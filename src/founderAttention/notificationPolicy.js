// FOUNDER ATTENTION — politica anti-spam. PUR, determinist.
// Cooldown per episod si per tip, limite zilnice, quiet hours.
// Starea (candidati emisi + contoare) traieste in jarvis_state (runner).

export const CANDIDATE_COOLDOWN_MS = {
  INTERRUPTIVE_ALERT: 6 * 3_600_000,
  FOUNDER_DECISION_REQUIRED: 12 * 3_600_000,
  default: 24 * 3_600_000,
};
export const MAX_ALERTS_PER_DAY = 5;
export const MAX_INTERRUPTIVE_PER_DAY = 2;
export const QUIET_START_HOUR = 22; // 22:00
export const QUIET_END_HOUR = 7;    // pana la 07:00

/** Ora locala Bucuresti pentru un timestamp. PUR (ora se poate injecta in teste). */
export function bucharestHour(ms) {
  return Number(new Intl.DateTimeFormat("ro-RO", { hour: "numeric", hour12: false, timeZone: "Europe/Bucharest" })
    .format(new Date(ms)));
}

export function inQuietHours(hour) {
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/**
 * Politica quiet hours pentru un candidat potential. PUR.
 * → { deferred, override } — critical confirmat determinist trece; restul → digest.
 */
export function applyQuietHours({ gateLevel, severity, confirmedRisk, hour }) {
  if (!inQuietHours(hour)) return { deferred: false, override: false };
  if (gateLevel === "INTERRUPTIVE_ALERT" && severity === "critical" && confirmedRisk)
    return { deferred: false, override: true };
  if (["INTERRUPTIVE_ALERT", "FOUNDER_DECISION_REQUIRED"].includes(gateLevel))
    return { deferred: true, override: false };
  return { deferred: false, override: false };
}

/**
 * Anti-spam la nivel de candidat. PUR.
 * Zero candidat nou daca: episod identic + severitate neschimbata + fara date
 * noi + fara worsening + termen neapropiat + fara decizie noua (toate acoperite
 * de _briefReason-ul episodului) SAU cooldown-ul tipului nu a expirat.
 * @param p.previous { [dedupKey]: { lastMs, level, sevRank } }
 * @param p.counters { date, alerts, interruptive }
 * → { allowed[], suppressed[], previous, counters }
 */
export function applyAntiSpam({ previous = {}, counters, candidates = [], nowMs, today }) {
  const SEV_RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
  const cnt = counters && counters.date === today
    ? { ...counters }
    : { date: today, alerts: 0, interruptive: 0 };
  const prev = { ...previous };
  const allowed = [];
  const suppressed = [];

  for (const c of candidates) {
    const key = c.deduplication_key;
    const p = prev[key];
    const cd = CANDIDATE_COOLDOWN_MS[c.attention_level] ?? CANDIDATE_COOLDOWN_MS.default;
    const sevRank = SEV_RANK[(c._severity || "medium")] ?? 2;

    if (p && nowMs - p.lastMs < cd && sevRank <= (p.sevRank ?? 0)) {
      suppressed.push({ key, reason: "cooldown_tip_alerta" });
      continue;
    }
    const isAlert = ["INTERRUPTIVE_ALERT", "FOUNDER_DECISION_REQUIRED"].includes(c.attention_level);
    if (isAlert && cnt.alerts >= MAX_ALERTS_PER_DAY) {
      suppressed.push({ key, reason: "max_alerte_pe_zi" });
      continue;
    }
    if (c.attention_level === "INTERRUPTIVE_ALERT" && cnt.interruptive >= MAX_INTERRUPTIVE_PER_DAY) {
      suppressed.push({ key, reason: "max_interruptive_pe_zi" });
      continue;
    }
    if (isAlert) { cnt.alerts++; if (c.attention_level === "INTERRUPTIVE_ALERT") cnt.interruptive++; }
    prev[key] = { lastMs: nowMs, level: c.attention_level, sevRank };
    allowed.push(c);
  }
  return { allowed, suppressed, previous: prev, counters: cnt };
}
