// CONNECTOR OPSDATA — citiri READ-ONLY suplimentare din baza Operational
// (reuse opsQuery/hasOpsDb din supervisor). Descoperite la auditul Master
// Phase 2: bank_statements, estimated_cash_inflows, income_invoices,
// site_visits (Spion), leads, supplier_due_items. Zero scrieri, timeouts,
// degradare eleganta: sursa picata → null + marcaj, NU zero.
import { opsQuery, hasOpsDb } from "../supervisor/opsdb.js";

const safe = (fn) => hasOpsDb ? fn().catch((e) => { console.error("[opsdata]", e.message); return null; }) : Promise.resolve(null);

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
  });
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
  });
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
  });
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
  });
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
  });
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
  });
}
