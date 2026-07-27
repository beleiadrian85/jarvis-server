// INVATARE DIN DECIZII — la fiecare Action Card rezolvat de Adrian se salveaza un
// DecisionExample. Modelul invata RELATIA context+fapte+necunoscute+risc+impact+
// owner+reversibilitate → decizia, NU asocierea naiva situatie→buton. Din exemple
// comparabile + rezultate consistente se formeaza DecisionPreference (pattern),
// care poate deveni regula DOAR cu aprobarea explicita a lui Adrian. jarvis_state.
import { getState, setState } from "../../state.js";

const EX_KEY = "ceo:decision-examples";
const PREF_KEY = "ceo:decision-preferences";
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const norm = (s) => String(s || "").toLowerCase().replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t");

/**
 * Amprenta situatiei — NU doar textul, ci semnatura structurala:
 * action_kind + risk + reversibility + financial + external + owner-domain +
 * unknowns-prezente. Doua situatii "aparent similare" difera daca risc/impact difera.
 */
export function situationFingerprint({ action_kind, risk_level, reversibility, financial_impact, external_impact, owner, unknowns } = {}) {
  return [
    `k=${norm(action_kind)}`, `risk=${norm(risk_level) || "low"}`, `rev=${norm(reversibility) || "reversible"}`,
    `fin=${financial_impact ? 1 : 0}`, `ext=${external_impact ? 1 : 0}`,
    `owner=${norm(owner) || "none"}`, `unk=${arr(unknowns).length ? 1 : 0}`,
  ].join("|");
}

/** Salveaza un DecisionExample cand Adrian alege/modifica/respinge/amana pe un card. */
export function buildDecisionExample(card, decision = {}, { nowISO = null } = {}) {
  const d = isObj(decision) ? decision : {};
  return {
    id: `ex:${(nowISO || "").replace(/[^0-9]/g, "").slice(0, 17) || "x"}:${norm(card?.id).slice(-6)}`,
    action_card_id: card?.id || null,
    situation_fingerprint: situationFingerprint({
      action_kind: card?.action_kind, risk_level: card?.risk_level, reversibility: card?.reversibility,
      financial_impact: card?.financial_impact, external_impact: card?.external_impact, owner: card?.owner, unknowns: card?.unknowns,
    }),
    company_context: d.company_context || null,
    facts_used: arr(card?.evidence_refs), unknowns: arr(card?.unknowns),
    risks: card?.risk_level || "low",
    proposed_action: card?.proposed_action || card?.title || null,
    alternatives_shown: arr(card?.alternatives).map((a) => a.label || a),
    selected_action: d.selected_action || null,
    rejected_actions: arr(d.rejected_actions),
    modified_fields: isObj(d.modified_fields) ? d.modified_fields : {},
    stated_reason: d.stated_reason || null,
    inferred_preference_candidate: d.inferred_preference_candidate || null,
    risk_level: card?.risk_level || "low", reversibility: card?.reversibility || "reversible",
    financial_impact: card?.financial_impact ?? false, owner: card?.owner || null,
    outcome: null, correction: null, undo_event: null,
    timestamp: nowISO || new Date().toISOString(),
  };
}

export async function recordDecisionExample(card, decision, { store = null, nowISO = null } = {}) {
  try {
    const S = store || { get: getState, set: setState };
    const ex = buildDecisionExample(card, decision, { nowISO });
    const prev = (await S.get(EX_KEY, { examples: [] })) || { examples: [] };
    const examples = [...arr(prev.examples), ex].slice(-500);
    await S.set(EX_KEY, { examples }).catch(() => {});
    // Reactualizeaza preferintele (pattern) — NU autonomie.
    const prefs = updatePreferences(examples);
    await S.set(PREF_KEY, { preferences: prefs }).catch(() => {});
    return { recorded: true, example: ex, preference_candidates: prefs.filter((p) => p.status !== "CANDIDATE").length };
  } catch (e) { return { recorded: false, error: e.message }; }
}

/**
 * Agrega exemplele pe amprenta → DecisionPreference. NU un click izolat: cere
 * exemple comparabile + consistenta. status: CANDIDATE→OBSERVED_PATTERN→...
 * Regula devine politica DOAR prin aprobarea lui Adrian (RULE_PROPOSED→APPROVED_POLICY).
 */
export function updatePreferences(examples = []) {
  const byFp = {};
  for (const ex of arr(examples)) {
    const fp = ex.situation_fingerprint;
    (byFp[fp] = byFp[fp] || []).push(ex);
  }
  const prefs = [];
  for (const [fp, list] of Object.entries(byFp)) {
    const chosen = {};
    for (const ex of list) { const k = norm(ex.selected_action); if (k) chosen[k] = (chosen[k] || 0) + 1; }
    const entries = Object.entries(chosen).sort((a, b) => b[1] - a[1]);
    if (!entries.length) continue;
    const [top, topN] = entries[0];
    const consistency = topN / list.length;
    const n = list.length;
    // Status pe volum + consistenta (nu dintr-un caz).
    let status = "CANDIDATE";
    if (n >= 3 && consistency >= 0.7) status = "OBSERVED_PATTERN";
    if (n >= 5 && consistency >= 0.8) status = "RULE_PROPOSED"; // gata de PROPUS lui Adrian (nu aprobat)
    const confidence = Math.min(90, Math.round(consistency * 100 * Math.min(1, n / 5)));
    const owners = {}; for (const ex of list) if (ex.owner) owners[norm(ex.owner)] = (owners[norm(ex.owner)] || 0) + 1;
    const preferred_owner = Object.entries(owners).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    prefs.push({
      id: `pref:${fp.replace(/[^a-z0-9]/g, "").slice(0, 20)}`,
      scope: fp, conditions: fpToConditions(fp),
      preferred_action: top, avoided_actions: entries.slice(1).map((e) => e[0]),
      preferred_owner, confidence,
      supporting_examples: topN, contradicting_examples: n - topN,
      outcome_score: null, last_confirmed_at: list[list.length - 1]?.timestamp || null, status,
    });
  }
  return prefs.sort((a, b) => b.confidence - a.confidence);
}

function fpToConditions(fp) {
  const o = {};
  for (const part of String(fp).split("|")) { const [k, v] = part.split("="); o[k] = v; }
  return o;
}

/** Preferintele curente (read). */
export async function getPreferences({ store = null } = {}) {
  const S = store || { get: getState, set: setState };
  return arr(((await S.get(PREF_KEY, { preferences: [] }).catch(() => null)) || {}).preferences);
}

/** Cere motivul (feedback rapid) DOAR in cazurile ambigue/divergente. */
export function shouldAskReason(card, decision = {}) {
  const d = isObj(decision) ? decision : {};
  return !!(
    (d.selected_action && card?.proposed_action && norm(d.selected_action) !== norm(card.proposed_action)) || // difera de recomandarea principala
    (isObj(d.modified_fields) && d.modified_fields.owner) || // schimba ownerul
    d.repeated_rejection || // resping repetat acelasi tip
    d.ambiguous
  );
}
export const REASON_OPTIONS = ["Urgent financiar", "Owner corect", "Mai intai diagnostic", "Nu vreau munca manuala", "Alt motiv"];
