// OPEN LOOP WATCHDOG (§2, §24). PUR.
// La fiecare ciclu, pentru FIECARE bucla deschisa, calculeaza urmatoarea cea
// mai buna actiune si un next_check_at — nicio bucla nu ramane uitata.
// Nu trimite nimic; produce recomandari deterministe. Trimiterea reala a
// follow-up-ului o face ciclul, gated, prin operationalWrite (add_observation).
import { OPERATIONAL_CLOSED_STATUSES, daysBetween, mapOperationalStatus } from "./contract.js";

const DAY = 86_400_000;

// Actiunile canonice (§2).
export const LOOP_ACTIONS = [
  "WAIT", "FOLLOW_UP", "ASK_BLOCKER", "EXTEND", "REASSIGN_PROPOSAL",
  "SYSTEM_SOLUTION", "ESCALATE", "VERIFY", "CLOSE", "NO_LONGER_NEEDED",
];

/** Cadenta de re-verificare pe nivel de insistenta (§24). */
function nextCheck(nowMs, level) {
  const h = level === "CRITICAL" ? 4 : level === "HIGH" ? 24 : level === "MEDIUM" ? 48 : 96;
  return new Date((nowMs ?? 0) + h * 3_600_000).toISOString();
}

/**
 * Decide urmatoarea actiune pentru o bucla (task CEO real). PUR.
 * @param {object} rec  intrarea din registrul CEO (operational_id, lifecycle,
 *   created_at, updated_at, followups[], verification, human, owner, task_type)
 * @param {object} ctx  { opsTask (task-ul Operational citit, cu status/report/
 *   attachments), stillNeeded (bool|null), insistence ({level}), nowMs, asOf }
 * @returns {{action, why, next_check_at, insistence, needs_followup, needs_verify}}
 */
export function decideLoopAction(rec = {}, ctx = {}) {
  const nowMs = ctx.nowMs ?? Date.parse("2026-07-22T00:00:00Z");
  const level = ctx.insistence?.level || "MEDIUM";
  const ops = ctx.opsTask || null;
  const done = (action, why) => ({ action, why, next_check_at: nextCheck(nowMs, level), insistence: level, needs_followup: action === "FOLLOW_UP" || action === "ASK_BLOCKER", needs_verify: action === "VERIFY" });

  // 1) Nevoia nu mai e valida → inchide fara sa deranjezi.
  if (ctx.stillNeeded === false) return done("NO_LONGER_NEEDED", "nevoia originala nu mai e valida (datele exista deja / rezolvata altfel)");

  // 2) Rezultat prezent, dar neverificat → VERIFY (bifat != rezolvat).
  const phase = ops ? mapOperationalStatus(ops.status) : rec.lifecycle;
  const hasResult = !!(ops && (String(ops.report || "").trim() || String(ops.status || "").toLowerCase() === "rezolvat"));
  if ((phase === "RESULT_SUBMITTED" || hasResult) && rec.verification?.verified !== true)
    return done("VERIFY", "rezultat raportat dar neverificat — cere dovada inainte de a inchide bucla");
  if (rec.verification?.verified === true) return done("CLOSE", "rezultat verificat — bucla se inchide");

  // 3) Task Operational inchis dar bucla noastra nu → sincronizeaza/verifica.
  if (ops && OPERATIONAL_CLOSED_STATUSES.includes(String(ops.status || "").toLowerCase()))
    return done("VERIFY", `task Operational ${ops.status} — verifica rezultatul inainte de inchidere`);

  // 4) Blocat → intelege blocajul (nu e esec).
  if (String(ops?.status || "").toLowerCase() === "blocat" || rec.lifecycle === "BLOCKED")
    return done("ASK_BLOCKER", "task blocat — analizeaza cauza si cine poate debloca (nu e task nereusit)");

  // 5) Deadline si follow-up.
  const dl = rec.human?.deadline || rec.internal?.deadline || null;
  const overdue = dl ? (daysBetween(dl, ctx.asOf || new Date(nowMs).toISOString().slice(0, 10)) ?? 0) : 0;
  const followups = (rec.followups || []).filter((f) => f.action === "FOLLOW_UP" || f.action === "REMINDER");
  const lastFu = followups[followups.length - 1];
  const hoursSinceFu = lastFu?.at ? (nowMs - Date.parse(lastFu.at)) / 3_600_000 : Infinity;

  if (overdue > 0) {
    // Rezultat aparut intre timp? (verificat mai sus) — altfel follow-up controlat.
    if (followups.length === 0) return done("FOLLOW_UP", `restant de ${overdue} zile, niciun reminder inca — cere status: FINALIZAT / BLOCAT+motiv / TERMEN NOU`);
    if (followups.length >= 1 && hoursSinceFu >= 24) {
      // Dupa reminderul unic, nu spam: reevalueaza (extend/reassign/escalate).
      if (level === "CRITICAL" || level === "HIGH") return done("ESCALATE", `restant de ${overdue} zile, reminder deja trimis, impact ${level} — reevaluare/escaladare justificata`);
      return done("EXTEND", `restant de ${overdue} zile, reminder deja trimis, impact ${level} — propune termen nou realist, fara spam`);
    }
    return done("WAIT", `restant dar reminder trimis acum ${Math.round(hoursSinceFu)}h — asteapta raspunsul (fara spam)`);
  }

  // 6) Inca in termen → asteapta, dar cu next_check_at (§24: WAIT nu e pasiv).
  return done("WAIT", `in termen (${dl ? `scadenta ${dl}` : "fara termen"}) — monitorizez, urmatoarea verificare programata`);
}

/**
 * Ruleaza watchdog-ul peste toate buclele deschise. PUR.
 * loops = intrarile CEO cu operational_id, deschise. resolveCtx(rec) → ctx.
 */
export function runWatchdog({ registry = {}, resolveCtx = () => ({}), nowMs = null } = {}) {
  const out = [];
  for (const rec of Object.values(registry)) {
    if (!rec.operational_id) continue;
    if (["COMPLETED", "FAILED", "EXPIRED", "NO_LONGER_NEEDED"].includes(rec.lifecycle)) continue;
    const decision = decideLoopAction(rec, { ...resolveCtx(rec), nowMs });
    out.push({ task_id: rec.operational_id, title: rec.human?.title || rec.task_title, owner: rec.owner, lifecycle: rec.lifecycle, ...decision });
  }
  return out;
}
