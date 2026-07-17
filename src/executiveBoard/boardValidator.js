// EXECUTIVE BOARD — validarea structurilor. PUR, zero importuri.
// Impune schemele canonice (codex/schemas/board-*.schema.json). Structura
// invalida → recomandarea NU se emite (regula CODEX, aplicata de guardian).

export const POSITIONS = ["approve", "approve_with_conditions", "reject", "insufficient_data"];
export const RECOMMENDATIONS = ["DA", "NU", "AMANA", "DATE_INSUFICIENTE"];
export const DATA_QUALITY = ["completa", "partiala", "slaba"];
export const REVERSIBILITY = ["reversibila", "partial_reversibila", "ireversibila", "necunoscuta"];

const DIRECTOR_ARRAYS = ["arguments", "evidence", "risks", "conditions", "alternatives", "unanswered_questions"];

const isStrArray = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
const num0to100 = (v) => typeof v === "number" && isFinite(v) && v >= 0 && v <= 100;

/** Valideaza raspunsul unui director. → { valid, errors[] } */
export function validateDirectorOutput(d) {
  const errors = [];
  if (!d || typeof d !== "object") return { valid: false, errors: ["lipseste obiectul director"] };
  if (typeof d.role !== "string" || !d.role) errors.push("role lipsa");
  if (!POSITIONS.includes(d.position)) errors.push(`position invalida: ${d.position}`);
  if (!num0to100(d.confidence)) errors.push(`confidence invalid: ${d.confidence}`);
  for (const k of DIRECTOR_ARRAYS) if (!isStrArray(d[k])) errors.push(`${k} lipsa sau nu e string[]`);
  if (d.position && d.position !== "insufficient_data" && isStrArray(d.arguments) && !d.arguments.length)
    errors.push("pozitie exprimata fara niciun argument");
  return { valid: !errors.length, errors };
}

/** Valideaza recomandarea finala sintetizata. → { valid, errors[] } */
export function validateRecommendation(r) {
  const errors = [];
  if (!r || typeof r !== "object") return { valid: false, errors: ["lipseste recomandarea"] };
  if (!num0to100(r.consensus_level)) errors.push("consensus_level invalid");
  if (!Array.isArray(r.major_disagreements)) errors.push("major_disagreements lipsa");
  if (!RECOMMENDATIONS.includes(r.recommendation)) errors.push(`recommendation invalida: ${r.recommendation}`);
  for (const k of ["conditions", "risk_limits", "stop_conditions"])
    if (!isStrArray(r[k])) errors.push(`${k} lipsa sau nu e string[]`);
  if (r.founder_decision_required !== true && !r.founder_override)
    errors.push("founder_decision_required trebuie true (Boardul nu decide)");
  if (!r.codex_compliance || typeof r.codex_compliance.compliant !== "boolean" || !Array.isArray(r.codex_compliance.issues))
    errors.push("codex_compliance invalid");
  if (!DATA_QUALITY.includes(r.data_quality)) errors.push(`data_quality invalid: ${r.data_quality}`);
  if (!num0to100(r.confidence)) errors.push("confidence invalid");
  if (r.contradicts_prior != null &&
      (typeof r.contradicts_prior !== "object" || typeof r.contradicts_prior.ref !== "string"))
    errors.push("contradicts_prior invalid (null sau {ref, explanation})");
  return { valid: !errors.length, errors };
}

/** Valideaza obiectul sedintei (punctele masurabile din cele 22). */
export function validateMeeting(m) {
  const errors = [];
  if (!m || typeof m !== "object") return { valid: false, errors: ["lipseste sedinta"] };
  for (const k of ["id", "asOf", "type", "question", "problem", "purpose"])
    if (typeof m[k] !== "string" || !m[k]) errors.push(`${k} lipsa`);
  for (const k of ["data_available", "data_missing", "assumptions", "options", "risks", "missing_perspectives"])
    if (!isStrArray(m[k])) errors.push(`${k} lipsa sau nu e string[]`);
  if (!Array.isArray(m.perspectives) || !m.perspectives.length) errors.push("perspectives lipsa");
  else for (const p of m.perspectives) {
    const v = validateDirectorOutput(p);
    if (!v.valid) errors.push(`director ${p?.role || "?"}: ${v.errors.join("; ")}`);
  }
  if (!m.impact || typeof m.impact !== "object") errors.push("impact lipsa");
  else for (const k of ["financial", "operational", "human", "legal", "brand_sales"])
    if (typeof m.impact[k] !== "string") errors.push(`impact.${k} lipsa`);
  if (!REVERSIBILITY.includes(m.reversibility)) errors.push(`reversibility invalid: ${m.reversibility}`);
  if (!m.scenarios || typeof m.scenarios.success !== "string" || typeof m.scenarios.failure !== "string")
    errors.push("scenarios.success/failure lipsa");
  if (m.recommendation != null) {
    const v = validateRecommendation(m.recommendation);
    if (!v.valid) errors.push(...v.errors.map((e) => `recomandare: ${e}`));
  } else if (!m.blocked) errors.push("fara recomandare si fara motiv de blocare");
  return { valid: !errors.length, errors };
}
