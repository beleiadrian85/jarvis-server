// LIVRARE NOTIFICARI → TELEGRAM (Faza 2). Notification Center produce notificarile;
// aici le LIVRAM real, dar controlat, ca JARVIS sa NU devina masina de spam:
//  - CRITICAL / FOUNDER_DECISION → Telegram IMEDIAT (compact).
//  - restul (INFO/LOW/MEDIUM/HIGH) → NU se trimit individual; intra in digest.
//  - dedup + cooldown + idempotenta pe (deduplication_key || id): aceeasi alerta NU se
//    retrimite la fiecare cron.
import { config } from "../../config.js";
let _state = null;
async function getState(k, f) { if (!_state) _state = await import("../../state.js"); return _state.getState(k, f); }
async function setState(k, v) { if (!_state) _state = await import("../../state.js"); return _state.setState(k, v); }
const SENT_KEY = "ceo:notif:telegram-sent";
const DEFAULT_COOLDOWN_MIN = Number(process.env.JARVIS_NOTIF_COOLDOWN_MIN || 180);

export function telegramDeliveryEnabled() {
  return !["off", "false", "0"].includes(String(process.env.JARVIS_TELEGRAM_ALERTS_ENABLED || "on").toLowerCase());
}

/** Severitatile care merg IMEDIAT pe Telegram (restul → digest). */
export function isImmediateSeverity(sev) {
  return ["CRITICAL", "FOUNDER_DECISION"].includes(String(sev || "").toUpperCase());
}

function formatForTelegram(n) {
  const sev = String(n.severity || "").toUpperCase();
  const when = String(n.created_at || "").slice(11, 16);
  const meta = [n.source && `Sursă: ${n.source}`, n.reason && `Motiv: ${String(n.reason).slice(0, 140)}`, when && `${when}`].filter(Boolean).join(" · ");
  const title = String(n.title || n.message || "Alertă").slice(0, 120);
  const body = n.message && n.message !== n.title ? `\n${String(n.message).slice(0, 400)}` : "";
  if (sev === "FOUNDER_DECISION")
    return `🟠 DECIZIE — ${title}${body}\n${meta}\n(necesită decizia ta)`;
  return `🔴 CRITIC — ${title}${body}\n${meta}`;
}

/**
 * Livreaza o notificare pe Telegram, controlat. @returns {sent, reason, key}
 * @param opts { store, sender (async fn(text)->void), nowISO, cooldownMin }
 */
export async function deliverToTelegram(n = {}, opts = {}) {
  if (!telegramDeliveryEnabled()) return { sent: false, reason: "telegram_alerts_off" };
  if (!isImmediateSeverity(n.severity)) return { sent: false, reason: "digest_only" }; // INFO/LOW/MEDIUM/HIGH → digest
  const key = n.deduplication_key || n.id;
  if (!key) return { sent: false, reason: "no_key" };
  const now = opts.nowISO ? new Date(opts.nowISO) : new Date();
  const cooldownMs = Math.max(0, (opts.cooldownMin ?? DEFAULT_COOLDOWN_MIN)) * 60000;

  const s = opts.store || { get: getState, set: setState };
  const reg = (await s.get(SENT_KEY, null)) || { sent: {} };
  const last = reg.sent[key];
  if (last && cooldownMs > 0 && (now - new Date(last.at)) < cooldownMs)
    return { sent: false, reason: "cooldown", key, last_sent: last.at };

  const text = formatForTelegram(n);
  try {
    const sender = opts.sender || (async (t) => { const { pushToOwner } = await import("../../telegram.js"); await pushToOwner(t); });
    await sender(text);
  } catch (e) { return { sent: false, reason: `send_failed: ${e.message}`, key }; }

  reg.sent[key] = { at: now.toISOString(), id: n.id, severity: n.severity };
  // pastreaza doar ~500 chei recente
  const keys = Object.keys(reg.sent);
  if (keys.length > 500) { keys.sort((a, b) => new Date(reg.sent[a].at) - new Date(reg.sent[b].at)); for (const k of keys.slice(0, keys.length - 500)) delete reg.sent[k]; }
  await s.set(SENT_KEY, reg);
  return { sent: true, reason: "delivered", key };
}
