// POLITICI DE AUTONOMIE — o DecisionPreference puternica poate deveni regula DOAR
// prin aprobarea explicita a lui Adrian. Ciclu: DRAFT→SUPERVISED→ACTIVE→(PAUSED/
// REVOKED). Versionat, auditabil, revocabil, suspendabil instant. NIMIC din lista
// never-autonomous nu poate deveni ACTIVE. O preferinta inferata NU se acorda singura.
import { getState, setState } from "../../state.js";
import { NEVER_AUTONOMOUS } from "./actionCard.js";

const KEY = "ceo:autonomy-policies";
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

export const POLICY_STATUSES = ["DRAFT", "SUPERVISED", "ACTIVE", "PAUSED", "REVOKED"];

/** Propune o regula din pattern (RULE_PROPOSED) — text pentru Adrian + structura DRAFT. */
export function proposeRuleFromPreference(pref, { nowISO = null } = {}) {
  const c = isObj(pref?.conditions) ? pref.conditions : {};
  const kind = c.k || "actiune";
  const forbidden = NEVER_AUTONOMOUS.includes(kind);
  return {
    proposal_text:
      `In ${pref.supporting_examples}/${pref.supporting_examples + pref.contradicting_examples} situatii similare ai ales „${pref.preferred_action}".\n` +
      `Propun regula: cand ${describe(c)}, JARVIS ${pref.preferred_action}` +
      (pref.preferred_owner ? ` (owner: ${pref.preferred_owner})` : "") + ".",
    forbidden_for_autonomy: forbidden,
    draft: {
      id: `policy:${(pref.id || "").replace(/[^a-z0-9]/g, "").slice(0, 24)}`,
      name: `Regula ${kind}`, description: `Din pattern ${pref.scope}`,
      trigger_conditions: c, required_facts: [], disqualifying_conditions: forbidden ? ["never_autonomous"] : [],
      allowed_actions: [pref.preferred_action], owner_rules: pref.preferred_owner ? { default: pref.preferred_owner } : {},
      risk_ceiling: "low", financial_ceiling: 0, reversibility_required: true,
      confidence_threshold: 80, escalation_conditions: ["state_changed", "correction"], notification_mode: "receipt",
      approval_source: null, version: 1, effective_from: null, status: "DRAFT",
      created_at: nowISO || new Date().toISOString(),
    },
  };
}
function describe(c) {
  return `${c.k || "o actiune"} cu risc ${c.risk || "low"}${c.fin === "1" ? ", cu impact financiar" : ""}${c.unk === "1" ? ", cu necunoscute" : ""}`;
}

/** Decizia lui Adrian pe o regula propusa. NIMIC never-autonomous nu ajunge ACTIVE. */
export async function decidePolicy(policyId, decision, { store = null, nowISO = null, draft = null } = {}) {
  const S = store || { get: getState, set: setState };
  const all = (await S.get(KEY, { policies: {} }).catch(() => null)) || { policies: {} };
  let pol = all.policies[policyId] || draft;
  if (!pol) return { ok: false, reason: "politica inexistenta" };
  const d = String(decision || "").toUpperCase();
  const forbidden = arr(pol.disqualifying_conditions).includes("never_autonomous") || NEVER_AUTONOMOUS.includes(pol.trigger_conditions?.k);

  if (d === "APPROVE" || d === "APPROVE_SUPERVISED") {
    if (forbidden) return { ok: false, reason: "actiune din lista never-autonomous — NU poate deveni politica autonoma; ramane pe aprobare per-caz" };
    pol = { ...pol, status: "SUPERVISED", approval_source: "adrian", effective_from: nowISO || new Date().toISOString() };
  } else if (d === "ACTIVATE") {
    if (forbidden) return { ok: false, reason: "never-autonomous — nu se activeaza niciodata" };
    const gate = canActivate(pol);
    if (!gate.ok) return { ok: false, reason: gate.reason };
    pol = { ...pol, status: "ACTIVE", approval_source: "adrian", version: (pol.version || 1) };
  } else if (d === "PAUSE") pol = { ...pol, status: "PAUSED" };
  else if (d === "REVOKE") pol = { ...pol, status: "REVOKED" };
  else if (d === "MODIFY") pol = { ...pol, ...(isObj(draft) ? draft : {}), version: (pol.version || 1) + 1, status: "DRAFT" };
  else return { ok: false, reason: "decizie necunoscuta (APPROVE/ACTIVATE/PAUSE/REVOKE/MODIFY)" };

  all.policies[policyId] = pol;
  await S.set(KEY, all).catch(() => {});
  return { ok: true, policy: pol };
}

