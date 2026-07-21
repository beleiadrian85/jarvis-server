// CEO AI — LEVEL 2: livrarea INFORMATION REQUEST-urilor aprobate EXPLICIT.
// POLITICA DE AUTONOMIE (impusa aici + in teste): GLOBAL = LEVEL 1; EXCEPTIA
// UNICA = information_request + APPROVE & SEND al lui Adrian = LEVEL 2.
// Orice alt tip (task/improvement/decision/data_connection) NU se livreaza.
// Fara mapping de identitate verificat → DELIVERY_BLOCKED_NO_IDENTITY.
// Idempotent: un request aprobat se trimite MAXIM o data (dublu-click = 1).
import { config } from "../config.js";
import { audit } from "../audit.js";
import { getState, setState } from "../state.js";
import { COMPANY } from "./companyConfig.js";

export const DELIVERY_STATES = ["REQUESTED", "SENT", "AWAITING_RESPONSE", "RECEIVED", "VALIDATED", "COMPLETED", "EXPIRED", "DELIVERY_BLOCKED_NO_IDENTITY", "FAILED"];
const PROPOSALS_KEY = "ceo:proposals";
const MAPPING_KEY = "people:telegram";

/** Politica: ce nivel de autonomie permite un tip de propunere. PUR. */
export function allowedLevelFor(type, cfg = config) {
  return type === "information_request" && cfg.inforeqDelivery ? 2 : 1;
}

/** Mapping-ul de identitate al unei persoane (config env SAU stare setata explicit). */
export async function identityFor(personName) {
  const p = COMPANY.people.find((x) => x.name.toLowerCase() === String(personName || "").toLowerCase());
  if (!p) return null;
  if (p.telegram_env && process.env[p.telegram_env]) return { person: p.name, chat_id: String(process.env[p.telegram_env]), source: "env" };
  const map = await getState(MAPPING_KEY, {}).catch(() => ({}));
  if (map[p.id]?.chat_id) return { person: p.name, chat_id: String(map[p.id].chat_id), source: "state" };
  return null;
}
export async function setIdentity(personId, chat_id, setBy = "adrian") {
  const p = COMPANY.people.find((x) => x.id === personId);
  if (!p) return { ok: false, error: "persoana necunoscuta" };
  if (!/^\d{5,15}$/.test(String(chat_id))) return { ok: false, error: "chat_id invalid" };
  const map = await getState(MAPPING_KEY, {}).catch(() => ({}));
  map[personId] = { chat_id: String(chat_id), set_by: setBy, at: new Date().toISOString() };
  await setState(MAPPING_KEY, map);
  await audit("identity_mapping_set", `${personId} → telegram (de ${setBy})`).catch(() => {});
  return { ok: true };
}

/** Mesajul canonic pentru un information request. PUR. */
export function composeRequestMessage(proposal, { formUrl = "" } = {}) {
  const who = proposal.task_proposal?.assignee || "";
  const ask = String(proposal.recommendation || "").replace(/^Cere:\s*/i, "");
  return `${who}, ${ask}${formUrl ? `\n\nFormular: ${formUrl}` : ""}\n\n(Cerere aprobată de Adrian prin JARVIS — răspunsul închide un data gap de cash-flow.)`;
}

/**
 * Livrarea unui request APROBAT. send = canalul injectat (pushToChat).
 * → { status, ... } — niciodata nu arunca; totul auditat.
 */
