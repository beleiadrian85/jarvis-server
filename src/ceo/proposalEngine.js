// CEO AI — PROPOSAL ENGINE (P0). Fluxul: CEO detecteaza → Recomandare →
// Action Proposal → ApprovalGate → Adrian (APPROVE/MODIFY/REJECT) → Task
// Proposal (responsabil, termen, rezultat asteptat, regula de verificare).
// FAZA CURENTA = INFRASTRUCTURA + SHADOW: propunerile se construiesc si se
// persista (jarvis_state + audit), dar NIMIC nu se trimite si NIMIC nu se
// executa. approvalGate existent ramane NEMODIFICAT, singura poarta viitoare.
import { audit } from "../audit.js";
import { getState, setState } from "../state.js";
import { personFor } from "./companyConfig.js";

const PROPOSALS_KEY = "ceo:proposals";
export const PROPOSAL_STATES = ["draft", "proposed", "approved", "modified", "rejected", "delegated", "verified"];

/** Construieste o propunere canonica. PUR. recommendation ≠ approval ≠ executie. */
export function buildActionProposal({
  id, problem, evidence = [], recommendation, options = [],
  assignee = null, deadline = null, expected_result = "", verification_rule = "",
  source = "ceo", severity = "medium",
} = {}) {
  const person = assignee ? personFor(assignee) : null;
  return {
    proposal_id: id || `prop:${(problem || "x").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
    state: "draft",                    // NIMIC nu e aprobat implicit
    problem, evidence, recommendation, options,
    task_proposal: person ? {
      assignee: person.name, assignee_role: person.role,
      deadline, expected_result, verification_rule,
      sent: false,                     // NU se trimite in aceasta faza
    } : null,
    source, severity,
    requires_founder_approval: true,   // Adrian decide, intotdeauna
    executed: false,
    created_note: "SHADOW — propunere pregatita; trimiterea trece prin ApprovalGate cand fluxul se activeaza.",
  };
}

/** Valideaza separarea propunere ≠ executie. PUR. */
export function validateProposal(p) {
  const errors = [];
  if (!p?.problem) errors.push("problem lipsa");
  if (!p?.recommendation) errors.push("recommendation lipsa");
  if (!Array.isArray(p?.evidence) || !p.evidence.length) errors.push("propunere fara dovezi — respinsa");
  if (p?.executed) errors.push("o propunere nu poate fi executata (executia e alt strat, dupa aprobare)");
  if (p?.state && !PROPOSAL_STATES.includes(p.state)) errors.push(`stare invalida: ${p.state}`);
  if (p?.task_proposal?.sent) errors.push("task_proposal.sent trebuie false in shadow");
  return { valid: !errors.length, errors };
}

/** Persista propunerile in jarvis_state + audit (SHADOW: doar evidenta). */
export async function recordProposals(proposals = [], { persist = true } = {}) {
  const valid = proposals.filter((p) => validateProposal(p).valid);
  if (persist && valid.length) {
    const existing = await getState(PROPOSALS_KEY, {}).catch(() => ({}));
    for (const p of valid) existing[p.proposal_id] = { ...p, recorded_at: new Date().toISOString() };
    await setState(PROPOSALS_KEY, existing).catch(() => {});
    for (const p of valid) {
      await audit("ceo_proposal", `${p.proposal_id} [${p.state}] ${p.problem}`.slice(0, 190),
        JSON.stringify(p).slice(0, 1900)).catch(() => {});
    }
  }
  return { recorded: valid.length, invalid: proposals.length - valid.length };
}

/** Propunerile curente (pentru Command Center / digest viitor). */
export async function listProposals() {
  return await getState(PROPOSALS_KEY, {}).catch(() => ({}));
}

/**
 * Decizia fondatorului pe o propunere (Approval Inbox): APPROVE/MODIFY/REJECT.
 * IMPORTANT: aprobarea NU trimite nimic — livrarea efectiva ramane in spatele
 * fluxului approvalGate + flag de livrare (dezactivat in aceasta faza).
 */
export async function decideProposal({ proposal_id, decision, note = "", decided_by = "adrian" } = {}) {
  const D = { APPROVE: "approved", MODIFY: "modified", REJECT: "rejected" };
  const state = D[String(decision).toUpperCase()];
  if (!state) return { ok: false, error: "decision: APPROVE|MODIFY|REJECT" };
  const all = await getState(PROPOSALS_KEY, {}).catch(() => ({}));
  const p = all[proposal_id];
  if (!p) return { ok: false, error: "propunere inexistenta" };
  p.state = state;
  p.founder_decision = { decision: state, note, decided_by, at: new Date().toISOString() };
  // §12: hash-ul contextului aprobat — livrarea refuza daca continutul s-a schimbat.
  let h = 0; const s = `${p.problem}|${p.recommendation}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  p.approved_context_hash = String(h >>> 0);
  // NU reseta livrarea la re-aprobare — idempotenta trimiterii depinde de ea.
  if (!p.delivery?.status && p.delivery?.sent !== true) {
    p.delivery = { sent: false, note: "netrimis — livrarea cere APPROVE & SEND explicit" };
  }
  all[proposal_id] = p;
  await setState(PROPOSALS_KEY, all);
  await audit("ceo_proposal_decision", `${proposal_id} → ${state}${note ? ` (${note.slice(0, 80)})` : ""}`,
    JSON.stringify(p.founder_decision)).catch(() => {});
  return { ok: true, proposal: p };
}
