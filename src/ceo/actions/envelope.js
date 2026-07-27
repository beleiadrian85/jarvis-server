// MANAGERIAL DECISION ENVELOPE — principiul de arhitectura: NU extragem actiuni din
// proza (regex/keywords). Modelul propune SEMANTIC actiuni (ManagerialAction);
// codul DETERMINIST clasifica, verifica permisiunile, construieste Action Cards,
// semneaza tokenurile, executa AUTO_EXECUTE prin CommandBus si produce receipts.
// Modelul NU creeaza tokenuri/receipts/statusuri. Reutilizeaza componentele existente
// (actionCard/actionToken/executor/finalizer) — zero sistem paralel.
import { buildActionCard, renderCard, classifyActionType } from "./actionCard.js";
import { signActionToken } from "./actionToken.js";
import { saveCard } from "./actionStore.js";
import { executeAction } from "./executor.js";
import { finalizeManagerialOutput } from "../managerialFinalizer.js";

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);

/** Campurile unei ManagerialAction (propunerea semantica a modelului). */
export const MANAGERIAL_ACTION_FIELDS = [
  "intent", "action_type", "title", "summary", "reason", "evidence_refs", "owner",
  "target", "payload", "alternatives", "risk_level", "reversibility", "financial_impact",
  "external_impact", "founder_required", "founder_reason", "permission_basis",
  "deadline", "deadline_basis", "preferred_execution_mode",
];

/** Normalizeaza o ManagerialAction propusa de model (fara sa acorde permisiuni). */
function normalizeAction(a = {}) {
  const x = isObj(a) ? a : {};
  return {
    intent: x.intent || null,
    action_kind: x.action_kind || x.kind || x.intent || null,
    title: String(x.title || "").slice(0, 120),
    summary: String(x.summary || "").slice(0, 400),
    reason: String(x.reason || "").slice(0, 300),
    evidence_refs: arr(x.evidence_refs), owner: x.owner || null, target: x.target || null,
    execution_payload: isObj(x.payload) ? x.payload : (isObj(x.execution_payload) ? x.execution_payload : null),
    alternatives: arr(x.alternatives),
    risk_level: x.risk_level || "low", reversibility: x.reversibility || "reversible",
    financial_impact: x.financial_impact ?? false, external_impact: x.external_impact ?? false,
    founder_required: !!x.founder_required, founder_reason: x.founder_reason || null,
    // permission_basis vine DIN cod, nu din model — modelul poate sugera, codul decide.
    permission_basis: x.permission_basis || (x.tasks_only ? "tasks_only" : "unknown"),
    tasks_only: x.tasks_only === true || /task|clarif|follow|notify|search|check|collect/i.test(String(x.action_kind || x.kind || x.intent || "")),
    needs_founder_info: x.action_type === "INFORMATION_REQUIRED" || x.needs_founder_info === true,
    deadline: x.deadline || null, deadline_basis: x.deadline_basis || null,
    // preferred_execution_mode = SUGESTIE; clasificarea finala e a codului.
    preferred_execution_mode: x.preferred_execution_mode || x.action_type || null,
    forbidden: x.forbidden === true,
  };
}

/**
 * Construieste envelope-ul dintr-un output structurat al modelului. Modelul da
 * {narrative, facts, unknowns, decisions, actions, information_requests, escalations}.
 * @returns ManagerialDecisionEnvelope (fara executie inca).
 */
export function buildEnvelope(modelOut = {}, ctx = {}) {
  const m = isObj(modelOut) ? modelOut : {};
  const actions = [...arr(m.actions), ...arr(m.information_requests).map((r) => ({ ...r, action_type: "INFORMATION_REQUIRED" }))].map(normalizeAction);
  return {
    response_id: ctx.response_id || null, conversation_id: ctx.conversation_id || null, user_id: ctx.user_id || "adrian",
    situation: m.situation || m.narrative || null,
    facts: arr(m.facts), unknowns: arr(m.unknowns),
    assessment: m.assessment || null, material_change: m.material_change ?? null, dominant_risk: m.dominant_risk || null,
    recommendations: arr(m.recommendations || m.decisions),
    actions,
    founder_decisions: actions.filter((a) => a.founder_required),
    information_requests: actions.filter((a) => a.needs_founder_info),
    execution_receipts: [], policy_references: arr(m.policy_references),
    escalation: m.escalation || arr(m.escalations)[0] || null,
    message: String(m.narrative || m.message || "").slice(0, 4000),
  };
}

