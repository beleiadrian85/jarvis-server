// EXECUTIVE BOARD — Guardian. DETERMINIST, zero LLM, zero IO.
// Apara CODEX: structura valida, dezacorduri nefalsificate, contradictii
// explicate, zero executie de actiuni, plati excluse. Poate BLOCA emiterea
// unei recomandari incomplete/neconforme; NU poate anula decizia fondatorului.
import { validateDirectorOutput, validateRecommendation } from "./boardValidator.js";

const strip = (s) => String(s || "").toLowerCase()
  .replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t");

/**
 * Verifica sedinta si sinteza. → DirectorOutput (rol GUARDIAN) + verdict:
 * { output, compliant, issues[], blockEmission }
 */
export function guardianReview({ question = "", directors = [], synthesis = null } = {}) {
  const issues = [];
  let block = false;

  // 1) Structura fiecarui director convocat (perspectivele lipsa sunt deja
  //    marcate insufficient_data de sesiune — aici prindem structuri corupte).
  for (const d of directors) {
    const v = validateDirectorOutput(d);
    if (!v.valid) { issues.push(`structura invalida la ${d?.role || "?"}: ${v.errors[0]}`); block = true; }
  }

  // 2) Structura recomandarii sintetizate.
  if (synthesis) {
    const v = validateRecommendation(synthesis);
    if (!v.valid) { issues.push(...v.errors.map((e) => `recomandare: ${e}`)); block = true; }
  } else {
    issues.push("lipseste sinteza");
    block = true;
  }

  // 3) Dezacordurile NU se falsifica: orice pozitie valida diferita de
  //    recomandare trebuie sa apara in major_disagreements.
  if (synthesis && Array.isArray(synthesis.major_disagreements)) {
    const recPositive = synthesis.recommendation === "DA";
    const recNegative = synthesis.recommendation === "NU";
    const listed = new Set(synthesis.major_disagreements.map((d) => d.role));
    for (const d of directors) {
      const dissent = (recPositive && d.position === "reject") ||
                      (recNegative && (d.position === "approve" || d.position === "approve_with_conditions"));
      if (dissent && !listed.has(d.role)) {
        issues.push(`dezacord eliminat din sinteza: ${d.role} (${d.position})`);
        block = true;
      }
    }
  }

  // 4) Contradictie fata de o decizie anterioara → obligatoriu explicata (F39-F40).
  if (synthesis && synthesis.contradicts_prior &&
      !(synthesis.contradicts_prior.explanation && synthesis.contradicts_prior.explanation.trim())) {
    issues.push("contradictie fata de o decizie anterioara fara explicatie (F40)");
    block = true;
  }

  // 5) Cifre fara sursa: argumente cu sume mari dar evidence gol (avertisment, nu blocaj).
  for (const d of directors) {
    if (d.position !== "insufficient_data" &&
        Array.isArray(d.arguments) && d.arguments.some((a) => /\d{4,}/.test(String(a))) &&
        Array.isArray(d.evidence) && d.evidence.length === 0) {
      issues.push(`cifre fara sursa in argumentele ${d.role} (evidence gol)`);
    }
  }

  // 6) Plati (Nivel 4): Boardul nu executa si nu recomanda executarea automata.
  if (/(executa (plata|platile)|plateste automat|transfer automat)/.test(strip(question))) {
    issues.push("plata detectata in intrebare: executia ramane exclusiv umana (Nivel 4) — Boardul doar analizeaza");
  }

  const output = {
    role: "GUARDIAN",
    position: block ? "reject" : "approve",
    confidence: 100, // verificare determinista, nu opinie
    arguments: block
      ? ["Recomandarea nu se emite: structura incompleta sau neconforma CODEX."]
      : ["Structura completa; dezacordurile pastrate; conformitate CODEX verificata."],
    evidence: ["[guardian] verificare determinista (boardValidator + reguli CODEX)"],
    risks: issues.slice(0, 5),
    conditions: [], alternatives: [],
    unanswered_questions: [],
  };

  return { output, compliant: !block, issues, blockEmission: block };
}

/**
 * Override-ul fondatorului (F27-F28): Guardianul NU il poate bloca.
 * Verifica doar ca limitele obligatorii exista; lipsesc → le cere (warnings).
 */
export function reviewFounderOverride(overriddenRec) {
  const warnings = [];
  if (!overriddenRec?.risk_limits?.length) warnings.push("override fara limite de capital/timp/risc (F28)");
  if (!overriddenRec?.stop_conditions?.length) warnings.push("override fara criterii de oprire (F28)");
  return { accepted: true, warnings }; // decizia fondatorului prevaleaza intotdeauna
}
