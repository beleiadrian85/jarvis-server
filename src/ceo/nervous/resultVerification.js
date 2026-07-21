// NERVOUS SYSTEM V1 §14 — RESULT VERIFICATION ENGINE (regula M din §28).
// Un task bifat NU inseamna rezolvat: "rezolvat" e o AFIRMATIE a omului;
// inchiderea gap-ului cere DOVADA. Motorul primeste task-ul CEO, task-ul
// Operational citit in amonte si un set de dataChecks (probe calculate de
// stratul de IO) si judeca daca rezultatul e demonstrabil.
// Modul PUR: functii deterministe peste argumente, ZERO IO. Date lipsa =
// "UNKNOWN"/gap explicit — niciodata inventate.
import { VERIFICATION_METHODS } from "./contract.js";

// ── CONSTANTE INTERNE ───────────────────────────────────────────────────

// Statusuri Operational care inseamna "omul sustine ca a terminat".
const RESOLVED_STATUSES = ["rezolvat", "acceptat"];

// Flag-ul specific din dataChecks care dovedeste fiecare metoda (DATA si
// USER_CONFIRMATION au reguli proprii, tratate explicit in verifyTaskResult).
const METHOD_PROOF_FLAG = {
  STATE_CHANGE: "state_changed",
  DOCUMENT: "document_present",
  SYSTEM_CONFIRMATION: "system_confirmed",
  DEPENDENCY_RESOLVED: "dependency_resolved",
};

// ── HELPERI INTERNI ─────────────────────────────────────────────────────

/** Metoda de verificare a task-ului; lipsa/necunoscuta → USER_CONFIRMATION
 *  (cea mai putin pretentioasa dovada: raportul omului). */
function resolveMethod(task) {
  const m = String(task?.internal?.verification_method || "").toUpperCase().trim();
  return VERIFICATION_METHODS.includes(m) ? m : "USER_CONFIRMATION";
}

/** task_type-ul canonic al task-ului CEO (sau null daca lipseste). */
function taskTypeOf(task) {
  return task?.internal?.task_type || task?.task_type || null;
}

/** Dovada pe metoda DATA: flag specific pe task_type (CASH_DATA are flag
 *  dedicat balances_fresh), generic dataChecks[<task_type>] === true. */
function dataProof(taskType, dataChecks) {
  if (taskType === "CASH_DATA") {
    const ok = dataChecks.balances_fresh === true || dataChecks.CASH_DATA === true;
    return { name: "data_proof", ok, note: ok ? "dovada in date: balances_fresh === true" : "lipseste dovada in date: balances_fresh nu e true" };
  }
  if (!taskType) return { name: "data_proof", ok: false, note: "task_type lipsa — nu stim ce dovada sa cautam in date (gap)" };
  const ok = dataChecks[taskType] === true;
  return { name: "data_proof", ok, note: ok ? `dovada in date: dataChecks["${taskType}"] === true` : `lipseste dovada in date: dataChecks["${taskType}"] nu e true` };
}

// ── EXPORTURI ───────────────────────────────────────────────────────────

/**
 * Verifica daca rezultatul unui task CEO e REAL (§14).
 * @param {object} p
 * @param {object} p.task       task-ul CEO (foloseste task.internal.verification_method + task_type)
 * @param {object|null} p.opsTask  task-ul Operational citit (status, report) — null daca necitit
 * @param {object} p.dataChecks  probe calculate in amonte (ex. balances_fresh, state_changed)
 * @returns {{verified: true|false|"UNKNOWN", method: string, checks: {name:string, ok:boolean, note:string}[], gap_closed: boolean, next: string}}
 */
