// MANAGERIAL REASONING CONTRACT (Partea II). Construieste un obiect INTERN
// structurat pentru raspunsurile manageriale importante — NU expune chain-of-thought
// brut, ci un schelet verificabil (fapte/asteptari/necunoscute/optiuni/owner/actiuni/
// escaladare/dovada de succes). Ghideaza raspunsul + alimenteaza Quality Gate.
// Pentru intrebari simple/factuale NU se genereaza structura (ruta determinista).
import { isManagerialIntent } from "./constitution.js";

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);

/** Forma contractului (documentata; campurile se completeaza best-effort). */
export const ASSESSMENT_FIELDS = [
  "user_intent", "decision_context", "confirmed_facts", "founder_declared_expectations",
  "external_signals", "unknowns", "assumptions", "relevant_risks", "options",
  "dominant_issue", "recommended_decision", "owner", "jarvis_actions", "team_actions",
  "founder_action", "escalation_condition", "success_evidence", "follow_up_at", "confidence",
];

/** Decide daca un mesaj cere rationament managerial (contract + gate). */
export function needsManagerialReasoning(text, intents = []) {
  if (isManagerialIntent(text)) return true;
  return arr(intents).some((i) => ["CASH", "RISK", "PEOPLE", "TASKS", "SALES", "OWNERSHIP", "FOUNDER_ACTIONS", "DECISION"].includes(i));
}

/**
 * Detecteaza o ASTEPTARE declarata de fondator (bani/incasare viitoare) — P8:
 * scenariu, NU fapt. @returns {object|null} founder expectation.
 */
export function detectFounderExpectation(text) {
  const n = String(text || "").toLowerCase();
  const future = /(vor intra|va intra|o sa intre|urmeaza sa intre|intra|incasez|primesc|voi (incasa|primi)|saptamana viitoare|luna viitoare|zilele astea|urmeaza)/i.test(n);
  const money = n.match(/(\d[\d.,\s]*)\s*(milioane|milion|mil|k|mii|lei|ron|eur|€)/i);
  if (!future || !money) return null;
  return { what: String(text).slice(0, 120), value: money[0], status: "EXPECTED", source: "Adrian", confidence: 40, bank_confirmation: "absent" };
}

/**
 * Construieste ManagerialAssessment din contextul determinist disponibil
 * (evidence packet, source truth, ledger, founder expectations). PUR — nu cheama
 * LLM. Campurile ramase necunoscute sunt marcate explicit (nu inventate).
 * @param {object} p { text, intents, packet, sourceTruth, expectations, risks }
 */
export function buildManagerialAssessment(p = {}) {
  const { text = "", intents = [], packet = null, sourceTruth = null, expectations = [], risks = [] } = isObj(p) ? p : {};
  const a = {};
  for (const f of ASSESSMENT_FIELDS) a[f] = f.endsWith("s") || ["jarvis_actions", "team_actions"].includes(f) ? [] : null;

  a.user_intent = arr(intents)[0] || (isManagerialIntent(text) ? "MANAGERIAL" : "GENERAL");
  a.decision_context = String(text || "").slice(0, 200);

  // Fapte confirmate = ce e VERIFIED in source truth / packet (nu inferente).
  if (sourceTruth?.sources) {
    a.confirmed_facts = sourceTruth.sources.filter((s) => /CONNECTED/.test(s.status)).map((s) => `${s.source} conectat (${(s.data_domains || []).slice(0, 3).join(", ")})`);
    for (const s of sourceTruth.sources.filter((s) => /NOT_CONNECTED/.test(s.status))) a.unknowns.push(`${s.source} neconectat → date indisponibile`);
  }
  a.founder_declared_expectations = arr(expectations).map((e) => ({ what: e.what || e.label, value: e.value ?? null, status: "EXPECTED", source: "Adrian", confidence: e.confidence ?? 50 }));
  a.external_signals = arr(packet?.external || []);
  a.relevant_risks = arr(risks).slice(0, 5);

  // Owner + actiuni: din packet (founder filter) daca exista.
  if (packet?.owners) a.owner = packet.owners;
  a.confidence = a.confirmed_facts.length && !a.unknowns.length ? "MEDIUM-HIGH" : a.unknowns.length ? "LOW-MEDIUM" : "UNKNOWN";
  return a;
}

/** Instructiune de injectat: cere modelului sa RASPUNDA conform contractului. */
export function assessmentInstruction(assessment) {
  const unknowns = arr(assessment?.unknowns);
  const exp = arr(assessment?.founder_declared_expectations);
  const parts = [
    "RASPUNS MANAGERIAL (nu raport): porneste de la concluzie, prioritizeaza problema dominanta, atribuie owner, spune ce faci TU, escaladeaza la Adrian doar exceptiile.",
  ];
  if (unknowns.length) parts.push(`NECUNOSCUTE de pastrat ca UNKNOWN (nu presupune valori): ${unknowns.slice(0, 4).join("; ")}.`);
  if (exp.length) parts.push(`ASTEPTARI ale fondatorului (conditionat 'DACA se confirma', NU fapt): ${exp.map((e) => e.what).join("; ")}.`);
  return parts.join("\n");
}
