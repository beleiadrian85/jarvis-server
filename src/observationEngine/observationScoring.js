// OBSERVATION ENGINE — scoring DETERMINIST (inainte de orice LLM). PUR, zero
// importuri. LLM-ul poate explica o observatie, dar severitatea vine EXCLUSIV
// de aici. Aceeasi intrare → acelasi scor (cerinta de test).

export const SEVERITIES = ["info", "low", "medium", "high", "critical"];
export const DATA_QUALITY_MULTIPLIER = { complete: 1.0, partial: 0.85, poor: 0.6 };

/**
 * Factorii unei observatii (toti optionali; lipsa = 0 puncte):
 * @param f.financialImpactRON  impact financiar estimat, in lei
 * @param f.urgencyDays         in cate zile devine problema (mai putin = mai urgent)
 * @param f.irreversible        bool — efect ireversibil
 * @param f.probability         0..1
 * @param f.systemsAffected     nr. de sisteme/zone afectate
 * @param f.persistence         "new" | "repeated" | "worsening"
 * @param f.legalRisk           bool
 * @param f.reputationalRisk    bool
 * @param f.operationalRisk     bool
 * @param f.founderDependency   bool
 * @param f.dataQuality         "complete" | "partial" | "poor"
 * → { score 0..100, severity }
 */
export function scoreObservation(f = {}) {
  let pts = 0;
  const fin = Number(f.financialImpactRON) || 0;
  if (fin >= 100_000) pts += 30;
  else if (fin >= 25_000) pts += 20;
  else if (fin >= 5_000) pts += 10;
  else if (fin > 0) pts += 5;

  const u = f.urgencyDays;
  if (u != null && isFinite(u)) {
    if (u <= 3) pts += 15;
    else if (u <= 7) pts += 10;
    else if (u <= 21) pts += 5;
  }

  if (f.irreversible) pts += 10;
  pts += Math.round(Math.max(0, Math.min(1, Number(f.probability) || 0)) * 10);

  const sys = Number(f.systemsAffected) || 0;
  if (sys >= 3) pts += 10;
  else if (sys === 2) pts += 6;
  else if (sys === 1) pts += 2;

  if (f.persistence === "worsening") pts += 10;
  else if (f.persistence === "repeated") pts += 5;

  if (f.legalRisk) pts += 5;
  if (f.reputationalRisk) pts += 5;
  if (f.operationalRisk) pts += 5;
  if (f.founderDependency) pts += 5;

  const mult = DATA_QUALITY_MULTIPLIER[f.dataQuality] ?? DATA_QUALITY_MULTIPLIER.partial;
  const score = Math.round(Math.min(100, pts) * mult);
  return { score, severity: severityForScore(score) };
}

export function severityForScore(score) {
  if (score >= 75) return "critical";
  if (score >= 55) return "high";
  if (score >= 35) return "medium";
  if (score >= 15) return "low";
  return "info";
}

/** Vechimea datelor degradeaza calitatea: >24h → partial, >72h → poor. */
export function dataQualityForAge(baseQuality, ageHours) {
  const order = ["poor", "partial", "complete"];
  let q = order.includes(baseQuality) ? baseQuality : "partial";
  if (ageHours > 72) q = "poor";
  else if (ageHours > 24 && q === "complete") q = "partial";
  return q;
}
