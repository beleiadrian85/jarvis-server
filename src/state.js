import { pool, query } from "./db.js";

/**
 * Stare interna persistenta (jarvis_state) + dedup notificari (notified).
 * Fara DB, totul degradeaza elegant (getState întoarce fallback-ul).
 */

export async function getState(key, fallback = null) {
  if (!pool) return fallback;
  const r = await query(`SELECT value FROM jarvis_state WHERE key = $1`, [key]);
  return r[0] ? r[0].value : fallback;
}

export async function setState(key, value) {
  if (!pool) return;
  await query(
    `INSERT INTO jarvis_state (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}

export async function wasNotified(key) {
  if (!pool) return false;
  const r = await query(`SELECT 1 FROM notified WHERE key = $1`, [key]);
  return r.length > 0;
}

export async function markNotified(key) {
  if (!pool) return;
  await query(`INSERT INTO notified (key) VALUES ($1) ON CONFLICT (key) DO NOTHING`, [key]);
}

export async function pruneNotified(days = 14) {
  if (!pool) return;
  await query(
    `DELETE FROM notified WHERE created_at < now() - ($1 || ' days')::interval`,
    [String(days)]
  );
}
