// FOUNDER ATTENTION — candidatul de notificare. PUR. safe_to_send este
// FORTAT false in aceasta faza (nicio notificare reala pana la aprobarea
// explicita a fondatorului + FOUNDER_NOTIFICATIONS_ENABLED=on).

const CHANNEL = {
  INTERRUPTIVE_ALERT: "telegram",
  FOUNDER_DECISION_REQUIRED: "telegram",
  DATA_REQUIRED_BEFORE_DECISION: "digest",
  DAILY_DIGEST: "digest",
  AUDIT_ONLY: "hud",
  IGNORE: "hud",
};

/**
 * Construieste candidatul canonic dintr-un episod + verdictul gate-ului.
 * @param p.episode  episodul executiv
 * @param p.gate     { level, reasons, interruptive_blocked }
 * @param p.quiet    { deferred: bool, override: bool } (politica quiet hours)
 */
export function buildNotificationCandidate({ episode, gate, quiet = { deferred: false, override: false } }) {
  const level = quiet.deferred ? "DAILY_DIGEST" : gate.level;
  const deadline = episode._minUrgencyDays != null && episode._minUrgencyDays < 900
    ? `in ${episode._minUrgencyDays} zile`
    : "";
  return {
    notification_candidate_id: `nc:${episode.episode_id}:${level}`,
    episode_id: episode.episode_id,
    attention_level: level,
    title: episode.title,
    why_now: gate.reasons.join("; "),
    what_changed: episode._briefReason || episode.status,
    business_impact: episode.business_impact || [],
    decision_needed: ["FOUNDER_DECISION_REQUIRED", "DATA_REQUIRED_BEFORE_DECISION"].includes(level)
      ? (episode._decisions || "")
      : "",
    deadline,
    confidence: episode.combined_confidence ?? 0,
    data_quality: (episode._members || []).every((m) => m.data_quality === "complete") ? "complete"
      : (episode._members || []).some((m) => m.data_quality === "poor") ? "poor" : "partial",
    missing_data: episode.unknowns || [],
    suggested_channel: CHANNEL[level] || "hud",
    safe_to_send: false, // FORTAT in Faza 4.4 — nicio notificare reala
    deduplication_key: `${episode.episode_id}:${level}`,
    quiet_deferred: quiet.deferred || undefined,
    quiet_override: quiet.override || undefined,
  };
}

/** Grupare: mai multe alerte interruptive intr-o rulare → UNA singura, grupata. */
export function groupCandidates(candidates = []) {
  const interruptive = candidates.filter((c) => c.attention_level === "INTERRUPTIVE_ALERT");
  if (interruptive.length <= 1) return candidates;
  const rest = candidates.filter((c) => c.attention_level !== "INTERRUPTIVE_ALERT");
  const grouped = {
    ...interruptive[0],
    notification_candidate_id: `nc:grup:${interruptive.length}`,
    title: `${interruptive.length} alerte importante simultan`,
    why_now: interruptive.map((c) => `${c.title}: ${c.why_now}`).join(" | ").slice(0, 400),
    business_impact: [...new Set(interruptive.flatMap((c) => c.business_impact))].slice(0, 4),
    missing_data: [...new Set(interruptive.flatMap((c) => c.missing_data))].slice(0, 4),
    deduplication_key: `grup:${interruptive.map((c) => c.episode_id).sort().join("|")}`,
    grouped_from: interruptive.map((c) => c.episode_id),
  };
  return [grouped, ...rest];
}
