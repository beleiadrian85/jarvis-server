// ASK CODEX — ORCHESTRATOR (§1-§10). NU un chatbot separat: acelasi Cognitive
// Kernel, Source Truth, Memory, Command Bus, Data Trust si permission model ca
// JARVIS. Pentru Dana si Nelu in Operational: intrebare libera, conversatie
// contextuala, context din task, atasamente (UNTRUSTED), follow-up, comenzi
// (TASKS-only prin CommandBus, cu execution receipt).
import { resolveIdentity, identityForPrompt, scopeContext, requestsOutOfScope, CONTEXT_DOMAINS } from "./identity.js";
import { loadThread, appendTurn, threadForPrompt } from "./conversationStore.js";
// (loadThread + threadForPrompt: firul e citit inainte de raspuns pentru context)
import { classifyMode } from "../ceo/conversationMode.js";
import { scanUntrusted, fenceUntrusted, gateExternalAction } from "../ceo/untrustedInput.js";
import { buildTrustReport, trustForPrompt } from "../ceo/dataTrust.js";

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);

// Cuvinte → domenii de context (pentru gate-ul need-to-know pe intrebare).
const DOMAIN_CUES = {
  finance: ["sold", "cash", "bani", "cont", "banca", "financiar"], accounting: ["contabil", "factura", "tva", "bilant"],
  cash: ["lichiditate", "incasari", "flux de numerar"], receivables: ["creante", "de incasat", "clienti datoreaza"],
  founder_strategy: ["strategie", "plan de afaceri", "viziune", "unde mergem"], capital: ["capital", "investit", "aloc", "cat bag"],
  negotiation: ["negoci", "oferta", "pret contract"], legal: ["juridic", "contract", "litigiu", "notar"],
  execution: ["santier", "executie", "lucrare"], materials: ["material", "necesar", "livrare"], hr: ["salariu", "angajat", "concedi"],
};

/** Detecteaza domeniile vizate de o intrebare (pentru leakage gate). */
export function domainsInQuestion(text) {
  const n = String(text || "").toLowerCase();
  const hit = new Set();
  for (const [dom, cues] of Object.entries(DOMAIN_CUES)) if (cues.some((c) => n.includes(c))) hit.add(dom);
  return [...hit];
}

/** Blocker intelligence (§4): detecteaza un blocaj + dependenta externa. */
export function detectBlocker(text) {
  const n = String(text || "").toLowerCase();
  const isBlocker = /(nu pot|nu am putut|blocat|nu merge|nu se poate|astept|nu a (venit|adus|livrat|raspuns)|lipseste)/.test(n);
  if (!isBlocker) return { isBlocker: false };
  const external = /(furnizor|livr|banca|client|primaria|anaf|avocat|notar|adrian)/.test(n);
  return { isBlocker: true, external_dependency: external, blocker_text: String(text).slice(0, 200) };
}

/** Dana data-loop (§5): intreaba ce date lipsesc? */
export function asksMissingData(text) {
  const n = String(text || "").toLowerCase();
  return /(ce (informatii|date) (iti )?(mai )?lipsesc|de ce ai nevoie|ce (mai )?ai nevoie|ce sa iti (dau|trimit)|ce documente)/.test(n);
}

