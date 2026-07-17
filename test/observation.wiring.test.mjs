// Teste wiring Observation Engine — flag-uri, runner (world/llm injectate),
// lock, cache, garzi de sursa. node test/observation.wiring.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";
delete process.env.OBSERVATION_ENGINE_ENABLED;
delete process.env.OBSERVATION_ENGINE_SHADOW_MODE;
delete process.env.OBSERVATION_NOTIFICATIONS_ENABLED;
delete process.env.OBSERVATION_BOARD_ESCALATION_ENABLED;

const { config } = await import("../src/config.js");
const { observationMode, startObservationEngine } = await import("../src/observationEngine/index.js");
const { runObservationCycle } = await import("../src/observationEngine/observationRunner.js");
const { validateObservation } = await import("../src/observationEngine/observationValidator.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = (f) => readFileSync(path.join(__dirname, "..", "src", f), "utf8");
let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// ── Test 1: flag-uri implicit sigure; OFF nu schimba comportamentul ─────
ok(config.observationEngine === false, "OBSERVATION_ENGINE_ENABLED implicit OFF");
ok(config.observationShadow === true, "OBSERVATION_ENGINE_SHADOW_MODE implicit ON (sigur)");
ok(config.observationNotifications === false, "OBSERVATION_NOTIFICATIONS_ENABLED implicit OFF");
ok(config.observationBoardEscalation === false, "OBSERVATION_BOARD_ESCALATION_ENABLED implicit OFF");
ok(observationMode() === "off", "observationMode() = off implicit");
ok(startObservationEngine() === false, "startObservationEngine cu flag OFF → dormant (zero cron)");
// Test 39: intervalul respecta limita configurata (minim 30)
ok(config.observationIntervalMinutes >= 30, `interval minim 30 min (${config.observationIntervalMinutes})`);

// ── Garzi de sursa (teste 3,4,5,30,31,37) ───────────────────────────────
const OBS_FILES = readdirSync(path.join(__dirname, "..", "src", "observationEngine")).map((f) => "observationEngine/" + f);
const allObs = OBS_FILES.map(SRC).join("\n");
ok(!/from\s+["'][^"']*(taskflow|approvalGate|mcp)\.js["']/.test(allObs), "zero importuri taskflow/approvalGate/mcp (nu executa actiuni)");
ok(!/from\s+["'][^"']*(telegram|notifier|tts)\.js["']/.test(allObs), "zero importuri telegram/notifier/tts (nu notifica)");
ok(!/from\s+["'][^"']*sources\/(gmail|calendar|drive)\.js["']/.test(allObs) && !/from\s+["'][^"']*google\.js["']/.test(allObs), "zero importuri Gmail/Calendar/Drive (nu le modifica)");
ok(!/(create_task|update_task|delete_task|restore_task|add_observation|import_price_references|create_task_from_obligation|createDraft|sendMessage)/.test(allObs), "zero referinte la scrieri Operational/Gmail/mesaje");
ok(!/from\s+["'][^"']*executiveBoard/.test(allObs), "Boardul NU e importat → NU poate fi convocat automat (etapa curenta)");
ok(!/CREATE TABLE|ALTER TABLE/i.test(allObs), "zero modificari de schema DB in modulele motorului");
ok(/INSERT INTO jarvis_state|setState|getState/.test(SRC("observationEngine/observationSources.js") + SRC("observationEngine/observationRunner.js")), "persistenta DOAR prin jarvis_state existent");
const gate = await import("../src/approvalGate.js");
for (const fn of ["proposeAction", "confirmActionById", "cancelActionById"]) ok(typeof gate[fn] === "function", `approvalGate.${fn} intact`);
// Test 38: raspunsurile vizibile neschimbate — brain.js nu importa motorul
ok(!/observationEngine/.test(SRC("brain.js")), "brain.js NU importa Observation Engine (raspunsurile vizibile neatinse)");
// Test 6: ruleaza in fundal — doar cron gated in boot
ok(/startObservationEngine\(\)/.test(SRC("index.js")), "boot: pornire gated (no-op cu flag OFF)");
ok(/cron\.schedule/.test(SRC("observationEngine/index.js")), "programare prin cron (fundal), nu in fluxul cererilor");

// ── Runner cu world injectat (fara retea) ────────────────────────────────
const NOW = "2026-07-17T10:00:00.000Z";
const WORLD = {
  now: NOW, asOf: "2026-07-17", period: { from: "2026-07-17", to: "2026-07-17" },
  obligations: [
    { dueDate: "2026-07-20", title: "rata IMM", amountRON: 416000, category: "Credit" },
    { dueDate: "2026-07-10", title: "factura beton", amountRON: 30000, category: "Furnizori" },
  ],
  tasks: [{ id: "T1", status: "nou", deadline: null, assignee: null, title: "Aviz" }],
  taskGroups: { blocate: 0, azi: 0, intarziate: 0, ok: 1 },
  sales: null, openingBalance: null, forecast: null,
  predictions: [], health: { score: 60 }, reminders: [], decisions: [],
  disciplineFlags: [], auditRecent: [], errors: [], pendingApprovals: null,
  jobs: [], traffic: null,
  sourceMeta: { collectedAt: NOW, missing: ["vanzari (sales_summary)"], freshnessHours: 0 },
};
const BASE = { world: WORLD, previousState: {}, persist: false, noCache: true };

// Test 2+37: shadow nu notifica (safe_to_notify=false chiar cu notificari pornite)
let llmCalls = 0;
const spyLlm = async () => { llmCalls++; return "sinteza test"; };
const res1 = await runObservationCycle({ ...BASE, llm: spyLlm, flags: { shadow: true, notifications: true, boardEscalation: false } });
ok(res1.ran === true && res1.observations.length > 0, `rulare completa: ${res1.observations?.length} observatii emise`);
ok(res1.observations.every((o) => o.safe_to_notify === false), "SHADOW: safe_to_notify=false pe TOATE, chiar cu notificari pornite");
// Test 40: fiecare observatie emisa respecta schema
ok(res1.observations.every((o) => validateObservation(o).valid), "fiecare observatie emisa respecta schema canonica");
ok(res1.observations.some((o) => o.requires_board_review), "escaladarea e MARCATA (impact ≥100k)");
ok(res1.llmUsed === true && llmCalls === 1, "sinteza LLM: exact 1 apel cand exista observatii semnificative");

// Test 35: cost LLM zero fara observatii relevante
let llmCalls2 = 0;
const spy2 = async () => { llmCalls2++; return "x"; };
const quiet = { ...WORLD, obligations: [], tasks: [{ id: "T1", status: "nou", deadline: null, assignee: "Dana", title: "A" }], sourceMeta: { collectedAt: NOW, missing: [], freshnessHours: 0 } };
const res2 = await runObservationCycle({ ...BASE, world: quiet, llm: spy2 });
ok(llmCalls2 === 0, `zero apeluri LLM cand nu exista observatii semnificative (${res2.observations.length} emise)`);

// Test 36: esecul LLM pastreaza rezultatul determinist
const res3 = await runObservationCycle({ ...BASE, llm: async () => { throw new Error("timeout"); } });
ok(res3.ran === true && res3.observations.length === res1.observations.length && res3.llmUsed === false, "LLM picat → observatiile deterministe raman, sinteza fallback");

// Test 7: o eroare nu blocheaza JARVIS (runner nu arunca niciodata)
const res4 = await runObservationCycle({ ...BASE, world: { now: NOW, asOf: "2026-07-17", obligations: "corupt", sourceMeta: {} } });
ok(res4 && !("then" in res4) && (res4.ran === true || res4.error), "world corupt → rulare izolata, fara exceptie propagata");

// Test 8: rulari concurente prevenite (lock)
const slowLlm = async () => { await new Promise((r) => setTimeout(r, 250)); return "ok"; };
const p1 = runObservationCycle({ ...BASE, llm: slowLlm });
const p2 = await runObservationCycle({ ...BASE, llm: null });
ok(p2.skipped === "in_progress", "a doua rulare concurenta → skipped (lock)");
await p1;

// Test 9: date identice → nu se reanalizeaza (cache)
let llmCalls3 = 0;
const spy3 = async () => { llmCalls3++; return "x"; };
const c1 = await runObservationCycle({ world: WORLD, previousState: {}, persist: false, llm: spy3 });
const c2 = await runObservationCycle({ world: JSON.parse(JSON.stringify(WORLD)), previousState: {}, persist: false, llm: spy3 });
ok(c1.ran === true && c2.skipped === "date_neschimbate" && llmCalls3 === 1, "date identice → a doua rulare sare complet (cache)");

// Test 34: aceeasi intrare → structura stabila (fara timestamps noi)
const d1 = await runObservationCycle({ ...BASE, llm: null });
const d2 = await runObservationCycle({ ...BASE, llm: null });
ok(JSON.stringify(d1.observations) === JSON.stringify(d2.observations), "aceeasi intrare → aceleasi observatii (determinism end-to-end)");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — observation (wiring)`);
process.exit(failed === 0 ? 0 : 1);
