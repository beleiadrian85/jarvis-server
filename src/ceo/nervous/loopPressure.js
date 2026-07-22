// LOOP PRESSURE CONTROL (§10). PUR.
// Daca organismul deschide bucle mai repede decat le inchide, incetineste
// automat crearea de task-uri noi de valoare mica — prioritizeaza inchiderea
// buclelor existente. NU blocheaza task-urile critice. Reversibil, determinist.
const DAY = 86_400_000;
const CLOSED = ["COMPLETED", "FAILED", "EXPIRED", "NO_LONGER_NEEDED"];

// Praguri (configurabile prin cfg in apelant): cate bucle deschise tolerate si
// ce valoare minima trebuie sa aiba un task nou ca sa treaca sub presiune.
export const PRESSURE = {
  ELEVATED_OPEN: 5,   // >= atatea bucle deschise → ELEVATED
  HIGH_OPEN: 8,       // >= atatea → HIGH
  AGING_DAYS: 5,      // bucla deschisa mai mult = imbatranita
  MIN_VALUE_ELEVATED: 45, // sub presiune ELEVATED, doar nevoi >= atat se creeaza autonom
  MIN_VALUE_HIGH: 65,     // sub presiune HIGH, doar nevoi critice
};

/**
 * Presiunea buclelor din registrul de task-uri CEO. PUR.
 * Returneaza { open, closed, ratio, aging, oldest_days, level, throttle,
 * min_value_to_create, recommendation }.
 */
export function computeLoopPressure({ registry = {}, nowMs = null, cfg = {} } = {}) {
  const now = nowMs ?? Date.parse("2026-07-22T00:00:00Z");
  const recs = Object.values(registry).filter((r) => r.operational_id); // doar task-uri reale
  const open = recs.filter((r) => !CLOSED.includes(r.lifecycle));
  const closed = recs.filter((r) => CLOSED.includes(r.lifecycle));
  const ages = open.map((r) => (r.created_at ? (now - Date.parse(r.created_at)) / DAY : 0));
  const aging = ages.filter((a) => a >= (cfg.agingDays ?? PRESSURE.AGING_DAYS)).length;
  const oldest = ages.length ? Math.round(Math.max(...ages) * 10) / 10 : 0;
  const ratio = closed.length ? Math.round((open.length / closed.length) * 10) / 10 : (open.length ? Infinity : 0);

  const highOpen = cfg.highOpen ?? PRESSURE.HIGH_OPEN;
  const elevOpen = cfg.elevatedOpen ?? PRESSURE.ELEVATED_OPEN;

  let level = "LOW", throttle = false, min_value_to_create = 0;
  if (open.length >= highOpen && closed.length === 0) {
    level = "HIGH"; throttle = true; min_value_to_create = cfg.minValueHigh ?? PRESSURE.MIN_VALUE_HIGH;
  } else if (open.length >= elevOpen && open.length > closed.length * 2) {
    level = "ELEVATED"; throttle = true; min_value_to_create = cfg.minValueElevated ?? PRESSURE.MIN_VALUE_ELEVATED;
  }

  const recommendation = throttle
    ? `Presiune ${level}: ${open.length} bucle deschise, ${closed.length} inchise${aging ? `, ${aging} imbatranite` : ""} — prioritizeaza inchiderea; task-uri noi doar cu valoare >= ${min_value_to_create}.`
    : `Presiune LOW: ${open.length} deschise / ${closed.length} inchise — ritm normal de creare.`;

  return { open: open.length, closed: closed.length, ratio, aging, oldest_days: oldest, level, throttle, min_value_to_create, recommendation };
}

/**
 * Decide daca o nevoie trece sub presiunea curenta. Nevoile critice (blocking
 * sau impact cash mare) trec INTOTDEAUNA — presiunea nu blocheaza urgentele. PUR.
 */
export function passesPressure(need = {}, pressure = {}) {
  if (!pressure.throttle) return { pass: true };
  const critical = need.blocking === true || need.severity === "critical" ||
    (Number.isFinite(Number(need.cash_impactRON)) && Number(need.cash_impactRON) >= 100000) ||
    need.urgency_days === 0;
  if (critical) return { pass: true, reason: "critic — presiunea nu blocheaza urgentele" };
  const val = Number(need.value?.total ?? 0);
  if (val >= pressure.min_value_to_create) return { pass: true };
  return { pass: false, reason: `sub presiune ${pressure.level}: valoare ${val} < prag ${pressure.min_value_to_create} — amanat ca propunere, prioritizam inchiderea buclelor` };
}
