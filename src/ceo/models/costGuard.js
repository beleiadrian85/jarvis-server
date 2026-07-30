// COST GUARD (§11) — plafon zilnic pe cheltuiala cu modele externe. Fara plafon,
// un apel gresit poate costa mult. Urmareste cheltuiala in jarvis_state pe zi.
// Daca s-ar depasi plafonul, blocheaza apelul (fail-closed).
import { config } from "../../config.js";

const KEY = "ceo:models:cost";
let _state = null;
async function getState(k, f) { if (!_state) _state = await import("../../state.js"); return _state.getState(k, f); }
async function setState(k, v) { if (!_state) _state = await import("../../state.js"); return _state.setState(k, v); }

// Ziua o primim din exterior (Date.now indisponibil determinist in unele contexte);
// implicit folosim ceasul serverului.
function today(nowISO) { return String(nowISO || new Date().toISOString()).slice(0, 10); }

/** Cat s-a cheltuit azi. */
export async function spentToday({ store, nowISO } = {}) {
  const s = store || { get: getState };
  const db = (await s.get(KEY, null)) || {};
  const d = today(nowISO);
  return { day: d, usd: Number(db[d] || 0), cap: Number(config.multiModel?.maxCostUsdPerDay || 0) };
}

/** Ar depasi plafonul un apel estimat la `estUsd`? (fail-closed daca plafon setat). */
export async function wouldExceed(estUsd, { store, nowISO } = {}) {
  const cap = Number(config.multiModel?.maxCostUsdPerDay || 0);
  if (!cap) return { blocked: false, reason: "fara plafon configurat" }; // 0 = nelimitat (dar guard-ul e recomandat sa fie setat)
  const { usd } = await spentToday({ store, nowISO });
  if (usd + Number(estUsd || 0) > cap) return { blocked: true, reason: `plafon zilnic depasit (${usd.toFixed(4)}+${Number(estUsd).toFixed(4)} > ${cap} USD)`, spent: usd, cap };
  return { blocked: false, spent: usd, cap };
}

/** Inregistreaza cheltuiala reala dupa un apel. */
export async function recordSpend(usd, { store, nowISO } = {}) {
  const s = store || { get: getState, set: setState };
  const db = (await s.get(KEY, null)) || {};
  const d = today(nowISO);
  db[d] = Number(db[d] || 0) + Number(usd || 0);
  // Pastreaza doar ~40 zile.
  const days = Object.keys(db).sort();
  while (days.length > 40) delete db[days.shift()];
  await (s.set ? s.set(KEY, db) : setState(KEY, db));
  return { day: d, usd: db[d] };
}
