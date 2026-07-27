import { callClaude, callClaudeWithMCP } from "./claude.js";
import { config, hasOperational, hasGoogle, hasStrategy } from "./config.js";
import { pool, query } from "./db.js";
import { appendMessage, getContext, maybeSummarize } from "./history.js";
import { recall, saveMemory, saveDecision, listDecisions, extractFacts } from "./memory.js";
import { activeReminders, settleReminder, formatReminders, addReminder } from "./reminders.js";
import { prepareTaskCreate, prepareCalendarEvent, executeConfirmed } from "./taskflow.js";
import { getPendingForChannel, confirmActionById, cancelActionById } from "./approvalGate.js";
import { classify } from "./decisionEngine.js";
import { fastReply } from "./fastPathRouter.js";
import { operationalFast } from "./operationalFastPath.js";
import { searchDrive } from "./sources/drive.js";
import { findEmail, createDraft, searchThreads, readThread } from "./sources/gmail.js";
import { buildMorningReport } from "./morning.js";
import { cashForecastReport } from "./engines/financialBrain.js";
import { ceoHomeReport, riskReport } from "./engines/ceoHome.js";
import { projectIntelReport } from "./engines/projectIntel.js";
import { entity360Report } from "./engines/entity360.js";
import { runCouncil, impactOver50k } from "./council.js";
// CODEX Faza 3 — Executive Board (GATED: ambele flag-uri implicit OFF → no-op).
import { boardMode, runBoardMeeting, formatBoardReport, maybeShadowBoard } from "./executiveBoard/index.js";
import { buildBriefing } from "./supervisor/briefing.js";
import { buildSalesReport } from "./supervisor/sales.js";
import { audit } from "./audit.js";
import { wrapExternal } from "./lib/safeContent.js";
import { norm } from "./lib/text.js";
import { PERSONA } from "./persona.js";
import { constitutionForPrompt, isManagerialIntent } from "./ceo/constitution.js";
import { needsManagerialReasoning, assessmentInstruction, buildManagerialAssessment } from "./ceo/managerialReasoning.js";
import { checkManagerialResponse, correctionInstruction, gateSummary } from "./ceo/qualityGate.js";
import { splitQuestions, multiQuestionInstruction, completenessGap, tokenBudgetFor } from "./multiQuestion.js";
import {
  isOperationalTopic, extractEntity, isProjectTopic, isRiskTopic, isCeoHomeTopic,
  extractBalance, isCashForecastTopic, isEmailTopic, isCalendarTopic, needsWeb, guessCategory,
  isStrongStrategic, isPredictionTopic, isOwnershipQuestion, isFounderActionsQuestion,
} from "./intents.js";
import { asksAboutRequests } from "./ceo/actionLedger.js";
// P2 — Prediction Engine (determinist, GATED pe config.predictionEngine).
import { predict } from "./predictionEngine.js";
import { buildPredictionState } from "./predictionState.js";
import { formatPredictionReport } from "./predictionReport.js";
export { splitVoice } from "./lib/text.js";
// FAZA FINALA — module pipeline (perceptie → decizie → rutare → provider → compunere).
import { getCapabilities } from "./capabilities.js";
import { buildContext, neededSources } from "./contextBuilder.js";
import { routeModel } from "./modelRouter.js";
import { buildProviderRequest } from "./providerAdapter.js";
import { composeResponse } from "./responseComposer.js";
import { validateResponse } from "./responseValidator.js";
import { buildTrace } from "./executionTrace.js";
import { estimateTokens, enforceBudget } from "./tokenBudget.js";
import { createMetrics } from "./providerMetrics.js";
import { createCache } from "./cache.js";
import { withTimeout, withRetry, withFallback } from "./resilience.js";
import { resolveModes } from "./modes.js";
import { reviewDecision } from "./postDecisionReview.js";
import { orchestrateStrategy } from "./strategyOrchestrator.js";
import { callOpenAI } from "./openai.js";

// Instante partajate (in-memory, fara egress).
const _metrics = createMetrics();
const _promptCache = createCache({ maxEntries: 200, ttlMs: 5 * 60_000 });
/** Telemetrie provider (expusa pentru diagnostic). */
export function providerMetrics() { return _metrics.snapshot(); }

/**
 * Creierul comun Telegram + HUD: istoric si memorie partajate,
 * intentii deterministe (fara tokeni) inainte de chat-ul general.
 *
 * handleMessage(channel, text) → { reply, confirmId? }
 * confirmId = exista o actiune in asteptare; UI-ul afiseaza Da/Nu.
 */

// Model rapid pentru conversatie (rapoartele/consiliul raman pe config.model).
const CHAT_MODEL = process.env.CHAT_MODEL || "claude-haiku-4-5-20251001";

// A1: pe calea de chat general, MCP-ul Operational e expus DOAR read-only.
// Tool-urile de scriere NU sunt in lista → modelul nu le poate apela;
// orice scriere trece exclusiv prin fluxul de confirmare (approvalGate).
const OPERATIONAL_READ_TOOLS = [
  "list_tasks", "get_task", "list_alerts", "list_journals", "project_costs",
  "list_material_orders", "building_expenses", "production_summary",
  "list_payment_obligations", "cash_report", "sales_summary",
  "list_sales_units", "partner_activity",
];

