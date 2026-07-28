// TASK INTELLIGENCE ENGINE V2 (ETAPA 2) — observa/invata/coreleaza/recomanda,
// read-only pe Operational. node test/taskIntel.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";
process.env.APP_SECRET ||= "test-secret-1234567890";
process.env.TASK_INTELLIGENCE_ENABLED = "on";

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
config.taskIntelligence = true; config.appSecret = "test-secret-1234567890";
import { ingestTasks, buildTaskRecord, isFinished, problemType, getTaskRecords } from "../src/ceo/taskIntel/ingest.js";
import { buildKnowledgeCard, extractConversation } from "../src/ceo/taskIntel/knowledge.js";
import { buildExperience, experienceFor } from "../src/ceo/taskIntel/experience.js";
import { findSimilar } from "../src/ceo/taskIntel/similar.js";
import { recommendForTask } from "../src/ceo/taskIntel/recommend.js";
import { runLearningCycle, adviseNewTask } from "../src/ceo/taskIntel/index.js";

let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(`${c ? "✅" : "❌"} ${n}. ${m}`); if (!c) failed++; };
const mkStore = () => { const mem = {}; return { get: async (k, f) => (k in mem ? mem[k] : f), set: async (k, v) => { mem[k] = v; } }; };

// Task-uri Operational simulate (finalizate + unul deschis).
const TASKS = [
  { id: "T1", title: "Extras CEC cont firma", status: "acceptat", assigneeName: "Dana", creator: "Adrian", project: "Birou", createdAt: "2026-07-01T09:00:00Z", updatedAt: "2026-07-01T09:12:00Z", report: "actualizare Cash cu extras.pdf" },
  { id: "T2", title: "Extras bancar ING", status: "rezolvat", assigneeName: "Dana", creator: "Adrian", createdAt: "2026-07-05T10:00:00Z", updatedAt: "2026-07-05T10:20:00Z", report: "reconciliat" },
  { id: "T3", title: "Extrase cont BT", status: "acceptat", assigneeName: "Dana", createdAt: "2026-07-08T10:00:00Z", updatedAt: "2026-07-08T10:15:00Z", report: "ok" },
  { id: "T4", title: "Certificat urbanism Mârșa", status: "acceptat", assigneeName: "Nelu", createdAt: "2026-07-02T09:00:00Z", updatedAt: "2026-07-04T09:00:00Z", report: "depus" },
  { id: "T5", title: "Task deschis", status: "in_lucru", assigneeName: "Nelu", createdAt: "2026-07-09T09:00:00Z" },
];
const collect = async () => ({ tasks: TASKS });

// ══ TASK MEMORY (ingest) ══
ok(isFinished("acceptat") && isFinished("rezolvat") && !isFinished("in_lucru"), "isFinished: acceptat/rezolvat da, in_lucru nu");
ok(problemType("Extras CEC cont") === "extras_bancar" && problemType("Certificat urbanism") === "autorizatie", "problemType clasifica din titlu");
{ const r = buildTaskRecord(TASKS[0]);
  ok(r.id === "T1" && r.executant === "Dana" && r.resolution_time_min === 12 && r.problem_type === "extras_bancar", "TaskRecord: executant + timp rezolvare (12 min) + tip"); }
{ const store = mkStore();
  const r1 = await ingestTasks({ collect, store });
  ok(r1.indexed === 4 && r1.total_records === 4, "ingest: doar cele 4 finalizate (nu task deschis)");
  const r2 = await ingestTasks({ collect, store });
  ok(r2.indexed === 0 && r2.skipped === 4, "ingest idempotent: a doua rulare → 0 indexate (neschimbate)"); }

