// OBSERVATION ENGINE — validarea schemei canonice a observatiei. PUR, zero
// importuri. Observatiile fara dovezi sau cu structura invalida se RESPING —
// nu ajung in audit si nu pot fi notificate. Sursa masina:
// codex/schemas/observation.schema.json.

export const CATEGORIES = ["cash", "sales", "traffic", "projects", "people", "decisions", "ops_risk", "founder"];
export const SEVERITIES = ["info", "low", "medium", "high", "critical"];
export const DATA_QUALITIES = ["complete", "partial", "poor"];
export const STATUSES = ["new", "repeated", "worsening", "improving", "resolved"];

const STR_ARRAYS = ["evidence", "sources", "business_impact", "possible_causes", "unknowns", "recommended_next_analysis"];
const BOOLS = ["requires_board_review", "requires_founder_attention", "requires_immediate_action", "safe_to_notify"];

const isStrArray = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Valideaza o observatie completa. → { valid, errors[] } */
export function validateObservation(o) {
  const errors = [];
  if (!o || typeof o !== "object") return { valid: false, errors: ["lipseste obiectul observatie"] };

  for (const k of ["observation_id", "type", "title", "summary", "detected_at", "deduplication_key"])
    if (typeof o[k] !== "string" || !o[k]) errors.push(`${k} lipsa`);
  if (!CATEGORIES.includes(o.category)) errors.push(`category invalida: ${o.category}`);
  if (!SEVERITIES.includes(o.severity)) errors.push(`severity invalida: ${o.severity}`);
  if (typeof o.confidence !== "number" || o.confidence < 0 || o.confidence > 100)
    errors.push(`confidence invalid (0-100): ${o.confidence}`);
  if (!DATA_QUALITIES.includes(o.data_quality)) errors.push(`data_quality invalid: ${o.data_quality}`);
  if (!STATUSES.includes(o.status)) errors.push(`status invalid: ${o.status}`);
  if (!o.period_analyzed || typeof o.period_analyzed !== "object") errors.push("period_analyzed lipsa");

  for (const k of STR_ARRAYS) if (!isStrArray(o[k])) errors.push(`${k} lipsa sau nu e string[]`);
  for (const k of BOOLS) if (typeof o[k] !== "boolean") errors.push(`${k} lipsa sau nu e boolean`);
  for (const k of ["metrics", "baseline", "deviation"])
    if (!o[k] || typeof o[k] !== "object" || Array.isArray(o[k])) errors.push(`${k} lipsa sau nu e obiect`);
  if (typeof o.urgency_reason !== "string") errors.push("urgency_reason lipsa");

  // FARA DOVEZI → RESPINS. Fiecare dovada poarta sursa etichetata [sursa].
  if (isStrArray(o.evidence)) {
    if (!o.evidence.length) errors.push("observatie fara dovezi (evidence gol) — respinsa");
    else if (!o.evidence.every((e) => /^\[[^\]]+\]\s?/.test(e)))
      errors.push("evidence cu intrari fara sursa etichetata [sursa]");
  }

  return { valid: !errors.length, errors };
}

/** Filtreaza doar observatiile valide; cele respinse se intorc separat. */
export function partitionValid(observations = []) {
  const valid = [], rejected = [];
  for (const o of observations) {
    const v = validateObservation(o);
    if (v.valid) valid.push(o);
    else rejected.push({ observation: o, errors: v.errors });
  }
  return { valid, rejected };
}