// PERSONA e in ./persona.js (B2).

const WAKE = ["buna dimineata jarvis", "buna dimineata", "neata jarvis"];

let userMsgCounter = 0;

export async function handleMessage(channel, text) {
  const t0 = Date.now(); // L6 — cronometru pentru fast-path
  const n = norm(text);

  // 0) Confirmare/anulare actiune in asteptare (text, pentru HUD si Telegram).
  // Verificam pending-ul DOAR cand mesajul e clar un da/nu (fara cost pe restul).
  if (["da", "confirm", "confirma", "ok", "nu", "anuleaza", "stop"].includes(n)) {
    const waiting = await getPendingForChannel(channel);
    if (waiting) {
      if (["da", "confirm", "confirma", "ok"].includes(n)) {
        return { reply: await runConfirmed(waiting.id) };
      }
      await cancelActionById(waiting.id);
      await audit("actiune_anulata", "", `pending ${waiting.id}`, false);
      return { reply: "Anulat." };
    }
  }

  // 0.4) STRATEGIC REFLEXIV → Director de Strategie (ChatGPT), prin generalChat.
  //       DOAR cand strategy e activ (hasStrategy). Cu flag off → NU intercepteaza,
  //       deci rapoartele deterministe (risc etc.) raman EXACT ca inainte (zero regresie).
  //       Comenzile de raport nu se potrivesc cu isStrongStrategic → raman deterministe.
  if (hasStrategy && isStrongStrategic(text)) {
    return { reply: await generalChat(channel, text) };
  }

  // 0.5) Supervisor briefing (F1) — la cerere.
  if (/^\/?(supervizor|briefing|brief|ce probleme)\b/.test(n) || n === "ce e cu operational") {
    const b = await buildBriefing();
    remember(channel, text, b);
    return { reply: b };
  }

  // 0.6) Raport Vanzari + Parteneri — la cerere.
  if (/^\/?(raport\s+)?(vanzari|v[aâ]nz[aă]ri|parteneri|spion)\b/.test(n) || /cum (stau|merg) (vanzarile|v[aâ]nz[aă]rile|partenerii)/.test(n)) {
    const r = await buildSalesReport();
    remember(channel, text, r);
    return { reply: r };
  }

  // 1) Raport de dimineata.
  if (WAKE.some((w) => n.includes(w)) || n === "/raport" || n === "raport") {
    const report = await buildMorningReport();
    await audit("raport", "raport de dimineata generat", "vreme+calendar+gmail+operational+reminders");
    remember(channel, text, report);
    return { reply: report };
  }

  // 1.4) Prediction Engine — probabilitati VIITOARE (determinist, ZERO LLM).
  //       GATED pe config.predictionEngine. OFF (implicit) → comportament neschimbat.
  if (config.predictionEngine && hasOperational && isPredictionTopic(text)) {
    const t0p = Date.now();
    const state = await buildPredictionState({ openingBalance: extractBalance(text) });
    const rep = formatPredictionReport(predict(state));
    console.log(`[route=prediction] ${Date.now() - t0p}ms`);
    await audit("prediction", "predictii generate (determinist)", "predictionEngine:obligatii+taskuri+vanzari");
    remember(channel, text, rep);
    return { reply: rep };
  }

  // Intent fidelity (Partea IV/XVI): intrebarile de OWNERSHIP / REQUEST-HISTORY /
  // FOUNDER-ACTIONS / multi-intrebare NU se lasa interceptate de rapoartele canned
  // — merg la chat-ul grounded (cu Evidence Packet), altfel raspund la alt intent.
  const wantsGrounded = (() => {
    try {
      return isOwnershipQuestion(text) || isFounderActionsQuestion(text) ||
        asksAboutRequests(text).about || splitQuestions(text).length >= 2 ||
        // CONSTITUTIA nu poate fi ocolita de rapoartele canned: orice intrebare
        // MANAGERIALA (riscuri, cash, task-uri, "cum stam", rezervari) merge pe
        // calea grounded cu Constitutie + Quality Gate, nu la raportul canned.
        isManagerialIntent(text);
    } catch { return false; }
  })();

  // 1.5) Financial Brain — cash forecast / necesar de plati (determinist).
  if (!wantsGrounded && hasOperational && isCashForecastTopic(text)) {
    const rep = await cashForecastReport({ openingBalance: extractBalance(text) });
    await audit("cash_forecast", "prognoza cash generata", "operational:list_payment_obligations");
    remember(channel, text, rep);
    return { reply: rep };
  }

  // 1.6) CEO Home — starea firmei intr-un ecran + Health Score.
  if (!wantsGrounded && hasOperational && isCeoHomeTopic(text)) {
    const rep = await ceoHomeReport({ openingBalance: extractBalance(text) });
    await audit("ceo_home", "CEO Home generat", "operational:cash+sales+tasks");
    remember(channel, text, rep);
    return { reply: rep };
  }

  // 1.7) Risk Engine — riscuri prioritizate.
  if (!wantsGrounded && hasOperational && isRiskTopic(text)) {
    const rep = await riskReport();
    await audit("risk_engine", "riscuri evaluate", "operational:cash+tasks+sales");
    remember(channel, text, rep);
    return { reply: rep };
  }

  // 1.8) Project Intelligence — cost/task-uri/vanzari pe proiecte.
  if (hasOperational && isProjectTopic(text)) {
    const rep = await projectIntelReport();
    await audit("project_intel", "raport proiecte generat", "operational:project_costs+tasks+sales");
    remember(channel, text, rep);
    return { reply: rep };
  }

  // 1.9) Knowledge Graph lite — Entity 360 ("tot ce tine de X").
  if (hasOperational) {
    const ent = extractEntity(text);
    if (ent) {
      const rep = await entity360Report(ent);
      await audit("entity360", `entitate: ${ent}`, "operational:tasks+plati+vanzari+costuri");
      remember(channel, text, rep);
      return { reply: rep };
    }
  }

  // 2) Remindere: rezolvat / amana / ignora #id.
  const rem = n.match(/^(rezolvat|amana|ignora)\s*#?(\d+)(?:\s+(\d+))?$/);
  if (rem) {
    const msg = await settleReminder(Number(rem[2]), rem[1], rem[3] ? Number(rem[3]) : 3);
    return { reply: msg };
  }

  // 2.5) Consiliu AI (la cerere) / Executive Board (CODEX Faza 3, GATED).
  //      Cu ambele flag-uri OFF (implicit): comportament IDENTIC cu inainte.
  if (/\bconsiliu\b/i.test(n) || (boardMode() !== "off" && /\b(board|sedinta de board)\b/.test(n))) {
    const q = text.replace(/.*(consiliu|board)[:\s]*/i, "").trim() || "ultima decizie discutata";
    if (boardMode() === "active") {
      const meeting = await runBoardMeeting(q);
      const rep = formatBoardReport(meeting);
      remember(channel, text, rep);
      return { reply: rep };
    }
    const r = await runCouncil(q);
    maybeShadowBoard(q); // no-op cu shadow OFF; cu shadow ON: analiza doar in audit
    remember(channel, text, r);
    return { reply: "🏛️ CONSILIU JARVIS\n\n" + r };
  }

  // 3) Registrul de decizii.
  const dec = text.match(/noteaz[aă] decizia[:\s]+([\s\S]+)/i);
  if (dec) {
    const d = await saveDecision(dec[1].trim());
    await audit("decizie_notata", d.decision, "registru decizii", true);
    remember(channel, text, d.decision);
    let reply =
      `📌 Decizie notata (#${d.id}):\n${d.decision}` +
      (d.figures ? `\nCifre: ${d.figures}` : "") +
      (d.risks ? `\nRiscuri: ${d.risks}` : "") +
      (d.review_by ? `\nRevizuire: ${d.review_by}` : "");
    // Consiliu automat la impact >50.000 EUR (constitutie, Faza 4).
    if (impactOver50k(`${dec[1]} ${d.figures || ""}`)) {
      const council = await runCouncil(d.decision).catch(() => null);
      if (council) reply += "\n\n🏛️ Impact estimat mare — consiliul JARVIS:\n\n" + council;
    }
    return { reply };
  }
  if (n === "/decizii" || n === "decizii") {
    const rows = await listDecisions(10);
    if (!rows.length) return { reply: "Registrul de decizii e gol." };
    return {
      reply:
        "📌 Ultimele decizii:\n" +
        rows
          .map((d) => `#${d.id} (${new Date(d.decided_on).toLocaleDateString("ro-RO")}) ${d.decision}`)
          .join("\n"),
    };
  }

  // 4) Memorie explicita: "tine minte: ...".
  const mem = text.match(/[tț]ine minte[:\s]+([\s\S]+)/i);
  if (mem) {
    await saveMemory(guessCategory(mem[1]), mem[1].trim(), "comanda directa");
    return { reply: "🧠 Retinut." };
  }

  // 5) Creare task (Nivel 2, cu confirmare).
  if (/creeaz[aă]\s+task/i.test(text)) {
    const { id, preview } = await prepareTaskCreate(text, channel);
    return { reply: preview + "\n\nRaspunde: da / nu", confirmId: id };
  }

  // 5.5) Calendar / alarma (cu confirmare). Necesita Google conectat.
  if (isCalendarTopic(text)) {
    if (!hasGoogle) {
      return { reply: "Calendarul nu e conectat încă. Conectează Google (link-ul de setup) și pot crea evenimente și alarme care apar pe telefon." };
    }
    try {
      const { id, preview } = await prepareCalendarEvent(text, channel);
      return { reply: preview + "\n\nRaspunde: da / nu", confirmId: id };
    } catch (e) {
      return { reply: e.message };
    }
  }

  // 5.7) Email: cautare + citire + sinteza (read-only; trimiterea NU se face).
  if (isEmailTopic(text)) {
    if (!hasGoogle) {
      return { reply: "Emailul nu e conectat încă. Conectează Google (link-ul de setup) și pot căuta, citi și pregăti drafturi (nu trimit nimic fără tine)." };
    }
    return { reply: await handleEmailQuery(channel, text) };
  }

  // 6) Cautare in Drive.
  const drv = text.match(/caut[aă]\s+[iî]n\s+drive[:\s]+(.+)/i);
  if (drv) {
    const files = await searchDrive(drv[1].trim());
    if (files === null) return { reply: "Drive neconfigurat (lipseste OAuth Google)." };
    if (!files.length) return { reply: "Nimic gasit in folderul JARVIS." };
    return {
      reply: files.map((f) => `📄 ${f.name} (${f.modified})\n${f.link}`).join("\n\n"),
    };
  }

  // 7) Draft de raspuns email (Nivel 2).
  const drf = text.match(/draft(?:\s+r[aă]spuns)?(?:\s+la)?[:\s]+([\s\S]+)/i);
  if (drf) {
    return { reply: await makeDraft(drf[1].trim()) };
  }

  // 7.9) FAST PATH (L1) — raspuns instant, fara Claude/MCP/recall/embedding.
  const fast = fastReply(text);
  if (fast !== null) {
    console.log(`[timing] route=fastPath total=${Date.now() - t0}ms`);
    return { reply: fast };
  }

  // 8) Coada deciziei — brain intreaba decisionEngine (fast-path-ul de sus ramane intact).
  //    Gated de flag: cu DECISION_ENGINE=off (implicit) → comportament identic cu inainte.
  if (config.useDecisionEngine) {
    const decision = classify(text, { hasOperational, hasGoogle, hasStrategy });
    if (decision.route === "clarify" && decision.reason.startsWith("capability_missing:")) {
      return { reply: capabilityClarify(decision.reason.split(":")[1]) };
    }
    // strategy (inactiv) / operational_read / simple → chat Claude existent (identic).
  }

  // 8.6) FOUNDER ACTIONS — raspuns DETERMINIST (Partea V), nu lasa modelul sa-i
  // dea lui Adrian sarcini operationale. Structura TU/DANA/NELU/JARVIS.
  if (isFounderActionsQuestion(text) && !splitQuestions(text).some((_, i) => i > 0)) {
    try {
      const { founderActionsAnswer } = await import("./ceo/evidencePacket.js");
      const fa = await founderActionsAnswer();
      if (fa) { remember(channel, text, fa); return { reply: fa }; }
    } catch { /* fallback la chat grounded */ }
  }

  // 8.7) Operational fast path (O2) — task-uri determinist, fara Claude+MCP server-side.
  // NU intercepta intrebarile grounded (founder-actions/ownership/requests/multi):
  // "ce am eu de facut" trebuie sa treaca prin founder filter, nu prin lista "today".
  const opFast = wantsGrounded ? null : await operationalFast(text);
  if (opFast) {
    console.log(`[timing] route=operationalFastPath total=${Date.now() - t0}ms`);
    remember(channel, text, opFast);
    return { reply: opFast };
  }

  // Chat general cu memorie.
  return { reply: await generalChat(channel, text) };
}

/** Confirmare venita pe buton (Telegram callback). */
export async function confirmAction(confirmId, yes) {
  if (!yes) {
    await cancelActionById(confirmId);
    await audit("actiune_anulata", "", `pending ${confirmId}`, false);
    return "Anulat.";
  }
  return runConfirmed(confirmId);
}

async function runConfirmed(confirmId) {
  const action = await confirmActionById(confirmId);
  if (!action) return "Actiunea a expirat. Reia comanda.";
  try {
    return await executeConfirmed(action);
  } catch (e) {
    console.error("[confirm]", e.message);
    return "Nu am putut executa: " + e.message;
  }
}

async function makeDraft(request) {
  const email = await findEmail(request.split(/\s+/).slice(0, 6).join(" "));
  if (email === null) return "Gmail neconfigurat sau nu am gasit emailul.";
  const body = await callClaude({
    system:
      PERSONA +
      "\nScrii un draft de raspuns la email in numele lui Adi. Profesional, direct, romana. " +
      "Doar corpul emailului, fara subiect, fara semnaturi inventate — inchei cu 'Adrian Belei'.",
    messages: [{
      role: "user",
      content: `${wrapExternal("email primit", `De la: ${email.from}\nSubiect: ${email.subject}\nFragment: ${email.snippet}`)}\n\nInstructiuni pentru raspuns (de la Adi): ${request}`,
    }],
    maxTokens: 700,
  });
  const draftId = await createDraft({
    to: email.from,
    subject: email.subject,
    body,
    threadId: email.threadId,
  });
  await audit("draft_email", `Re: ${email.subject}`, `gmail draft ${draftId}`, true);
  return `✉️ Draft creat in Gmail la „${email.subject}”:\n\n${body}\n\n(E doar draft — il trimiti tu din Gmail.)`;
}

async function generalChat(channel, text) {
  const gt0 = Date.now();        // L6 — cronometre generalChat
  const T = {}, th = Date.now();
  const [ctx, memories, reminders] = await Promise.all([
    getContext().then((r) => { T.history = Date.now() - th; return r; }),
    recall(text).then((r) => { T.recall = Date.now() - th; return r; }),
    activeReminders(5).then((r) => { T.reminders = Date.now() - th; return r; }),
  ]);

  // FAZA FINALA — perceptie → decizie → rutare (pur, ieftin).
  const decision = classify(text, { hasOperational, hasGoogle, hasStrategy });
  const caps = getCapabilities();
  const modes = resolveModes({ strategy: hasStrategy });
  const router = routeModel({ route: decision.route, capabilities: caps, options: {} });

  let system = PERSONA;
  // SURSE REALE: injectam ce poate JARVIS chiar accesa (anti-halucinatie) —
  // best-effort, ne-blocant.
  try {
    const { buildSourceTruth, sourceTruthForPrompt } = await import("./ceo/sourceTruth.js");
    system += "\n\n" + sourceTruthForPrompt(await buildSourceTruth({}));
  } catch { /* daca esueaza, chat-ul continua fara harta */ }
  // §4/§24 — "ce i-ai cerut Danei/Nelu?" → raspuns FAPTUAL din ledger, nu din
  // memoria LLM. Injectam cererile reale ca sa nu se inventeze/reconstruiasca.
  try {
    const { buildActionLedger, ledgerForPrompt } = await import("./ceo/actionLedger.js");
    const aq = asksAboutRequests(text);
    if (aq.about) system += "\n\n" + ledgerForPrompt(await buildActionLedger({ personId: aq.person }));
  } catch { /* best-effort */ }
  // CEO EVIDENCE PACKET (Partea III-V): context determinist per intent, ca
  // raspunsul managerial sa porneasca din aceeasi realitate (un singur adevar).
  try {
    const { detectIntents, buildEvidencePacket, packetForPrompt } = await import("./ceo/evidencePacket.js");
    const intents = detectIntents(text);
    if (intents.some((i) => ["FOUNDER_ACTIONS", "OWNERSHIP", "CASH", "PEOPLE", "TASKS", "RISK"].includes(i))) {
      system += "\n\n" + packetForPrompt(await buildEvidencePacket({ text, intents }));
    }
  } catch { /* best-effort */ }
  // CONSTITUTIA CEO + CONTRACT MANAGERIAL (o singura sursa canonica): pe calea
  // manageriala injectam principiile (interpreteaza/prioritizeaza/founder filter/
  // owner/UNKNOWN/actioneaza) + instructiunea de raspuns pe contract. Intrebarile
  // simple/factuale NU primesc structura (raman pe ruta rapida).
  let _managerial = false, _assessment = null, _pipelineReceipts = [];
  try {
    const { detectIntents } = await import("./ceo/evidencePacket.js");
    _managerial = needsManagerialReasoning(text, detectIntents(text));
    if (_managerial) {
      system += "\n\n" + constitutionForPrompt({ scope: "compact" });
      let _srcTruth = null;
      try { _srcTruth = await (await import("./ceo/sourceTruth.js")).buildSourceTruth({}); } catch { /* best-effort */ }
      const { detectFounderExpectation } = await import("./ceo/managerialReasoning.js");
      const _exp = detectFounderExpectation(text);
      _assessment = buildManagerialAssessment({ text, intents: detectIntents(text), sourceTruth: _srcTruth, expectations: _exp ? [_exp] : [] });
      system += "\n\n" + assessmentInstruction(_assessment);
      if (_exp) system += "\n\nATENTIE (P8): utilizatorul declara o ASTEPTARE de incasare (" + _exp.value + "), NU un fapt. Trateaz-o conditional ('DACA se confirma incasarea…'). NU spune ca vanzarea e 'confirmata/reala/sigura' fara dovada bancara/contract. Nu inventa ore exacte pentru pasi.";
      // DISCIPLINA AFIRMATIILOR: valorile din rubrici (termen/prag/owner/executie/
      // founder) trebuie sa aiba baza — nu fabricate. Repara continutul, nu formatul.
      const { CLAIM_DISCIPLINE_PROMPT } = await import("./ceo/managerialClaimValidator.js");
      system += "\n\n" + CLAIM_DISCIPLINE_PROMPT;
      // DATE STALE / DOCUMENTE INCARCATE: diagnostic pipeline (upload→...→reconciliat)
      // INAINTE de a propune munca manuala (P13 — root cause before process burden).
      try {
        const { asksPipeline, diagnoseSourcePipeline, pipelineForPrompt } = await import("./ceo/sourcePipeline.js");
        if (asksPipeline(text)) {
          const diag = await diagnoseSourcePipeline({ text });
          system += "\n\n" + pipelineForPrompt(diag);
          // Sursele verificate REAL = receipts: "am verificat X,Y,Z" devine adevarat.
          _pipelineReceipts = diag.searched_sources.map((s) => ({ id: "checked:" + s, kind: "source_check" }));
        }
      } catch { /* best-effort */ }
    }
  } catch { /* best-effort */ }
  // EXTERNAL INTELLIGENCE (Fazele 23-26): la intrebari despre lumea externa,
  // injecteaza semnalele cu impact intern (marcate EXTERNAL, NU fapte interne).
  if (config.externalIntel) {
    try {
      const { asksExternal, externalForPrompt } = await import("./ceo/externalIntel.js");
      if (asksExternal(text)) {
        const cached = await (await import("./state.js")).getState("ceo:external-intel", null);
        if (cached) system += "\n\n" + externalForPrompt(cached);
      }
    } catch { /* best-effort */ }
  }
  if (ctx.summary) system += `\n\nSUMARUL CONVERSATIEI DE PANA ACUM:\n${ctx.summary}`;
  if (memories.length) {
    system +=
      "\n\nMEMORIE RELEVANTA (fapte salvate anterior):\n" +
      memories.map((m) => `[${m.category}] ${m.fact}`).join("\n");
  }
  // MAI MULTE INTREBARI: descompune si cere raspuns punctual la fiecare (in
  // ordine, numerotat, UNKNOWN unde lipsesc date) — acelasi context pt toate.
  const questions = splitQuestions(text);
  const multi = questions.length >= 2;
  if (multi) system += multiQuestionInstruction(questions);

  const messages = [
    ...ctx.recent.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: text },
  ];

  // VITEZA: chat pe model rapid (Haiku); tool-urile (MCP/web) intra DOAR cand
  // sunt necesare, ca raspunsurile simple sa fie instant.
  // Managerial → are nevoie de datele reale: expune tool-urile de citire Operational.
  const useOperational = hasOperational && (isOperationalTopic(text) || _managerial);
  const useWeb = needsWeb(text);

  const tc = Date.now();
  let reply, providerUsed = "claude";
  if (config.pipeline && router.provider === "chatgpt" && hasStrategy && modes.canSend) {
    // STRATEGY (ChatGPT) — DOAR cand STRATEGY_ROUTING=on. Read-only, cu fallback Claude.
    providerUsed = "chatgpt";
    reply = await runStrategyPipeline(text, memories, decision);
  } else if (useOperational || useWeb) {
    if (useWeb) {
      system +=
        "\n\nINTERNET: ai cautare web. Foloseste-o cand intrebarea cere info curenta/externa " +
        "(preturi, cursuri, vreme, stiri, firme, reglementari). Raspuns scurt, cu sursa daca e relevant.";
    }
    if (useOperational) {
      system +=
        "\n\nTOOLS OPERATIONAL — DOAR CITIRE pe aceasta cale de chat:\n" +
        "- Ai acces DOAR la tool-uri de citire: list_tasks, get_task, list_alerts, list_journals, " +
        "project_costs, list_material_orders, building_expenses, production_summary, " +
        "list_payment_obligations, cash_report, sales_summary, list_sales_units, partner_activity.\n" +
        "- NU ai si NU poti apela tool-uri de scriere (create_task, update_task, delete_task, restore_task, " +
        "add_observation, import_price_references, create_task_from_obligation) — ele NU sunt expuse aici.\n" +
        "- Orice actiune cu efect (creare/modificare/stergere task, observatii, preturi) se face EXCLUSIV prin " +
        "fluxul de confirmare al lui JARVIS (approvalGate): se propune, Adi confirma cu 'da', apoi se executa. " +
        "Daca Adi cere o astfel de actiune, indruma-l spre comanda dedicata (ex. 'creeaza task: ...') care cere " +
        "confirmare — nu incerca si nu promite ca o executi tu direct.\n" +
        "- PLATI (Nivel 4): list_payment_obligations si cash_report sunt DOAR informative. Poti PREGATI " +
        "datele unei plati (suma, scadenta, furnizor, IBAN) si le prezinti, dar NU executi si NU promiti executarea.";
    }
    reply = await callClaudeWithMCP({
      model: CHAT_MODEL,
      system,
      messages,
      webSearch: useWeb,
      mcpServers: useOperational
        ? [{ name: "operational", url: config.operationalMcpUrl, allowedTools: OPERATIONAL_READ_TOOLS }]
        : [],
      // buget scalat cu numarul de intrebari (raspuns punctual la fiecare)
      maxTokens: tokenBudgetFor(questions.length, 1400),
    });
  } else {
    // Cale rapida: fara tool-uri. Multi-intrebare → buget scalat, nu taia.
    reply = await callClaude({ model: CHAT_MODEL, system, messages, maxTokens: tokenBudgetFor(questions.length, 800) });
  }
  T.claude = Date.now() - tc;
  reply = reply || "…";

  // GARDA DE COMPLETITUDINE (§2): daca s-au detectat N intrebari dar raspunsul
  // acopera mai putine, cere O SINGURA completare pentru cele lipsa — nu trimite
  // raspuns incomplet. Acelasi context (system + messages) reutilizat.
  if (multi) {
    const gap = completenessGap(questions.length, reply);
    if (!gap.complete && gap.missing.length) {
      try {
        const missingList = gap.missing.map((i) => `${i}. ${questions[i - 1]}`).join("\n");
        const completion = await callClaude({
          model: CHAT_MODEL, system,
          messages: [
            ...messages,
            { role: "assistant", content: reply },
            { role: "user", content: `Ai omis raspunsul la aceste intrebari — raspunde DOAR la ele, numerotat exact la fel:\n${missingList}` },
          ],
          maxTokens: tokenBudgetFor(gap.missing.length, 600),
        });
        if (completion && completion.trim()) reply += `\n\n${completion.trim()}`;
      } catch (e) { console.error("[multiQ.completion]", e.message); }
    }
  }
  _metrics.record({ provider: providerUsed, ms: T.claude, ok: true, tokens: estimateTokens(system + "\n" + text) });

  // Modul "nu ma lasa sa uit": reamintire la fiecare interactiune.
  if (reminders.length) {
    reply +=
      `\n\n⏰ Nerezolvate (${reminders.length}):\n` +
      formatReminders(reminders.slice(0, 3)) +
      `\n(raspunde: rezolvat #id / amana #id [zile] / ignora #id)`;
  }

  // CANONICAL FINALIZER (Partea I/II/III): pe raspunsurile manageriale, TOT
  // outputul trece prin acelasi lant — Assessment → Founder Filter → Claim
  // Validator → Quality Gate → traceability → (1 corectie). Nu poate fi ocolit
  // de fast-path/canned (acelea nu ajung aici cu _managerial).
  if (_managerial && _assessment) {
    try {
      const { finalizeManagerialOutput } = await import("./ceo/managerialFinalizer.js");
      const fin = await finalizeManagerialOutput({
        assessment: _assessment, draft: reply, channel: channel === "hud" ? "hud" : channel === "telegram" ? "telegram" : "chat",
        trigger: "chat", executionReceipts: _pipelineReceipts, forFounder: true,
        llm: ({ system: s, messages: m }) => callClaude({ model: CHAT_MODEL, system: s, messages: m, maxTokens: tokenBudgetFor(1, 900) }),
        system, messages,
      });
      if (fin.text && fin.text.trim()) reply = fin.text;
    } catch (e) { console.error("[finalizer]", e.message); }
  }

  // INVATARE DIN CORECTIILE LUI ADRIAN (Partea VI): daca mesajul curent e o corectie
  // pe raspunsul anterior, o inregistram in Founder Model (nu modifica Constitutia).
  try {
    const { recordCorrection } = await import("./ceo/founderModel.js");
    const prevAssistant = [...ctx.recent].reverse().find((m) => m.role === "assistant");
    await recordCorrection(text, prevAssistant?.content || "");
  } catch { /* best-effort */ }

  remember(channel, text, reply);

  // FAZA FINALA — TOATE raspunsurile trec prin ResponseComposer + validare + trace
  // (telemetrie; pentru chat liber textul ramane al modelului). Gated de config.pipeline.
  if (config.pipeline) {
    const plan = buildContext(text, decision.route, { capabilities: caps });
    const composed = composeResponse({ route: decision.route, capabilities: caps });
    const validation = validateResponse(composed);
    if (!validation.valid) console.error("[pipeline] validare raspuns:", validation.errors.join("; "));
    const trace = buildTrace({ decision: { route: decision.route, provider: providerUsed }, context: plan, router, response: composed });
    reviewDecision({ brief: {}, response: composed, trace });
    console.log(`[trace] route=${trace.route} provider=${providerUsed} fallback=${router.fallback} sources=${neededSources(plan).length} steps=${trace.steps.length}`);
  }
  const lbl = providerUsed === "chatgpt" ? "chatgpt" : useOperational ? "claude+mcp" : useWeb ? "claude+web" : "claude";
  console.log(`[timing] route=generalChat recall=${T.recall}ms history=${T.history}ms reminders=${T.reminders}ms ${lbl}=${T.claude}ms total=${Date.now() - gt0}ms`);
  return reply;
}

