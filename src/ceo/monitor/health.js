// MONITORING HEALTH — daca monitorizarea nu ruleaza, Adrian TREBUIE notificat.
// Nu permite iluzia "monitorizez" cand workerul e oprit. jarvis_state.
import { getState, setState } from "../../state.js";

const KEY = "ceo:monitor:health";
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

/** Inregistreaza rezultatul unei rulari de worker. */
export async function recordRun(worker, { ok = true, latency_ms = null, error = null, queue_depth = 0, dead_letters = 0, sources_unavailable = [], nowISO = null, store = null } = {}) {
  const S = store || { get: getState, set: setState };
  const all = (await S.get(KEY, { workers: {} }).catch(() => null)) || { workers: {} };
  const now = nowISO || new Date().toISOString();
  const w = all.workers[worker] || { worker, runs: 0, errors: 0, retry_count: 0 };
  w.runs += 1; w.last_run_at = now; w.latency_ms = latency_ms;
  w.queue_depth = queue_depth; w.dead_letters = dead_letters; w.sources_unavailable = sources_unavailable;
  if (ok) { w.last_success_at = now; w.last_error = null; } else { w.errors += 1; w.last_error = error; w.retry_count += 1; }
  all.workers[worker] = w;
  await S.set(KEY, all).catch(() => {});
  return w;
}

/** Evalueaza sanatatea: worker degradat daca nu a rulat cu succes in fereastra. */
export async function monitoringHealth({ store = null, nowMs = Date.now(), windows = {} } = {}) {
  const S = store || { get: getState, set: setState };
  const all = (await S.get(KEY, { workers: {} }).catch(() => null)) || { workers: {} };
  const defWindow = 6 * 3600_000; // 6h implicit
  const workers = Object.values(all.workers).map((w) => {
    const win = windows[w.worker] || defWindow;
    const lastOkMs = w.last_success_at ? Date.parse(w.last_success_at) : 0;
    const degraded = !lastOkMs || (nowMs - lastOkMs) > win;
    return { ...w, degraded, stale_minutes: lastOkMs ? Math.round((nowMs - lastOkMs) / 60000) : null };
  });
  const degraded = workers.filter((w) => w.degraded);
  return { at: new Date(nowMs).toISOString(), workers, degraded: degraded.map((w) => w.worker), healthy: degraded.length === 0 };
}

/** Mesaj onest de degradare (nu "activ si sanatos"). */
export function degradedMessage(worker) {
  return `Monitorizarea „${worker.worker}" este degradata.\nUltima verificare reusita: ${worker.last_success_at || "niciodata"}${worker.sources_unavailable?.length ? `\nSurse indisponibile: ${worker.sources_unavailable.join(", ")}` : ""}${worker.last_error ? `\nEroare: ${worker.last_error}` : ""}.`;
}
