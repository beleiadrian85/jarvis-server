// NERVOUS SYSTEM V1 §5/§12/§24 — INSISTENCE ENGINE (persistenta pe impact).
// Nu toate cererile merita aceeasi presiune: pozele de progres pot astepta,
// dar un document de banca cu termen NU. Motorul calculeaza un scor de
// persistenta 0-100 din impactul de business, urgenta, vechime, dependente,
// intarzieri repetate si reactia ownerului — si de aici cadenta urmatoarei
// verificari (§24: fiecare WAIT are un next_check_at). Persistenta creste cu
// impactul, nu cu nerabdarea. Modul PUR: determinist, ZERO IO, missing !=
// zero (o valoare lipsa nu inseamna impact zero — inseamna necunoscut).

// ── NIVELURILE CANONICE DE INSISTENTA ────────────────────────────────────
export const INSISTENCE_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

// Cadenta urmatoarei verificari per nivel (ms). CRITICAL des, LOW rar.
const NEXT_CHECK_MS = {
  CRITICAL: 4 * 60 * 60 * 1000,    // +4 ore
  HIGH: 24 * 60 * 60 * 1000,       // +1 zi
  MEDIUM: 2 * 24 * 60 * 60 * 1000, // +2 zile
  LOW: 4 * 24 * 60 * 60 * 1000,    // +4 zile
};

// Pragul de "impact mare" pe cash (RON) peste care cererea devine CRITICA.
const CASH_CRITICAL_RON = 100_000;

/** Normalizeaza eticheta de impact la low/medium/high; necunoscut → null. */
function impactLevel(v) {
  const s = String(v ?? "").toLowerCase().trim();
  if (["high", "ridicat", "mare", "critic", "critical"].includes(s)) return "high";
  if (["medium", "mediu", "normal", "moderat"].includes(s)) return "medium";
  if (["low", "scazut", "mic", "minor"].includes(s)) return "low";
  return null; // missing != zero
}

/** Scor din nivel (pentru scala). */
function scoreToLevel(score) {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 35) return "MEDIUM";
  return "LOW";
}

/**
 * Scorul de persistenta pe o cerere in asteptare (§24).
 * @param {object} p
 * @param {string|null} p.businessImpact  "high"/"medium"/"low" (sau ro) — impactul asupra firmei
 * @param {number|null} p.urgencyDays      zile pana la termen (0 = azi, negativ = depasit)
 * @param {number} p.ageDays               de cate zile e deschisa cererea
 * @param {number} p.dependencies          cate alte lucrari depind de raspuns
 * @param {number} p.repeatedDelay         de cate ori s-a amanat deja
 * @param {string|null} p.ownerResponse    "responding"/"silent"/null — reactia ownerului
 * @param {number|null} p.cashImpactRON    impact monetar direct (RON), daca se cunoaste
 * @returns {{score: number, level: string, why: string}}
 */
