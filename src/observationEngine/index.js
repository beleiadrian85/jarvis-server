// OBSERVATION ENGINE (CODEX Faza 4) — API public + programare GATED.
// OFF implicit → dormant total (zero cron, zero rulari). SHADOW implicit ON
// cand ruleaza → scrie doar in audit/jarvis_state. Motorul OBSERVA: nu decide,
// nu executa, nu notifica (notificarile si convocarea Boardului = etape
// ulterioare, gated separat).
import cron from "node-cron";
import { config } from "./../config.js";
import { runObservationCycle } from "./observationRunner.js";

export { runObservationCycle };
export { collectWorld } from "./observationSources.js";
export { validateObservation } from "./observationValidator.js";

/** Starea motorului: "off" | "shadow" | "active" (active = shadow dezactivat explicit). */
export function observationMode() {
  if (!config.observationEngine) return "off";
  return config.observationShadow ? "shadow" : "active";
}

let _started = false;

/**
 * Porneste programarea (apelat din boot). NO-OP complet cu flag OFF —
 * boot-ul si job-urile existente raman neatinse.
 * Cadenta: rapid la OBSERVATION_INTERVAL_MINUTES (implicit 45); zilnic
 * aprofundat 06:45 (inaintea raportului de dimineata); saptamanal luni 06:30.
 */
export function startObservationEngine() {
  if (observationMode() === "off") {
    console.log("[observation] dormant (OBSERVATION_ENGINE_ENABLED=off)");
    return false;
  }
  if (_started) return true;
  _started = true;

  const step = Math.min(59, Math.max(30, config.observationIntervalMinutes));
  cron.schedule(`*/${step} * * * *`, () => {
    runObservationCycle({ kind: "quick" }).catch((e) => console.error("[observation.quick]", e.message));
  }, { timezone: "Europe/Bucharest" });
  cron.schedule("45 6 * * *", () => {
    runObservationCycle({ kind: "daily" }).catch((e) => console.error("[observation.daily]", e.message));
  }, { timezone: "Europe/Bucharest" });
  cron.schedule("30 6 * * 1", () => {
    runObservationCycle({ kind: "weekly" }).catch((e) => console.error("[observation.weekly]", e.message));
  }, { timezone: "Europe/Bucharest" });

  console.log(`[observation] activ (${observationMode()}): rapid la ${step} min, zilnic 06:45, saptamanal luni 06:30`);
  return true;
}
