// CANONICAL MANAGERIAL FINALIZER — punctul UNIC prin care trece ORICE output
// managerial catre Adrian (chat, Telegram, Ask CODEX, CEO Home, proactive digest,
// reactive watch, alerts, reports). Niciun canal nu genereaza raspunsul final direct.
// Lant: Assessment → Founder Filter → Claim Validator → Quality Gate → (1 corectie)
// → traceability → channel formatting. Adaptoarele de canal schimba doar lungime/
// emoji/limite, NU logica manageriala.
import { checkManagerialResponse, correctionInstruction, gateSummary } from "./qualityGate.js";
import { validateClaims, sanitizeManagerial } from "./managerialClaimValidator.js";
import { audit } from "../audit.js";

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const L = (s) => String(s || "").toLowerCase();

/**
 * TRASABILITATE: afirmatiile MATERIALE din raspuns trebuie sa aiba suport in
 * assessment (owner/founder_reason/deadline_basis/threshold_basis/receipt). Daca
 * raspunsul contine o recomandare/cifra/owner/termen/actiune fara suport → gap.
 * @returns { traceable, gaps:[{claim, why}] }
 */
export function assertResponseTraceability(response, assessment = {}, { receipts = [] } = {}) {
  const r = String(response || "");
  const a = isObj(assessment) ? assessment : {};
  const gaps = [];

  // Reutilizam validatorul de claim-uri: orice violare = afirmatie fara baza in assessment.
  const cv = validateClaims(r, { receipts, founderExpectation: arr(a.founder_declared_expectations).length > 0, unknowns: arr(a.unknowns) });
  for (const v of cv.violations) gaps.push({ claim: v.type, why: `fara suport in assessment: ${v.why}` });

  // Executie declarata → trebuie sa existe receipt in assessment.jarvis_actions/receipts.
  const claimsExecuted = /\b(am creat|am trimis|am pus|am cerut|am facut|am inchis|am rezolvat)\b/i.test(r);
  if (claimsExecuted && !receipts.length && !arr(a.jarvis_actions).some((x) => /EXECUTED|receipt/i.test(JSON.stringify(x))))
    gaps.push({ claim: "EXECUTION", why: "raspunsul declara executie dar assessment/receipts nu contin nicio scriere reala" });

  // Sarcina pentru Adrian → assessment.founder_action trebuie sa aiba founder_reason.
  const asksFounder = /\btu (sa )?(verifici|ceri|intrebi|suni|trimiti|vorbesti)|interventia ta|verifici personal\b/i.test(r);
  if (asksFounder && !(isObj(a.founder_action) && a.founder_action.founder_reason))
    gaps.push({ claim: "FOUNDER_ACTION", why: "raspunsul ii da o sarcina lui Adrian dar assessment nu are founder_action cu founder_reason" });

  return { traceable: gaps.length === 0, gaps };
}

/** Adaptoare de canal: DOAR forma (lungime/emoji/limite), nu logica. */
const CHANNEL_ADAPTERS = {
  telegram: (t) => t.length > 3800 ? t.slice(0, 3780) + "\n…(continuare la cerere)" : t,
  hud: (t) => t,
  chat: (t) => t,
  codex: (t) => t,
  digest: (t) => t,
  reactive: (t) => t,
};

/**
 * Finalizeaza un output managerial. TOATE canalele trec pe aici.
 * @param {object} p {
 *   assessment, draft (textul propus de canal/model), channel, trigger,
 *   executionReceipts:[], forFounder, llm (pt. UN ciclu de corectie; optional),
 *   system (pt. corectie), messages (pt. corectie) }
 * @returns { text, gate, traceability, corrected, blocked }
 */
