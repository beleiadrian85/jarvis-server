// ACTION CARD STORE — persistenta cardurilor + tranzitii de status + idempotenta.
// jarvis_state (zero write Operational aici). Un card executat NU se re-executa.
import { getState, setState } from "../../state.js";
import { CARD_STATUSES } from "./actionCard.js";

const KEY = "ceo:action-cards";
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

// Tranzitii permise (idempotenta + audit).
const TRANSITIONS = {
  PROPOSED: ["APPROVED", "REJECTED", "EXECUTING", "EXPIRED", "CANCELLED", "SUPERSEDED"],
  APPROVED: ["EXECUTING", "CANCELLED", "SUPERSEDED"],
  EXECUTING: ["EXECUTED", "FAILED"],
  EXECUTED: [], FAILED: ["EXECUTING"], REJECTED: [], EXPIRED: [], CANCELLED: [], SUPERSEDED: [],
};

export function canTransition(from, to) {
  return CARD_STATUSES.includes(to) && (TRANSITIONS[from] || []).includes(to);
}

export async function saveCard(card, { store = null } = {}) {
  const S = store || { get: getState, set: setState };
  const all = (await S.get(KEY, { cards: {} }).catch(() => null)) || { cards: {} };
  all.cards[card.id] = card;
  // Marginim istoricul (ultimele 200 carduri).
  const ids = Object.keys(all.cards);
  if (ids.length > 200) { const drop = ids.slice(0, ids.length - 200); for (const d of drop) delete all.cards[d]; }
  await S.set(KEY, all).catch(() => {});
  return card;
}

export async function getCard(cardId, { store = null } = {}) {
  const S = store || { get: getState, set: setState };
  const all = (await S.get(KEY, { cards: {} }).catch(() => null)) || { cards: {} };
  return all.cards[cardId] || null;
}

/** Tranzitie de status idempotenta. @returns { ok, card?, reason? } */
export async function transitionCard(cardId, to, patch = {}, { store = null, nowISO = null } = {}) {
  const S = store || { get: getState, set: setState };
  const all = (await S.get(KEY, { cards: {} }).catch(() => null)) || { cards: {} };
  const card = all.cards[cardId];
  if (!card) return { ok: false, reason: "card inexistent" };
  if (card.status === to) return { ok: true, card, idempotent: true }; // deja in starea ceruta
  if (!canTransition(card.status, to)) return { ok: false, reason: `tranzitie invalida ${card.status}→${to}`, card };
  const updated = { ...card, ...(isObj(patch) ? patch : {}), status: to, updated_at: nowISO || new Date().toISOString() };
  all.cards[cardId] = updated;
  await S.set(KEY, all).catch(() => {});
  return { ok: true, card: updated };
}

/** Carduri active (PROPOSED/APPROVED) neexpirate — pt. afisare (management by exception). */
export async function activeCards({ store = null, nowMs = Date.now(), limit = 3 } = {}) {
  const S = store || { get: getState, set: setState };
  const all = (await S.get(KEY, { cards: {} }).catch(() => null)) || { cards: {} };
  return Object.values(all.cards)
    .filter((c) => ["PROPOSED", "APPROVED"].includes(c.status) && Date.parse(c.expires_at) > nowMs)
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, limit);
}
function rank(c) { // prioritizare: risc dominant + ce deblocheaza + decizie de fondator
  let r = 0;
  if (c.founder_required) r += 3;
  if (c.risk_level === "high") r += 3; else if (c.risk_level === "medium") r += 1;
  if (c.financial_impact) r += 2;
  return r;
}

/** Expira cardurile trecute de expires_at (housekeeping). */
export async function expireCards({ store = null, nowMs = Date.now() } = {}) {
  const S = store || { get: getState, set: setState };
  const all = (await S.get(KEY, { cards: {} }).catch(() => null)) || { cards: {} };
  let n = 0;
  for (const c of Object.values(all.cards)) {
    if (["PROPOSED", "APPROVED"].includes(c.status) && Date.parse(c.expires_at) <= nowMs) { c.status = "EXPIRED"; n++; }
  }
  if (n) await S.set(KEY, all).catch(() => {});
  return { expired: n };
}