/**
 * Transforma envelope → carduri semnate + executa AUTO_EXECUTE. DETERMINIST.
 * @param p { envelope, ctx {user_id, conversation_id}, commandBus, revalidate, store,
 *           autoExecute (bool, default true), nowISO }
 * @returns { cards:[{card, rendered, buttons, token_map}], receipts, superseded }
 */
export async function envelopeToCards(p = {}) {
  const { envelope, ctx = {}, commandBus = null, revalidate = null, store = null, autoExecute = true, nowISO = null, channelSupportsButtons = true } = isObj(p) ? p : {};
  const out = { cards: [], receipts: [] };
  for (const a of arr(envelope?.actions)) {
    // Clasificare finala = COD (nu model). preferred_execution_mode e doar hint.
    const cls = classifyActionType(a);
    const card = buildActionCard({ ...a, kind: a.action_kind }, { nowISO });
    card.action_type = cls.action_type; // sursa de adevar = clasificatorul determinist
    card.conversation_id = ctx.conversation_id || null;
    await saveCard(card, { store });

    if (autoExecute && card.action_type === "AUTO_EXECUTE") {
      // Executa singur prin executor (token intern) — receipt, fara buton de aprobare.
      const token = signActionToken({ card_id: card.id, action_id: "auto", user_id: ctx.user_id || "adrian", conversation_id: ctx.conversation_id, payload: card.execution_payload, version: card.version, expires_at: card.expires_at });
      const r = await executeAction({ token, card_id: card.id, action_id: "auto", user_id: ctx.user_id || "adrian", conversation_id: ctx.conversation_id, commandBus, revalidate, store, nowISO });
      if (r.ok && r.receipt) { out.receipts.push(r.receipt); out.cards.push({ card: r.card, rendered: executedText(r.card), buttons: [], token_map: {} }); continue; }
      // Daca AUTO a esuat/superseded, cade pe card interactiv (aprobare) mai jos.
      card.status = r.status === "SUPERSEDED" ? "SUPERSEDED" : "PROPOSED";
    }
    if (card.status === "SUPERSEDED") { out.cards.push({ card, rendered: "Situatia s-a schimbat de la propunere — JARVIS a reanalizat si nu a executat actiunea veche.", buttons: [], token_map: {} }); continue; }

    // Card interactiv: semneaza cate un token per buton (opac).
    const rend = renderCard(card, { channelSupportsButtons });
    const token_map = {};
    for (const b of rend.buttons) token_map[b.action_id] = signActionToken({ card_id: card.id, action_id: b.action_id, user_id: ctx.user_id || "adrian", conversation_id: ctx.conversation_id, payload: card.execution_payload, version: card.version, expires_at: card.expires_at });
    out.cards.push({ card, rendered: rend.text, buttons: rend.buttons, token_map });
  }
  return out;
}

function executedText(card) {
  const r = card?.receipt;
  if (!r) return "Executat.";
  if (r.kind === "info_recorded") return `Notat: ${r.value}.`;
  return `Am executat.\n\nDovada:\n- task${card.owner ? ` (${card.owner})` : ""}: ${card.execution_payload?.title || card.title}\n- receipt: ${r.operational_id || "inregistrat"}`;
}

/**
 * FINALIZER pe envelope: mesaj (validat prin canonical finalizer) + carduri +
 * receipts + policy_references + rendering_hints (max 3 principale, grupare).
 */
