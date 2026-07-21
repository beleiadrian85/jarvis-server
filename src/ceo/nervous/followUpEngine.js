// NERVOUS SYSTEM V1 §16 — FOLLOW-UP ENGINE (politica ZERO SPAM).
// Un task overdue nu se bombardeaza cu reminders: intai observam, apoi
// analizam (importanta, ce blocheaza, incarcarea persoanei, cat de realist
// era termenul) si abia apoi PROPUNEM o singura actiune. Motorul NU executa
// nimic — produce doar propuneri; singura exceptie marcata este reminderul
// pe INFORMATION_TASK low-risk (AUTO_OK_AFTER_VALIDATION), si acela tot
// dupa validare in alt strat. Max 1 reminder per cerere (Level 2B).
// Modul PUR: functii deterministe peste argumente, ZERO IO. Date lipsa =
// gap explicit — niciodata inventate.
import { FOLLOWUP_ACTIONS, OPERATIONAL_CLOSED_STATUSES, daysBetween, taskClassFor } from "./contract.js";

// ── HELPERI INTERNI: ISTORIC FOLLOW-UP ──────────────────────────────────

/** Actiunea dintr-o intrare de istoric (string sau obiect {action|type}). */
function historyAction(entry) {
  if (entry == null) return null;
  if (typeof entry === "string") return entry.toUpperCase().trim() || null;
  return historyAction(entry.action ?? entry.type ?? null);
}

/** Intrarile din istoric care au fost follow-up-uri reale (nu NO_ACTION). */
function priorFollowUps(priorHistory = []) {
  const arr = Array.isArray(priorHistory) ? priorHistory : [];
  return arr.map(historyAction).filter((a) => a && a !== "NO_ACTION");
}

// ── HELPERI INTERNI: ANALIZA ────────────────────────────────────────────

/** Importanta din task.internal.priority/severity (praguri aliniate cu
 *  priorityToOperational din contract: 75/55). Fara date → UNKNOWN. */
function importanceOf(task) {
  const it = task?.internal || {};
  const p = String(it.priority || "").toLowerCase().trim();
  const s = Number(it.severity);
  if (p === "critic" || (Number.isFinite(s) && s >= 75)) return "HIGH";
  if (p === "ridicat" || (Number.isFinite(s) && s >= 55)) return "MEDIUM";
  if (p === "normal" || p === "scazut" || Number.isFinite(s)) return "LOW";
  return "UNKNOWN";
}

/** Task-ul blocheaza altceva? Doar din dependencies declarate — nu ghicim. */
function blocksOf(task) {
  const d = task?.internal?.dependencies;
  if (Array.isArray(d)) return d.length > 0;
  if (typeof d === "string") return d.trim().length > 0;
  return false;
}

