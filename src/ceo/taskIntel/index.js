// TASK INTELLIGENCE ENGINE — orchestrator. Ruleaza ciclul de invatare (read-only pe
// Operational): ingest taskuri finalizate → knowledge cards → experience. Produce
// recomandari la task nou. NU executa/modifica/decide. Gated CEO_TASK_INTELLIGENCE.
import { config } from "../../config.js";
import { audit } from "../../audit.js";
import { getState, setState } from "../../state.js";
import { ingestTasks, getTaskRecords } from "./ingest.js";
import { extractConversation, buildKnowledgeCard, saveKnowledge, getKnowledge } from "./knowledge.js";
import { buildExperience } from "./experience.js";
import { recommendForTask, recommendationEnvelope } from "./recommend.js";
import { findSimilar } from "./similar.js";

const EXP_KEY = "ceo:taskintel:experience";
const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * Un ciclu complet de invatare. READ-ONLY pe Operational. @returns rezumat.
 * `llm` injectabil pt extractia conversatiei (best-effort; fara → euristica).
 */
export async function runLearningCycle({ collect = null, attachmentsFor = null, observationsFor = null, llm = null, store = null, nowISO = null } = {}) {
  const S = store || { get: getState, set: setState };
  if (!config.taskIntelligence) return { skipped: "flag off" };
  // 1. TASK MEMORY (idempotent).
  const ing = await ingestTasks({ collect, attachmentsFor, observationsFor, store: S, nowISO });
  // 2. KNOWLEDGE — doar pt taskurile noi indexate (fara re-procesare).
  const records = await getTaskRecords({ store: S });
  const known = new Set((await getKnowledge({ store: S })).map((k) => k.task_id));
  let built = 0;
  for (const r of records) {
    if (known.has(r.id)) continue;
    let observations = [];
    if (typeof observationsFor === "function") observations = await observationsFor(r.id).catch(() => []);
    const conv = await extractConversation(observations, { llm });
    await saveKnowledge(buildKnowledgeCard(r, { conversation: conv, documents: [], nowISO }), { store: S });
    built++;
  }
  // 3. EXPERIENCE — agregare pe fingerprint.
  const cards = await getKnowledge({ store: S });
  const experiences = buildExperience(cards);
  await S.set(EXP_KEY, { experiences, at: nowISO || new Date().toISOString() }).catch(() => {});
  await audit("taskintel_cycle", `indexed=${ing.indexed} knowledge=${built} experiences=${experiences.length}`, "", true).catch(() => {});
  return { ...ing, knowledge_built: built, experiences: experiences.length, patterns: experiences.filter((e) => e.is_pattern).length };
}

export async function getExperiences({ store = null } = {}) {
  const S = store || { get: getState, set: setState };
  return arr(((await S.get(EXP_KEY, { experiences: [] }).catch(() => null)) || {}).experiences);
}

/** La un task NOU: similar + recomandare (nu decide). @returns { similar, recommendation, envelope } */
export async function adviseNewTask(newTask = {}, { store = null, user_id = "adrian", conversation_id = null } = {}) {
  const S = store || { get: getState, set: setState };
  const records = await getTaskRecords({ store: S });
  const experiences = await getExperiences({ store: S });
  const similar = findSimilar(newTask, records);
  const recommendation = recommendForTask(newTask, { records, experiences });
  const envelope = recommendation ? await recommendationEnvelope(recommendation, { user_id, conversation_id }) : null;
  return { similar, recommendation, envelope };
}
