// Teste Master Phase 3 — Company Nervous System. node test/ceoNervous.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

import { readFileSync } from "node:fs";
const NS = await import("../src/ceo/nervousSystem.js");
const { composeDigestMessage } = await import("../src/founderAttention/digestDelivery.js");
const { buildDailyDigest } = await import("../src/founderAttention/dailyDigest.js");
const SB = await import("../src/connectors/smartbill.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// ── Bank Intelligence (pe rulaje; soldul NU se deduce) ──────────────────
const L = (date, amountRON, direction, description) => ({ date, amountRON, direction, description, currency: "RON" });
const LINES = [
  L("2026-06-05", 7200, "out", "MERCEDES LEASING RATA 123"),
  L("2026-07-05", 7200, "out", "MERCEDES LEASING RATA 124"),
  L("2026-06-20", 50000, "in", "INCASARE CLIENT SC X 001"),
  L("2026-07-01", 120000, "out", "PLATA FURNIZOR BETON 99"),
  L("2026-07-03", 9000, "in", "INCASARE CLIENT SC Y 002"),
];
const bi = NS.analyzeBankFlows(LINES);
ok(bi.totals.inRON === 59000 && bi.totals.outRON === 134400, "totaluri in/out exacte");
ok(bi.recurring_out.some((r) => /mercedes/i.test(r.key) && r.months === 2), "plata recurenta detectata (2 luni)");
ok(/soldul/i.test(bi.balance_note), "nota explicita: rulajele NU dau soldul");
ok(bi.largest[0].amountRON === -120000 || Math.abs(bi.largest[0].amountRON) === 120000, "cea mai mare miscare identificata");
ok(NS.analyzeBankFlows([]) === null && NS.analyzeBankFlows(null) === null, "fara rulaje → null (nu zero)");
const mm = NS.matchBankToObligations({ lines: LINES, obligations: [{ title: "Mercedes Laesing", amountRON: 7200, dueDate: "2026-07-05" }] });
ok(mm.length === 1 && mm[0].confidence === "probabila", "reconciliere probabila rulaj↔obligatie");

// ── Detectii receivables ────────────────────────────────────────────────
const issues = NS.detectReceivableIssues({
  register: { items: [{ ref: "F3", who: "SC Z", state: "OVERDUE", remainingRON: 20000, dueDate: "2026-07-01" }] },
  bankLines: [L("2026-07-10", 33333, "in", "INCASARE NEIDENTIFICATA")],
  sales: { rezervat: 6, avansIncasat: 0 }, asOf: "2026-07-21",
});
ok(issues.some((i) => i.key === "factura_neincasata"), "factura emisa fara incasare detectata");
ok(issues.some((i) => i.key === "incasare_fara_asociere"), "incasare fara asociere detectata");
ok(issues.some((i) => i.key === "rezervare_fara_valoare"), "rezervare fara valoare detectata");

// ── Service debt 30/60/90 ───────────────────────────────────────────────
const ds = NS.debtServiceWindows({ asOf: "2026-07-21", obligations: [
  { dueDate: "2026-07-30", title: "rata IMM", amountRON: 416000, category: "Credit" },
  { dueDate: "2026-08-30", title: "rata IMM", amountRON: 416000, category: "Credit" },
  { dueDate: "2026-10-09", title: "BT Leasing", amountRON: 99000, category: "Leasing" },
  { dueDate: "2026-07-24", title: "D112", amountRON: 21000, category: "Credit" },
]});
ok(ds.d30 === 416000 && ds.d60 === 832000 && ds.d90 === 931000, `service debt 30/60/90 exact (${ds.d30}/${ds.d60}/${ds.d90})`);

// ── Registre generice (NOT_CONNECTED onest, schema definita) ────────────
const reg = await NS.getRegister("contracts");
ok(reg.status === "NOT_CONNECTED" && reg.schema.includes("notice_period"), "registrul de contracte: schema completa, zero inventii");
ok((await NS.getRegister("assets")).schema.includes("occupancy"), "registrul de active definit");
ok((await NS.getRegister("legal")).schema.includes("exposure"), "registrul juridic definit");
ok((await NS.getRegister("xx")).error, "registru necunoscut → eroare");

// ── Autonomie ───────────────────────────────────────────────────────────
ok(NS.activeAutonomyLevel({}) === 1, "nivelul activ = LEVEL 1 (propose, nimic trimis)");
ok(Object.keys(NS.AUTONOMY_LEVELS).length === 5, "cele 5 niveluri definite");

// ── Decision memory ─────────────────────────────────────────────────────
const d1 = NS.buildDecisionRecord({ context: "extindere corp nou Bell Residence finantare", recommendation: "amanare 60 zile", why: "cash presiune" });
ok(d1.actual_result === null && d1.decision_id.startsWith("dec:"), "inregistrare canonica");
const sim = NS.findSimilarDecisions("incepem corp nou la Bell Residence cu finantare bancara", [
  { ...d1, adrian_decision: "amanat", actual_result: "presiunea a scazut", lesson: "amanarea a functionat" },
  NS.buildDecisionRecord({ context: "angajare sofer", recommendation: "da" }),
]);
ok(sim.length === 1 && sim[0].outcome === "presiunea a scazut", "situatie similara gasita cu rezultatul ei (nu cea nesimilara)");

// ── Atributie ───────────────────────────────────────────────────────────
const at = NS.buildAttribution({
  traffic: { daily: Array.from({ length: 14 }, (_, i) => ({ date: `2026-07-${String(i + 7).padStart(2, "0")}`, visits: 40 })) },
  leads: [], sales: { rezervat: 6, avansIncasat: 0, vandut: 4 },
  salesHistory: [{ date: "2026-07-01", vandut: 4 }, { date: "2026-07-21", vandut: 4 }],
});
ok(at.chain.TRAFFIC.status === "CONNECTED" && at.chain.CASH.status === "ATTRIBUTION_GAP", "lantul cu gap-uri marcate explicit");
ok(at.findings.some((f) => f.pattern === "trafic_fara_leaduri"), "diferentiere: trafic creste, lead-uri nu");
ok(at.findings.some((f) => f.pattern === "rezervari_fara_avans"), "diferentiere: rezervari fara avansuri");
ok(at.findings.some((f) => f.pattern === "vanzari_plate"), "diferentiere: vanzari plate pe istoric");
ok(NS.buildAttribution({}).chain.TRAFFIC.status === "SOURCE_DOWN", "sursa picata ≠ trafic zero");

// ── SmartBill: mapare oficiala onesta ───────────────────────────────────
ok(SB.NOT_AVAILABLE_FROM_SOURCE.includes("listare bulk facturi emise"), "NOT_AVAILABLE_FROM_SOURCE declarat (fara scraping)");
ok(typeof SB.getSeries === "function" && typeof SB.getPaymentStatus === "function", "endpoint-urile oficiale disponibile implementate");
const rec = await SB.reconcileWithOperational([{ ref: "PROF 123", client: "X", remainingRON: 100 }]);
ok(rec.error === "NOT_CONNECTED" || rec.checked >= 0, "reconcilierea gestioneaza NOT_CONNECTED");

// ── Digest V2: risc + oportunitate ──────────────────────────────────────
const msg = composeDigestMessage({
  digest: buildDailyDigest({ episodes: [], candidates: [] }),
  candidates: [], episodes: [],
  extras: { main_risk: "654k iesiri fara acoperire", main_opportunity: "Colectarea avansurilor" },
});
ok(/RISC PRINCIPAL:/.test(msg) && /OPORTUNITATE:/.test(msg), "digest V2: risc + oportunitate incluse");
ok(/PRIORITATEA ZILEI:/.test(msg), "prioritatea ramane");

// ── Garzi: nervous system nu executa nimic ──────────────────────────────
const src = readFileSync(new URL("../src/ceo/nervousSystem.js", import.meta.url), "utf8");
ok(!/(telegram|notifier|taskflow|approvalGate|mcp)\.js/.test(src), "zero canale/executie in nervous system");
ok(!/Dana|Nelu|Bell Residence/.test(src.replace(/\/\/[^\n]*/g, "")), "nucleul generic (fara companie hardcodata)");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — ceoNervous`);
process.exit(failed === 0 ? 0 : 1);
