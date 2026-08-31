// JARVIS INFORMATION RESOLVER — serviciu canonic care investigheaza o intrebare in
// MAI MULTE surse (Operational + Email + Internet) INAINTE de a declara UNKNOWN.
// Ordinea surselor e data de intrebare, nu fixata arbitrar. Inregistreaza sursele
// verificate. NU transforma "gasit" in "confirmat". Reutilizeaza sourceTruth/email
// adapter/web. PUR-ish (IO injectabil).
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

// Ordinea surselor per tip de intrebare.
export function planSources(intent, text = "") {
  const n = String(text).toLowerCase();
  if (/lege|reglementar|fiscal|tva|anaf|norm|hotarare|ordonanta|ocpi|cadastru/.test(n) || /LEGAL|REGULATION/i.test(intent))
    return ["official_primary", "official_secondary", "journalistic_context"];
  if (/piata|concuren|pret|competitor/.test(n)) return ["official_primary", "company_sites", "registries", "credible_publications"];
  // Intern financiar/documente → Operational + Email + atasamente.
  return ["operational", "email", "email_attachments", "authorized_drive"];
}

/**
 * Investigheaza o intrebare. `checkers` = map de surse → async ({question}) → evidence[].
 * Injectabil pentru teste. Inregistreaza sources_checked/unavailable INAINTE de UNKNOWN.
 * @returns InvestigationResult
 */
export async function resolve({ question, intent = "GENERIC", entities = [], context = {}, evidence_requirements = [], checkers = {}, nowISO = null } = {}) {
  const planned = planSources(intent, question);
  const sources_checked = [], sources_unavailable = [], evidence = [], contradictions = [];
  for (const src of planned) {
    const fn = checkers[src];
    if (typeof fn !== "function") { sources_unavailable.push(src); continue; }
    try {
      const r = await fn({ question, intent, entities, context });
      sources_checked.push(src);
      for (const e of arr(r)) evidence.push({ source: src, ...e });
    } catch (e) { sources_unavailable.push(src); }
  }
  // Detecteaza contradictii intre surse (ex. email spune platit, Operational nu).
  const byClaim = {};
  for (const e of evidence) { const k = (e.claim || e.field || "").toLowerCase(); if (k) (byClaim[k] = byClaim[k] || []).push(e); }
  for (const [k, list] of Object.entries(byClaim)) {
    const vals = new Set(list.map((x) => String(x.value)));
    if (vals.size > 1) contradictions.push({ claim: k, values: [...vals], sources: list.map((x) => x.source) });
  }
  // Prospetime: cea mai recenta dovada.
  const dates = evidence.map((e) => e.observed_at || e.date).filter(Boolean).sort();
  const freshness = dates.length ? { latest: dates[dates.length - 1] } : { latest: null };

  // Concluzie: gasit ≠ confirmat. Daca nu avem dovezile cerute → nu declaram complet.
  const missing = arr(evidence_requirements).filter((req) => !evidence.some((e) => (e.field || e.claim) === req));
  let conclusion, confidence;
  if (!evidence.length && sources_checked.length) { conclusion = "NOT_OBSERVED"; confidence = 40; }
  else if (!sources_checked.length) { conclusion = "UNKNOWN"; confidence = 10; }
  else if (missing.length) { conclusion = "FOUND_PARTIAL"; confidence = 55; }
  else if (contradictions.length) { conclusion = "CONTRADICTION"; confidence = 45; }
  else { conclusion = "FOUND_NOT_YET_CONFIRMED"; confidence = 65; } // gasit, dar "confirmat oficial" cere sursa oficiala

  return {
    investigation_id: `inv:${(nowISO || new Date().toISOString()).replace(/[^0-9]/g, "").slice(0, 17)}`,
    sources_planned: planned, sources_checked, sources_unavailable,
    evidence, contradictions, unresolved_unknowns: missing, freshness_assessment: freshness,
    conclusion, confidence, recommended_actions: [],
  };
}

/** Rezumat uman al investigatiei — separa gasit/confirmat/necunoscut. */
export function investigationSummary(inv) {
  if (!isObj(inv)) return "";
  const L = [`Am verificat: ${inv.sources_checked.join(", ") || "niciuna"}.`];
  if (inv.sources_unavailable.length) L.push(`Indisponibile: ${inv.sources_unavailable.join(", ")}.`);
  if (inv.evidence.length) L.push(`Dovezi gasite: ${inv.evidence.length}.`);
  if (inv.contradictions.length) L.push(`Contradictii: ${inv.contradictions.map((c) => c.claim).join(", ")}.`);
  if (inv.unresolved_unknowns.length) L.push(`Inca necunoscut: ${inv.unresolved_unknowns.join(", ")}.`);
  const map = { NOT_OBSERVED: "nu am observat informatia in sursele verificate", UNKNOWN: "nu am putut verifica sursele", FOUND_PARTIAL: "gasit partial — lipsesc dovezi", CONTRADICTION: "surse contradictorii", FOUND_NOT_YET_CONFIRMED: "gasit, dar neconfirmat oficial" };
  L.push(`Concluzie: ${map[inv.conclusion] || inv.conclusion}.`);
  return L.join(" ");
}
