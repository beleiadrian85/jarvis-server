// CEO AI — NERVOUS SYSTEM (Master Phase 3). Motoare PURE consolidate:
// Bank Intelligence, Atributie trafic→cash, detectii receivables, service debt,
// registre generice (contracte/active/legal), niveluri de autonomie, memoria
// deciziilor. Toate deterministe; date lipsa = UNKNOWN/GAP, niciodata inventate.
import { audit } from "../audit.js";
import { getState, setState } from "../state.js";

// ── 1.2 BANK INTELLIGENCE (pe rulajele existente; soldul NU se inventeaza) ─
export function analyzeBankFlows(lines = []) {
  if (!lines?.length) return null;
  const days = new Set(lines.map((l) => l.date));
  const inflows = lines.filter((l) => l.direction === "in");
  const outflows = lines.filter((l) => l.direction === "out");
  const sum = (a) => Math.round(a.reduce((s, l) => s + Math.abs(l.amountRON), 0));
  const norm = (d) => d.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").slice(0, 40);

  // Tipare recurente: aceeasi descriere normalizata in ≥2 luni diferite.
  const groups = new Map();
  for (const l of lines) {
    const k = `${l.direction}|${norm(l.description)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(l);
  }
  const recurring = [...groups.entries()]
    .map(([k, ls]) => ({ key: k.split("|")[1], direction: k.split("|")[0], count: ls.length,
      months: new Set(ls.map((l) => l.date.slice(0, 7))).size,
      avgRON: Math.round(ls.reduce((s, l) => s + Math.abs(l.amountRON), 0) / ls.length) }))
    .filter((g) => g.months >= 2 && g.avgRON >= 500)
    .sort((a, b) => b.avgRON - a.avgRON);

  const totalOut = sum(outflows), totalIn = sum(inflows);
  const avg = (t) => days.size ? Math.round(t / days.size) : 0;
  const big = [...lines].sort((a, b) => Math.abs(b.amountRON) - Math.abs(a.amountRON)).slice(0, 5)
    .map((l) => ({ date: l.date, amountRON: Math.round(l.amountRON), direction: l.direction, desc: l.description.slice(0, 60) }));

  return {
    period: { from: [...days].sort()[0], to: [...days].sort().pop(), days_with_data: days.size },
    totals: { inRON: totalIn, outRON: totalOut, netRON: totalIn - totalOut },
    daily_avg: { inRON: avg(totalIn), outRON: avg(totalOut) },
    burn_rate_note: totalOut > totalIn ? `iesiri nete ${Math.round((totalOut - totalIn)).toLocaleString("ro-RO")} lei pe perioada` : "intrari nete pozitive pe perioada",
    recurring_out: recurring.filter((r) => r.direction === "out").slice(0, 8),
    recurring_in: recurring.filter((r) => r.direction === "in").slice(0, 5),
    largest: big,
    balance_note: "Rulajele NU dau soldul — soldul ramane input manual/sursa cu sold.",
  };
}

/** Reconciliere probabila rulaje ↔ obligatii (match suma ±1% si ±5 zile). PUR. */
export function matchBankToObligations({ lines = [], obligations = [] } = {}) {
  const matches = [];
  for (const o of obligations) {
    const hit = lines.find((l) => l.direction === "out" &&
      Math.abs(Math.abs(l.amountRON) - o.amountRON) <= Math.max(10, o.amountRON * 0.01) &&
      o.dueDate && Math.abs((new Date(l.date) - new Date(o.dueDate)) / 86_400_000) <= 5);
    if (hit) matches.push({ obligation: o.title, amountRON: o.amountRON, paid_on: hit.date, confidence: "probabila" });
  }
  return matches;
}

// ── 1.3 Detectii receivables (fara double-counting) ────────────────────
export function detectReceivableIssues({ register, bankLines = [], sales = null, asOf } = {}) {
  const issues = [];
  if (sales && (sales.rezervat ?? 0) > 0) {
    issues.push({ key: "rezervare_fara_valoare", finding: `${sales.rezervat} rezervari fara valoare de avans inregistrata`, evidence: "[operational] sales_summary + lipsa camp valoare" });
    if ((sales.avansIncasat ?? 0) === 0)
      issues.push({ key: "rezervare_fara_avans", finding: `${sales.rezervat} rezervari, 0 avans incasat`, evidence: "[operational] sales_summary" });
  }
  for (const i of register?.items || []) {
    if (i.state === "OVERDUE") issues.push({ key: "factura_neincasata", finding: `Factura ${i.ref} (${i.who}) restanta: ${Math.round(i.remainingRON).toLocaleString("ro-RO")} lei`, evidence: `[income_invoices] ${i.ref} scadenta ${i.dueDate}` });
  }
  // Incasari in banca fara asociere cu facturi (suma in > orice remaining cunoscut).
  const knownIn = new Set((register?.items || []).map((i) => Math.round(i.remainingRON || i.amountRON || 0)));
  const orphanIn = bankLines.filter((l) => l.direction === "in" && Math.abs(l.amountRON) >= 5000 &&
    ![...knownIn].some((k) => Math.abs(k - Math.abs(l.amountRON)) <= Math.max(10, k * 0.01)));
  if (orphanIn.length)
    issues.push({ key: "incasare_fara_asociere", finding: `${orphanIn.length} incasari bancare ≥5.000 lei fara factura asociata cunoscuta`, evidence: `[bank] ex.: ${orphanIn[0].date} ${Math.round(orphanIn[0].amountRON).toLocaleString("ro-RO")} lei` });
  return issues;
}

// ── 1.6 Service debt 30/60/90 ──────────────────────────────────────────
export function debtServiceWindows({ asOf, obligations = [] } = {}) {
  const fin = obligations.filter((o) => /credit|leasing/i.test(o.category || "") && !/d112|salari/i.test(o.title || ""));
  const win = (d) => Math.round(fin.filter((o) => o.dueDate >= asOf && (new Date(o.dueDate) - new Date(asOf)) / 86_400_000 <= d)
    .reduce((s, o) => s + (o.amountRON || 0), 0));
  return { d30: win(30), d60: win(60), d90: win(90) };
}

// ── 1.7 Registre generice (adaptoare; manual store; NOT_CONNECTED onest) ─
const REGISTERS = {
  contracts: { key: "register:contracts", fields: ["party", "type", "value", "start", "end", "notice_period", "obligations", "renewal", "guarantees", "risks", "document_source"] },
  assets: { key: "register:assets", fields: ["asset", "owner", "value", "debt", "income", "expenses", "occupancy", "key_contracts"] },
  legal: { key: "register:legal", fields: ["issue", "deadline", "exposure", "responsible", "source", "status"] },
};
export async function getRegister(name) {
  const def = REGISTERS[name];
  if (!def) return { error: "registru necunoscut" };
  const entries = await getState(def.key, []).catch(() => []);
  return {
    register: name, schema: def.fields, entries,
    status: entries.length ? "PARTIAL (input manual)" : "NOT_CONNECTED",
    note: "Datele NU se inventeaza — registrul se populeaza manual/din surse viitoare.",
  };
}

// ── 7. NIVELURI DE AUTONOMIE ───────────────────────────────────────────
export const AUTONOMY_LEVELS = {
  0: "OBSERVE — read-only",
  1: "PROPOSE — creeaza propuneri, nimic trimis",
  2: "EXECUTE AFTER EXPLICIT APPROVAL — Adrian aproba individual",
  3: "PRE-APPROVED LOW-RISK — doar politici aprobate explicit",
  4: "HIGH AUTONOMY — viitor",
};
/** Nivelul ACTIV, derivat din flag-uri (nu declarat). PUR peste config dat. */
export function activeAutonomyLevel(cfg = {}) {
  // Orice cale de livrare reala inexistenta/oprita → maxim LEVEL 1.
  if (cfg.deliveryEnabled) return 2; // (viitor — flag inexistent azi)
  return 1;
}

// ── 6. DECISION + OUTCOME MEMORY (auditabila; fara self-modificare) ─────
const DECMEM_KEY = "ceo:decision-memory";
const tokens = (s) => new Set(String(s || "").toLowerCase().replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t").split(/[^a-z0-9]+/).filter((x) => x.length > 3));

export function buildDecisionRecord({ id, context, options = [], recommendation, adrian_decision = null, why = "", expected_result = "" } = {}) {
  return {
    decision_id: id || `dec:${Date.now().toString(36)}`,
    context, options, recommendation,
    adrian_decision, why, expected_result,
    actual_result: null, lesson: null,
    recorded_at: new Date().toISOString(),
  };
}
export async function rememberDecision(record, { persist = true } = {}) {
  if (persist) {
    const st = await getState(DECMEM_KEY, []).catch(() => []);
    await setState(DECMEM_KEY, [...st.slice(-100), record]).catch(() => {});
    await audit("ceo_decision_memory", `${record.decision_id}: ${String(record.context).slice(0, 120)}`,
      JSON.stringify(record).slice(0, 1900)).catch(() => {});
  }
  return record;
}
/** „Data trecuta intr-o situatie similara am ales X si rezultatul a fost Y." PUR. */
export function findSimilarDecisions(context, memory = [], minOverlap = 3) {
  const t = tokens(context);
  return memory
    .map((m) => ({ m, overlap: [...tokens(m.context)].filter((x) => t.has(x)).length }))
    .filter((x) => x.overlap >= minOverlap)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 3)
    .map(({ m }) => ({
      decision_id: m.decision_id, context: m.context,
      chosen: m.adrian_decision || m.recommendation,
      outcome: m.actual_result || "rezultat neinregistrat inca",
      lesson: m.lesson,
    }));
}

// ── 1.5 ATRIBUTIE: TRAFIC → LEAD → REZERVARE → CASH ────────────────────
export function buildAttribution({ traffic = null, leads = null, funnelCounts = null, sales = null, salesHistory = [] } = {}) {
  const gaps = [];
  const chain = {};
  chain.TRAFFIC = traffic?.daily?.length
    ? { status: "CONNECTED", last7_avg: Math.round(traffic.daily.slice(-7).reduce((s, d) => s + d.visits, 0) / Math.min(7, traffic.daily.length)) }
    : { status: "SOURCE_DOWN" };
  chain.LEAD = leads ? { status: leads.length ? "CONNECTED" : "CONNECTED_EMPTY", count: leads.length } : { status: "SOURCE_DOWN" };
  chain.RESERVATION = sales ? { status: "CONNECTED", count: sales.rezervat ?? 0 } : { status: "SOURCE_DOWN" };
  chain.ADVANCE = sales ? { status: "CONNECTED", count: sales.avansIncasat ?? 0 } : { status: "SOURCE_DOWN" };
  chain.SALE = sales ? { status: "CONNECTED", count: sales.vandut ?? 0 } : { status: "SOURCE_DOWN" };
  chain.CASH = { status: "ATTRIBUTION_GAP", note: "cash-ul incasat per vanzare nu e legat de sursa de trafic" };
  if (!leads?.length) gaps.push("ATTRIBUTION GAP: trafic → lead (formularul exista, volum ~0 — de verificat plasarea/CTA)");
  gaps.push("ATTRIBUTION GAP: lead → rezervare (fara legatura persoana-unitate in date)");
  gaps.push("ATTRIBUTION GAP: rezervare → cash (valoarea avansului neinregistrata)");

  const findings = [];
  const t7 = chain.TRAFFIC.last7_avg ?? null;
  if (t7 != null && (leads?.length ?? 0) === 0)
    findings.push({ pattern: "trafic_fara_leaduri", finding: `Trafic viu (~${t7} vizitatori/zi) dar 0 lead-uri noi — marketingul produce trafic, nu cash.`, evidence: "[spion]+[leads]" });
  if ((sales?.rezervat ?? 0) > 0 && (sales?.avansIncasat ?? 0) === 0)
    findings.push({ pattern: "rezervari_fara_avans", finding: "Rezervarile cresc, avansurile nu — conversia finala scurgere.", evidence: "[operational] sales_summary" });
  if (salesHistory.length >= 2) {
    const d = salesHistory[salesHistory.length - 1].vandut - salesHistory[0].vandut;
    if (d === 0) findings.push({ pattern: "vanzari_plate", finding: "Zero contracte noi pe fereastra istorica.", evidence: "[jarvis_state] sales:history" });
  }
  return { chain, findings, attribution_gaps: gaps };
}
