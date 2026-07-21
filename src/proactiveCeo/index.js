// PROACTIVE CEO PIPELINE (CODEX Faza 4.2) — API public. GATED total:
// PROACTIVE_CEO_PIPELINE_ENABLED implicit OFF → pipeline-ul nu ruleaza deloc.
// Lantul: Observation Engine → Signal Triage → Executive Episodes →
// Board Escalation Preview → CEO Brief → (Adrian decide).
// Zero actiuni automate, zero notificari, zero convocare Board live.
import { config } from "../config.js";
import { runProactivePipeline } from "./pipelineRunner.js";

export { runProactivePipeline };
export { triageObservation, triageAll } from "./signalTriage.js";
export { groupIntoEpisodes, reconcileEpisodes } from "./executiveEpisodes.js";
export { buildBoardPreview } from "./boardPreview.js";
export { buildCeoBrief } from "./ceoBrief.js";

/** Starea pipeline-ului: "off" | "shadow" | "active". */
export function proactiveCeoMode() {
  if (!config.proactiveCeoPipeline) return "off";
  return config.proactiveCeoShadow ? "shadow" : "active";
}
