// ACTION & REQUEST LEDGER (§4, §24, §31.4-5) — ce a cerut JARVIS REAL, cui, cand.
// FAPTUAL, nu conversational: citeste registrul de scrieri reale (ceo:nervous:tasks)
// prin requestMemoryView existent. Cand Adrian intreaba "ce i-ai cerut Danei?",
// chat-ul raspunde din ACEST ledger, NU din memoria LLM. Daca nu exista dovada
// ca JARVIS a facut cererea → spune ca nu a cerut nimic real, nu inventeaza.
import { getState } from "../state.js";
import { requestMemoryView } from "./nervous/requestMemory.js";

const REG_KEY = "ceo:nervous:tasks";

/** O intrare de ledger e o cerere REALA a lui JARVIS (scriere in Operational). */
function isRealJarvisRequest(r) {
  // task creat de JARVIS (operational_id) SAU clarificare pe original SAU follow-up trimis.
  return !!(r.task_id || r.request_id?.startsWith?.("need:clarify:") || r.reminders_sent > 0);
}

/**
 * Ledger-ul cererilor reale ale lui JARVIS, optional filtrat pe persoana.
 * Returneaza { person, requests:[{what, asked_at, deadline, status, responded,
 * verified, blocker, next}], total, open, answered }. Read-only.
 */
export async function buildActionLedger({ personId = null, nowISO = null } = {}) {
  const registry = (await getState(REG_KEY, {})) || {};
  const view = requestMemoryView(registry, { nowISO }).filter(isRealJarvisRequest);
  const scoped = personId ? view.filter((r) => String(r.owner || "").toLowerCase() === String(personId).toLowerCase()) : view;
  const requests = scoped.map((r) => ({
    what: r.what, why: r.why, asked_at: r.asked_at, deadline: r.deadline,
    status: r.status, owner: r.owner,
    responded: !!r.response_received_at, verified: r.result_validated,
    blocker: r.blocker, next: r.open_loop ? "urmaresc / follow-up" : "inchis",
    clarifies_original: r.request_id?.startsWith?.("need:clarify:") ? r.task_id : null,
  }));
  return {
    person: personId, at: new Date().toISOString(),
    requests, total: requests.length,
    open: requests.filter((r) => r.next !== "inchis").length,
    answered: requests.filter((r) => r.responded).length,
  };
}

/** Detecteaza intrebarile "ce i-ai cerut [persoana]" / "ce nu ti-a raspuns". */
export function asksAboutRequests(text) {
  const t = String(text || "").toLowerCase();
  const about = /(ce (i-)?ai cerut|ce (i-)?am cerut prin tine|ce ai solicitat|ce nu (ti-|ti )?a raspuns|ce nu (mi-)?a dat|ce cereri ai|ce le-ai cerut)/.test(t);
  if (!about) return { about: false, person: null };
  let person = null;
  if (/\bdan[ae]i?\b/.test(t)) person = "dana";
  else if (/\bnelu(lui)?\b/.test(t)) person = "nelu";
  else if (/\badrian|mihaela/.test(t)) person = /adrian/.test(t) ? "adrian" : "mihaela";
  return { about: true, person };
}

/** Formateaza ledger-ul factual pentru injectare in system-prompt-ul chat-ului. */
export function ledgerForPrompt(ledger) {
  const who = ledger.person ? ledger.person.toUpperCase() : "ECHIPA";
  if (!ledger.requests.length) {
    return (
      `LEDGER FAPTUAL — CE A CERUT JARVIS ${who}: NIMIC real inca. ` +
      `NU exista nicio cerere scrisa de JARVIS (task/observatie/follow-up) catre ${who.toLowerCase()}. ` +
      `Raspunde exact asta — NU inventa cereri, NU confunda task-uri create de Adrian cu cereri ale tale, ` +
      `NU reconstrui din conversatie.`
    );
  }
  const lines = ledger.requests.map((r, i) =>
    `${i + 1}. "${r.what}" → ${r.owner} · cerut: ${(r.asked_at || "?").slice(0, 16)} · termen: ${r.deadline || "-"} · ` +
    `stare: ${r.status}${r.responded ? " · A RASPUNS" : " · FARA raspuns inca"}${r.verified ? " · verificat" : ""}` +
    `${r.blocker ? " · blocaj: " + (r.blocker.blocker_type || r.blocker) : ""}${r.clarifies_original ? ` · (clarificare pe task-ul original #${r.clarifies_original})` : ""}`
  );
  return (
    `LEDGER FAPTUAL — CE A CERUT JARVIS ${who} (din scrieri reale, NU din conversatie):\n` +
    lines.join("\n") +
    `\nRaspunde EXCLUSIV pe baza acestui ledger. Daca Adi intreaba "ce nu ti-a raspuns", listeaza cele cu "FARA raspuns". ` +
    `NU adauga cereri care nu sunt aici.`
  );
}
