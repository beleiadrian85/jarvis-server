// CEO AI — DECISION ENGINE V2: REGULA 6+1 (P1). Metoda lui Adrian formalizata:
// pana la 6 scenarii REALE (nu umplute artificial) + SCENARIUL 7 = recomandarea
// CEO AI cu "DE CE ACEASTA ESTE CEA MAI BUNA DECIZIE ACUM". Un singur apel LLM,
// validare determinista; date critice lipsa → DATA_REQUIRED, nu recomandare.
import { config } from "../config.js";
import { callClaude } from "../claude.js";
import { withTimeout, withRetry, withFallback } from "../resilience.js";
import { COMPANY } from "./companyConfig.js";

export const SCENARIO_FIELDS = [
  "name", "description", "upside", "downside", "cash_impact", "profit_impact",
  "time_impact", "risk", "reversibility", "people_impact", "company_value_impact",
  "unknowns", "confidence",
];
const LLM_TIMEOUT_MS = 180_000;
const MAX_TOKENS = 12_000; // lectia sonnet-5: buget peste thinking

/** Validare determinista a analizei. PUR. */
export function validateDecisionAnalysis(a) {
  const errors = [];
  if (!a || typeof a !== "object") return { valid: false, errors: ["analiza lipsa"] };
  if (!Array.isArray(a.scenarios) || a.scenarios.length < 2) errors.push("minim 2 scenarii reale");
  if ((a.scenarios || []).length > 6) errors.push("maxim 6 scenarii (nu se umple artificial)");
  for (const s of a.scenarios || []) {
    for (const f of SCENARIO_FIELDS) if (!(f in s)) errors.push(`scenariul „${s.name || "?"}”: camp lipsa ${f}`);
    if (typeof s.confidence === "number" && (s.confidence < 0 || s.confidence > 100)) errors.push("confidence 0-100");
  }
  if (a.status === "RECOMMENDED") {
    if (!a.scenario7?.recommendation) errors.push("scenariul 7 lipsa la status RECOMMENDED");
    if (!a.scenario7?.why_now) errors.push("scenariul 7 fara DE CE ACUM");
  } else if (a.status !== "DATA_REQUIRED") {
    errors.push(`status invalid: ${a.status}`);
  }
  if (a.status === "DATA_REQUIRED" && !(a.missing_data || []).length) errors.push("DATA_REQUIRED fara lista de date lipsa");
  return { valid: !errors.length, errors };
}

/** Gard determinist INAINTE de LLM: date critice lipsa → DATA_REQUIRED direct. PUR. */
export function preflightDecision({ question, criticalData = {} } = {}) {
  const missing = Object.entries(criticalData).filter(([, v]) => v == null || v === "UNKNOWN").map(([k]) => k);
  if (missing.length) {
    return {
      status: "DATA_REQUIRED", question, scenarios: [],
      missing_data: missing,
      note: "Decizie cu date critice lipsa ≠ recomandare finala. Intai datele.",
    };
  }
  return null;
}

/**
 * Analiza 6+1. UN apel LLM (injectabil in teste), pe dosar determinist.
 * @param p.question      decizia de analizat
 * @param p.dataBlock     dosarul determinist (cifre DOAR de aici)
 * @param p.criticalData  {nume: valoare|null} — null/UNKNOWN → DATA_REQUIRED fara LLM
 * @param p.llm           injectabil pt teste
 */
export async function analyzeDecision({ question, dataBlock = "", criticalData = {}, llm = null } = {}) {
  const pre = preflightDecision({ question, criticalData });
  if (pre) return pre; // zero cost LLM cand datele critice lipsesc

  const call = llm || withFallback(withRetry(withTimeout(
    ({ system, user }) => callClaude({ system, messages: [{ role: "user", content: user }], maxTokens: MAX_TOKENS, model: config.model }),
    LLM_TIMEOUT_MS), { retries: 1 }), () => null);

  const raw = await call({
    system:
      `Esti CEO AI (${COMPANY.name} / ${COMPANY.brand}, fondator ${COMPANY.founder.name}). Aplici REGULA 6+1: ` +
      "generezi DOAR scenariile REALE (2-6; nu inventezi optiuni ca sa umpli 6), apoi SCENARIUL 7 = recomandarea ta. " +
      "Folosesti EXCLUSIV datele din dosar; nu inventezi cifre. Separi STRICT cash de profit. " +
      "Raspunzi DOAR JSON valid: {\"status\":\"RECOMMENDED\",\"scenarios\":[{" +
      SCENARIO_FIELDS.map((f) => `\"${f}\":...`).join(",") +
      "}],\"scenario7\":{\"recommendation\":\"...\",\"why_now\":\"DE CE aceasta este cea mai buna decizie ACUM\",\"conditions\":[],\"stop_conditions\":[],\"confidence\":0}} " +
      "SAU {\"status\":\"DATA_REQUIRED\",\"missing_data\":[\"...\"]} daca dosarul nu ajunge pentru o analiza onesta. " +
      "cash_impact/profit_impact: text cu cifre din dosar sau \"necunoscut\". reversibility: reversibila|partial|ireversibila. " +
      "Fii concis: max 2 fraze per camp.",
    user: `DECIZIA:\n${question}\n\nDOSAR DETERMINIST (singura sursa de cifre):\n${dataBlock || "(fara date)"}`,
  });
  if (raw == null) return { status: "DATA_REQUIRED", question, scenarios: [], missing_data: ["analiza LLM indisponibila (timeout/eroare)"], note: "fallback sigur" };

  let parsed = null;
  try {
    const c = String(raw).replace(/```json|```/g, "");
    const s = c.indexOf("{"), e = c.lastIndexOf("}");
    parsed = JSON.parse(c.slice(s, e + 1).replace(/[\u0000-\u0008\u000B-\u001F]/g, " ").replace(/\r?\n/g, " "));
  } catch { /* invalid */ }
  if (!parsed) return { status: "DATA_REQUIRED", question, scenarios: [], missing_data: ["raspuns model neparsabil"], note: "fallback sigur" };

  parsed.question = question;
  const v = validateDecisionAnalysis(parsed);
  if (!v.valid) return { status: "DATA_REQUIRED", question, scenarios: parsed.scenarios || [], missing_data: v.errors, note: "structura invalida — nu se emite recomandare" };
  return parsed;
}
