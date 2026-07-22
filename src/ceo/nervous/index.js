// NERVOUS SYSTEM V1 — inregistrare in ritmul companiei (§18) + barrel.
// GATED: CEO_NERVOUS_SYSTEM_ENABLED=off → dormant total, zero cron.
// Dimineata 07:10 (dupa observation daily 06:45, INAINTE de digestul 07:40 —
// digestul poate include starea organismului) si mini-check 15:30.
// Reactivitatea la schimbari de stare (nu doar cron) e cablata in ceo/api.js:
// POST bank-balance / proposals/decision declanseaza un ciclu "reactive".
import { config } from "../../config.js";
import { runNervousCycle } from "./cycle.js";

let _started = false;

export function startNervousSystem() {
  if (!config.nervousSystem) {
    console.log("[nervous] dormant (CEO_NERVOUS_SYSTEM_ENABLED=off)");
    return;
  }
  if (_started) return;
  _started = true;
  import("node-cron").then(({ default: cron }) => {
    const tz = { timezone: "Europe/Bucharest" };
    // Ciclul cognitiv (PARTEA II/XIII): INGEST documente → management. Cade
    // elegant pe runNervousCycle daca orchestratorul lipseste.
    const cycle = async (kind) => {
      try {
        const { runCognitiveCycle } = await import("../cognitiveOrchestrator.js");
        return await runCognitiveCycle({ kind, persist: true });
      } catch { return runNervousCycle({ kind, persist: true }); }
    };
    // §18 — ciclul de dimineata: task-urile de ieri, overdue, rezultate,
    // nevoi noi, max 3 prioritati active/persoana, blocaje, ce cere fondatorul.
    cron.schedule("10 7 * * *", () => cycle("morning"), tz);
    // §18 — mini-check ~15:30: ce s-a terminat, ce e blocat, ce s-a schimbat.
    cron.schedule("30 15 * * *", () => cycle("midday"), tz);
    console.log(`[nervous] pornit (mode=${config.taskAutonomy}, autonomous_info=${config.autonomousInfoTasks}, kill=${config.nervousKill}) — 07:10 + 15:30`);
  });
}

/** Ciclu reactiv, best-effort, ne-blocant — apelat la schimbari de stare. */
export function triggerReactiveCycle(reason = "state-change") {
  if (!config.nervousSystem) return;
  setTimeout(() => {
    runNervousCycle({ kind: "reactive", persist: true })
      .then((r) => { if (r?.ran) console.log(`[nervous] reactiv (${reason})`); })
      .catch(() => {});
  }, 1500);
}

export { runNervousCycle } from "./cycle.js";
export * from "./contract.js";
export { opsWrite, opsUpdateCeoTask, assertTasksOnly, checkLimits, activeLimits, ALLOWED_WRITE_TOOLS, BLOCKED_WRITE_KINDS } from "./operationalWrite.js";
export { buildNeeds, scoreTaskValue, answerFifteen } from "./needEngine.js";
export { buildResponsibilityMap, ownerForDomain } from "./responsibilityMap.js";
export { delegateNeed, founderCheck } from "./delegationEngine.js";
export { checkDuplicate, noteCooldown } from "./dedupEngine.js";
export { buildCeoTask, classifyForAutonomy } from "./taskOrchestrator.js";
export { verifyTaskResult, verificationPlan } from "./resultVerification.js";
export { evaluateFollowUp, maxOneReminder } from "./followUpEngine.js";
export { escalationCost, planEscalation } from "./escalationEngine.js";
export { buildPeopleLoad } from "./peopleLoad.js";
export { recordOutcome, delegationConfidence, bestOwnerFor, summarizeMemory } from "./orgMemory.js";
export { buildSelfEval } from "./selfEval.js";
export { appendStream, appendMany, formatStream, STREAM_EVENTS } from "./activityStream.js";
export { assessNervousHealth, formatNervousHealth } from "./organismHealth.js";
