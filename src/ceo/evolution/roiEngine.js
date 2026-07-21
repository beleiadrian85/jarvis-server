// SELF-EVOLUTION V1 §16-18 — ROI ENGINE (motor PUR, determinist).
// Scoreaza un Capability Request pe dimensiunile de valoare vs. cost si emite
// recomandarea BUILD / DO_NOT_BUILD / BUILD_LATER + tier-ul de backlog (§17).
// Principii: date lipsa = null (gap explicit, nu inventam); acelasi CR →
// acelasi scor (zero aleator); §18 — nu construim tot ce putem construi,
// construim doar ce merita: valoare mare + cost rezonabil.
// ZERO IO — importa DOAR din ./contract.js.
import { BACKLOG_TIERS, crId } from "./contract.js";

// ── PONDERI SI PRAGURI (§17-18) ─────────────────────────────────────────

// Ponderile dimensiunilor de VALOARE (suma 100). Daca o dimensiune lipseste
// din CR, ponderea ei se redistribuie proportional pe cele prezente —
// lipsa nu e tratata drept zero (zero != nu am date).
export const ROI_WEIGHTS = {
  business_value: 20,
  data_value: 10,
  founder_time_saved: 15,
  employee_time_saved: 10,
  risk_reduction: 10,
  revenue_impact: 15,
  cash_impact: 10,
  reusability: 10,
};

// Complexitate declarata → cost estimat 0-100 (§18).
export const COMPLEXITY_COST = { low: 20, medium: 50, high: 80 };
// Asumptie conservatoare cand complexitatea lipseste: medium (documentat,
// decizie de model, nu data inventata).
export const DEFAULT_COMPLEXITY_COST = COMPLEXITY_COST.medium;

// Praguri de recomandare (§18): total >= build → BUILD; total < do_not_build
// → DO_NOT_BUILD; intre ele → BUILD_LATER.
export const ROI_THRESHOLDS = { build: 55, do_not_build: 35 };

// §17 — NOW doar daca blocheaza ceva important sau valoarea de business e mare.
export const NOW_BUSINESS_VALUE_MIN = 70;

// Penalizare pe dependenta (§16): fiecare dependenta creste riscul si
// intarzierea; plafonata ca sa nu domine scorul.
const DEPENDENCY_PENALTY_PER_ITEM = 5;
const DEPENDENCY_PENALTY_CAP = 20;

// Factorii de penalizare din total (§18): costul apasa mai tare decat
// complexitatea (complexitatea e deja partial reflectata in cost).
const COST_PENALTY_FACTOR = 0.25;
const COMPLEXITY_PENALTY_FACTOR = 0.10;

// ── HELPERI INTERNI (puri) ──────────────────────────────────────────────

function fold(s) { return String(s == null ? "" : s).toLowerCase().trim(); }
function round1(n) { return Math.round(n * 10) / 10; }
function clamp100(n) { return Math.max(0, Math.min(100, n)); }

/** Numar finit 0-100 sau null (gap explicit) — nu inventam valori. */
function num100(v) {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return clamp100(n);
}

/** Costul de complexitate 0-100 din CR: string low/medium/high, numar direct,
 *  sau asumptia conservatoare medium daca lipseste. */
function complexityCostOf(cr) {
  const c = cr?.complexity;
  const mapped = COMPLEXITY_COST[fold(c)];
  if (mapped != null) return mapped;
  const n = num100(c);
  if (n != null) return n;
  return DEFAULT_COMPLEXITY_COST;
}

/** Numarul de dependente declarate in CR (array de id-uri sau titluri). */
function dependencyCount(cr) {
  return Array.isArray(cr?.dependencies) ? cr.dependencies.filter(Boolean).length : 0;
}

// ── §16-18 — SCORUL UNEI CAPABILITATI ───────────────────────────────────

/**
 * Scoreaza un Capability Request. PUR si determinist.
 * Dimensiunile de valoare vin deja 0-100 din CR; lipsa = null in output si
 * excludere din media ponderata (ponderile se renormalizeaza pe cele prezente).
 * total = media ponderata a valorii MINUS penalizarile de cost, complexitate
 * si dependente, clamp 0-100.
 */