export function insistenceScore({
  businessImpact = null, urgencyDays = null, ageDays = 0, dependencies = 0,
  repeatedDelay = 0, ownerResponse = null, cashImpactRON = null,
} = {}) {
  const impact = impactLevel(businessImpact);
  const cash = Number.isFinite(Number(cashImpactRON)) ? Number(cashImpactRON) : null;
  const urg = Number.isFinite(Number(urgencyDays)) ? Number(urgencyDays) : null;
  const age = Number.isFinite(Number(ageDays)) ? Number(ageDays) : 0;
  const deps = Number.isFinite(Number(dependencies)) ? Number(dependencies) : 0;
  const delays = Number.isFinite(Number(repeatedDelay)) ? Number(repeatedDelay) : 0;
  const resp = String(ownerResponse || "").toLowerCase().trim();

  const factors = [];
  let score = 20; // baza: orice cerere deschisa are o persistenta minima

  // ── Impactul de business ridica scorul (persistenta creste cu impactul). ─
  if (impact === "high") { score += 30; factors.push("impact de business mare"); }
  else if (impact === "medium") { score += 15; factors.push("impact de business mediu"); }
  else if (impact === "low") { score += 2; factors.push("impact de business mic"); }

  // ── Urgenta (termen). Depasit sau azi = presiune mare. ───────────────────
  if (urg != null) {
    if (urg <= 0) { score += 25; factors.push(urg < 0 ? `termen depasit cu ${-urg} zile` : "termen chiar azi"); }
    else if (urg <= 1) { score += 18; factors.push("termen maine"); }
    else if (urg <= 3) { score += 10; factors.push("termen apropiat"); }
    else { score += 2; factors.push("termen lejer"); }
  }

  // ── Vechimea fara raspuns creste presiunea (dar plafonat). ───────────────
  if (age >= 5) { score += 12; factors.push(`deschisa de ${age} zile`); }
  else if (age >= 2) { score += 6; factors.push(`deschisa de ${age} zile`); }

  // ── Dependente (blocheaza alte lucrari). ─────────────────────────────────
  if (deps >= 3) { score += 12; factors.push(`blocheaza ${deps} lucrari`); }
  else if (deps >= 1) { score += 6; factors.push(`blocheaza ${deps} lucrare(i)`); }

  // ── Intarzieri repetate = ownerul amana sistematic. ──────────────────────
  if (delays >= 2) { score += 10; factors.push(`amanat de ${delays} ori`); }
  else if (delays === 1) { score += 5; factors.push("amanat o data"); }

  // ── Reactia ownerului: cine raspunde primeste mai putina presiune. ───────
  if (resp === "responding") { score -= 12; factors.push("ownerul raspunde — mai putina insistenta"); }
  else if (resp === "silent") { score += 10; factors.push("ownerul tace — insistenta creste"); }

  score = Math.max(0, Math.min(100, Math.round(score)));
  let level = scoreToLevel(score);

  // ── REGULI DETERMINISTE DE OVERRIDE (praguri categorice din directiva). ──
  // 1) Impact monetar direct mare → CRITICAL indiferent de scorul liniar
  //    (ex. document de banca de care depinde o suma mare).
  if (cash != null && cash >= CASH_CRITICAL_RON) {
    level = "CRITICAL";
    factors.unshift(`impact cash ${cash} RON >= ${CASH_CRITICAL_RON}`);
  }
  // 2) Termen azi/depasit + impact mare → CRITICAL (decizie care nu asteapta).
  else if (urg != null && urg <= 0 && impact === "high") {
    level = "CRITICAL";
    factors.unshift("termen azi/depasit pe o cerere cu impact mare");
  }
  // 3) Termen recent depasit + impact cel putin mediu → minim HIGH.
  else if (urg != null && urg <= 0 && (impact === "medium" || impact === "high")) {
    if (INSISTENCE_LEVELS.indexOf(level) < INSISTENCE_LEVELS.indexOf("HIGH")) {
      level = "HIGH";
      factors.unshift("termen depasit pe o cerere cu impact");
    }
  }

  const why = factors.length ? factors.slice(0, 3).join("; ") : "cerere fara factori agravanti — persistenta minima";
  return { score, level, why };
}

/**
 * Momentul urmatoarei verificari pentru o cerere in WAIT (§24).
 * nowMs este OBLIGATORIU (determinism — nu folosim Date.now implicit).
 * @param {object} p
 * @param {string} p.level   nivelul de insistenta (LOW/MEDIUM/HIGH/CRITICAL)
 * @param {number} p.nowMs   momentul curent in ms (injectat)
 * @returns {string} ISO — momentul urmatoarei verificari
 */
export function nextCheckAt({ level, nowMs } = {}) {
  if (!Number.isFinite(Number(nowMs))) {
    throw new Error("nextCheckAt: nowMs obligatoriu (ms) — determinism, nu Date.now implicit");
  }
  const delta = NEXT_CHECK_MS[level] ?? NEXT_CHECK_MS.LOW; // nivel necunoscut → cadenta cea mai lejera
  return new Date(Number(nowMs) + delta).toISOString();
}
