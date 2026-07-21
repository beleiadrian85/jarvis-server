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

// ── Faza 4.6 — Daily CEO Digest (SINGURUL canal real, gated separat) ─────
export { deliverDailyDigest, composeDigestMessage, priorityOfDay, contentHash } from "./digestDelivery.js";

let _digestStarted = false;

/**
 * Programeaza digestul zilnic (07:40 Europe/Bucharest — dupa rularea
 * aprofundata a Observation Engine 06:45 si briefingul supervisor 07:30).
 * Senderul (pushToOwner) e INJECTAT din boot — modulul nu importa canale.
 * NO-OP complet cu FOUNDER_DAILY_DIGEST_ENABLED=off (implicit).
 */
export function startDigestSchedule({ send } = {}) {
  if (!config.founderDailyDigest) {
    console.log("[digest] dormant (FOUNDER_DAILY_DIGEST_ENABLED=off)");
    return false;
  }
  if (_digestStarted) return true;
  _digestStarted = true;
  import("node-cron").then(({ default: cron }) => {
    cron.schedule("40 7 * * *", async () => {
      const { deliverDailyDigest } = await import("./digestDelivery.js");
      deliverDailyDigest({ send }).catch((e) => console.error("[digest]", e.message));
    }, { timezone: "Europe/Bucharest" });
    console.log("[digest] activ: zilnic 07:40 Europe/Bucharest (max 1 mesaj/zi)");
  });
  return true;
}