export function verifyTaskResult({ task = {}, opsTask = null, dataChecks = {} } = {}) {
  const method = resolveMethod(task);
  const checks = [];

  // Fara task-ul Operational nu stim starea reala → UNKNOWN, nu ghicim.
  if (!opsTask) {
    checks.push({ name: "ops_task_present", ok: false, note: "task Operational inexistent sau necitit — starea reala e necunoscuta" });
    return { verified: "UNKNOWN", method, checks, gap_closed: false, next: "citeste task-ul din Operational inainte de verificare" };
  }

  const status = String(opsTask.status || "").toLowerCase().trim();
  const resolved = RESOLVED_STATUSES.includes(status);
  checks.push({ name: "status_resolved", ok: resolved, note: `status Operational: "${status || "?"}"` });
  if (!resolved) {
    return { verified: false, method, checks, gap_closed: false, next: "task inca in lucru" };
  }

  // Statusul spune "gata" — acum cerem dovada, pe metoda declarata a task-ului.
  let proof;
  if (method === "DATA") {
    proof = dataProof(taskTypeOf(task), dataChecks);
    // Fallback onest: cand NU exista sursa automata de dovada pentru acest
    // task_type (cheia lipseste cu totul din dataChecks), raportul uman de
    // rezolvare tine loc de dovada (metoda degradata la USER_CONFIRMATION) —
    // altfel task-ul ar ramane neverificabil pe veci.
    const tt = taskTypeOf(task);
    const hasAutoSource = tt === "CASH_DATA"
      ? ("balances_fresh" in dataChecks || "CASH_DATA" in dataChecks)
      : (tt != null && tt in dataChecks);
    if (!proof.ok && !hasAutoSource) {
      const report = String(opsTask.report || "").trim();
      proof = {
        name: "report_fallback", ok: report.length > 0,
        note: report.length > 0
          ? "fara sursa automata de verificare — raportul uman de rezolvare accepta ca dovada (metoda degradata)"
          : "fara sursa automata si fara raport de rezolvare — cere dovada umana",
      };
    }
  } else if (method === "USER_CONFIRMATION") {
    const report = String(opsTask.report || "").trim();
    proof = { name: "report_present", ok: report.length > 0, note: report.length > 0 ? "raport de rezolvare prezent pe task" : "raport de rezolvare gol — bifat fara continut" };
  } else {
    // STATE_CHANGE / DOCUMENT / SYSTEM_CONFIRMATION / DEPENDENCY_RESOLVED:
    // flag specific pe metoda, cu fallback pe dovada generica per task_type.
    const flag = METHOD_PROOF_FLAG[method];
    const tt = taskTypeOf(task);
    const ok = (flag != null && dataChecks[flag] === true) || (tt != null && dataChecks[tt] === true);
    proof = { name: "method_proof", ok, note: ok ? `dovada pentru ${method} prezenta` : `lipseste dovada pentru ${method}${flag ? ` (dataChecks.${flag})` : ""}` };
  }
  checks.push(proof);

  if (!proof.ok) {
    return { verified: false, method, checks, gap_closed: false, next: "cere clarificare/dovada — rezultatul nu e demonstrabil" };
  }
  return { verified: true, method, checks, gap_closed: true, next: "nimic — dovada exista, gap-ul e inchis" };
}

/**
 * Descrie CE dovada inchide task-ul (§14) — folosita la creare, ca task-ul
 * sa plece in lume cu criteriul de verificare deja stabilit.
 * @param {object} task  task-ul CEO
 * @returns {{method: string, what_proves_it: string}}
 */
export function verificationPlan(task = {}) {
  const method = resolveMethod(task);
  const tt = taskTypeOf(task);
  const dataProofText = tt === "CASH_DATA"
    ? "date proaspete in sursa: dataChecks.balances_fresh === true"
    : `date proaspete in sursa: dataChecks["${tt || "<task_type>"}"] === true`;
  const map = {
    DATA: dataProofText,
    STATE_CHANGE: "starea observata s-a schimbat efectiv: dataChecks.state_changed === true",
    DOCUMENT: "documentul cerut exista si e accesibil: dataChecks.document_present === true",
    USER_CONFIRMATION: "raport de rezolvare nevid pe task-ul Operational (opsTask.report)",
    SYSTEM_CONFIRMATION: "sistemul confirma rezultatul automat: dataChecks.system_confirmed === true",
    DEPENDENCY_RESOLVED: "blocajul/task-ul dependent s-a inchis: dataChecks.dependency_resolved === true",
  };
  return { method, what_proves_it: map[method] || dataProofText };
}