/** Gard de activare SUPERVISED→ACTIVE: cazuri suficiente + rata acceptare + zero corectii recente. */
export function canActivate(pol, { minCases = 10, minAcceptRate = 0.9, maxRecentCorrections = 0 } = {}) {
  const m = isObj(pol?.metrics) ? pol.metrics : {};
  if (pol.status !== "SUPERVISED") return { ok: false, reason: "politica nu e in SUPERVISED" };
  if ((m.cases || 0) < minCases) return { ok: false, reason: `prea putine cazuri (${m.cases || 0}/${minCases})` };
  if ((m.accept_rate ?? 0) < minAcceptRate) return { ok: false, reason: `rata de acceptare prea mica (${Math.round((m.accept_rate || 0) * 100)}%)` };
  if ((m.recent_corrections || 0) > maxRecentCorrections) return { ok: false, reason: "corectii recente — nu se activeaza" };
  if (!pol.approval_source) return { ok: false, reason: "lipseste aprobarea explicita a lui Adrian" };
  return { ok: true };
}

/** In SUPERVISED, o corectie ("Anuleaza") reduce increderea si poate suspenda regula. */
export async function recordSupervisedFeedback(policyId, feedback, { store = null } = {}) {
  const S = store || { get: getState, set: setState };
  const all = (await S.get(KEY, { policies: {} }).catch(() => null)) || { policies: {} };
  const pol = all.policies[policyId];
  if (!pol) return { ok: false, reason: "inexistenta" };
  const m = (pol.metrics = isObj(pol.metrics) ? pol.metrics : { cases: 0, accepted: 0, corrections: 0, recent_corrections: 0 });
  m.cases += 1;
  const f = String(feedback || "").toUpperCase();
  if (f === "CORRECT") { m.accepted += 1; m.recent_corrections = 0; }
  else if (f === "CANCEL") { m.corrections += 1; m.recent_corrections += 1; if (m.recent_corrections >= 2) pol.status = "PAUSED"; }
  else if (f === "STOP_AUTO") pol.status = "PAUSED";
  m.accept_rate = m.cases ? m.accepted / m.cases : 0;
  await S.set(KEY, all).catch(() => {});
  return { ok: true, policy: pol };
}

/** Politici active care s-ar aplica unui context (pentru SUPERVISED/ACTIVE execution). */
export async function matchingPolicy(fingerprintConditions, { store = null } = {}) {
  const S = store || { get: getState, set: setState };
  const all = (await S.get(KEY, { policies: {} }).catch(() => null)) || { policies: {} };
  const c = isObj(fingerprintConditions) ? fingerprintConditions : {};
  return Object.values(all.policies).find((p) =>
    ["SUPERVISED", "ACTIVE"].includes(p.status) &&
    !NEVER_AUTONOMOUS.includes(p.trigger_conditions?.k) &&
    p.trigger_conditions?.k === c.k && p.trigger_conditions?.risk === c.risk) || null;
}

export async function listPolicies({ store = null } = {}) {
  const S = store || { get: getState, set: setState };
  return Object.values(((await S.get(KEY, { policies: {} }).catch(() => null)) || { policies: {} }).policies);
}