/** FAZA FINALA — pipeline de strategie (ChatGPT). Chemat DOAR cand STRATEGY_ROUTING=on.
 *  orchestrator (brief/strategyEngine/adapter) → OpenAI cu resilience/budget/cache/metrics
 *  → fallback Claude. ChatGPT NU are tool-uri (read-only, nu executa nimic). */
async function runStrategyPipeline(text, memories, decision) {
  const state = { memory: (memories || []).map((m) => m && m.fact).filter(Boolean) };
  const orch = orchestrateStrategy({ route: decision.route, question: text, state, capabilities: getCapabilities(), options: {} });
  const req = orch.request; // format openai (executes:false)
  const sys = req && req.body ? req.body.messages[0].content : PERSONA;
  const usr = req && req.body && req.body.messages[1] ? req.body.messages[1].content : text;
  const budgeted = enforceBudget(sys + "\n" + usr, 6000);

  const cacheKey = "strat:" + norm(usr).slice(0, 240);
  const hit = _promptCache.get(cacheKey);
  if (hit !== undefined) { _metrics.record({ provider: "cache", ms: 0, ok: true, tokens: 0 }); return hit; }

  const callGpt = () => callOpenAI({ system: sys, messages: [{ role: "user", content: usr }], model: config.strategyModel, maxTokens: 900 });
  const resilient = withFallback(
    withRetry(withTimeout(callGpt, 20000), { retries: 1 }),
    async () => callClaude({ model: CHAT_MODEL, system: sys, messages: [{ role: "user", content: usr }], maxTokens: 800 }),
  );
  const t0 = Date.now();
  let out, ok = true;
  try { out = await resilient(); }
  catch (e) { ok = false; out = "Nu am putut rula analiza strategica acum."; console.error("[strategy]", e.message); }
  _metrics.record({ provider: "chatgpt", ms: Date.now() - t0, ok, tokens: budgeted.estimated });
  _promptCache.set(cacheKey, out);
  return out;
}

