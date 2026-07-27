// NOTIFICATION CENTER — notificari native, PERSISTENTE, consultabile, legate de
// situatia care le-a produs. Nu toast temporar. Politica: imediat pentru
// Founder/critic/termen; restul in digest. Dedup + escaladare. jarvis_state.
import { getState, setState } from "../../state.js";

const KEY = "ceo:notifications";
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

export const NOTIF_STATUSES = ["CREATED", "QUEUED", "DELIVERED", "SEEN", "READ", "ACTIONED", "DISMISSED", "SNOOZED", "EXPIRED", "SUPERSEDED", "FAILED"];
export const SEVERITIES = ["INFORMATIONAL", "LOW", "MEDIUM", "HIGH", "CRITICAL", "FOUNDER_DECISION"];

/** Decide daca o notificare merge IMEDIAT sau in digest (management by exception). */
export function notifyImmediately(n = {}) {
  const sev = String(n.severity || "").toUpperCase();
  if (["CRITICAL", "FOUNDER_DECISION"].includes(sev)) return true;
  if (n.requires_founder || n.requires_action) return true;
  if (sev === "HIGH" && (n.material_change || n.deadline_soon)) return true;
  return false; // restul → digest
}

let _seq = 0;
export function buildNotification(p = {}, { nowISO = null } = {}) {
  const c = isObj(p) ? p : {};
  const now = nowISO || new Date().toISOString();
  return {
    id: c.id || `notif:${now.replace(/[^0-9]/g, "").slice(0, 17)}:${(_seq++) % 1000}`,
    user_id: c.user_id || "adrian", type: c.type || "info", category: c.category || "general",
    title: String(c.title || "").slice(0, 140), summary: String(c.summary || "").slice(0, 500),
    severity: c.severity || "INFORMATIONAL", priority: c.priority || null,
    source_type: c.source_type || null, source_reference: c.source_reference || null,
    conversation_id: c.conversation_id || null, envelope_id: c.envelope_id || null,
    action_card_ids: arr(c.action_card_ids), receipt_ids: arr(c.receipt_ids), topic_ids: arr(c.topic_ids),
    company_context: c.company_context || null, material_change: c.material_change ?? null,
    requires_action: !!c.requires_action, requires_founder: !!c.requires_founder,
    deduplication_key: c.deduplication_key || null,
    status: "CREATED", created_at: now, delivered_at: null, seen_at: null, read_at: null,
    acted_at: null, dismissed_at: null, snoozed_until: null, expires_at: c.expires_at || null,
    escalations: 0,
  };
}

/** Creeaza o notificare cu DEDUP pe deduplication_key. @returns {created, notification, deduped} */
export async function pushNotification(p = {}, { store = null, nowISO = null } = {}) {
  const S = store || { get: getState, set: setState };
  const all = (await S.get(KEY, { items: {} }).catch(() => null)) || { items: {} };
  const n = buildNotification(p, { nowISO });
  if (n.deduplication_key) {
    const dup = Object.values(all.items).find((x) => x.deduplication_key === n.deduplication_key && !["DISMISSED", "EXPIRED", "SUPERSEDED"].includes(x.status));
    if (dup) return { created: false, deduped: true, notification: dup };
  }
  n.status = notifyImmediately(n) ? "DELIVERED" : "QUEUED";
  n.delivered_at = n.status === "DELIVERED" ? n.created_at : null;
  all.items[n.id] = n;
  const ids = Object.keys(all.items);
  if (ids.length > 500) for (const d of ids.slice(0, ids.length - 500)) delete all.items[d];
  await S.set(KEY, all).catch(() => {});
  return { created: true, deduped: false, notification: n };
}

/** Tranzitie de status (seen/read/actioned/dismissed/snoozed). */
export async function updateNotification(id, patch = {}, { store = null } = {}) {
  const S = store || { get: getState, set: setState };
  const all = (await S.get(KEY, { items: {} }).catch(() => null)) || { items: {} };
  if (!all.items[id]) return { ok: false, reason: "inexistenta" };
  all.items[id] = { ...all.items[id], ...(isObj(patch) ? patch : {}) };
  await S.set(KEY, all).catch(() => {});
  return { ok: true, notification: all.items[id] };
}

/** Lista pentru Notification Center (grupata + badge count). */
export async function listNotifications({ store = null, nowMs = Date.now() } = {}) {
  const S = store || { get: getState, set: setState };
  const all = (await S.get(KEY, { items: {} }).catch(() => null)) || { items: {} };
  const items = Object.values(all.items).filter((n) => !n.expires_at || Date.parse(n.expires_at) > nowMs);
  const unread = items.filter((n) => !["READ", "DISMISSED", "EXPIRED", "SUPERSEDED"].includes(n.status));
  const group = (pred) => items.filter(pred).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  return {
    badge: unread.length,
    sections: {
      needs_decision: group((n) => n.requires_founder),
      material_risk: group((n) => ["HIGH", "CRITICAL"].includes(n.severity) && !n.requires_founder),
      legislative: group((n) => n.category === "legislation"),
      market: group((n) => n.category === "market"),
      executed: group((n) => n.status === "ACTIONED" || arr(n.receipt_ids).length),
      informational: group((n) => n.severity === "INFORMATIONAL" && !n.requires_action),
    },
    all: group(() => true).slice(0, 100),
  };
}

/** Escaladare: notificari HIGH/CRITICAL nevazute → re-notificare controlata. */
export async function escalateStale({ store = null, nowMs = Date.now(), highAfterMin = 120, criticalAfterMin = 30 } = {}) {
  const S = store || { get: getState, set: setState };
  const all = (await S.get(KEY, { items: {} }).catch(() => null)) || { items: {} };
  const escalated = [];
  for (const n of Object.values(all.items)) {
    if (!["DELIVERED", "QUEUED"].includes(n.status) || n.seen_at) continue;
    const ageMin = (nowMs - Date.parse(n.created_at)) / 60000;
    const thr = n.severity === "CRITICAL" || n.requires_founder ? criticalAfterMin : n.severity === "HIGH" ? highAfterMin : Infinity;
    if (ageMin >= thr && n.escalations < 3) { n.escalations += 1; n.last_escalated_at = new Date(nowMs).toISOString(); escalated.push(n.id); }
  }
  if (escalated.length) await S.set(KEY, all).catch(() => {});
  return { escalated };
}
