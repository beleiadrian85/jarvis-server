// RESPONSE QUALITY GATE (Partea III). Valideaza raspunsul managerial INAINTE de
// livrare, prin 15 verificari deterministe/heuristice. Daca esueaza material →
// UN singur ciclu de corectie (regenerare cu violarile ca instructiune), apoi
// livreaza cu incertitudinea explicita. Fara loop-uri nelimitate. PUR.
import { PRINCIPLES } from "./constitution.js";
import { validateClaims } from "./managerialClaimValidator.js";

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const L = (s) => String(s || "").toLowerCase();

// Recomandari GENERICE interzise (P7).
const GENERIC_PHRASES = [
  "achita sau reeșaloneaza", "achita sau reesaloneaza", "cere termen nou", "pregateste cash",
  "urmareste situatia", "urmareste situația", "monitorizeaza", "ai grija", "tine sub control",
  "trebuie rezolvat", "gestioneaza", "ocupa-te de",
];
// Stari emotionale interzise ca fapt (P10).
const EMOTION_WORDS = ["demotivat", "demotivata", "paralizat", "paralizata", "dezinteresat", "neimplicat", "incompetent", "frustrat", "lenes", "delasa"];
// Coduri interne care nu trebuie sa apara la om (P14).
const INTERNAL_CODES = /\b(need|loop|dec|cr|trace)[:_-][a-z0-9]{3,}\b|#[A-Z0-9]{5,}|\bDATA_REQUIRED_BEFORE_DECISION\b|\bEVIDENCE_PACKET\b/i;
// Afirmatii ferme de succes fara dovada (P11).
const SUCCESS_CLAIM = /\b(rezolvat|finalizat|inchis|platit|incasat|gata|s-a facut)\b/i;
const EVIDENCE_WORD = /\b(dovada|document|confirmare|reconcili|receipt|extras|cifra|verificat|screenshot|foto)\b/i;
// Plan prezentat ca executie (P1/P12).
const EXEC_CLAIM = /\b(am cerut|am trimis|am creat|am verificat|am extras|am contactat)\b/i;

/**
 * Verifica un raspuns managerial. @returns { pass, violations:[{check,principle,why}], score }
 * `ctx`: { text (intrebarea), isManagerial, hasOwnerData, unknowns[], founderExpectation,
 *          receipts[] (scrieri reale), forFounder (bool) }
 */