/** Persistenta istoric + intretinere async (sumar, extragere fapte). */
function remember(channel, userText, assistantText) {
  if (!pool) return;
  (async () => {
    await appendMessage(channel, "user", userText);
    await appendMessage(channel, "assistant", assistantText);
    userMsgCounter++;
    if (userMsgCounter % 8 === 0) {
      const recent = await query(
        `SELECT role, content FROM conversations ORDER BY id DESC LIMIT 16`
      );
      const block = recent
        .reverse()
        .map((m) => `${m.role === "user" ? "Adi" : "JARVIS"}: ${m.content}`)
        .join("\n");
      await extractFacts(block);
    }
    await maybeSummarize();
  })().catch((e) => console.error("[remember]", e.message));
}

// Detectia intentiilor (isOperationalTopic, extractEntity, isProjectTopic, isRiskTopic,
// isCeoHomeTopic, extractBalance, isCashForecastTopic, isEmailTopic) e in ./intents.js (B3).

// Cautare + citire + sinteza pe Gmail (read-only). Reguli din handoff-ul lui Adi.
async function handleEmailQuery(channel, text) {
  let q;
  try {
    q = (await callClaude({
      model: CHAT_MODEL,
      system:
        "Transforma cererea in DOAR un query de cautare Gmail valid (o singura linie, fara explicatii). " +
        "Operatori Gmail: from:, subject:, newer_than:, has:attachment, \"fraza exacta\". " +
        "Pentru nume/locuri romanesti adauga variante OR cu si fara diacritice (ex: Marsa OR Mârșa). " +
        "Cauta firme atat dupa denumire cat si dupa domeniul de email. Implicit newer_than:60d.",
      messages: [{ role: "user", content: text }],
      maxTokens: 120,
    })).trim().replace(/^`+|`+$/g, "").split("\n")[0];
  } catch { q = "in:inbox newer_than:30d"; }

  const threads = await searchThreads(q, 25).catch(() => null);
  if (threads === null) return "Nu am putut căuta în Gmail.";
  if (!threads.length) return `Niciun email găsit pentru: ${q}`;

  const detailed = [];
  for (const t of threads.slice(0, 3)) {
    const msgs = await readThread(t.threadId).catch(() => null);
    if (msgs) detailed.push({ subject: t.subject, from: t.from, date: t.date, msgs });
  }
  const ctx = detailed
    .map((d) =>
      `FIR: ${d.subject} — ${d.from} (${d.date})\n` +
      d.msgs.map((m) => `[${m.from} → ${m.to}] ${m.body}${m.attachments.length ? `\n(atasamente: ${m.attachments.join(", ")})` : ""}`).join("\n---\n")
    )
    .join("\n\n=====\n\n");

  const answer = await callClaude({
    model: CHAT_MODEL,
    system:
      PERSONA +
      "\nRaspunzi STRICT pe baza emailurilor de mai jos. Extragi exact ce intreaba Adi " +
      "(date, sume, telefoane — care apar doar in continutul complet, scadente). " +
      "Daca raspunsul nu e in emailuri, spui clar. Scurt.",
    messages: [{ role: "user", content: `Intrebarea: ${text}\n\nEMAILURI (query: ${q}):\n${wrapExternal("emailuri", ctx.slice(0, 12000))}` }],
    maxTokens: 700,
  });
  remember(channel, text, answer);
  return answer;
}

// isCalendarTopic, needsWeb, guessCategory sunt in ./intents.js (B3).

// C3 — mesaje oneste cand o capabilitate ceruta nu e (inca) conectata.
function capabilityClarify(cap) {
  const M = {
    railwayLogs: "Logurile de pe Railway nu-s conectate încă la mine — nu le pot citi direct. Le vezi în dashboard-ul Railway.",
    ga4: "Google Analytics nu e citit direct de mine încă. E activ pe site — îl vezi în dashboard-ul GA4.",
    searchConsole: "Search Console nu e conectat încă la mine.",
    banking: "Datele bancare nu-s conectate la mine (nu citesc și nu execut plăți). Pot pregăti datele unei plăți, dar execuția e la tine în aplicația băncii.",
  };
  return M[cap] || "Asta încă nu e conectat la mine.";
}

// Folosit de gmail la clasificare → reminders; reexportat pentru scheduler (Faza 3).
export { addReminder };
