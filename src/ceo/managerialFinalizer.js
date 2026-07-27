// CANONICAL MANAGERIAL FINALIZER — punctul UNIC prin care trece ORICE output
// managerial catre Adrian (chat, Telegram, Ask CODEX, CEO Home, proactive digest,
// reactive watch, alerts, reports). Niciun canal nu genereaza raspunsul final direct.
// Lant: Assessment → Founder Filter → Claim Validator → Quality Gate → (1 corectie)
// → traceability → channel formatting. Adaptoarele de canal schimba doar lungime/
// emoji/limite, NU logica manageriala.
import { checkManagerialResponse, correctionInstruction, gateSummary } from "./qualityGate.js";
import { validateClaims } from "./managerialClaimValidator.js";
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
    executionReceipts = [], confirmedFailures = [], forFounder = true, llm = null, system = null, messages = null,
  } = isObj(p) ? p : {};

  let text = String(draft || "");
  const gctx = { text: assessment?.decision_context || "", isManagerial: true, forFounder, unknowns: arr(assessment?.unknowns), receipts: arr(executionReceipts), confirmedFailures: arr(confirmedFailures), founderExpectation: arr(assessment?.founder_declared_expectations).length > 0 };

  let gate = checkManagerialResponse(text, gctx);
  let trace = assertResponseTraceability(text, assessment, { receipts: executionReceipts });
  let corrected = false;

  // UN singur ciclu de corectie (daca avem cu ce regenera si e material).
  if ((!gate.pass || !trace.traceable) && typeof llm === "function") {
    const fixMsg = correctionInstruction(gate) + (trace.gaps.length ? "\nTRASABILITATE — afirmatii fara suport (elimina-le sau leaga-le de fapte reale):\n" + trace.gaps.map((g) => `- ${g.claim}: ${g.why}`).join("\n") : "");
    try {
      const regen = await llm({ system: system || "", messages: [...arr(messages), { role: "assistant", content: text }, { role: "user", content: fixMsg }] });
      if (regen && String(regen).trim()) {
        const cand = String(regen).trim();
        const g2 = checkManagerialResponse(cand, gctx);
        const t2 = assertResponseTraceability(cand, assessment, { receipts: executionReceipts });
        // Pastreaza corectia doar daca imbunatateste (mai putine violari materiale + gaps).
        if (g2.material + t2.gaps.length <= gate.material + trace.gaps.length) { text = cand; gate = g2; trace = t2; corrected = true; }
      }
    } catch { /* corectie best-effort */ }
  }

  const adapt = CHANNEL_ADAPTERS[channel] || CHANNEL_ADAPTERS.chat;
  text = adapt(text);

  await audit("managerial_finalize", `${channel}/${trigger || "-"}`, `${gateSummary(gate)} traceable=${trace.traceable} gaps=${trace.gaps.length} corrected=${corrected}`).catch(() => {});
  return { text, gate, traceability: trace, corrected, channel };
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