export function checkManagerialResponse(reply, ctx = {}) {
  const r = String(reply || "");
  const n = L(r);
  const c = isObj(ctx) ? ctx : {};
  const v = [];
  const add = (check, principle, why) => v.push({ check, principle, why });

  // 1. Fapte vs presupuneri separate (P1) — daca afirma cifre dar nu marcheaza incertitudinea.
  if (c.unknowns?.length && !/(necunoscut|unknown|nu (stiu|am date|e confirmat)|neconfirmat|nereconciliat|daca se confirma)/i.test(n))
    add("facts_vs_assumptions", "P1", "exista necunoscute in context dar raspunsul nu le marcheaza");

  // 3. Doar dashboard/enumerare fara interpretare (P2 — soft).
  const looksLikeList = (r.match(/^\s*[-•\d]/gm) || []).length >= 4;
  const interprets = /(inseamna|conteaza|priorit|dominant|recomand|concluzie|ce conteaza acum|impact)/i.test(n);
  if (looksLikeList && !interprets)
    add("interpret_not_report", "P2", "lista lunga fara interpretare/prioritizare");
  // 3b. DASHBOARD DUMP la o intrebare de tip "ce conteaza acum" — MATERIAL (P3):
  // enumera toate problemele fara issue dominant.
  const asksWhatMatters = /(ce conteaza acum|cum stam|care (sunt|e) (riscul|riscurile)|ce e important|ce am pe cap|prioritati|situatia (generala|firmei))/i.test(L(c.text));
  if (asksWhatMatters && looksLikeList && !/(dominant|cel mai (important|grav|urgent)|principalul|conteaza acum e|singurul care)/i.test(n))
    add("dashboard_dump", "P3", "la o intrebare de tip 'ce conteaza acum' a enumerat toate problemele fara issue dominant");

  // 5. Sarcina operationala pusa pe Adrian (P5) — "tu sa ceri/faci/verifici" ce e delegabil.
  if (/\b(tu (sa )?(ceri|cere|faci|fa|verifici|verifica|trimiti|trimite|suni|suna)|ar trebui sa (ceri|faci|verifici))\b/i.test(n) && !/decizie|aprob|negoci|capital|strateg/i.test(n))
    add("founder_filter", "P5", "pune pe Adrian o sarcina operationala delegabila (Dana/Nelu/JARVIS)");

  // 6. Recomandare materiala fara owner (P6).
  if (/\b(recomand|propun|trebuie)\b/i.test(n) && c.isManagerial && !/(dana|nelu|mihaela|eu |jarvis|owner|responsabil|ma ocup)/i.test(n))
    add("owner_present", "P6", "recomandare fara owner atribuit");

  // 7. Recomandare generica (P7).
  if (GENERIC_PHRASES.some((g) => n.includes(g)) && !/(pana cand|termen|verific|prag|optiun|cine)/i.test(n))
    add("specific_recommendation", "P7", "recomandare generica fara cine/ce/pana cand/prag");

  // 8. Scenariu prezentat ca fapt (P8) — inclusiv "e real/confirmat/sigur".
  if (c.founderExpectation &&
      (/\b(vei avea|ai|avem) (sigur|garantat|\d)/i.test(n) || /(vanzarea|incasarea|tranzactia|banii) (e|este|sunt) (real|confirmat|sigur|garantat)/i.test(n) || /\b(real si confirmat|confirmat si real|sigur ca intra)\b/i.test(n)) &&
      !/daca se confirma|conditionat|neconfirmat|nu e (inca )?(confirmat|semnat|in sistem)|expected/i.test(n))
    add("scenario_not_fact", "P8", "asteptarea fondatorului prezentata ca incasare/vanzare sigura ('real/confirmat') fara dovada — conditioneaz-o ('DACA se confirma')");

  // 9. Succes declarat fara receipt/dovada (P11).
  if (SUCCESS_CLAIM.test(n) && !EVIDENCE_WORD.test(n) && !(c.receipts?.length))
    add("closed_loop_evidence", "P11", "declara succes fara dovada/receipt");

  // 10. Plan prezentat ca executie fara scriere reala (P1/P12).
  if (EXEC_CLAIM.test(n) && !(c.receipts?.length) && !/propun|urmeaza sa|voi/i.test(n))
    add("plan_not_execution", "P12", "prezinta un plan ca executie fara scriere reala");

  // 11. Lipsa datelor confundata cu zero (P9).
  if (/\b(zero|0)\s*(lei|bani|avans|sold|profit)\b/i.test(n) && c.unknowns?.some((u) => /sold|avans|cash|profit/i.test(u)))
    add("missing_not_zero", "P9", "lipsa datelor tratata ca valoare zero");

  // 12. Stare emotionala atribuita ca fapt (P10).
  if (EMOTION_WORDS.some((w) => n.includes(w)) && !/(pare|posibil|ipotez|s-ar putea|de verificat)/i.test(n))
    add("no_emotion_facts", "P10", "atribuie o stare psihologica ca fapt");

  // 14. Coduri interne / jargon la om (P14).
  if (INTERNAL_CODES.test(r))
    add("human_language", "P14", "contine coduri interne/jargon tehnic");

  // 13/15. Pentru fondator: raspuns care nu spune ce conteaza acum (P14) — foarte lung fara concluzie sus.
  if (c.forFounder && r.length > 600 && !/^(.{0,120})(ce conteaza acum|concluzie|pe scurt|dominant|cel mai important)/i.test(n.slice(0, 160)))
    add("founder_attention", "P14", "raspuns lung fara concluzie manageriala la inceput");

  // SUBSTANTA (Managerial Claim Validator): termen/prag/owner/executie/founder/
  // emotie/proces manual — respinge valorile FABRICATE, nu doar formatul.
  const claim = validateClaims(r, { receipts: c.receipts, founderExpectation: c.founderExpectation, unknowns: c.unknowns });
  for (const cv of claim.violations) add(cv.type, cv.principle, cv.why);

  const material = v.filter((x) => ["P1", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11", "P12", "P13", "P14"].includes(String(x.principle).split("/")[0]));
  const score = Math.max(0, 100 - v.length * 12);
  return { pass: material.length === 0, violations: v, material: material.length, score, claim_violations: claim.violations };
}

/** Instructiune de corectie pentru regenerare (UN singur ciclu). */
export function correctionInstruction(check) {
  if (!check?.violations?.length) return "";
  const byPrinciple = check.violations.map((x) => `- ${x.principle}: ${x.why}`).join("\n");
  return (
    "Raspunsul tau incalca principii din Constitutia CEO. CORECTEAZA exact aceste puncte, " +
    "pastrand ce era bun, si RASPUNDE din nou (o singura data):\n" + byPrinciple +
    "\nReguli: incepe cu concluzia, prioritizeaza problema dominanta, atribuie owner, marcheaza UNKNOWN-urile, " +
    "recomandare specifica (cine/ce/pana cand/prag), nu pune sarcini operationale pe Adrian, fara coduri interne."
  );
}

/** Rezumat scurt (pentru audit/log). */
export function gateSummary(check) {
  return `quality_gate: ${check.pass ? "PASS" : "FAIL"} score=${check.score} violari=${check.violations.length} (${check.violations.map((x) => x.check).join(",") || "-"})`;
}