export async function finalizeManagerialOutput(p = {}) {
  const {
    assessment = {}, draft = "", channel = "chat", trigger = null,
    executionReceipts = [], sourceChecks = [], confirmedFailures = [], actionCards = [], policyReferences = [],
    forFounder = true, llm = null, system = null, messages = null,
  } = isObj(p) ? p : {};

  let text = String(draft || "");
  const hasActionReceipt = arr(executionReceipts).some((x) => x && !/source_check/i.test(x.kind || "") && (x.operational_id || x.id || /task|operational|created|action|job/i.test(x.kind || "")));
  const gctx = { text: assessment?.decision_context || "", isManagerial: true, forFounder, unknowns: arr(assessment?.unknowns), receipts: arr(executionReceipts), sourceChecks: arr(sourceChecks), confirmedFailures: arr(confirmedFailures), founderExpectation: arr(assessment?.founder_declared_expectations).length > 0 };

  let gate = checkManagerialResponse(text, gctx);
  let trace = assertResponseTraceability(text, assessment, { receipts: executionReceipts });
  let corrected = false;

  // COMPRESIE (§9): tinta 80–180 cuvinte pentru raspunsuri manageriale uzuale. Peste
  // ~200 cuvinte declanseaza acelasi UNIC ciclu de corectie cu instructiune de comprimare.
  const wordCount = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
  const tooLong = forFounder && wordCount(text) > 180;

  // UN singur ciclu de corectie (daca avem cu ce regenera si e material SAU prea lung).
  if ((!gate.pass || !trace.traceable || tooLong) && typeof llm === "function") {
    const fixMsg = (correctionInstruction(gate) || "Rescrie raspunsul managerial.") +
      (trace.gaps.length ? "\nTRASABILITATE — afirmatii fara suport (elimina-le sau leaga-le de fapte reale):\n" + trace.gaps.map((g) => `- ${g.claim}: ${g.why}`).join("\n") : "") +
      (tooLong ? "\nCOMPRIMARE (obligatoriu): raspunsul e prea lung. Rescrie in MAXIM 180 de cuvinte: o concluzie dominanta la inceput, maximum 3 puncte, o opinie clara (separata de fapt), o singura actiune/decizie. ELIMINA tabelele daca nu sunt strict necesare, sectiunile repetitive, notificarile (DIGI/ANAF) si emoji-urile in exces. Scurt si executabil." : "");
    try {
      const regen = await llm({ system: system || "", messages: [...arr(messages), { role: "assistant", content: text }, { role: "user", content: fixMsg }] });
      if (regen && String(regen).trim()) {
        const cand = String(regen).trim();
        const g2 = checkManagerialResponse(cand, gctx);
        const t2 = assertResponseTraceability(cand, assessment, { receipts: executionReceipts });
        // Pastreaza corectia daca imbunatateste (mai putine violari + gaps) SAU, pentru
        // compresie, daca ramane curata (0 violari materiale + 0 gaps) si e mai scurta.
        const better = g2.material + t2.gaps.length <= gate.material + trace.gaps.length;
        const cleanerShorter = tooLong && g2.material === 0 && t2.gaps.length === 0 && wordCount(cand) < wordCount(text);
        if (better || cleanerShorter) { text = cand; gate = g2; trace = t2; corrected = true; }
      }
    } catch { /* corectie best-effort */ }
  }

  // SANITIZER DETERMINIST (dupa cele max 1 ciclu): garanteaza ca inferentele cauzale
  // nesustinute NU supravietuiesc, chiar daca modelul le-a repetat.
  const sanitized = sanitizeManagerial(text, { confirmedFailures: arr(confirmedFailures), hasActionReceipt });
  if (sanitized !== text) { text = sanitized; corrected = true; trace = assertResponseTraceability(text, assessment, { receipts: executionReceipts }); }

  const adapt = CHANNEL_ADAPTERS[channel] || CHANNEL_ADAPTERS.chat;
  text = adapt(text);

  // INVARIANT: fara actiuni ascunse in proza (trebuie card/receipt/info-request).
  const hidden = assertNoHiddenActions(text, { actionCards, executionReceipts });

  await audit("managerial_finalize", `${channel}/${trigger || "-"}`, `${gateSummary(gate)} traceable=${trace.traceable} gaps=${trace.gaps.length} corrected=${corrected} cards=${arr(actionCards).length} hidden=${!hidden.ok}`).catch(() => {});
  // Contract structurat (Partea FINALIZER): mesaj + carduri + receipts + politici.
  return {
    message: text, action_cards: arr(actionCards), execution_receipts: arr(executionReceipts), policy_references: arr(policyReferences),
    gate, traceability: trace, hidden_actions: hidden, corrected, channel,
    text, // compat inapoi
  };
}

/**
 * INVARIANT: nicio actiune ascunsa in proza. Daca textul PROMITE/DIRECTIONEAZA o
 * actiune (creeaza/trimite/verifica/aproba/alege/contacteaza/amana/anuleaza), ea
 * trebuie sa existe structural ca Action Card, receipt de executie sau cerere de
 * informatie. @returns {ok, hidden:[verb]}
 */
export function assertNoHiddenActions(text, { actionCards = [], executionReceipts = [] } = {}) {
  const t = L(text);
  const hasStructure = arr(actionCards).length > 0 || arr(executionReceipts).length > 0;
  // Verbe de actiune ca DIRECTIVA/PROMISIUNE (nu descriere factuala).
  const ACTION_VERBS = /\b(creez|creeaza|voi crea|trimit|voi trimite|aprob|alege intre|contactez|voi contacta|aman|voi amana|anulez|voi anula|programez follow)\b/i;
  // "pot crea/pot trimite/pot verifica" = ABILITATE (nu directiva) — permis fara card.
  const isAbility = /\b(pot |as putea |daca vrei|iti pot)\b/i.test(t);
  if (ACTION_VERBS.test(t) && !hasStructure && !isAbility)
    return { ok: false, hidden: (t.match(ACTION_VERBS) || []).slice(0, 1), why: "textul directioneaza/promite o actiune care nu exista ca buton/receipt/cerere de informatie" };
  return { ok: true, hidden: [] };
}

/** True daca un output PROACTIV merita trimis (management by exception). Fara
 *  schimbare materiala / risc nou / prag depasit / SLA depasit / decizie → NU. */
export function warrantsProactiveSend({ hasMaterialChange = false, newRisk = false, thresholdBreach = false, slaBreach = false, decisionNeeded = false, priorityShift = false } = {}) {
  return !!(hasMaterialChange || newRisk || thresholdBreach || slaBreach || decisionNeeded || priorityShift);
}

/** Structura implicita a unui mesaj proactiv (management by exception). */
export function proactiveStructure({ changed, why, done, next, decision = null, back = null }) {
  const S = [];
  if (changed) S.push(`CE S-A SCHIMBAT\n${changed}`);
  if (why) S.push(`DE CE CONTEAZA\n${why}`);
  if (done) S.push(`CE AM FACUT\n${done}`);
  if (next) S.push(`CE URMEAZA\n${next}`);
  S.push(decision ? `DECIZIA TA\n${decision}` : "Nu ai nimic de facut acum.");
  if (back) S.push(`CAND REVIN\n${back}`);
  return S.join("\n\n");
}
