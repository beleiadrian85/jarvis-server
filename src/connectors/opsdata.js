// CONNECTOR OPSDATA — citiri READ-ONLY suplimentare din baza Operational
// (reuse opsQuery/hasOpsDb din supervisor). Descoperite la auditul Master
// Phase 2: bank_statements, estimated_cash_inflows, income_invoices,
// site_visits (Spion), leads, supplier_due_items. Zero scrieri, timeouts,
// degradare eleganta: sursa picata → null + marcaj, NU zero.
import { opsQuery, hasOpsDb } from "../supervisor/opsdb.js";

// Telemetrie surse (9. Reliability): fiecare citire isi noteaza statusul,
// latenta si AS_OF — CEO AI nu crede date vechi fara sa stie.
const _health = new Map();
export function getSourcesHealth() {
  return Object.fromEntries([..._health.entries()].map(([k, v]) => [k, v]));
}
const safe = (fn, name = fn.name || "src") => {
  if (!hasOpsDb) { _health.set(name, { status: "NOT_CONNECTED", as_of: null }); return Promise.resolve(null); }
  const t0 = Date.now();
  return fn().then((r) => {
    _health.set(name, { status: "OK", latency_ms: Date.now() - t0, as_of: new Date().toISOString() });
    return r;
  }).catch((e) => {
    const prev = _health.get(name) || {};
    _health.set(name, { status: "ERROR", error: e.message.slice(0, 80), fails: (prev.fails || 0) + 1, as_of: prev.as_of || null });
    console.error("[opsdata]", name, e.message);
    return null;
  });
};

/** Extrasele bancare: ultimul upload + rulaje (NU sold — extrasele ING n-au sold). */
export function getBankStatementsSummary() {
  return safe(async () => {
    const [latest] = await opsQuery(`SELECT original_name, uploaded_by, created_at FROM bank_statements ORDER BY created_at DESC LIMIT 1`);
    const [agg] = await opsQuery(`
      SELECT count(*)::int AS lines, max(op_date) AS last_op,
             sum(CASE WHEN direction='in' THEN amount ELSE 0 END)::float AS total_in,
             sum(CASE WHEN direction='out' THEN amount ELSE 0 END)::float AS total_out
      FROM bank_statement_lines`);
    if (!latest) return { connected: true, statements: 0 };
    const staleDays = Math.round((Date.now() - new Date(latest.created_at)) / 86_400_000);
    return {
      connected: true, statements: 1, latest_upload: String(latest.created_at).slice(0, 10),
      uploaded_by: latest.uploaded_by, stale_days: staleDays,
      lines: agg?.lines ?? 0, last_op: agg?.last_op ? String(agg.last_op).slice(0, 10) : null,
      note: "Extrasele contin RULAJE, nu sold — soldul curent ramane input manual pana la o sursa cu sold.",
    };
  }, "bank_statements");
}

/** Incasarile estimate introduse in Operational (mecanismul EXISTA; poate fi gol). */
export function getEstimatedInflows() {
  return safe(async () => {
    const rows = await opsQuery(`
      SELECT label, amount::float, currency, for_date, project, created_by
      FROM estimated_cash_inflows WHERE for_date::date >= CURRENT_DATE - 7 ORDER BY for_date::date`);
    return rows.map((r) => ({
      label: r.label, amountRON: r.currency === "EUR" ? r.amount * 5.06 : r.amount,
      currency: r.currency, dueDate: String(r.for_date).slice(0, 10), project: r.project, by: r.created_by,
    }));
  }, "estimated_inflows");
}

/** Facturile emise (income_invoices) — sursa incasarilor CONFIRMATE de primit. */
export function getIncomeInvoices() {
  return safe(async () => {
    const rows = await opsQuery(`
      SELECT client, doc_ref, amount::float, currency, due_date, status, paid_amount::float, document_date
      FROM income_invoices ORDER BY due_date NULLS LAST`);
    return rows.map((r) => ({
      client: r.client, ref: r.doc_ref,
      amountRON: r.currency === "EUR" ? r.amount * 5.06 : r.amount,
      remainingRON: Math.max(0, (r.currency === "EUR" ? 5.06 : 1) * (r.amount - (r.paid_amount || 0))),
      currency: r.currency, dueDate: r.due_date ? String(r.due_date).slice(0, 10) : null,
      status: r.status, documentDate: r.document_date ? String(r.document_date).slice(0, 10) : null,
    }));
  }, "income_invoices");
}

/** Instantaneu financiar REAL pentru Morning Brief — DOAR date existente (fara estimari
 *  inventate). Sold bancar = null (nu e conectat, vine prin input manual). */