// ══ KNOWLEDGE (extractie conversatie, nu bruta) ══
{ const conv = await extractConversation([{ note: "Unde e extrasul?" }, { note: "Atasat, cont CEC" }]); // fara llm → euristica
  ok(conv.problem && conv.questions.length >= 1, "extractConversation (fallback) → problema + intrebari"); }
{ const card = buildKnowledgeCard(buildTaskRecord(TASKS[0]), { conversation: { problem: "extras lipsa", conclusion: "cash actualizat" }, documents: [{ filename: "extras.pdf", doc_type: "bank_statement" }] });
  ok(card.task_id === "T1" && card.who === "Dana" && card.reusable.some((x) => /Dana rezolva/.test(x)) && card.documents_used.length === 1, "KnowledgeCard: cine/reutilizabil/documente");
  ok(!("raw" in card) && !JSON.stringify(card).includes("Unde e extrasul"), "KnowledgeCard NU stocheaza conversatia bruta"); }

// ══ EXPERIENCE (agregare, pattern din N+) ══
{ const cards = TASKS.filter((t) => isFinished(t.status)).map((t) => buildKnowledgeCard(buildTaskRecord(t), { conversation: {} }));
  const exp = buildExperience(cards, { minOccurrences: 3 });
  const bank = experienceFor("extras_bancar", exp);
  ok(bank && bank.occurrences === 3 && bank.typical_owner === "Dana" && bank.is_pattern, "experience: extras_bancar → 3 ocurente, owner Dana, PATTERN");
  const urb = experienceFor("autorizatie", exp);
  ok(urb && urb.occurrences === 1 && !urb.is_pattern, "experience: autorizatie → 1 ocurenta, NU pattern (nu dintr-un caz)"); }

// ══ SIMILAR + RECOMMEND ══
{ const store = mkStore(); await ingestTasks({ collect, store });
  const records = await getTaskRecords({ store });
  const sim = findSimilar({ title: "Extras cont Raiffeisen" }, records);
  ok(sim.problem_type === "extras_bancar" && sim.similar_tasks.length >= 2 && sim.similar_people[0].name === "Dana", "similar: task nou 'extras' → taskuri Dana similare");
  const cards = records.map((r) => buildKnowledgeCard(r, { conversation: {} }));
  const exp = buildExperience(cards);
  const rec = recommendForTask({ title: "Extras cont nou" }, { records, experiences: exp });
  ok(rec && rec.suggested_executant === "Dana" && rec.estimated_time_min != null && rec.based_on_task_ids.length >= 2, "recommend: executant Dana + timp estimat + bazat pe taskuri");
  ok(/decizia ramane a ta/i.test(rec.disclaimer), "recommend: DOAR recomanda (disclaimer decizia ta)");
  const none = recommendForTask({ title: "Ceva complet nou xyzzy" }, { records: [], experiences: [] });
  ok(none === null, "recommend: fara baza → NULL (nu inventeaza)"); }

// ══ FULL CYCLE + ADVISE (read-only) ══
{ const store = mkStore();
  const cy = await runLearningCycle({ collect, store });
  ok(cy.indexed === 4 && cy.knowledge_built === 4 && cy.experiences >= 2, "ciclu complet: ingest+knowledge+experience");
  const adv = await adviseNewTask({ title: "Extras cont firma noua" }, { store });
  ok(adv.recommendation && adv.recommendation.suggested_executant === "Dana", "advise task nou → recomandare Dana");
  ok(adv.envelope && adv.envelope.information_requests?.length >= 1, "advise → envelope cu Action Card (recomandare, nu executie)"); }

// ══ GARDA STRUCTURALA: read-only pe Operational (nu executa/modifica) ══
{ const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "ceo", "taskIntel");
  const all = readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n");
  ok(!/from\s+["'][^"']*(taskflow|approvalGate|operationalWrite)\.js["']/.test(all), "taskIntel NU importa executie/scriere (taskflow/approvalGate/operationalWrite)");
  ok(!/(create_task|update_task|delete_task|add_observation)\s*\(/.test(all), "taskIntel NU apeleaza scrieri Operational");
  ok(!/opsQuery\(\s*["'`]\s*(INSERT|UPDATE|DELETE)/i.test(all), "taskIntel: zero scriere opsdb (read-only)");
  ok(/collector\.js|collectState/.test(all), "taskIntel citeste prin collectState (opsdb read-only)"); }

console.log(`\n${n} verificari · ${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — taskIntel`);
process.exit(failed === 0 ? 0 : 1);
