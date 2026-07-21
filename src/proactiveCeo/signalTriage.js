// PROACTIVE CEO — Signal Triage. PUR, determinist, zero LLM, zero IO.
// Decide ce se intampla cu fiecare observatie a Observation Engine:
// ignore / audit_only / group / board_candidate / founder_attention.
// Nu re-scoreaza: refoloseste severitatea/escaladarea deja calculate.

export const TRIAGE_DECISIONS = ["ignore", "audit_only", "group", "board_candidate", "founder_attention"];

/** data_quality slaba reduce increderea (nu severitatea — aceea e scorata). */
export function adjustedConfidence(o) {
  const c = Math.max(0, Math.min(100, Number(o.confidence) || 0));
  return o.data_quality === "poor" ? Math.round(c * 0.7) : c;
}

/**
 * Triaj determinist. → { decision, confidence, reasons[] }
 * Ierarhie: founder_attention ⊃ board_candidate ⊃ group ⊃ audit_only ⊃ ignore.
 */
export function triageObservation(o) {
  const reasons = [];
  const conf = adjustedConfidence(o);
  const f = o._factors || {};

  // Candidat Board: escaladarea deja marcata SAU high cu incredere suficienta.
  const boardCandidate =
    o.requires_board_review ||
    (o.severity === "critical") ||
    (o.severity === "high" && conf >= 60) ||
    (f.irreversible && (o.severity === "high" || o.severity === "critical"));
  if (o.requires_board_review) reasons.push("escaladare marcata de Observation Engine");
  if (o.severity === "critical") reasons.push("severitate critical");
  if (o.severity === "high" && conf >= 60) reasons.push(`high cu incredere ${conf}%`);
  if (f.irreversible) reasons.push("efect ireversibil");

  // Atentia fondatorului: marcata deja SAU candidat Board SAU dependenta de fondator.
  const founderAttention = o.requires_founder_attention || boardCandidate || !!f.founderDependency;

  let decision;
  if (o.severity === "info" && o.status !== "resolved") { decision = "ignore"; reasons.push("semnal informativ"); }
  else if (boardCandidate && founderAttention) decision = "founder_attention";
  else if (boardCandidate) decision = "board_candidate";
  else if (o.severity === "medium" || o.severity === "high" || o.status === "worsening" || f.founderDependency) {
    decision = "group";
    if (o.status === "worsening") reasons.push("in agravare");
  } else { decision = "audit_only"; reasons.push("severitate scazuta — ramane in audit"); }

  return { decision, confidence: conf, reasons };
}

/** Triaj pe lot. → { byDecision: {decizie: obs[]}, triaged: [{obs, decision, confidence, reasons}] } */
export function triageAll(observations = []) {
  const triaged = observations.map((o) => ({ obs: o, ...triageObservation(o) }));
  const byDecision = {};
  for (const t of triaged) {
    if (!byDecision[t.decision]) byDecision[t.decision] = [];
    byDecision[t.decision].push(t.obs);
  }
  return { byDecision, triaged };
}