/** Risc financiar numeric daca exista in datele task-ului; altfel null (gap). */
function financialRiskOf(task) {
  const it = task?.internal || {};
  const cands = [it.financial_risk, it.value?.financial_impact, it.task_value?.financial_impact, task?.value_score?.financial_impact];
  for (const c of cands) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Termenul a fost realist? false doar cu semnale concrete (EXTEND deja dat
 *  fara efect sau intarziere foarte mare); altfel null — nu stim. */
function deadlineRealistic(daysOverdue, priorActions) {
  if (priorActions.includes("EXTEND")) return false;
  if (daysOverdue != null && daysOverdue > 14) return false;
  return null;
}

/** Task marcat explicit ca nemaifiind necesar — DOAR din flag-uri, nu dedus. */
function isIrrelevant(task) {
  const it = task?.internal || {};
  return it.no_longer_needed === true || it.irrelevant === true || task?.no_longer_needed === true;
}

/** Clasa de autonomie: declarata pe task sau derivata din task_type. */
function autonomyClassOf(task) {
  const it = task?.internal || {};
  return it.autonomy_class || taskClassFor(it.task_type);
}

/** Titlu si owner pentru texte de propunere — din date, niciodata inventate. */
function taskTitleOf(task, opsTask) {
  return task?.internal?.task_title || task?.human?.title || opsTask?.title || "task fara titlu";
}
function ownerOf(task, opsTask) {
  return task?.internal?.owner || opsTask?.assignee || null;
}

// ── EXPORTURI ───────────────────────────────────────────────────────────

/**
 * Max 1 reminder per cerere (Level 2B): true daca NU exista deja un
 * REMINDER in istoricul de follow-up.
 * @param {Array} priorHistory  intrari string sau {action}
 * @returns {boolean}
 */
export function maxOneReminder(priorHistory = []) {
  return !priorFollowUps(priorHistory).includes("REMINDER");
}

/**
 * Evalueaza ce follow-up (daca vreunul) merita un task CEO overdue (§16).
 * Totul e PROPUNERE — motorul nu trimite si nu modifica nimic.
 * @param {object} p
 * @param {object} p.task        task-ul CEO (internal.priority/severity/dependencies/...)
 * @param {object|null} p.opsTask  task-ul Operational citit (status, deadline, assignee)
 * @param {string} p.asOf        data curenta ISO (injectata — determinism)
 * @param {object|null} p.personLoad  starea de incarcare a ownerului ({states:[...]})
 * @param {Array} p.priorHistory  follow-up-urile deja facute pe acest task
 * @returns {{action: string, why: string, analysis: {days_overdue: number|null, importance: string, blocks_something: boolean, financial_risk: number|null, person_overloaded: boolean, deadline_realistic: boolean|null}, proposal: {type:string, text:string}|null}}
 */
export function evaluateFollowUp({ task = {}, opsTask = null, asOf, personLoad = null, priorHistory = [] } = {}) {
  const analysis = {
    days_overdue: null,
    importance: "UNKNOWN",
    blocks_something: false,
    financial_risk: null,
    person_overloaded: false,
    deadline_realistic: null,
  };
  const out = (action, why, proposal = null) => ({
    action: FOLLOWUP_ACTIONS.includes(action) ? action : "NO_ACTION",
    why,
    analysis,
    proposal,
  });

  // Fara task-ul Operational nu evaluam nimic — date lipsa, nu presupuneri.
  if (!opsTask) return out("NO_ACTION", "task Operational necunoscut/necitit — nu evaluam pe date lipsa");

  const status = String(opsTask.status || "").toLowerCase().trim();
  if (OPERATIONAL_CLOSED_STATUSES.includes(status)) return out("NO_ACTION", "task inchis in Operational — nimic de urmarit");
  if (status === "rezolvat") return out("NO_ACTION", "rezultat trimis — urmeaza verificarea (§14), nu follow-up");

  if (!asOf) return out("NO_ACTION", "asOf lipsa — nu putem masura intarzierea");
  const deadline = opsTask.deadline || task?.internal?.deadline || null;
  if (!deadline) return out("NO_ACTION", "task fara deadline — nu exista overdue de masurat (gap: deadline lipsa)");
  const dOver = daysBetween(deadline, asOf);
  if (dOver == null) return out("NO_ACTION", "deadline/asOf invalide — nu putem masura intarzierea");
  if (dOver <= 0) return out("NO_ACTION", "task in termen — zero spam");
  analysis.days_overdue = dOver;

  // Analiza completa inainte de orice decizie.
  const prior = priorFollowUps(priorHistory);
  analysis.importance = importanceOf(task);
  analysis.blocks_something = blocksOf(task);
  analysis.financial_risk = financialRiskOf(task);
  analysis.person_overloaded = personLoad?.states?.includes?.("OVERLOADED") === true;
  analysis.deadline_realistic = deadlineRealistic(dOver, prior);

  const title = taskTitleOf(task, opsTask);
  const owner = ownerOf(task, opsTask);

  // Prima intarziere: observam, nu bombardam.
  if (dOver <= 2 && prior.length === 0) return out("NO_ACTION", "overdue abia marcat — observam");

  // Task marcat irelevant intre timp → propunem anularea (inaintea oricarei
  // presiuni pe oameni: nu urmarim un task mort).
  if (isIrrelevant(task)) {
    return out("CANCEL", "task marcat ca nemaifiind necesar — presiunea pe el ar fi zgomot", {
      type: "PROPOSAL",
      text: `Propun anularea task-ului "${title}": e marcat ca nemaifiind necesar. Confirmi anularea?`,
    });
  }

  const important = analysis.importance === "HIGH" || analysis.importance === "MEDIUM";

  // Importanta mare + blocheaza alte lucrari → escaladare (lantul din §17).
  if (analysis.importance === "HIGH" && analysis.blocks_something) {
    return out("ESCALATE", `importanta mare si blocheaza alte lucrari (overdue ${dOver} zile)`, {
      type: "PROPOSAL",
      text: `Propun escaladarea task-ului "${title}" (overdue ${dOver} zile, prioritate mare, blocheaza dependente) pe lantul de escaladare — pas cu pas, fondatorul ultimul.`,
    });
  }

  // Overdue mare si important → UN singur reminder; daca reminderul unic a
  // fost deja dat, urcam (ESCALATE) sau relaxam termenul (EXTEND).
  if (dOver > 7 && important) {
    if (!maxOneReminder(priorHistory)) {
      if (analysis.importance === "HIGH") {
        return out("ESCALATE", "reminderul unic a fost deja trimis si task-ul important e tot overdue", {
          type: "PROPOSAL",
          text: `Reminderul pentru "${title}" nu a produs rezultat (overdue ${dOver} zile). Propun escaladarea conform lantului §17.`,
        });
      }
      return out("EXTEND", "reminder deja trimis fara efect; task ne-critic → propunem termen nou realist", {
        type: "PROPOSAL",
        text: `Propun un termen nou pentru "${title}" — reminderul a fost deja dat si task-ul nu e critic. Ownerul propune data, nu o inventam noi.`,
      });
    }
    const autoOk = autonomyClassOf(task) === "INFORMATION_TASK" && analysis.importance !== "HIGH";
    return out("REMINDER", `overdue mare (${dOver} zile > 7) si task important — un singur reminder, apoi escaladare`, {
      type: autoOk ? "AUTO_OK_AFTER_VALIDATION" : "PROPOSAL",
      text: `Reminder pentru ${owner || "ownerul task-ului"}: "${title}" e intarziat cu ${dOver} zile. Care e stadiul si ce blocheaza finalizarea?`,
    });
  }

  // Persoana supraincarcata + task ne-critic → mutam sau relaxam, nu presam.
  if (analysis.person_overloaded && analysis.importance !== "HIGH") {
    if (analysis.blocks_something) {
      return out("REASSIGN", "owner supraincarcat si task-ul blocheaza alte lucrari — mutarea deblocheaza lantul", {
        type: "PROPOSAL",
        text: `Propun reasignarea task-ului "${title}": ownerul curent e supraincarcat, iar task-ul tine pe loc alte lucrari. Owner nou din harta de responsabilitati, nu ghicit.`,
      });
    }
    return out("EXTEND", "owner supraincarcat si task ne-critic — termen nou in loc de presiune", {
      type: "PROPOSAL",
      text: `Propun prelungirea termenului pentru "${title}": ownerul e supraincarcat si task-ul nu e critic. Termenul nou il propune ownerul.`,
    });
  }

  // Nimic din cele de mai sus → tacem (zero spam este si el o decizie).
  return out("NO_ACTION", "overdue moderat fara factori agravanti — zero spam");
}