export async function deliverApprovedRequest(proposalId, { send, formUrl = "", cfg = config, store = null } = {}) {
  try {
    const S = store || { get: getState, set: setState };
    const all = await S.get(PROPOSALS_KEY, {}).catch?.(() => ({})) ?? await S.get(PROPOSALS_KEY, {});
    const p = all[proposalId];
    if (!p) return { status: "FAILED", error: "propunere inexistenta" };
    if (allowedLevelFor(p.source === "data-gap-engine" ? "information_request" : p.type || "task", cfg) < 2)
      return { status: "FAILED", error: "LEVEL 1: tipul nu se livreaza (doar information_request cu flag activ)" };
    if (p.state !== "approved") return { status: "FAILED", error: `stare ${p.state} — cere APPROVE intai` };
    if (p.delivery?.status === "SENT" || p.delivery?.sent === true || p.delivery?.status === "AWAITING_RESPONSE")
      return { status: p.delivery.status, note: "deja trimis — idempotent, zero dubla trimitere" };

    const identity = await identityFor(p.task_proposal?.assignee);
    if (!identity) {
      p.delivery = { status: "DELIVERY_BLOCKED_NO_IDENTITY", at: new Date().toISOString(), sent: false };
      all[proposalId] = p; await S.set(PROPOSALS_KEY, all);
      await audit("inforeq_delivery_blocked", `${proposalId}: fara mapping Telegram pt ${p.task_proposal?.assignee}`).catch(() => {});
      return { status: "DELIVERY_BLOCKED_NO_IDENTITY", fix: `Persoana trimite /id botului JARVIS, apoi mapezi in Command Center.` };
    }
    if (typeof send !== "function") return { status: "FAILED", error: "canal de trimitere lipsa" };

    const text = composeRequestMessage(p, { formUrl });
    let msg;
    try { msg = await send(identity.chat_id, text); }
    catch (e) {
      p.delivery = { status: "FAILED", error: e.message, at: new Date().toISOString(), sent: false };
      all[proposalId] = p; await S.set(PROPOSALS_KEY, all);
      await audit("inforeq_delivery_failed", `${proposalId}: ${e.message}`.slice(0, 190)).catch(() => {});
      return { status: "FAILED", error: e.message };
    }
    p.delivery = {
      status: "AWAITING_RESPONSE", sent: true, at: new Date().toISOString(),
      channel: "telegram", chat_id: identity.chat_id, identity_source: identity.source,
      message_id: msg?.message_id ?? null, text,
    };
    all[proposalId] = p; await S.set(PROPOSALS_KEY, all);
    await audit("inforeq_sent", `${proposalId} → ${identity.person} (telegram, msg ${msg?.message_id ?? "?"})`, text.slice(0, 1900)).catch(() => {});
    console.log(`[level2] inforeq trimis: ${proposalId} → ${identity.person}`);
    return { status: "SENT", message_id: msg?.message_id ?? null, to: identity.person };
  } catch (e) {
    console.error("[level2]", e.message);
    return { status: "FAILED", error: e.message };
  }
}

/**
 * Corelarea raspunsului: cand data soseste (ex. soldul in balanceStore),
 * request-ul se inchide: RECEIVED → VALIDATED → COMPLETED + outcome.
 * validator(data) decide VALIDATED; date invalide/stale → gap ramane deschis.
 */
export async function correlateResponse(domain, { data = null, valid = true, note = "", store = null } = {}) {
  const S = store || { get: getState, set: setState };
  const all = await S.get(PROPOSALS_KEY, {});
  const id = `prop:inforeq:${String(domain).toLowerCase()}`;
  const p = all[id];
  if (!p || !["AWAITING_RESPONSE", "SENT"].includes(p.delivery?.status || "")) return { correlated: false };
  if (!valid) {
    p.delivery.status = "RECEIVED";
    p.delivery.validation = { valid: false, note, at: new Date().toISOString() };
    all[id] = p; await S.set(PROPOSALS_KEY, all);
    await audit("inforeq_response_invalid", `${id}: ${note}`.slice(0, 190)).catch(() => {});
    return { correlated: true, status: "RECEIVED", gap_closed: false };
  }
  p.delivery.status = "COMPLETED";
  p.delivery.validation = { valid: true, note, at: new Date().toISOString() };
  p.state = "verified";
  all[id] = p; await S.set(PROPOSALS_KEY, all);
  await audit("inforeq_completed", `${id}: data primita si validata — gap inchis; recalcul declansat`, JSON.stringify({ note }).slice(0, 500)).catch(() => {});
  console.log(`[level2] ${id} COMPLETED — gap inchis`);
  return { correlated: true, status: "COMPLETED", gap_closed: true };
}
