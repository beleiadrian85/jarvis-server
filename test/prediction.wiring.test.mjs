// Teste wiring P2. node test/prediction.wiring.test.mjs
import { assembleState, getPredictionAlerts } from "../src/predictionState.js";
import { formatPredictionReport } from "../src/predictionReport.js";
import { predict } from "../src/predictionEngine.js";
import { config } from "../src/config.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

const OBLIG = [
  { dueDate: "2026-07-09", title: "BT Leasing - leaseback", amountRON: 99000, category: "Leasing", priority: "normala" },
  { dueDate: "2026-07-13", title: "esalonare TVA", amountRON: 22127, category: "TVA", priority: "normala" },
  { dueDate: "2026-07-30", title: "rata IMM", amountRON: 416000, category: "Credit", priority: "ridicat" },
  { dueDate: "2026-08-30", title: "rata IMM", amountRON: 416000, category: "Credit", priority: "ridicat" },
];
const TASKS = [
  { id: "T1", status: "in_lucru", deadline: "2026-06-24", assignee: "Nelu", project: "C3", priority: "ridicat" },
  { id: "T2", status: "blocat", deadline: "2026-07-10", assignee: "Nelu", project: "C3", priority: "normala" },
  { id: "T3", status: "nou", deadline: "2026-07-11", assignee: "Nelu", project: "C3", priority: "normala" },
  { id: "T4", status: "in_lucru", deadline: "2026-07-20", assignee: "Nelu", project: "General", priority: "normala" },
  { id: "T5", status: "nou", deadline: "2026-06-20", assignee: "Nelu", project: "C3", priority: "normala" },
  { id: "T6", status: "in_lucru", deadline: "2026-08-20", assignee: "Nelu", project: "General", priority: "normala" },
];
const SALES = { total: 30, disponibil: 20, rezervat: 6, vandut: 4, avansIncasat: 0 };

// 1) assembleState complet
const s1 = assembleState({ asOf: "2026-07-08", openingBalance: 150000, obligations: OBLIG, tasks: TASKS, sales: SALES, tasksSource: "opsdb" });
ok(s1.asOf === "2026-07-08" && s1.openingBalance === 150000, "state complet: asOf + openingBalance");
ok(s1.obligations.length === 4 && s1.tasks.length === 6 && s1.sales.total === 30, "state complet: surse mapate");
ok(Array.isArray(s1.inflows) && s1.inflows.length === 0, "inflows gol (nu se inventeaza)");
ok(!("history" in s1.sales), "sales fara history (nu se inventeaza)");
ok(s1._sources.tasks === "opsdb", "_sources reflecta sursa task-urilor (opsdb)");

// 2) state fara sold → confidence mai mica
const s2 = assembleState({ asOf: "2026-07-08", openingBalance: null, obligations: OBLIG, tasks: TASKS, sales: SALES, tasksSource: "mcp" });
ok(s2.openingBalance === null, "state fara sold: openingBalance null");
ok(predict(s2).confidence < predict(s1).confidence, "confidence scade fara sold");
ok(s2._sources.tasks === "mcp", "fallback tasksSource='mcp' reflectat");

// 3) lipsa vanzari → nu crapa, fara sales_trend eronat
const s3 = assembleState({ asOf: "2026-07-08", openingBalance: 150000, obligations: OBLIG, tasks: TASKS, sales: null, tasksSource: "mcp" });
const r3 = predict(s3);
ok(Array.isArray(r3.predictions), "lipsa vanzari: predict rezista");
ok(!r3.predictions.some((p) => p.key === "sales_trend"), "fara vanzari → fara predictie de trend");

// 4) formatPredictionReport — max 3, sectiuni, probability+confidence separat, [VOCE]<=300
const r1 = predict(s1);
const rep = formatPredictionReport(r1);
const summaryLines = rep.split("\n").filter((l) => /^\s+\[\d+\]/.test(l));
ok(summaryLines.length <= 3, `raport: maxim 3 predictii in sumar (${summaryLines.length})`);
ok(/CONFIRMAT/.test(rep) && /DATE LIPS[AĂ]/.test(rep), "raport contine CONFIRMAT + DATE LIPSĂ");
ok(/confidence \d+%/.test(rep) && /probabilitate \d+%/.test(rep), "afiseaza confidence SI probability separat");
const voce = (rep.match(/\[VOCE\]\s*([\s\S]*)$/) || [])[1] || "";
ok(voce.length > 0 && voce.length <= 300, `[VOCE] <= 300 caractere (${voce.length})`);

// 5) raport gol
const repEmpty = formatPredictionReport({ predictions: [], confidence: 0, assumptions: [] });
ok(/\[VOCE\]/.test(repEmpty) && /nimic notabil|insuficiente/i.test(repEmpty), "raport gol: mesaj sigur + [VOCE]");

// 6) getPredictionAlerts — doar high/critical, deduplicat
const alerts = getPredictionAlerts(s1);
ok(alerts.every((a) => a.severity === "high" || a.severity === "critical"), "alerts: doar high/critical");
ok(new Set(alerts.map((a) => a.title)).size === alerts.length, "alerts deduplicate dupa titlu");

// 7) determinism (assemble + predict)
ok(JSON.stringify(predict(assembleState({ asOf: "2026-07-08", openingBalance: 150000, obligations: OBLIG, tasks: TASKS, sales: SALES, tasksSource: "opsdb" })))
  === JSON.stringify(r1), "determinist: acelasi input → acelasi rezultat");

// 8) input invalid
ok(assembleState().asOf && Array.isArray(assembleState().obligations), "assembleState() fara argumente → shape valid (asOf injectat)");
ok(predict({}).predictions.length === 0, "predict({}) → gol, fara exceptie");

// 9) ZERO LLM pe ruta prediction — niciun import de claude/openai in modulele P1/P2
for (const f of ["src/predictionEngine.js", "src/predictionState.js", "src/predictionReport.js"]) {
  const src = readFileSync(path.join(__dirname, "..", f), "utf8");
  const llm = /from\s+["'][^"']*(claude|openai)[^"']*["']/i.test(src);
  ok(!llm, `${f}: zero import LLM (claude/openai)`);
}
ok(!/from\s+["'][^"']*(claude|openai)/i.test(readFileSync(path.join(__dirname, "..", "src/predictionEngine.js"), "utf8"))
   && readFileSync(path.join(__dirname, "..", "src/predictionEngine.js"), "utf8").indexOf("import ") === -1, "predictionEngine.js: ZERO importuri (pur)");

// 10) flag OFF implicit (rollback trivial)
ok(config.predictionEngine === false, "PREDICTION_ENGINE implicit OFF (comportament neschimbat)");

// 11) timing — engine pur, rapid
const t0 = Date.now();
for (let i = 0; i < 50; i++) predict(s1);
const per = (Date.now() - t0) / 50;
ok(per < 20, `engine rapid: ${per.toFixed(2)} ms/apel (pur, fara IO)`);

// 12) buildPredictionState (IO real) e verificat separat, offline-safe, in
//     smoke-ul de validare — testele unitare raman pure (fara retea).

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"}`);
process.exit(failed === 0 ? 0 : 1);
