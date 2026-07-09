import crypto from "node:crypto";
import { pool, query } from "./db.js";

/**
 * A2 — approvalGate: poarta tehnica pentru actiunile cu efect.
 * Actiunile in asteptare se persista in `pending_actions` (supravietuiesc
 * restart-ului). Fara DB → fallback in-memory (aceeasi comportare ca inainte,
 * degradare eleganta). approvalGate NU executa actiunea; doar tine starea.
 * Executia ramane in taskflow.executeConfirmed.
 */

const DEFAULT_TTL = 10 * 60 * 1000; // 10 minute (ca vechiul TTL din taskflow)
const mem = new Map();              // fallback fara DB: id → {id,channel,type,payload,preview,status,expiresAt}

const newId = () => crypto.randomBytes(4).toString("hex");

/** Propune o actiune → intoarce id-ul (folosit ca confirmId). */
export async function proposeAction(channel, type, payload, preview, ttlMs = DEFAULT_TTL) {
  const id = newId();
  const ttl = Math.max(1000, Number(ttlMs) || DEFAULT_TTL);
  if (!pool) {
    mem.set(id, { id, channel, type, payload, preview, status: "pending", expiresAt: Date.now() + ttl });
    return id;
  }
  await query(
    `INSERT INTO pending_actions (id, channel, type, payload, preview, expires_at)
     VALUES ($1,$2,$3,$4::jsonb,$5, now() + ($6 || ' milliseconds')::interval)`,
    [id, channel, type, JSON.stringify(payload), preview, String(ttl)]
  );
  return id;
}

/** Cea mai recenta actiune 'pending' neexpirata pentru un canal (sau null). */
export async function getPendingForChannel(channel) {
  if (!pool) {
    let best = null;
    for (const a of mem.values()) {
      if (a.channel === channel && a.status === "pending" && a.expiresAt > Date.now()) {
        if (!best || a.expiresAt > best.expiresAt) best = a;
      }
    }
    return best ? { id: best.id, channel, type: best.type, payload: best.payload, preview: best.preview } : null;
  }
  const rows = await query(
    `SELECT id, channel, type, payload, preview FROM pending_actions
     WHERE channel = $1 AND status = 'pending' AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [channel]
  );
  return rows[0] || null;
}

/**
 * Marcheaza actiunea confirmata SI o intoarce (atomic) — doar daca era
 * inca 'pending' si neexpirata. Intoarce null altfel (expirat/deja decis).
 */
export async function confirmActionById(id) {
  if (!pool) {
    const a = mem.get(id);
    if (!a || a.status !== "pending" || a.expiresAt <= Date.now()) return null;
    a.status = "confirmed";
    return { id: a.id, channel: a.channel, type: a.type, payload: a.payload, preview: a.preview };
  }
  const rows = await query(
    `UPDATE pending_actions SET status='confirmed', decided_at=now(), decision='da'
     WHERE id=$1 AND status='pending' AND expires_at > now()
     RETURNING id, channel, type, payload, preview`,
    [id]
  );
  return rows[0] || null;
}

/** Marcheaza actiunea anulata. Intoarce {id} daca era pending, altfel null. */
export async function cancelActionById(id) {
  if (!pool) {
    const a = mem.get(id);
    if (!a || a.status !== "pending") return null;
    a.status = "cancelled";
    return { id };
  }
  const rows = await query(
    `UPDATE pending_actions SET status='cancelled', decided_at=now(), decision='nu'
     WHERE id=$1 AND status='pending'
     RETURNING id`,
    [id]
  );
  return rows[0] || null;
}

/** Igienizare: marcheaza expirate actiunile pending trecute de scadenta. */
export async function expireOldActions() {
  if (!pool) {
    const now = Date.now();
    for (const [k, a] of mem) if (a.status !== "pending" || a.expiresAt <= now) mem.delete(k);
    return;
  }
  await query(
    `UPDATE pending_actions SET status='expired', decided_at=now()
     WHERE status='pending' AND expires_at <= now()`
  );
}
