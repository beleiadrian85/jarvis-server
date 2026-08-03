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
function month(nowISO) { return String(nowISO || new Date().toISOString()).slice(0, 7); }

/** Cat s-a cheltuit azi. */
export async function spentToday({ store, nowISO } = {}) {
  const s = store || { get: getState };
  const db = (await s.get(KEY, null)) || {};
  const d = today(nowISO);
  return { day: d, usd: Number(db[d] || 0), cap: Number(config.multiModel?.maxCostUsdPerDay || 0) };
}

/** Cat s-a cheltuit luna asta (suma zilelor din luna). */
export async function spentThisMonth({ store, nowISO } = {}) {
  const s = store || { get: getState };
  const db = (await s.get(KEY, null)) || {};
  const m = month(nowISO);
  let usd = 0; for (const [k, v] of Object.entries(db)) if (k.startsWith(m)) usd += Number(v || 0);
  return { month: m, usd, cap: Number(config.multiModel?.maxCostUsdPerMonth || 0) };
}

/** Ar depasi plafonul (zilnic SAU lunar) un apel estimat la `estUsd`? Fail-closed. */
export async function wouldExceed(estUsd, { store, nowISO } = {}) {
  const capDay = Number(config.multiModel?.maxCostUsdPerDay || 0);
  const capMonth = Number(config.multiModel?.maxCostUsdPerMonth || 0);
  const { usd: dayUsd } = await spentToday({ store, nowISO });
  const { usd: monthUsd } = await spentThisMonth({ store, nowISO });
  const e = Number(estUsd || 0);
  if (capDay && dayUsd + e > capDay) return { blocked: true, reason: `plafon zilnic depasit (${dayUsd.toFixed(4)}+${e.toFixed(4)} > ${capDay} USD)`, spent: dayUsd, cap: capDay };
  if (capMonth && monthUsd + e > capMonth) return { blocked: true, reason: `plafon lunar depasit (${monthUsd.toFixed(4)}+${e.toFixed(4)} > ${capMonth} USD)`, spent: monthUsd, cap: capMonth };
  if (!capDay && !capMonth) return { blocked: false, reason: "fara plafon configurat" };
  return { blocked: false, spent: dayUsd, cap: capDay };
}

/** Prag de alerta atins azi? (§21 — notifica, nu opreste). */
export async function alertStatus({ store, nowISO } = {}) {
  const alert = Number(config.multiModel?.costAlertUsdPerDay || 0);
  if (!alert) return { alert: false };
  const { usd } = await spentToday({ store, nowISO });
  return { alert: usd >= alert, spent: usd, threshold: alert, message: usd >= alert ? `Utilizarea AI a depasit pragul configurat (${usd.toFixed(2)} >= ${alert} USD azi).` : null };
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
