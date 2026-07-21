// FOUNDER ATTENTION GATE (CODEX Faza 4.4) — API public. GATED total:
// FOUNDER_ATTENTION_GATE_ENABLED implicit OFF. Decide CE merita atentia lui
// Adrian si CAND — dar in aceasta faza NIMIC nu se trimite (safe_to_send=false
// fortat; notificarile reale cer FOUNDER_NOTIFICATIONS_ENABLED + aprobarea lui).
import { config } from "../config.js";
import { runFounderGate } from "./founderGateRunner.js";

export { runFounderGate };
export { gateEpisode, hasConfirmedRisk, ATTENTION_LEVELS } from "./attentionGate.js";
export { buildNotificationCandidate, groupCandidates } from "./notificationCandidate.js";
export { applyQuietHours, applyAntiSpam, inQuietHours } from "./notificationPolicy.js";
export { buildDailyDigest } from "./dailyDigest.js";

/** Starea gate-ului: "off" | "shadow" | "active". */
export function founderAttentionMode() {
  if (!config.founderAttentionGate) return "off";
  return config.founderAttentionShadow ? "shadow" : "active";
}
