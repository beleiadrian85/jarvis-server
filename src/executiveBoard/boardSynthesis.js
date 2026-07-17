// EXECUTIVE BOARD — sinteza CEO AI. PURA, determinista, zero LLM, zero IO.
// Acelasi input → aceeasi recomandare. Dezacordurile NU se falsifica.
// Reguli (BOARD_DECISION_PROTOCOL §5): date lipsa → DATE_INSUFICIENTE;
// ireversibil cu consens <80% → AMANA (F24); egalitate → AMANA;
// majoritate reject → NU; majoritate approve → DA cu conditii.

const uniq = (a) => [...new Set(a)];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * @param p.directors      DirectorOutput[] (toate perspectivele, inclusiv deterministe)
 * @param p.dataQuality    "completa" | "partiala" | "slaba"
 * @param p.reversibility  "reversibila" | "partial_reversibila" | "ireversibila" | "necunoscuta"
 * @param p.contradictsPrior null | { ref, explanation }
 * → BoardRecommendation
 */
export function synthesize({ directors = [], dataQuality = "partiala", reversibility = "necunoscuta", contradictsPrior = null } = {}) {
  const votes = directors.filter((d) => d && d.position && d.position !== "insufficient_data");
  const approves = votes.filter((d) => d.position === "approve" || d.position === "approve_with_conditions");
  const rejects = votes.filter((d) => d.position === "reject");

  // Consens: ponderea taberei majoritare in pozitiile valide.
  const majority = Math.max(approves.length, rejects.length);
  const consensus = votes.length ? Math.round((100 * majority) / votes.length) : 0;

  // Dezacordurile majore = tabara minoritara, cu rol + pozitie + primul argument.
  const minority = approves.length >= rejects.length ? rejects : approves;
  const major_disagreements = minority.map((d) => ({
    role: d.role, position: d.position,
    reason: (d.arguments && d.arguments[0]) || "fara argument explicit",
  }));

  // Verdict determinist, in ordinea regulilor.
  let recommendation;
  if (!votes.length || dataQuality === "slaba") recommendation = "DATE_INSUFICIENTE";
  else if (reversibility === "ireversibila" && consensus < 80) recommendation = "AMANA";
  else if (approves.length === rejects.length) recommendation = "AMANA";
  else if (rejects.length > approves.length) recommendation = "NU";
  else recommendation = "DA";

  // Conditiile: reuniunea conditiilor din approve_with_conditions (dedup).
  const conditions = uniq(approves.flatMap((d) => d.conditions || []));

  // Limite de risc si criterii de oprire: din perspectiva CRO (riskEngine),
  // altfel din riscurile tuturor directorilor.
  const cro = directors.find((d) => d.role === "CRO");
  const riskPool = (cro?.risks?.length ? cro.risks : uniq(votes.flatMap((d) => d.risks || []))).slice(0, 4);
  const risk_limits = recommendation === "DA" || recommendation === "AMANA"
    ? riskPool.map((r) => `Limiteaza expunerea: ${r}`)
    : [];
  const stop_conditions = recommendation === "DA"
    ? riskPool.map((r) => `Opreste executia daca se materializeaza: ${r}`)
    : [];

  // Incredere: media confidence a pozitiilor valide, penalizata de lipsa de consens.
  const avgConf = votes.length ? votes.reduce((a, d) => a + (d.confidence || 0), 0) / votes.length : 0;
  const confidence = recommendation === "DATE_INSUFICIENTE"
    ? 0
    : clamp(Math.round(avgConf * (consensus / 100)), 0, 100);

  return {
    consensus_level: consensus,
    major_disagreements,
    recommendation,
    conditions,
    risk_limits,
    stop_conditions,
    founder_decision_required: true, // Boardul nu decide niciodata
    codex_compliance: { compliant: true, issues: [] }, // completat de guardian in sesiune
    data_quality: dataQuality,
    confidence,
    contradicts_prior: contradictsPrior,
  };
}

/**
 * Override-ul fondatorului (F27-F28). PURA. Un Board unanim NU nu il poate
 * bloca pe Adrian; decizia lui prevaleaza, dar override-ul ataseaza OBLIGATORIU
 * limite de capital/timp/risc si criterii de oprire.
 */
export function applyFounderOverride(rec, { decision, rationale = "" } = {}) {
  if (!rec || !decision) return rec;
  const risk_limits = rec.risk_limits?.length ? rec.risk_limits : [
    "Limita de capital: de stabilit explicit de Adrian inainte de executie.",
    "Limita de timp: termen de revizuire obligatoriu la 30 de zile.",
  ];
  const stop_conditions = rec.stop_conditions?.length ? rec.stop_conditions : [
    "Oprire imediata daca lichiditatea scade sub pragul stabilit de Adrian.",
    "Oprire si reconvocare Board daca apare un risc juridic nou.",
  ];
  return {
    ...rec,
    founder_override: { decision, rationale, applied: true },
    founder_decision_required: false, // decizia a fost luata — de fondator
    risk_limits,
    stop_conditions,
  };
}
