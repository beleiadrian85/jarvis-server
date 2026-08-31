// SINGLE-INSTANCE / DUPLICATE PROTECTION (Faza 3). Pe Railway pot rula 2 instante;
// un job programat trebuie executat O SINGURA DATA logic. Folosim advisory lock Postgres
// (pg_try_advisory_lock) tinut pe UN client dedicat pe durata jobului (atomic, fara tabel
// nou) + o dedupare per-perioada in jarvis_state (ca sa nu se re-ruleze in aceeasi perioada
// nici daca cele doua instante trag la secunde diferenta). Fara DB → rulam (dev/single).
let _state = null;
async function getState(k, f) { if (!_state) _state = await import("./state.js"); return _state.getState(k, f); }
async function setState(k, v) { if (!_state) _state = await import("./state.js"); return _state.setState(k, v); }
const LAST_RUN_KEY = "ceo:cron:last-run";

/** Hash determinist string → int32 semnat (id pentru advisory lock). */
export function lockIdFor(name) {
  let h = 0; const s = "jarvis:" + String(name || "");
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return h;
}

/**
 * Ruleaza `fn` DOAR daca aceasta instanta castiga lock-ul si jobul n-a rulat deja in
 * `periodKey`. @returns { ran, reason }
 * @param periodKey ex. "2026-08-27" (zilnic) sau bucket 10-min — null = doar lock-ul.
 */
export async function withCronLock(jobName, periodKey, fn) {
  let pool = null;
  try { pool = (await import("./db.js")).pool; } catch { /* */ }
  if (!pool) { await fn(); return { ran: true, reason: "no-db (single-instance assumed)" }; }

  const lockId = lockIdFor(jobName);
  let client;
  try { client = await pool.connect(); } catch (e) { await fn(); return { ran: true, reason: `no-client (${e.message})` }; }
  try {
    const r = await client.query("SELECT pg_try_advisory_lock($1) AS got", [lockId]);
    if (!r.rows?.[0]?.got) return { ran: false, reason: "lock detinut de alta instanta" };

    if (periodKey) {
      const last = (await getState(LAST_RUN_KEY, {})) || {};
      if (last[jobName] === periodKey) return { ran: false, reason: "deja rulat in perioada asta" };
    }
    await fn();
    if (periodKey) {
      const last = (await getState(LAST_RUN_KEY, {})) || {};
      last[jobName] = periodKey; await setState(LAST_RUN_KEY, last).catch(() => {});
    }
    return { ran: true, reason: "ran" };
  } finally {
    try { await client.query("SELECT pg_advisory_unlock($1)", [lockId]); } catch { /* */ }
    client.release();
  }
}

/** Cheie de perioada zilnica (Europe/Bucharest). */
export function dayKey(nowISO = null) {
  const d = nowISO ? new Date(nowISO) : new Date();
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
}
/** Cheie de perioada la N minute (pt joburi frecvente). */
export function bucketKey(minutes = 10, nowISO = null) {
  const d = nowISO ? new Date(nowISO) : new Date();
  const ms = Math.max(1, minutes) * 60000;
  return new Date(Math.floor(d.getTime() / ms) * ms).toISOString().slice(0, 16);
}
