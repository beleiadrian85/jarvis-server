// MODEL PERFORMANCE MEMORY (§22) — memorie separata de evaluare: pe task type + model,
// urmareste validari trecute/esuate, corectii, contradictii, latenta, cost, acceptare,
// halucinatii, esecuri de schema. Routerul poate folosi scorurile pentru selectie, dar
// NU schimba automat providerul pentru date sensibile fara o politica aprobata (§22).
import { config } from "../../config.js";
let _state = null;
async function getState(k, f) { if (!_state) _state = await import("../../state.js"); return _state.getState(k, f); }
async function setState(k, v) { if (!_state) _state = await import("../../state.js"); return _state.setState(k, v); }
const KEY = "ceo:models:evaluation";

export function evaluationEnabled() { return config.multiModel?.enabled === true && config.multiModel?.evaluation === true; }

/** Inregistreaza rezultatul unui apel pentru invatarea routerului. */
export async function recordEvaluation(e = {}, { store } = {}) {
  const s = store || { get: getState, set: setState };
  const db = (await s.get(KEY, null)) || { by: {} };
  const key = `${e.task_type || "generic"}|${e.model || e.provider || "?"}`;
  const b = db.by[key] || { task_type: e.task_type || "generic", provider: e.provider || null, model: e.model || null, calls: 0, validation_passed: 0, validation_failed: 0, corrections: 0, contradictions: 0, hallucinations: 0, schema_failures: 0, accepted: 0, latency_sum: 0, cost_sum: 0 };
  b.calls++;
  if (e.validation === "passed") b.validation_passed++;
  if (e.validation === "failed") b.validation_failed++;
  if (e.corrected) b.corrections++;
  if (e.contradiction) b.contradictions++;
  if (e.hallucination) b.hallucinations++;
  if (e.schema_failure) b.schema_failures++;
  if (e.accepted) b.accepted++;
  if (typeof e.latency === "number") b.latency_sum += e.latency;
  if (typeof e.cost === "number") b.cost_sum += e.cost;
  db.by[key] = b;
  await s.set(KEY, db);
  return b;
}

/** Scor de performanta per provider (0..1) pentru un task — hint pentru router. */
export async function perfScores(task_type, { store } = {}) {
  const s = store || { get: getState };
  const db = (await s.get(KEY, null)) || { by: {} };
  const out = {};
  for (const b of Object.values(db.by)) {
    if (task_type && b.task_type !== task_type) continue;
    if (!b.calls) continue;
    const good = b.validation_passed + b.accepted;
    const bad = b.validation_failed + b.hallucinations + b.schema_failures + b.corrections;
    const score = Math.max(0, Math.min(1, (good + 1) / (good + bad + 2))); // Laplace
    out[b.provider] = Math.max(out[b.provider] || 0, score);
  }
  return out;
}

export async function evaluationSummary({ store } = {}) {
  const s = store || { get: getState };
  const db = (await s.get(KEY, null)) || { by: {} };
  return Object.values(db.by);
}