export function scoreCapability(cr = {}) {
  // Dimensiunile de valoare — exact campurile din CR, clamp 0-100 sau null.
  const dims = {};
  for (const key of Object.keys(ROI_WEIGHTS)) dims[key] = num100(cr[key]);

  // Media ponderata doar pe dimensiunile prezente; niciuna prezenta → 0
  // (fara date de valoare nu exista valoare demonstrata, doar presupusa).
  let weightSum = 0, valueSum = 0;
  for (const [key, w] of Object.entries(ROI_WEIGHTS)) {
    if (dims[key] == null) continue;
    weightSum += w;
    valueSum += dims[key] * w;
  }
  const valueScore = weightSum > 0 ? valueSum / weightSum : 0;

  // Costuri: implementation_cost explicit (0-100) sau derivat din complexity.
  const complexity = complexityCostOf(cr);
  const explicitCost = num100(cr.implementation_cost);
  const implementationCost = explicitCost != null ? explicitCost : complexity;

  // Penalizarea de dependente (§16): liniara, plafonata.
  const dependenciesPenalty = Math.min(
    DEPENDENCY_PENALTY_CAP,
    dependencyCount(cr) * DEPENDENCY_PENALTY_PER_ITEM
  );

  const total = round1(clamp100(
    valueScore
    - COST_PENALTY_FACTOR * implementationCost
    - COMPLEXITY_PENALTY_FACTOR * complexity
    - dependenciesPenalty
  ));

  return {
    business_value: dims.business_value,
    data_value: dims.data_value,
    founder_time_saved: dims.founder_time_saved,
    employee_time_saved: dims.employee_time_saved,
    risk_reduction: dims.risk_reduction,
    revenue_impact: dims.revenue_impact,
    cash_impact: dims.cash_impact,
    reusability: dims.reusability,
    implementation_cost: implementationCost,
    complexity,
    dependencies_penalty: dependenciesPenalty,
    total,
  };
}

// ── §17-18 — RECOMANDAREA DE BUILD ──────────────────────────────────────

/**
 * Recomandarea pentru un CR: BUILD / DO_NOT_BUILD / BUILD_LATER + tier (§17).
 * §18: valoare mare + cost rezonabil → BUILD; valoare mica → DO_NOT_BUILD
 * (a nu construi e o decizie valida); valoare medie → BUILD_LATER.
 * §17: NOW doar daca cr.blocks_important === true sau business_value >= 70.
 */
export function recommendBuild(cr = {}) {
  const s = scoreCapability(cr);

  if (s.total < ROI_THRESHOLDS.do_not_build) {
    return {
      recommendation: "DO_NOT_BUILD",
      tier: "LATER",
      why: `scor total ${s.total} < ${ROI_THRESHOLDS.do_not_build} — valoarea nu justifica costul (cost ${s.implementation_cost}, complexitate ${s.complexity}, penalizare dependente ${s.dependencies_penalty}); a nu construi e o decizie valida (§18).`,
    };
  }

  if (s.total >= ROI_THRESHOLDS.build) {
    const nowEligible = cr.blocks_important === true
      || (s.business_value != null && s.business_value >= NOW_BUSINESS_VALUE_MIN);
    const tier = nowEligible ? "NOW" : "NEXT";
    const nowWhy = cr.blocks_important === true
      ? "blocheaza ceva important (blocks_important)"
      : `business_value ${s.business_value} >= ${NOW_BUSINESS_VALUE_MIN}`;
    return {
      recommendation: "BUILD",
      tier,
      why: nowEligible
        ? `scor total ${s.total} >= ${ROI_THRESHOLDS.build} si ${nowWhy} — se construieste acum (§17).`
        : `scor total ${s.total} >= ${ROI_THRESHOLDS.build}, dar fara criteriu NOW (nu blocheaza nimic important, business_value ${s.business_value == null ? "UNKNOWN" : s.business_value} < ${NOW_BUSINESS_VALUE_MIN}) — urmatorul in coada (§17).`,
    };
  }

  return {
    recommendation: "BUILD_LATER",
    tier: "LATER",
    why: `scor total ${s.total} intre ${ROI_THRESHOLDS.do_not_build} si ${ROI_THRESHOLDS.build} — valoare medie; ramane in backlog pana creste valoarea sau scade costul (§18).`,
  };
}

// ── §17 — RANK-UL BACKLOG-ULUI ──────────────────────────────────────────

/**
 * Ordoneaza backlog-ul de CR-uri descrescator dupa scorul total.
 * Tie-break determinist pe cr_id (acelasi input → aceeasi ordine).
 */
export function rankBacklog(requests = []) {
  const list = (Array.isArray(requests) ? requests : [])
    .filter((cr) => cr && typeof cr === "object")
    .map((cr) => {
      const s = scoreCapability(cr);
      const rec = recommendBuild(cr);
      return {
        cr_id: cr.capability_request_id || crId(cr.title),
        title: cr.title || null,
        tier: BACKLOG_TIERS.includes(rec.tier) ? rec.tier : "LATER",
        total: s.total,
        recommendation: rec.recommendation,
      };
    });
  list.sort((a, b) => (b.total - a.total) || String(a.cr_id).localeCompare(String(b.cr_id)));
  return list;
}
