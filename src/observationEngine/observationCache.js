// OBSERVATION ENGINE — cache pe amprenta datelor. Date identice → NU se
// reanalizeaza (zero detectori re-rulati, zero LLM). Reuse createCache existent.
import { createCache } from "../cache.js";

const _cache = createCache({ maxEntries: 8, ttlMs: 6 * 3_600_000 });

/** Amprenta STABILA a starii lumii — doar semnalele care conteaza pentru
 *  detectie (nu timestamp-ul), ca aceleasi date sa dea aceeasi amprenta. */
export function worldFingerprint(w = {}) {
  const ob = w.obligations || [];
  return JSON.stringify([
    w.asOf,
    ob.length, Math.round(ob.reduce((a, o) => a + (o.amountRON || 0), 0)),
    (w.tasks || []).length, w.taskGroups || null,
    w.sales || null,
    (w.predictions || []).map((p) => [p.key, p.score]),
    (w.decisions || []).map((d) => d.id),
    (w.disciplineFlags || []).map((f) => [f.type, f.taskId]),
    (w.jobs || []).map((j) => [j.name, j.lastRunAt]),
    (w.errors || []).map((e) => [e.kind, e.count]),
    w.pendingApprovals ?? null,
    w.traffic ? (w.traffic.daily || []).length : null,
    w.sourceMeta?.missing || [],
  ]);
}

export function getCached(fp) { return _cache.get(fp); }
export function setCached(fp, value) { _cache.set(fp, value); }
