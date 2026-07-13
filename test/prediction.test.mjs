// Test pur pentru Prediction Engine. node test/prediction.test.mjs
import { predict, DETECTORS } from "../src/predictionEngine.js";

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };
const has = (preds, prefix) => preds.find((p) => p.key === prefix || p.key.startsWith(prefix));

// ── Fixtură realistă ──
const state = {
  asOf: "2026-07-08",
  openingBalance: 150000,
  obligations: [
    { dueDate: "2026-07-09", title: "BT Leasing - leaseback", amountRON: 99000, category: "Leasing", project: "General", priority: "normala" },
    { dueDate: "2026-07-13", title: "esalonare TVA", amountRON: 22127, category: "TVA", project: "General", priority: "normala" },
    { dueDate: "2026-07-13", title: "dobanzi penalitati esalonare", amountRON: 1500, category: "TVA", project: "General", priority: "normala" },
    { dueDate: "2026-07-30", title: "rata IMM", amountRON: 416000, category: "Credit", project: "General", priority: "ridicat" },
    { dueDate: "2026-07-30", title: "dobanda IMM Invest", amountRON: 25000, category: "Credit", project: "General", priority: "normala" },
    { dueDate: "2026-08-30", title: "rata IMM", amountRON: 416000, category: "Credit", project: "General", priority: "ridicat" },
  ],
  tasks: [
    { id: "T1", status: "in_lucru", deadline: "2026-06-24", assignee: "Nelu", project: "C3", priority: "ridicat" }, // overdue
    { id: "T2", status: "blocat", deadline: "2026-07-10", assignee: "Nelu", project: "C3", priority: "normala" }, // blocked + near
    { id: "T3", status: "nou", deadline: "2026-07-11", assignee: "Nelu", project: "C3", priority: "normala" }, // near
    { id: "T4", status: "in_lucru", deadline: "2026-07-20", assignee: "Nelu", project: "General", priority: "normala" },
    { id: "T5", status: "nou", deadline: "2026-06-20", assignee: "Nelu", project: "C3", priority: "normala" }, // overdue
    { id: "T6", status: "in_lucru", deadline: "2026-08-20", assignee: "Nelu", project: "General", priority: "normala" },
    { id: "T7", status: "nou", deadline: "2026-07-13", assignee: "Dana", project: "General", priority: "normala" },
    { id: "T8", status: "acceptat", deadline: "2026-06-01", assignee: "Nelu", project: "C3", priority: "normala" }, // închis, ignorat
  ],
  sales: { total: 30, disponibil: 20, rezervat: 6, vandut: 4, avansIncasat: 0 },
};

const r = predict(state);

// 1) Determinism
ok(JSON.stringify(predict(state)) === JSON.stringify(predict(state)), "determinist: același state → același rezultat");

// 2) Structură + câmpuri obligatorii pe fiecare predicție
ok(r.predictions.length > 0, `produce predicții (${r.predictions.length})`);
const SEV = ["low", "medium", "high", "critical"];
const fieldsOk = r.predictions.every((p) =>
  typeof p.title === "string" && SEV.includes(p.severity) &&
  typeof p.probability === "number" && p.probability >= 0 && p.probability <= 1 &&
  Number.isInteger(p.score) && p.score >= 0 && p.score <= 100 &&
  ("impact" in p) && (p.daysUntilProblem === null || typeof p.daysUntilProblem === "number") &&
  typeof p.recommendation === "string" && typeof p.why === "string" && p.why.length > 0);
ok(fieldsOk, "fiecare predicție are title/severity/probability/score/impact/daysUntilProblem/recommendation/why");

// 3) score coerent cu probability (0–100)
ok(r.predictions.every((p) => p.score <= Math.round(p.probability * 100)), "score ≤ probability×100 (ponderat cu urgența)");

// 4) Detectoare cheie declanșate
ok(!!has(r.predictions, "cash_"), "detectează risc de cash");
ok(r.predictions.some((p) => p.key.startsWith("cash_") && (p.severity === "high" || p.severity === "critical")), "risc cash pe 30/60z e high/critical (rata IMM 416k)");
ok(!!has(r.predictions, "rate_"), "detectează rată mare fără acoperire (IMM/Leasing)");
ok(!!has(r.predictions, "critical_oblig"), "detectează obligații care devin critice în 14 zile");
ok(!!has(r.predictions, "op_block"), "detectează blocaj operațional (task blocat)");
ok(!!has(r.predictions, "task_overrun"), "detectează task-uri care depășesc termenul");
const nelu = has(r.predictions, "overload_Nelu");
ok(!!nelu, "detectează supraîncărcarea lui Nelu");
ok(nelu && nelu.severity !== "low", `supraîncărcare Nelu are severitate ${nelu ? nelu.severity : "-"}`);
ok(!!has(r.predictions, "sales_trend"), "detectează pipeline fragil vânzări (rezervări fără avans)");

// 5) Alerts = subset high/critical
ok(r.alerts.every((a) => a.severity === "high" || a.severity === "critical"), "alerts conține doar high/critical");
ok(r.alerts.length > 0 && r.alerts.length <= r.predictions.length, `alerts e subset (${r.alerts.length} din ${r.predictions.length})`);

// 6) Confidence
ok(r.confidence > 0 && r.confidence <= 1, `confidence în (0,1]: ${r.confidence}`);
const rNoBalance = predict({ ...state, openingBalance: null });
ok(rNoBalance.confidence < r.confidence, `confidence scade fără sold (${rNoBalance.confidence} < ${r.confidence})`);
ok(rNoBalance.assumptions.some((a) => /sold curent necunoscut/i.test(a)), "asumpție explicită când lipsește soldul");

// 7) Extensibilitate — adaug un detector nou FĂRĂ să ating predict()
const custom = () => [{ key: "custom_x", title: "Detector custom", severity: "high", probability: 0.9, score: 90, impact: "-", daysUntilProblem: 2, recommendation: "r", why: "test extensibilitate" }];
const rExt = predict(state, { extraDetectors: [custom] });
ok(!!has(rExt.predictions, "custom_x"), "opts.extraDetectors adaugă un detector fără modificarea predict()");
ok(DETECTORS.length === 8, `registrul are 8 detectoare (${DETECTORS.length})`);

// 8) state invalid
ok(predict(null).confidence === 0 && predict({}).predictions.length === 0, "state invalid → răspuns gol, fără excepție");

// 9) Sortare după score (desc)
const scores = r.predictions.map((p) => p.score);
ok(scores.every((s, i) => i === 0 || scores[i - 1] >= s), "predicții sortate descrescător după score");

console.log("\n— TOP 5 predicții (exemplu) —");
for (const p of r.predictions.slice(0, 5)) console.log(`  [${p.score}] ${p.severity.toUpperCase()} · ${p.title} (p=${p.probability}, ${p.daysUntilProblem ?? "—"}z)\n     why: ${p.why}`);
console.log(`\nconfidence ${r.confidence} · assumptions: ${r.assumptions.length}`);

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"}`);
process.exit(failed === 0 ? 0 : 1);
