// CEO AI — SYSTEM IMPROVEMENT ENGINE (P2). PUR + persistenta. "Nu pot face X
// bine deoarece sistemului ii lipseste Y" → SYSTEM IMPROVEMENT PROPOSAL.
// Regula absoluta: CEO AI NU isi modifica singur codul in productie — propune,
// Adrian aproba, implementarea trece prin Change Control (15-security-engine).
import { audit } from "../audit.js";
import { getState, setState } from "../state.js";

const IMPROVEMENTS_KEY = "ceo:improvements";
export const IMPROVEMENT_FIELDS = [
  "problem", "evidence", "business_value", "proposed_change",
  "affected_system", "risk", "estimated_complexity", "expected_benefit", "approval_required",
];

/** Construieste o propunere canonica de imbunatatire. PUR. */
export function buildImprovementProposal(p = {}) {
  return {
    improvement_id: p.id || `imp:${(p.affected_system || "x").toLowerCase()}:${(p.problem || "").slice(0, 30).replace(/[^a-zA-Z0-9]+/g, "-")}`,
    problem: p.problem || "", evidence: p.evidence || [],
    business_value: p.business_value || "", proposed_change: p.proposed_change || "",
    affected_system: p.affected_system || "", risk: p.risk || "necunoscut",
    estimated_complexity: p.estimated_complexity || "medie",
    expected_benefit: p.expected_benefit || "",
    approval_required: true,          // INTOTDEAUNA — nimic auto-implementat
    priority: p.priority ?? 99,
    status: "proposed",
  };
}

export function validateImprovement(p) {
  const errors = [];
  for (const f of IMPROVEMENT_FIELDS) if (p?.[f] == null || p[f] === "") errors.push(`camp lipsa: ${f}`);
  if (!Array.isArray(p?.evidence) || !p.evidence.length) errors.push("propunere fara dovezi");
  if (p?.approval_required !== true) errors.push("approval_required trebuie true (Change Control)");
  return { valid: !errors.length, errors };
}

/** Din lacunele de date → propuneri de imbunatatire (deterministic). PUR. */
export function improvementsFromGaps(gaps = []) {
  return gaps.slice(0, 6).map((g, i) => buildImprovementProposal({
    id: `imp:${g.domain.toLowerCase()}`,
    problem: `Nu pot analiza ${g.domain} corect: ${g.data_gap}`,
    evidence: [`[data-map] ${g.domain} = ${g.severity.toUpperCase()}`, `[impact] ${g.why}`],
    business_value: g.why,
    proposed_change: g.proposed_implementation,
    affected_system: g.best_source,
    risk: "scazut (read-only / input uman)",
    estimated_complexity: g.permanent_solution?.includes("conector") || g.permanent_solution?.includes("API") ? "medie" : "mica",
    expected_benefit: `Domeniul ${g.domain} devine vizibil pentru CEO AI; deciziile aferente devin fundamentate.`,
    priority: i + 1,
  }));
}

// Scoring backlog (F): CEO propune, Adrian aproba, Claude Code dezvolta.
export const IMPROVEMENT_SCORE_FIELDS = ["business_value_score", "data_value_score", "time_saved_score", "risk_reduction_score", "implementation_cost_score", "saas_reusability_score"];

/** Scor 0-100 pe cele 6 dimensiuni (cost invers: mic = bine). PUR. */
export function scoreImprovement(p) {
  const s = {
    business_value_score: p.business_value_score ?? 50,
    data_value_score: p.data_value_score ?? 50,
    time_saved_score: p.time_saved_score ?? 30,
    risk_reduction_score: p.risk_reduction_score ?? 30,
    implementation_cost_score: p.implementation_cost_score ?? 50, // 100 = ieftin
    saas_reusability_score: p.saas_reusability_score ?? 50,
  };
  const total = Math.round(
    s.business_value_score * 0.3 + s.data_value_score * 0.2 + s.time_saved_score * 0.1 +
    s.risk_reduction_score * 0.15 + s.implementation_cost_score * 0.1 + s.saas_reusability_score * 0.15
  );
  return { ...s, total };
}

/** Backlog-ul ordonat CEO IMPROVEMENT OPPORTUNITIES. PUR. */
export function rankBacklog(proposals = []) {
  return proposals
    .map((p) => ({ ...p, scoring: scoreImprovement(p) }))
    .sort((a, b) => b.scoring.total - a.scoring.total);
}

export async function recordImprovements(proposals = [], { persist = true } = {}) {
  const valid = proposals.filter((p) => validateImprovement(p).valid);
  if (persist && valid.length) {
    const st = await getState(IMPROVEMENTS_KEY, {}).catch(() => ({}));
    for (const p of valid) st[p.improvement_id] = { ...p, recorded_at: new Date().toISOString() };
    await setState(IMPROVEMENTS_KEY, st).catch(() => {});
    for (const p of valid) {
      await audit("ceo_improvement", `${p.improvement_id} [p${p.priority}] ${p.problem}`.slice(0, 190),
        JSON.stringify(p).slice(0, 1900)).catch(() => {});
    }
  }
  return { recorded: valid.length, invalid: proposals.length - valid.length };
}
