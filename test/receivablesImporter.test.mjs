// RECEIVABLES IMPORTER — scenariile obligatorii. node test/receivablesImporter.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

const {
  importReceivables,
  toIncomeInvoicesShape,
  reconcileReceivables,
  receivablesForCash,
} = await import("../src/ceo/evolution/receivablesImporter.js");
const { buildReceivablesRegister } = await import("../src/ceo/receivablesEngine.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// ── Fixtur: records CU provenienta {VALUE,SOURCE_ROW,CONFIDENCE}, numere RO ─
// as_of = 2026-07-22. Rol generic pentru client (fara nume reale).
const AS_OF = "2026-07-22";
const prov = (v, row, conf) => ({ VALUE: v, SOURCE_ROW: row, CONFIDENCE: conf });
const recordsProv = [
  // creanta scadenta in trecut → OVERDUE; suma RO "1.234,56"
  { client: prov("client-a", 1, 90), invoice: prov("SB-001", 1, 88), amount: prov("1.234,56", 1, 85), remaining: prov("1.234,56", 1, 80), due_date: prov("01.07.2026", 1, 82) },
  // creanta scadenta in viitor → CONFIRMED; collected derivat din amount-remaining
  { client: prov("client-b", 2, 90), invoice: prov("SB-002", 2, 88), amount: prov("10.000,00", 2, 85), remaining: prov("4.000,00", 2, 80), due_date: prov("31.08.2026", 2, 82) },
  // creanta incasata integral → COLLECTED (remaining 0)
  { client: prov("client-c", 3, 90), invoice: prov("SB-003", 3, 88), amount: prov("5.000,00", 3, 85), remaining: prov("0,00", 3, 80), due_date: prov("15.06.2026", 3, 82) },
  // camp lipsa: fara suma, fara scadenta → missing != zero (null, nu 0)
  { client: prov("client-d", 4, 90), invoice: prov("SB-004", 4, 88), amount: prov("", 4, 0), due_date: prov("", 4, 0) },
];

const imp = importReceivables({ records: recordsProv, documentDate: AS_OF, source: "[staging] situatie clienti" });

// 1. Provenienta {VALUE} extrasa + numere RO parsate corect
const a = imp.receivables[0];
ok(a.amountRON === 1234.56 && a.remainingRON === 1234.56, "1. numar RO '1.234,56' parsat determinist");
ok(a.ref === "SB-001" && a.client === "client-a", "1. ref = invoice; client extras din {VALUE}");
ok(a.source_row === 1 && a.confidence === 85, "1. provenienta pastrata (source_row + confidence min)");

// 2. missing != zero: campurile lipsa → null, NU 0
const d = imp.receivables[3];
ok(d.amountRON === null && d.dueDate === null, "2. camp lipsa → null (missing != zero, nu 0)");
ok(imp.data_quality.missing_amount === 1 && imp.data_quality.missing_due === 1, "2. data_quality contorizeaza lipsurile");

// 3. collected derivat din amount - remaining (fara inventare)
const b = imp.receivables[1];
ok(b.collectedRON === 6000 && b.remainingRON === 4000, "3. collected derivat = amount - remaining");

// 4. status: OVERDUE / CONFIRMED / COLLECTED dupa dueDate vs as_of
ok(a.status === "OVERDUE", "4. scadenta trecuta → OVERDUE");
ok(b.status === "CONFIRMED", "4. scadenta viitoare → CONFIRMED");
ok(imp.receivables[2].status === "COLLECTED", "4. remaining 0 → COLLECTED");
ok(d.status === "UNKNOWN", "4. fara scadenta/rest → UNKNOWN");

// 5. stats + trust (fara reconciliere → cel mult VALIDATED)
ok(imp.stats.total === 4 && imp.stats.collected_count === 1, "5. stats coerente (total, collected_count)");
ok(["VALIDATED", "UNVALIDATED"].includes(imp.trust) && imp.trust !== "RECONCILED", "5. fara reconciliere trust <= VALIDATED");

// ── 6. toIncomeInvoicesShape → pasat REAL prin buildReceivablesRegister ──
const shape = toIncomeInvoicesShape(imp.receivables);
ok(Object.keys(shape[0]).sort().join(",") === "amountRON,client,dueDate,ref,remainingRON,status", "6. forma exacta incomeInvoices");
const reg = buildReceivablesRegister({ asOf: AS_OF, incomeInvoices: shape });
// CONFIRMED remaining = 4000 (client-b); OVERDUE remaining = 1234.56 (client-a)
ok(reg.totals.confirmedRON === 4000, "6. buildReceivablesRegister: confirmedRON coerent");
// collected_count = 1: DOAR client-c (remaining 0). client-d (amount/remaining
// null) NU e COLLECTED — missing != zero (review E: null<=0 nu mai inseamna incasat).
ok(reg.totals.overdueRON === 1235 && reg.totals.collected_count === 1, "6. overdueRON coerent + creanta cu suma lipsa NU e COLLECTED (missing!=zero)");

// ── 7. Reconciliere ──────────────────────────────────────────────────────
// doc 1000 vs ops 1000 → MATCHED (in ambele surse, suma egala)
const recMatch = reconcileReceivables({
  imported: [{ ref: "F1", client: "client-a", amountRON: 1000 }],
  operationalInvoices: [{ ref: "F1", client: "client-a", amountRON: 1000 }],
  smartbillInvoices: [{ ref: "F1", client: "client-a", amountRON: 1000 }],
});
ok(recMatch.rows[0].verdict === "MATCHED" && recMatch.summary.matched === 1, "7. doc 1000 vs surse 1000 → MATCHED");
ok(recMatch.trust_after === "RECONCILED", "7. zero contradictii + match → trust_after RECONCILED");

// doc 1000 vs ops 2000 → CONTRADICTION + reconciliation_need grupat
const recContra = reconcileReceivables({
  imported: [{ ref: "F2", client: "client-b", amountRON: 1000 }],
  operationalInvoices: [{ ref: "F2", client: "client-b", amountRON: 2000 }],
});
ok(recContra.rows[0].verdict === "CONTRADICTION" && recContra.summary.contradictions === 1, "7. doc 1000 vs ops 2000 → CONTRADICTION");
ok(recContra.reconciliation_need && recContra.reconciliation_need.no_auto_correction === true, "7. divergenta → reconciliation_need cu no_auto_correction");
ok(recContra.trust_after === null, "7. contradictii > 0 → trust NU urca la RECONCILED");

// in doc dar nu in surse → UNMATCHED
const recUnmatched = reconcileReceivables({ imported: [{ ref: "F3", client: "client-c", amountRON: 500 }], operationalInvoices: [] });
ok(recUnmatched.rows[0].verdict === "UNMATCHED" && recUnmatched.summary.unmatched === 1, "7. in doc, nu in surse → UNMATCHED");

// divergentele grupate intr-UN singur need (nu N taskuri)
const recMulti = reconcileReceivables({
  imported: [{ ref: "X1", amountRON: 100 }, { ref: "X2", amountRON: 200 }, { ref: "X3", amountRON: 300 }],
  operationalInvoices: [{ ref: "X1", amountRON: 999 }],
});
ok(recMulti.reconciliation_need.count === 3 && Array.isArray(recMulti.rows), "7. 3 divergente → UN singur need grupat (count 3)");

// ── 8. receivablesForCash: trust gate ────────────────────────────────────
const cashUnval = receivablesForCash({ imported: { trust: "UNVALIDATED", receivables: imp.receivables }, asOf: AS_OF });
ok(cashUnval.confirmed_inflows.length === 0 && /prag/.test(cashUnval.note || ""), "8. trust UNVALIDATED → confirmed_inflows gol + nota");

const cashVal = receivablesForCash({ imported: { trust: "VALIDATED", receivables: imp.receivables }, asOf: AS_OF });
ok(cashVal.confirmed_inflows.length > 0 && cashVal.note === null, "8. trust VALIDATED → inflows populate din confirmedForCash");

// ── 9. Determinism: acelasi input → acelasi output ───────────────────────
const imp2 = importReceivables({ records: recordsProv, documentDate: AS_OF, source: "[staging] situatie clienti" });
ok(JSON.stringify(imp2.receivables) === JSON.stringify(imp.receivables), "9. determinism: import reproductibil");
const rec2 = reconcileReceivables({ imported: [{ ref: "F2", amountRON: 1000 }], operationalInvoices: [{ ref: "F2", amountRON: 2000 }] });
ok(JSON.stringify(rec2.summary) === JSON.stringify(recContra.summary), "9. determinism: reconciliere reproductibila");

// Review A/B: ref prezent in doc dar negasit in surse → UNMATCHED (NU fallback
// pe client+suma cu o factura DIFERITA), si NU se ridica trust la RECONCILED.
const recRefMismatch = reconcileReceivables({
  imported: [{ ref: "F123", client: "client-x", amountRON: 5000 }],
  operationalInvoices: [{ ref: "F999", client: "client-x", amountRON: 5000 }],
});
ok(recRefMismatch.rows[0].verdict === "UNMATCHED" && recRefMismatch.summary.unmatched === 1, "A. ref prezent dar negasit → UNMATCHED (nu fallback pe factura diferita)");
ok(recRefMismatch.trust_after !== "RECONCILED", "B. potrivire slaba pe client+suma NU ridica trust la RECONCILED");
// Potrivire FERMA pe nr. factura → MATCHED + RECONCILED (calea legitima).
const recStrong = reconcileReceivables({
  imported: [{ ref: "F5", client: "client-y", amountRON: 5000 }],
  operationalInvoices: [{ ref: "F5", client: "client-y", amountRON: 5000 }],
  smartbillInvoices: [{ ref: "F5", client: "client-y", amountRON: 5000 }],
});
ok(recStrong.rows[0].verdict === "MATCHED" && recStrong.trust_after === "RECONCILED", "A. potrivire ferma pe nr. factura (ambele surse) → MATCHED + RECONCILED");

// ── 10. records PLATE (fara provenienta) → aceleasi rezultate ────────────
const flat = importReceivables({ records: [{ client: "client-e", invoice: "SB-9", amountRON: "2.500,00", remaining: "2.500,00", due_date: "01.07.2026" }], documentDate: AS_OF });
ok(flat.receivables[0].amountRON === 2500 && flat.receivables[0].status === "OVERDUE", "10. records plate acceptate (amount + status corect)");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — receivablesImporter`);
process.exit(failed === 0 ? 0 : 1);
