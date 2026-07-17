// OBSERVATION ENGINE — escaladare. PUR. In etapa curenta DOAR MARCHEAZA
// (requires_board_review etc.) si produce motivul pentru audit. Executive
// Board NU este convocat automat (gated pe OBSERVATION_BOARD_ESCALATION_ENABLED,
// implicit OFF — convocarea efectiva e o etapa ulterioara, cu aprobare).

export const FINANCIAL_ESCALATION_THRESHOLD_RON = 100_000;

/**
 * Aplica regulile de escaladare pe o observatie. → observatia + escalation_reason.
 * Criterii board (ORICARE): critical; ireversibil ≥high; impact ≥100k lei;
 * contradictie majora; ≥3 sisteme; repetat SI agravat; ameninta cash/credibilitate/identitate (F31).
 */
export function applyEscalation(o) {
  const reasons = [];
  const f = o._factors || {};

  if (o.severity === "critical") reasons.push("severitate critical");
  if (f.irreversible && (o.severity === "high" || o.severity === "critical")) reasons.push("efect ireversibil");
  if ((f.financialImpactRON || 0) >= FINANCIAL_ESCALATION_THRESHOLD_RON)
    reasons.push(`impact financiar ${Math.round(f.financialImpactRON).toLocaleString("ro-RO")} lei ≥ prag`);
  if (o._contradiction && (o.severity === "high" || o.severity === "critical" || o.category === "decisions"))
    reasons.push("contradictie de decizie care cere explicatie (F39-F40)");
  if ((f.systemsAffected || 0) >= 3) reasons.push(`${f.systemsAffected} sisteme afectate`);
  if (o.status === "worsening" && (f.persistence === "repeated" || f.persistence === "worsening"))
    reasons.push("problema repetata si in agravare");
  if (o._threatensCore) reasons.push(`ameninta ${o._threatensCore === "cash" ? "cash-ul" : o._threatensCore === "identity" ? "identitatea si scopul" : "credibilitatea"} companiei (F31)`);

  const requires_board_review = reasons.length > 0;
  const requires_founder_attention =
    requires_board_review || o.severity === "high" || o.severity === "critical" || !!f.founderDependency;
  const requires_immediate_action =
    o.severity === "critical" && f.urgencyDays != null && f.urgencyDays <= 3;

  return {
    ...o,
    requires_board_review,
    requires_founder_attention,
    requires_immediate_action,
    escalation_reason: reasons.join("; ") || null,
  };
}
