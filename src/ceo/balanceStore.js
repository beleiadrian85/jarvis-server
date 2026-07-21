// CEO AI — BALANCE STORE. Soldurile bancare, introduse MANUAL (Dana/Adrian)
// prin Command Center, pana la o sursa automata cu sold. Traieste in
// jarvis_state (aditiv, zero schema noua). Prospetimea conteaza: un sold
// vechi >24h degradeaza calitatea; >72h → STALE (nu se mai foloseste tacit).
import { audit } from "../audit.js";
import { getState, setState } from "../state.js";

const KEY = "bank:balances";
export const STALE_HOURS = 24;
export const EXPIRED_HOURS = 72;

/** Valideaza o intrare de sold. PUR. */
export function validateBalanceEntry(e) {
  const errors = [];
  if (!e || typeof e !== "object") return { valid: false, errors: ["intrare lipsa"] };
  if (!e.bank) errors.push("bank lipsa");
  if (!e.account) errors.push("account lipsa");
  if (!["RON", "EUR"].includes(e.currency)) errors.push("currency RON|EUR");
  if (typeof e.available !== "number" || !isFinite(e.available) || e.available < 0) errors.push("available invalid");
  if (e.blocked != null && (typeof e.blocked !== "number" || e.blocked < 0)) errors.push("blocked invalid");
  if (!e.enteredBy) errors.push("enteredBy lipsa");
  return { valid: !errors.length, errors };
}

/** Seteaza soldul unui cont (upsert pe bank+account). Auditat. */
export async function setBalance(entry) {
  const v = validateBalanceEntry(entry);
  if (!v.valid) return { ok: false, errors: v.errors };
  const st = await getState(KEY, { accounts: [] }).catch(() => ({ accounts: [] }));
  const key = `${entry.bank}|${entry.account}`;
  const acc = {
    bank: entry.bank, account: entry.account, currency: entry.currency,
    available: entry.available, blocked: entry.blocked ?? 0,
    asOf: entry.asOf || new Date().toISOString(),
    source: entry.source || "manual", enteredBy: entry.enteredBy,
  };
  st.accounts = [...st.accounts.filter((a) => `${a.bank}|${a.account}` !== key), acc];
  await setState(KEY, st);
  await audit("bank_balance_set", `${acc.bank}/${acc.account}: ${acc.available} ${acc.currency} (de ${acc.enteredBy})`,
    JSON.stringify(acc)).catch(() => {});
  return { ok: true, account: acc };
}

/** Starea agregata a soldurilor. { totalRON, accounts, freshness } sau null (fara date). */
export async function getBalances({ nowMs = Date.now(), eurRon = 5.06 } = {}) {
  const st = await getState(KEY, { accounts: [] }).catch(() => ({ accounts: [] }));
  if (!st.accounts.length) return null; // NU AM DATE ≠ 0
  const withAge = st.accounts.map((a) => ({
    ...a, age_hours: Math.round((nowMs - Date.parse(a.asOf)) / 3_600_000),
  }));
  const usable = withAge.filter((a) => a.age_hours <= EXPIRED_HOURS);
  if (!usable.length) return { expired: true, accounts: withAge, totalRON: null, freshness: "EXPIRED" };
  const totalRON = usable.reduce((s, a) => s + a.available * (a.currency === "EUR" ? eurRon : 1), 0);
  const oldest = Math.max(...usable.map((a) => a.age_hours));
  return {
    totalRON: Math.round(totalRON), accounts: withAge,
    freshness: oldest <= STALE_HOURS ? "FRESH" : "STALE",
    oldest_hours: oldest,
  };
}
