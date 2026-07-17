// OBSERVATION ENGINE — deduplicare si anti-spam. NUCLEU PUR (reconcile);
// persistenta starii se face in runner prin jarvis_state (fara tabele noi).
// Diferentiaza: new / repeated / worsening / improving / resolved.
// Nu emite observatii doar ca sa demonstreze ca motorul ruleaza.

export const COOLDOWN_HOURS = { critical: 2, high: 6, default: 24 };
export const MAX_PER_RUN = 10;
export const WEAK_SCORE = 15;      // sub acest scor = semnal slab
export const WEAK_MIN_COUNT = 3;   // semnal slab emis doar daca persista N rulari

const cooldownMs = (sev) => (COOLDOWN_HOURS[sev] ?? COOLDOWN_HOURS.default) * 3_600_000;

/**
 * Reconciliaza observatiile curente cu starea anterioara. PUR.
 * @param p.previous   map persistat: { [dedupKey]: {score,severity,count,lastSeenMs,lastEmittedMs,title,category,type,resolvedEmitted} }
 * @param p.observations  observatiile VALIDE ale rularii curente
 * @param p.nowMs
 * → { emitted, suppressed, state }
 */
export function reconcile({ previous = {}, observations = [], nowMs = 0, maxPerRun = MAX_PER_RUN } = {}) {
  const state = {};
  const candidates = [];
  const suppressed = [];
  const currentKeys = new Set();

  for (const o of observations) {
    const key = o.deduplication_key;
    currentKeys.add(key);
    const prev = previous[key];
    let status = "new";
    let count = 1;
    if (prev) {
      count = (prev.count || 1) + 1;
      const delta = (o._score ?? 0) - (prev.score ?? 0);
      status = delta >= 10 ? "worsening" : delta <= -10 ? "improving" : "repeated";
    }
    const obs = { ...o, status };
    const entry = {
      score: o._score ?? 0, severity: o.severity, count,
      lastSeenMs: nowMs, lastEmittedMs: prev?.lastEmittedMs || 0,
      title: o.title, category: o.category, type: o.type,
    };

    // Semnal slab: se emite doar daca persista.
    if ((o._score ?? 0) < WEAK_SCORE && count < WEAK_MIN_COUNT) {
      suppressed.push({ key, reason: "semnal_slab", status });
      state[key] = entry;
      continue;
    }
    // Cooldown: "repeated" ne-agravat nu se re-emite in fereastra.
    if (status === "repeated" && prev?.lastEmittedMs && nowMs - prev.lastEmittedMs < cooldownMs(o.severity)) {
      suppressed.push({ key, reason: "cooldown", status });
      state[key] = entry;
      continue;
    }
    candidates.push({ obs, entry, key });
  }

  // Rezolvate: probleme din starea anterioara care nu mai apar → emise O data.
  for (const [key, prev] of Object.entries(previous)) {
    if (currentKeys.has(key) || prev.resolvedEmitted) continue;
    candidates.push({
      key,
      entry: { ...prev, resolvedEmitted: true, lastSeenMs: prev.lastSeenMs },
      obs: {
        observation_id: `obs:${key}`,
        type: prev.type, category: prev.category,
        title: `Rezolvat: ${prev.title}`,
        summary: `Observatia „${prev.title}” nu mai apare in datele curente — considerata rezolvata sau iesita din perioada.`,
        detected_at: new Date(nowMs).toISOString(),
        period_analyzed: {}, severity: "info", confidence: 60, data_quality: "partial",
        evidence: [`[dedup] cheia ${key} prezenta anterior (scor ${prev.score}), absenta acum`],
        sources: ["observationDeduplicator"],
        metrics: { scorAnterior: prev.score }, baseline: {}, deviation: {},
        business_impact: [], urgency_reason: "",
        possible_causes: [], unknowns: [], recommended_next_analysis: [],
        requires_board_review: false, requires_founder_attention: false, requires_immediate_action: false,
        deduplication_key: key, status: "resolved", safe_to_notify: false,
        _score: 0,
      },
    });
  }

  // Prioritizare: scorul cel mai mare intai; limita dura per rulare.
  candidates.sort((a, b) => (b.obs._score ?? 0) - (a.obs._score ?? 0));
  const emitted = [];
  for (const c of candidates) {
    if (emitted.length < maxPerRun) {
      emitted.push(c.obs);
      state[c.key] = { ...c.entry, lastEmittedMs: c.obs.status === "resolved" ? c.entry.lastEmittedMs : nowMs, resolvedEmitted: c.entry.resolvedEmitted || c.obs.status === "resolved" };
    } else {
      suppressed.push({ key: c.key, reason: "peste_limita", status: c.obs.status });
      if (!state[c.key]) state[c.key] = c.entry;
    }
  }
  // Intrarile rezolvate si emise se curata la urmatoarea rulare.
  for (const [key, e] of Object.entries(state)) {
    if (e.resolvedEmitted && !currentKeys.has(key) && e.lastSeenMs < nowMs) delete state[key];
  }
  return { emitted, suppressed, state };
}