export function getCashSnapshot() {
  return safe(async () => {
    const [backlog, invoices, inflows] = await Promise.all([getSupplierBacklog(), getIncomeInvoices(), getEstimatedInflows()]);
    const now = Date.now();
    const soon = (d) => d && (new Date(d).getTime() - now) <= 30 * 86400000;
    const receivables = (invoices || []).filter((i) => (i.remainingRON || 0) > 0.5);
    const toReceive = receivables.length ? {
      count: receivables.length,
      amount: Math.round(receivables.reduce((s, i) => s + i.remainingRON, 0)),
      soon: Math.round(receivables.filter((i) => soon(i.dueDate)).reduce((s, i) => s + i.remainingRON, 0)),
    } : null;
    const toPay = backlog && backlog.unconfirmed_amount > 0
      ? { count: backlog.unconfirmed || 0, amount: Math.round(backlog.unconfirmed_amount) } : null;
    const estimated = (inflows || []).length
      ? { count: inflows.length, amount: Math.round(inflows.reduce((s, i) => s + (i.amountRON || 0), 0)) } : null;
    return { toReceive, toPay, estimated, bank_balance: null };
  }, "cash_snapshot");
}

/** Traficul site-ului (Spion) — agregat zilnic, ultimele N zile. */
export function getSiteTraffic(days = 28) {
  return safe(async () => {
    const rows = await opsQuery(`
      SELECT day::text AS date, count(DISTINCT visitor_hash)::int AS visitors, count(*)::int AS hits
      FROM site_visits WHERE day >= CURRENT_DATE - $1::int GROUP BY day ORDER BY day`, [days]);
    const [last] = await opsQuery(`SELECT max(created_at) AS latest FROM site_visits`);
    return {
      daily: rows.map((r) => ({ date: r.date, visits: r.visitors, hits: r.hits })),
      lastDataAt: last?.latest ? new Date(last.latest).toISOString() : null,
    };
  }, "site_traffic");
}

/** Lead-urile din site (mecanismul exista; volumul poate fi mic). */
export function getLeads() {
  return safe(async () => {
    const rows = await opsQuery(`
      SELECT name, source, status, handled_by, created_at, utm_source
      FROM leads ORDER BY created_at DESC LIMIT 50`);
    return rows.map((r) => ({
      name: r.name, source: r.source || r.utm_source || "necunoscut", status: r.status,
      handledBy: r.handled_by, createdAt: String(r.created_at).slice(0, 10),
    }));
  }, "leads");
}

/** Backlog-ul de facturi furnizori (neconfirmate → nu intra in necesarul oficial). */
export function getSupplierBacklog() {
  return safe(async () => {
    // Coloanele confirmed/paid/superseded sunt INTEGER (0/1) in opsdb, nu boolean.
    const [agg] = await opsQuery(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE COALESCE(confirmed,0)=0 AND COALESCE(paid,0)=0)::int AS unconfirmed,
             sum(due_amount) FILTER (WHERE COALESCE(confirmed,0)=0 AND COALESCE(paid,0)=0)::float AS unconfirmed_amount
      FROM supplier_due_items WHERE COALESCE(superseded,0)=0`);
    return agg || { total: 0, unconfirmed: 0, unconfirmed_amount: 0 };
  }, "supplier_backlog");
}

/** Rulajele bancare linie cu linie (pentru Bank Intelligence). */
export function getBankLines(limit = 1000) {
  return safe(async () => {
    const rows = await opsQuery(`
      SELECT op_date::text AS date, amount::float, direction, description, currency
      FROM bank_statement_lines ORDER BY op_date DESC LIMIT $1`, [limit]);
    return rows.map((r) => ({
      date: r.date.slice(0, 10), amountRON: r.currency === "EUR" ? r.amount * 5.06 : r.amount,
      direction: r.direction, description: (r.description || "").slice(0, 120), currency: r.currency,
    }));
  }, "bank_lines");
}

/** Numarul de inregistrari pe stagiile funnel din schema mkt_* (existenta, nefolosita inca). */
export function getFunnelCounts() {
  return safe(async () => {
    const one = async (t) => { try { return (await opsQuery(`SELECT count(*)::int n FROM ${t}`))[0].n; } catch { return null; } };
    return {
      leads_site: await one("leads"),
      mkt_leads: await one("mkt_leads"),
      viewings: await one("mkt_viewings"),
      reservations_mkt: await one("mkt_reservations"),
      lead_events: await one("mkt_lead_events"),
    };
  }, "funnel_counts");
}