export async function finalizeEnvelope(p = {}) {
  const { envelope, ctx = {}, commandBus = null, revalidate = null, store = null, channel = "chat", autoExecute = true, nowISO = null, llm = null, system = null, messages = null } = isObj(p) ? p : {};
  const built = await envelopeToCards({ envelope, ctx, commandBus, revalidate, store, autoExecute, nowISO, channelSupportsButtons: channel !== "telegram_text" });

  const interactiveCards = built.cards.filter((c) => ["PROPOSED", "APPROVED"].includes(c.card.status));
  // Management by exception: max 3 principale, restul grupate.
  const ranked = interactiveCards.sort((a, b) => rank(b.card) - rank(a.card));
  const primary = ranked.slice(0, 3);
  const secondary = ranked.slice(3);

  // Mesajul trece prin canonical finalizer (Constitutie/Claim Validator/traceability).
  // Actiunile fiind STRUCTURALE, nu exista actiuni ascunse (le trecem ca action_cards).
  const fin = await finalizeManagerialOutput({
    assessment: { decision_context: envelope?.situation || "", unknowns: arr(envelope?.unknowns) },
    draft: envelope?.message || "", channel, trigger: "envelope",
    executionReceipts: built.receipts, actionCards: built.cards.map((c) => ({ id: c.card.id })),
    policyReferences: arr(envelope?.policy_references), forFounder: true, llm, system, messages,
  });

  return {
    message: fin.message,
    action_cards: primary.map((c) => publicCard(c)),
    secondary_cards: secondary.map((c) => publicCard(c)),
    execution_receipts: built.receipts,
    policy_references: arr(envelope?.policy_references),
    rendering_hints: {
      primary_card_id: primary[0]?.card.id || null,
      collapse_secondary_cards: secondary.length > 0,
      notification_priority: primary.some((c) => c.card.founder_required) ? "founder" : primary.some((c) => c.card.risk_level === "high") ? "high" : "normal",
      channel_layout: channel,
      founder_attention_required: primary.some((c) => c.card.founder_required),
    },
    gate: fin.gate, hidden_actions: fin.hidden_actions,
  };
}

/**
 * FALLBACK NUMEROTAT: mapeaza un raspuns "1"/"2"/"3" la butonul unui card ACTIV.
 * Interpreteaza DOAR daca: exista exact UN card activ compatibil, numarul e valid,
 * user+conversatie corespund, cardul nu e expirat, starea nu s-a schimbat. Altfel
 * NU interpreta orice numar drept apasare. @returns { matched, card?, action_id?, token?, reason? }
 */
export async function resolveNumberedChoice(input, { user_id, conversation_id, store = null, nowMs = null } = {}) {
  const num = Number(String(input || "").trim());
  if (!Number.isInteger(num) || num < 1 || num > 9) return { matched: false, reason: "nu e un numar de optiune" };
  const { activeCards } = await import("./actionStore.js");
  const cards = await activeCards({ store, limit: 20, nowMs: nowMs || Date.now() });
  const compatible = cards.filter((c) => (!conversation_id || c.conversation_id === conversation_id) && ["PROPOSED", "APPROVED"].includes(c.status));
  if (compatible.length === 0) return { matched: false, reason: "niciun card activ" };
  if (compatible.length > 1) return { matched: false, reason: "mai multe carduri active — cere identificarea cardului", ambiguous: true };
  const card = compatible[0];
  const { renderCard } = await import("./actionCard.js");
  const rend = renderCard(card, { channelSupportsButtons: false });
  const btn = rend.buttons.find((b) => b.index === num);
  if (!btn) return { matched: false, reason: "numar in afara optiunilor cardului" };
  const token = signActionToken({ card_id: card.id, action_id: btn.action_id, user_id: user_id || "adrian", conversation_id, payload: card.execution_payload, version: card.version, expires_at: card.expires_at });
  return { matched: true, card_id: card.id, action_id: btn.action_id, token, label: btn.label, choice_label: btn.label };
}

function rank(card) {
  let r = 0;
  if (card.founder_required) r += 4;              // 1) decizie Founder Only
  if (card.risk_level === "high") r += 3;         // 2) risc material
  if (card.action_type === "INFORMATION_REQUIRED") r += 2; // deblocheaza fluxul
  if (card.financial_impact) r += 1;
  return r;
}

/** Reprezentarea PUBLICA a unui card (fara payload/token/permission internals). */
function publicCard(c) {
  const card = c.card;
  return {
    id: card.id, title: card.title, summary: card.summary, reason: card.reason,
    impact: card.financial_impact ? "material" : null, owner: card.owner,
    unknowns: arr(card.unknowns).slice(0, 3), action_type: card.action_type, status: card.status,
    risk_level: card.risk_level, founder_required: card.founder_required,
    buttons: arr(c.buttons).map((b) => ({ label: b.label, action_id: b.action_id, index: b.index || null, token: c.token_map[b.action_id] || null })),
    rendered: c.rendered,
    receipt: card.receipt ? { kind: card.receipt.kind, operational_id: card.receipt.operational_id || null } : null,
  };
}