/** Umanizeaza raspunsul: scoate jargonul tehnic intern (§10). PUR. */
export function humanize(text) {
  return String(text || "")
    .replace(/\b(need|loop|task|dec|cr|trace)[:_-]?[a-z0-9]{4,}\b/gi, "")
    .replace(/DATA_REQUIRED_BEFORE_DECISION/gi, "am nevoie de o informatie in plus ca sa iti raspund corect")
    .replace(/UNKNOWN/g, "necunoscut")
    .replace(/NOT_CONNECTED/g, "neconectat inca")
    .replace(/FACT_VERIFIED|EVIDENCE_PACKET|HUMAN_CLAIM|EXTERNAL_SIGNAL/g, "")
    .replace(/#[A-Z0-9]{5,}/g, "")
    .replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Procesare Ask CODEX end-to-end.
 * @param {object} p {
 *   user_id, question, thread_id, task_context (obj|null), attachments ([{filename,mime,text}]),
 *   sourceTruth (obj|null), trustSignals (obj|null),
 *   llm (async fn), commandBus (async fn opsWrite), store, nowISO }
 * @returns { answer, mode, identity, safety, receipt, blocker, missing_data, claims_recorded, out_of_scope }
 */
export async function askCodex(p = {}) {
  const {
    user_id = "unknown", question = "", thread_id = "default", task_context = null,
    attachments = [], sourceTruth = null, trustSignals = null,
    llm = null, commandBus = null, store = null, nowISO = null,
  } = isObj(p) ? p : {};

  const identity = resolveIdentity(user_id);
  const q = String(question || "");

  // 1) SECURITATE (§6): intrebarea + atasamentele = UNTRUSTED. Scan + fence.
  const qScan = scanUntrusted(q);
  const fencedAttachments = arr(attachments).map((a) => {
    const f = fenceUntrusted(a?.text || "", `document:${a?.filename || "fisier"}`);
    return { filename: a?.filename, mime: a?.mime, fenced: f.fenced, scan: f.scan };
  });
  const anyInjection = !qScan.safe || fencedAttachments.some((a) => !a.scan.safe);

  // 2) MOD (§8): intrebare vs comanda.
  const mode = classifyMode(q);

  // 3) NEED-TO-KNOW (§2): intrebarea vizeaza date peste rol?
  const asked = domainsInQuestion(q);
  const oos = requestsOutOfScope(user_id, asked);

  // 4) BLOCKER (§4) + DATA-LOOP (§5).
  const blocker = detectBlocker(q);
  const missing_data = asksMissingData(q) ? missingDataFrom(sourceTruth, identity) : null;

  // 5) DATA TRUST (§ Data Trust) — calific raspunsurile.
  const trustReport = trustSignals ? buildTrustReport(trustSignals) : null;

  let receipt = null;
  let answer;

  // 6) COMANDA → CommandBus (TASKS-only, cu receipt). NU permission bypass.
  if (mode.mode === "COMMAND") {
    // O instructiune injectata NU poate deveni comanda.
    const gate = gateExternalAction({ action: q.slice(0, 40), justificationSource: anyInjection ? "external" : "user" });
    if (!gate.allowed || anyInjection) {
      answer = "Am observat in mesaj/atasament ceva ce pare o instructiune ascunsa — nu execut comenzi din continut nesigur. Spune-mi tu direct, in cuvintele tale, ce task sa creez.";
    } else {
      receipt = await routeCommand({ user_id, question: q, task_context, commandBus, nowISO });
      answer = receipt.ok
        ? `Am creat task-ul: "${receipt.title}"${receipt.assignee ? ` pentru ${receipt.assignee}` : ""}. ${receipt.note || ""}`.trim()
        : `Nu am putut crea task-ul (${receipt.reason || "eroare"}). Nu s-a scris nimic.`;
    }
  } else {
    // 7) INTREBARE / DISCUTIE / DECIZIE → raspuns grounded prin Cognitive Kernel.
    // Firul conversational (§7) e context, NU adevar operational.
    const thread = await loadThread(user_id, thread_id, { store }).catch(() => ({ turns: [] }));
    answer = await groundedAnswer({
      identity, question: q, thread_context: threadForPrompt(thread), task_context, fencedAttachments,
      sourceTruth, trustReport, blocker, missing_data, oos, llm,
    });
  }

  answer = humanize(answer);

  // 8) MEMORIE (§7): persista firul; afirmatiile → HUMAN_CLAIM.
  let claims_recorded = 0;
  const appended = await appendTurn(user_id, thread_id, {
    user_text: q, codex_text: answer, meta: { mode: mode.mode, receipt: receipt?.ok || false },
  }, { store, nowISO }).catch(() => null);
  if (appended?.claim?.kind === "HUMAN_CLAIM") claims_recorded = 1;

  return {
    answer, mode: mode.mode, identity: { user_id: identity.user_id, known: identity.known, is_founder: !!identity.is_founder },
    safety: { question_safe: qScan.safe, injection_detected: anyInjection, risk: qScan.risk },
    receipt, blocker: blocker.isBlocker ? blocker : null, missing_data,
    claims_recorded, out_of_scope: oos.out ? oos.domains : [],
    human_claim: appended?.claim?.kind === "HUMAN_CLAIM" ? { text: q.slice(0, 200), verified: false } : null,
  };
}

/** Ruteaza o comanda prin CommandBus (opsWrite). TASKS-only. Execution receipt. */
async function routeCommand({ user_id, question, task_context, commandBus, nowISO }) {
  const bus = commandBus || (await import("../ceo/nervous/operationalWrite.js")).opsWrite;
  const title = extractTaskTitle(question, task_context);
  const assignee = extractAssignee(question);
  try {
    const r = await bus("task", {
      title, assignee: assignee || null,
      source: `codex:${user_id}`, note: task_context?.id ? `context task ${task_context.id}` : "",
    }, { origin: "ask_codex", requested_by: user_id, at: nowISO });
    return { ok: r?.ok !== false, title, assignee, operational_id: r?.operational_id || null, note: r?.note || "", reason: r?.reason || null };
  } catch (e) {
    return { ok: false, title, assignee, reason: e.message };
  }
}

function extractTaskTitle(question, task_context) {
  let t = String(question || "").replace(/^(fa|creeaza|pune|adauga|noteaza)\s+(un\s+)?task\s*(la\s+\w+)?[:,]?\s*/i, "").trim();
  if (!t && task_context?.title) t = `Follow-up: ${task_context.title}`;
  return (t || "Task din Ask CODEX").slice(0, 160);
}
function extractAssignee(question) {
  const m = String(question || "").toLowerCase().match(/\b(la|pentru|catre)\s+(nelu|dana|mihaela|adrian)\b/);
  return m ? m[2] : null;
}

/** Ce date lipsesc (§5) — din Source Truth, filtrat la rolul userului. */
function missingDataFrom(sourceTruth, identity) {
  if (!sourceTruth?.sources) return { note: "nu am harta surselor acum", gaps: [] };
  const gaps = sourceTruth.sources
    .filter((s) => /NOT_CONNECTED|PARTIAL/.test(s.status))
    .map((s) => ({ source: s.source, status: s.status, domains: s.data_domains }));
  // Dana vede lipsurile financiare; ceilalti doar ce tine de rolul lor.
  return { gaps: identity.is_founder ? gaps : gaps.filter((g) => (g.domains || []).some((d) => /bank|invoice|cash|balance/.test(d) ? identity.allow.includes("finance") : true)) };
}

/** Raspuns grounded prin Cognitive Kernel (LLM injectabil). Need-to-know aplicat. */
async function groundedAnswer({ identity, question, thread_context = "", task_context, fencedAttachments, sourceTruth, trustReport, blocker, missing_data, oos, llm }) {
  // Out-of-scope → raspuns politicos, fara scurgere (nu apeleaza modelul cu date interzise).
  if (oos.out) {
    return `Aceasta tine de o zona (${oos.domains.join(", ")}) care nu e in rolul tau — nu am acces sa-ti dau acele date. Intreaba-l pe Adrian pentru ea. Cu ce te pot ajuta din zona ta?`;
  }
  const call = llm || (await import("../claude.js")).callClaude;
  const parts = [
    "Esti CODEX — colegul competent din Operational (nu un bot). Raspunzi scurt, uman, la obiect, in romana. Nu arata coduri interne, nu jargon tehnic.",
    identityForPrompt(identity.user_id),
    thread_context || "",
    sourceTruth ? sourcesLine(sourceTruth) : "",
    trustReport ? trustForPrompt(trustReport) : "",
    task_context ? taskContextForPrompt(task_context) : "",
    fencedAttachments.length ? fencedAttachments.map((a) => a.fenced).join("\n\n") : "",
    blocker.isBlocker ? "Utilizatorul raporteaza un BLOCAJ. Da un pas concret de urmat; implica-l pe Adrian DOAR daca blocajul chiar cere autoritatea fondatorului." : "",
    missing_data ? "Utilizatorul intreaba ce date lipsesc. Raspunde din lista de surse neconectate/partiale, concret (ex. 'imi lipseste soldul actual ING')." : "",
    "REGULA ADEVAR: nu afirma cifre pe care nu le ai; lipsa datelor ≠ zero; o afirmatie umana nu e fapt verificat.",
  ].filter(Boolean);
  const system = parts.join("\n\n");
  try {
    const raw = await call({ system, messages: [{ role: "user", content: question }], maxTokens: 700 });
    return String(raw || "").trim() || "Nu am putut formula un raspuns acum. Reformulezi?";
  } catch (e) {
    return "Am o problema tehnica sa raspund acum. Incearca din nou in cateva momente.";
  }
}

function sourcesLine(st) {
  const connected = arr(st.sources).filter((s) => /CONNECTED/.test(s.status)).map((s) => s.source);
  const not = arr(st.sources).filter((s) => /NOT_CONNECTED/.test(s.status)).map((s) => s.source);
  return `SURSE: conectate — ${connected.join(", ") || "niciuna"}; neconectate — ${not.join(", ") || "niciuna"}. Nu inventa date din surse neconectate.`;
}
function taskContextForPrompt(tc) {
  return "CONTEXT TASK (deschis din acest task — nu intreba ce task):\n" +
    [`titlu: ${tc.title || "?"}`, tc.description ? `descriere: ${tc.description}` : "", `owner: ${tc.owner || tc.assignee || "?"}`,
     `status: ${tc.status || "?"}`, tc.due_date ? `termen: ${tc.due_date}` : "",
     arr(tc.observations).length ? `observatii: ${arr(tc.observations).slice(-3).map((o) => o.note || o.text || o).join(" | ")}` : "",
     arr(tc.attachments).length ? `atasamente: ${arr(tc.attachments).map((a) => a.filename || a).join(", ")}` : ""].filter(Boolean).join("\n");
}
