// DATA TRUST SCORE (Faza 4) — cat de mult poate JARVIS sa se BAZEZE pe datele
// dintr-un domeniu, pe 5 dimensiuni reale (nu scor cosmetic). Leaga increderea
// de RASPUNSURILE CEO: "Operational arata X, dar reconcilierea bancara lipseste
// → confidence medium". PUR + determinist: primeste semnale, NU face IO.
// REGULA: date lipsa NU inseamna scor 0 fabricat — inseamna COMPLETENESS scazut
// si confidence coborata onest, cu motivul declarat.

export const TRUST_DOMAINS = ["CASH", "BANK", "OBLIGATIONS", "SALES", "RECEIVABLES", "TASKS", "PROJECTS"];
export const TRUST_DIMENSIONS = ["COMPLETENESS", "FRESHNESS", "CONSISTENCY", "RECONCILIATION", "SOURCE_RELIABILITY"];

const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

// Ponderi per dimensiune (suma 1). Reconcilierea si prospetimea conteaza mult
// pentru un CEO (o cifra veche/neconciliata poate induce decizii gresite).
const W = { COMPLETENESS: 0.25, FRESHNESS: 0.20, CONSISTENCY: 0.20, RECONCILIATION: 0.20, SOURCE_RELIABILITY: 0.15 };

// Fiabilitatea intrinseca a sursei (0-100). Bancar prin API > sold manual, etc.
const SOURCE_RELIABILITY = {
  operational_db: 85, operational_mcp: 75, smartbill_api: 80,
  manual_entry: 45, bank_api: 90, bank_manual: 40, document_parsed: 60,
  spion: 70, inference: 30, unknown: 20,
};

/** Freshness → scor din varsta (ore) fata de un prag de "proaspat". */
function freshnessScore(ageHours, freshWithinH = 24) {
  if (ageHours == null) return 0;               // necunoscut = nu ne bazam
  if (ageHours <= freshWithinH) return 100;
  if (ageHours <= freshWithinH * 3) return 70;
  if (ageHours <= freshWithinH * 7) return 45;
  return 20;
}

/**
 * Scor de incredere pentru UN domeniu.
 * @param {object} signal {
 *   present: bool (avem date deloc?), fields_present, fields_expected,
 *   age_hours, source (cheie SOURCE_RELIABILITY), reconciled (bool|null),
 *   contradictions (nr, ex. Operational vs banca), fresh_within_h
 * }
 * @returns { domain, score, band (HIGH/MEDIUM/LOW/NONE), dims, reasons }
 */
export function scoreDomain(domain, signal = {}) {
  const sg = isObj(signal) ? signal : {};
  const reasons = [];

  // COMPLETENESS — cat din ce ne asteptam avem efectiv.
  let completeness;
  if (sg.present === false) { completeness = 0; reasons.push("date absente pentru acest domeniu (COMPLETENESS 0 — nu inseamna valoare 0 reala)"); }
  else if (sg.fields_expected > 0) completeness = clamp((100 * (Number(sg.fields_present) || 0)) / sg.fields_expected);
  else completeness = sg.present ? 80 : 0;

  // FRESHNESS
  const freshness = freshnessScore(sg.age_hours, sg.fresh_within_h || 24);
  if (freshness <= 45 && sg.age_hours != null) reasons.push(`date vechi (~${Math.round(sg.age_hours)}h)`);
  if (sg.age_hours == null && sg.present !== false) reasons.push("varsta datelor necunoscuta");

  // CONSISTENCY — penalizat de contradictii interne.
  const contra = Number(sg.contradictions) || 0;
  const consistency = clamp(100 - contra * 30);
  if (contra > 0) reasons.push(`${contra} contradictii in date`);

  // RECONCILIATION — impacaate cu o a doua sursa (ex. banca)?
  let reconciliation;
  if (sg.reconciled === true) reconciliation = 100;
  else if (sg.reconciled === false) { reconciliation = 30; reasons.push("nereconciliat cu o sursa independenta"); }
  else { reconciliation = 55; reasons.push("reconciliere indisponibila"); } // null = necunoscut

  // SOURCE_RELIABILITY
  const source_reliability = SOURCE_RELIABILITY[sg.source] ?? SOURCE_RELIABILITY.unknown;
  if (source_reliability < 50) reasons.push(`sursa cu fiabilitate scazuta (${sg.source || "necunoscuta"})`);

  const dims = { COMPLETENESS: completeness, FRESHNESS: freshness, CONSISTENCY: consistency, RECONCILIATION: reconciliation, SOURCE_RELIABILITY: source_reliability };
  const score = clamp(TRUST_DIMENSIONS.reduce((acc, d) => acc + dims[d] * W[d], 0));
  let band = sg.present === false ? "NONE" : score >= 75 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW";
  // REGULA financiara: nu poti avea incredere HIGH intr-o cifra de bani care NU e
  // reconciliata cu o sursa independenta (banca). Plafon la MEDIUM.
  if (band === "HIGH" && sg.reconciled === false && ["CASH", "BANK", "RECEIVABLES"].includes(domain)) {
    band = "MEDIUM";
    if (!reasons.some((r) => /reconcilia/.test(r))) reasons.push("nereconciliat cu banca → plafon MEDIUM");
  }

  return { domain, score, band, dims, reasons };
}

/** Scoruri pentru toate domeniile dintr-o harta de semnale { DOMAIN: signal }. */
export function buildTrustReport(signals = {}) {
  const sg = isObj(signals) ? signals : {};
  const domains = TRUST_DOMAINS.map((d) => scoreDomain(d, sg[d] || { present: false }));
  const scored = domains.filter((d) => d.band !== "NONE");
  const overall = scored.length ? clamp(scored.reduce((a, d) => a + d.score, 0) / scored.length) : 0;
  return {
    at: null, // stampilat de apelant (I: fara Date.now aici pentru puritate)
    overall_band: !scored.length ? "NONE" : overall >= 75 ? "HIGH" : overall >= 50 ? "MEDIUM" : "LOW",
    overall, domains,
  };
}

/** Un rand per domeniu, cu motivul — pentru a CALIFICA raspunsurile CEO. PUR. */
export function trustForPrompt(report) {
  if (!report?.domains?.length) return "DATA TRUST: nedisponibil.";
  const rows = report.domains
    .filter((d) => d.band !== "HIGH") // in prompt scoatem doar ce coboara increderea
    .map((d) => `- ${d.domain}: ${d.band}${d.reasons.length ? ` (${d.reasons[0]})` : ""}`);
  if (!rows.length) return "DATA TRUST: toate domeniile la incredere HIGH.";
  return "DATA TRUST (calific raspunsurile — nu afirma ferm ce are incredere LOW/MEDIUM):\n" + rows.join("\n");
}

/** Calificare a unei afirmatii dintr-un domeniu: prefix onest de incredere. */
export function qualify(domain, report) {
  const d = (report?.domains || []).find((x) => x.domain === domain);
  if (!d || d.band === "NONE") return "date indisponibile";
  if (d.band === "HIGH") return "incredere ridicata";
  return `incredere ${d.band === "MEDIUM" ? "medie" : "scazuta"}${d.reasons.length ? ` — ${d.reasons[0]}` : ""}`;
}
