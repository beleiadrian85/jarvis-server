// Teste Master Phase 2 — Data Loop + Management Loop (nucleu pur + garzi).
// node test/ceoDataLoop.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";
delete process.env.SMARTBILL_EMAIL; delete process.env.SMARTBILL_TOKEN; delete process.env.SMARTBILL_CIF;

import { readFileSync } from "node:fs";
const { parseObligations } = await import("../src/connectors/financial.js").catch(() => ({}));
const fin = await import("../src/connectors/financial.js");
const { computeMinimumCash } = await import("../src/ceo/cashIntelligence.js");
const { validateBalanceEntry } = await import("../src/ceo/balanceStore.js");
const { buildReceivablesRegister, confirmedForCash } = await import("../src/ceo/receivablesEngine.js");
const { buildFinancingRegister } = await import("../src/ceo/financingRegister.js");
const { topPriorities, scorePriority } = await import("../src/ceo/priorityEngine.js");
const { whoNeedsToDoWhat, forward30, NO_ACTION } = await import("../src/ceo/managementView.js");
const { smartbillHealth, reconcileInvoice } = await import("../src/connectors/smartbill.js");
const { scoreImprovement, rankBacklog } = await import("../src/ceo/improvementEngine.js");
const { buildCapabilityManifest } = await import("../src/ceo/capabilityManifest.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// ── H1 regresie: coloana "rămas" nu mai strica bucketing-ul ─────────────
const MCP_LINE = "• 2026-07-30 · rata IMM · 416.000 RON · rămas 416.000 · Credit · General · normala · neplatita";
const parsed = fin.parseObligations ? fin.parseObligations(MCP_LINE) : null;
if (parsed) {
  ok(parsed[0].category === "Credit" && parsed[0].project === "General", "parser: 'rămas X' sarit → category=Credit (bug live reparat)");
  const old = fin.parseObligations("• 2026-07-30 · rata IMM · 416.000 RON · Credit · General · normala · neplatita");
  ok(old[0].category === "Credit", "parser: formatul vechi (fara rămas) ramane compatibil");
} else {
  const src = readFileSync(new URL("../src/connectors/financial.js", import.meta.url), "utf8");
  ok(/r\[aă\]mas/.test(src), "parser exporta intern; fix-ul 'rămas' prezent in sursa");
}

// ── Minimum cash / deficit ──────────────────────────────────────────────
const OB = [
  { dueDate: "2026-07-25", amountRON: 50_000 },
  { dueDate: "2026-08-10", amountRON: 100_000 },
];
const mc = computeMinimumCash({ asOf: "2026-07-21", bankBalance: 80_000, confirmedReceivables: [{ dueDate: "2026-08-01", amountRON: 60_000 }], obligations: OB });
ok(mc.available_now === 80000, "available now = soldul introdus");
ok(mc.minimum_cash === -10000 && mc.minimum_cash_date === "2026-08-10", "punctul minim calculat exact (80k-50k+60k-100k=-10k)");
ok(mc.first_deficit_date === "2026-08-10", "ziua primului deficit identificata");
const mcU = computeMinimumCash({ asOf: "2026-07-21", bankBalance: null, obligations: OB });
ok(mcU.available_now === "UNKNOWN" && mcU.how_to_fix.length > 0, "fara sold → UNKNOWN + how_to_fix (nu inventeaza)");
const mcNoDef = computeMinimumCash({ asOf: "2026-07-21", bankBalance: 500_000, confirmedReceivables: [], obligations: OB });
ok(mcNoDef.first_deficit_date === "fara deficit in orizont", "sold suficient → fara deficit");

// ── Balance store validation ────────────────────────────────────────────
ok(validateBalanceEntry({ bank: "ING", account: "5013", currency: "RON", available: 120000, enteredBy: "Dana" }).valid, "intrare sold valida");
ok(!validateBalanceEntry({ bank: "ING", account: "5013", currency: "USD", available: 1, enteredBy: "x" }).valid, "moneda nesuportata respinsa");
ok(!validateBalanceEntry({ bank: "ING", currency: "RON", available: -5, enteredBy: "x" }).valid, "sold negativ/cont lipsa respins");

// ── Receivables: emisa ≠ incasata; contractat ≠ cash ────────────────────
const reg = buildReceivablesRegister({
  asOf: "2026-07-21",
  incomeInvoices: [
    { client: "SC X", ref: "F1", amountRON: 50000, remainingRON: 50000, dueDate: "2026-08-01", status: "emisa" },
    { client: "SC Y", ref: "F2", amountRON: 30000, remainingRON: 0, dueDate: "2026-07-01", status: "platita" },
    { client: "SC Z", ref: "F3", amountRON: 20000, remainingRON: 20000, dueDate: "2026-07-01", status: "emisa" },
  ],
  estimatedInflows: [{ label: "avans ap 12", amountRON: 15000, dueDate: "2026-08-05", by: "dana" }],
  sales: { rezervat: 6, avansIncasat: 0 },
});
ok(reg.totals.confirmedRON === 50000 && reg.totals.overdueRON === 20000 && reg.totals.probableRON === 15000, "stari corecte: confirmat/restant/probabil");
ok(reg.items.find((i) => i.ref === "F2").state === "COLLECTED", "factura platita = COLLECTED (emisa ≠ incasata)");
ok(reg.items.find((i) => i.kind === "avans_rezervari").amountRON === null, "avansul rezervarilor fara suma inregistrata = UNKNOWN, nu inventat");
ok(/UNKNOWN/.test(reg.statement) && /confirmat/i.test(reg.statement), "fraza canonica: contractat vs cash confirmat");
ok(confirmedForCash(reg).length === 2 && confirmedForCash(reg).every((i) => i.dueDate), "doar confirmate+restante intra in cash (cu termen)");
const regDown = buildReceivablesRegister({ asOf: "2026-07-21", incomeInvoices: null, estimatedInflows: null });
ok(regDown.data_gaps.length === 2, "surse picate → gaps, nu zero");

// ── Financing register ──────────────────────────────────────────────────
const finReg = buildFinancingRegister({ asOf: "2026-07-21", obligations: [
  { dueDate: "2026-07-30", title: "rata IMM", amountRON: 416000, category: "Credit" },
  { dueDate: "2026-08-30", title: "rata IMM", amountRON: 416000, category: "Credit" },
  { dueDate: "2026-08-09", title: "BT Leasing - leaseback", amountRON: 99000, category: "Leasing" },
  { dueDate: "2026-07-24", title: "contributii salarii D112", amountRON: 21000, category: "Credit" },
]});
ok(finReg.entries.length === 2 && finReg.entries[0].creditor === "rata IMM", "creditori grupati (D112 exclus — e salarii)");
ok(finReg.entries[0].outstanding_balance === "UNKNOWN", "soldul creditului = UNKNOWN (Data Gap, nu estimare)");
ok(finReg.entries.find((e) => e.type === "leasing"), "leasingul clasificat");
ok(finReg.data_gaps.length >= 3, "gap-urile registrului declarate");

// ── Priority engine: max 3, scorat ──────────────────────────────────────
const pr = topPriorities({
  observations: [
    { title: "Obligatii mari", severity: "high", _factors: { urgencyDays: 2, financialImpactRON: 500000 }, requires_board_review: true, evidence: ["[op] x"] },
    { title: "Restante", severity: "high", _factors: { urgencyDays: 0, financialImpactRON: 7000 }, evidence: ["[op] y"] },
    { title: "Minor", severity: "low", _factors: {} },
  ],
  episodes: [{ title: "Presiune de lichiditate si executie", episode_id: "ep:lich", combined_severity: "high", _minUrgencyDays: 0, requires_board_review: true, status: "open" }],
  gaps: [{ domain: "CASH" }],
  asOf: "2026-07-21",
});
ok(pr.priorities.length === 3, "exact TOP 3 (niciodata mai mult)");
ok(pr.priorities.every((p) => p.evidence && p.score > 0), "fiecare prioritate cu scor + dovada");
ok(pr.priorities.some((p) => /soldul bancar/i.test(p.title)), "gap-ul de sold devine prioritate structurala");
ok(scorePriority({ severity: "critical", urgency_days: 0, cash_impactRON: 200000, blocking: true }) > scorePriority({ severity: "low" }), "scoring monoton");

// ── Management view ─────────────────────────────────────────────────────
const who = whoNeedsToDoWhat({ answers: { q5_adrian: ["Zi fara decizii blocate pe tine — construieste."], q3_dana: ["Introdu soldurile"], q4_nelu: [] }, systemFailing: ["gmail: picat"] });
ok(who.ADRIAN[0] === NO_ACTION, "fondator fara nimic real → NO EXECUTIVE ACTION REQUIRED (nu se umple lista)");
ok(who.DANA[0] === "Introdu soldurile" && who.SYSTEM[0].includes("gmail"), "Dana + Sistem populate din date");
const f30 = forward30({ answers: { q10_riscuri_30_zile: ["r1", "r2"], q9_top3_oportunitati: ["o1 · [ev]"] }, liquidity: { horizons: { 30: { outflows: { total_known: 654000 } } } }, episodes: [] });
ok(f30.risks.length <= 5 && f30.risks[0].confidence === 90 && /654/.test(f30.risks[0].text), "forward30: riscuri cu evidence+confidence");
ok(f30.lost_opportunities.length <= 3, "max 3 oportunitati pierdute");

// ── SmartBill: NOT_CONNECTED onest + reconciliere pura ──────────────────
const sh = smartbillHealth();
ok(sh.status === "NOT_CONNECTED" && sh.missing_env.length === 3, "fara env → NOT_CONNECTED cu lista exacta (nu se inventeaza)");
ok(reconcileInvoice({ amountRON: 1000, collectedRON: 1000 }).state === "COLLECTED", "reconciliere: incasata integral");
ok(reconcileInvoice({ amountRON: 1000, collectedRON: 0, dueDate: "2026-07-01", asOf: "2026-07-21" }).state === "OVERDUE", "reconciliere: restanta");
ok(/emisa ≠ incasata/.test(reconcileInvoice({ amountRON: 1000, collectedRON: 0, dueDate: "2026-09-01", asOf: "2026-07-21" }).note), "emisa ≠ incasata (explicit)");

// ── Improvement backlog scoring ─────────────────────────────────────────
const ranked = rankBacklog([
  { improvement_id: "a", business_value_score: 90, saas_reusability_score: 80 },
  { improvement_id: "b", business_value_score: 20, saas_reusability_score: 20 },
]);
ok(ranked[0].improvement_id === "a" && ranked[0].scoring.total > ranked[1].scoring.total, "backlog ordonat pe scor compus");
ok(scoreImprovement({}).total > 0 && scoreImprovement({}).total <= 100, "scor implicit sanatos");

// ── Capability manifest ─────────────────────────────────────────────────
const man = buildCapabilityManifest({});
ok(man.can_execute.length === 0, "can_execute = [] — NIMIC autonom (regula permanenta)");
ok(man.company.id === "profi-concept" && man.roles.length === 4, "manifestul instantei complet");
ok(Object.keys(man.sources).length === 22, "sursele celor 22 domenii in manifest");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — ceoDataLoop`);
process.exit(failed === 0 ? 0 : 1);
