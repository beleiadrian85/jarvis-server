// ACTION CARDS — orice recomandare care poate conduce la o actiune devine un obiect
// structurat, clasificat pe nivel de executie (AUTO_EXECUTE/APPROVAL_REQUIRED/
// CHOICE_REQUIRED/INFORMATION_REQUIRED/FORBIDDEN). PUR (clasificare + randare).
// Executia trece prin executor.js → CommandBus (TASKS-only). Reguli: Founder Filter,
// never-autonomous list, permission basis. Nu se afiseaza JSON/payload la user.

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);

export const ACTION_TYPES = ["AUTO_EXECUTE", "APPROVAL_REQUIRED", "CHOICE_REQUIRED", "INFORMATION_REQUIRED", "FORBIDDEN"];
export const CARD_STATUSES = ["PROPOSED", "APPROVED", "REJECTED", "EXECUTING", "EXECUTED", "FAILED", "EXPIRED", "CANCELLED", "SUPERSEDED"];

// NICIODATA autonome — cer INTOTDEAUNA aprobarea explicita a fondatorului,
// indiferent de istoric. (Lista din directiva.)
export const NEVER_AUTONOMOUS = [
  "payment", "bank_transfer", "credit", "guarantee", "reschedule_debt", "contract",
  "signature", "external_financial_commitment", "sensitive_message_bank",
  "sensitive_message_client", "sensitive_message_authority", "firing", "hiring",
  "salary_change", "role_change", "sanction", "legal_decision", "policy_change",
  "irreversible_delete", "mass_data_change", "financial_threshold_change", "founder_only",
];

// Tipuri de actiune sigure, permise autonom (reversibile, risc redus, TASKS-only).
const AUTO_SAFE_TYPES = [
  "search_source", "check_status", "create_internal_task", "notify_internal_owner",
  "internal_clarification", "schedule_internal_followup", "collect_accessible_data",
];

/**
 * Clasifica o actiune propusa. @param {object} a partial ActionCard cu:
 *   action_type_hint, reversibility ('reversible'|'irreversible'|'partial'),
 *   risk_level ('low'|'medium'|'high'), financial_impact (bool/number),
 *   external_impact (bool), founder_required (bool), transfers_money (bool),
 *   legal (bool), sends_external (bool), modifies_policy (bool),
 *   alternatives (array), permission_basis, kind (semantic action kind)
 * @returns action_type ∈ ACTION_TYPES + reason
 */
export function classifyActionType(a = {}) {
  const c = isObj(a) ? a : {};
  const kind = String(c.kind || c.action_kind || "").toLowerCase();

  // 1) FORBIDDEN / never-autonomous → mereu aprobare (sau blocat daca incalca politica).
  const neverAuto = NEVER_AUTONOMOUS.includes(kind) || c.transfers_money || c.legal || c.modifies_policy ||
    c.irreversible_mass || String(c.reversibility) === "irreversible" && (c.financial_impact || c.external_impact);
  if (c.forbidden === true || (neverAuto && c.permission_basis === "denied"))
    return { action_type: "FORBIDDEN", reason: "incalca permisiunile/Constitutia/Founder Filter — nu se propune executie" };

  // 2) Bani / juridic / extern sensibil / fondator → APPROVAL_REQUIRED (buton de aprobare).
  if (neverAuto || c.founder_required || c.sends_external || c.financial_impact || c.external_impact)
    return { action_type: c.alternatives && arr(c.alternatives).length >= 2 ? "CHOICE_REQUIRED" : "APPROVAL_REQUIRED",
             reason: "necesita aprobarea/alegerea fondatorului (bani/juridic/extern/autoritate)" };

  // 3) Informatie pe care doar Adrian o stie → INFORMATION_REQUIRED.
  if (c.needs_founder_info === true)
    return { action_type: "INFORMATION_REQUIRED", reason: "diagnosticul cere o informatie pe care doar fondatorul o cunoaste" };

  // 4) Alternative manageriale reale → CHOICE_REQUIRED.
  if (arr(c.alternatives).length >= 2)
    return { action_type: "CHOICE_REQUIRED", reason: "exista alternative manageriale reale — alegerea fondatorului" };

  // 5) AUTO_EXECUTE — reversibil, risc redus, TASKS-only, fara bani/juridic/extern/fondator.
  const safe = (AUTO_SAFE_TYPES.includes(kind) || c.tasks_only === true) &&
    String(c.reversibility || "reversible") !== "irreversible" &&
    String(c.risk_level || "low") !== "high" &&
    !c.transfers_money && !c.legal && !c.sends_external && !c.founder_required && !c.modifies_policy &&
    (c.permission_basis === "role_allowed" || c.permission_basis === "tasks_only" || c.tasks_only === true);
  if (safe) return { action_type: "AUTO_EXECUTE", reason: "reversibil + risc redus + TASKS-only + permis de roluri — se executa singur, cu receipt" };

  // Implicit: cere aprobare (safe by default — nu executa fara temei clar).
  return { action_type: "APPROVAL_REQUIRED", reason: "fara temei clar de auto-executie — cere aprobare" };
}

let _seq = 0;
/** Construieste un ActionCard complet (campurile lipsa marcate, nu inventate). */
export function buildActionCard(p = {}, { nowISO = null, ttlMinutes = 1440 } = {}) {
  const c = isObj(p) ? p : {};
  const now = nowISO || new Date().toISOString();
  const cls = classifyActionType(c);
  const id = c.id || `card:${now.replace(/[^0-9]/g, "").slice(0, 17)}:${(_seq++) % 1000}`;
  const expMs = Date.parse(now) + ttlMinutes * 60_000;
  return {
    id, version: c.version || 1,
    title: String(c.title || "").slice(0, 120),
    summary: String(c.summary || "").slice(0, 400),
    reason: String(c.reason || cls.reason).slice(0, 300),
    evidence_refs: arr(c.evidence_refs), unknowns: arr(c.unknowns),
    proposed_action: c.proposed_action || null,
    alternatives: arr(c.alternatives),
    owner: c.owner || null,
    action_type: cls.action_type,
    action_kind: c.kind || c.action_kind || null,
    risk_level: c.risk_level || "low",
    reversibility: c.reversibility || "reversible",
    financial_impact: c.financial_impact ?? false,
    external_impact: c.external_impact ?? false,
    founder_required: !!c.founder_required,
    founder_reason: c.founder_reason || null,
    permission_basis: c.permission_basis || (c.tasks_only ? "tasks_only" : "unknown"),
    execution_payload: c.execution_payload || null, // NU se arata userului
    expires_at: new Date(expMs).toISOString(),
    status: "PROPOSED",
    created_at: now,
  };
}

// Butoanele standard per tip de actiune.
export function buttonsFor(card) {
  switch (card.action_type) {
    case "AUTO_EXECUTE": return []; // se executa singur; butoanele apar DUPA (Corect/Anuleaza) doar sub politica
    case "APPROVAL_REQUIRED": return ["Aproba", "Modifica", "Respinge"];
    case "CHOICE_REQUIRED": return [...arr(card.alternatives).map((a) => a.label || a).slice(0, 4), "Analizeaza alte variante"];
    case "INFORMATION_REQUIRED": return [...arr(card.alternatives).map((a) => a.label || a).slice(0, 4), "Alta locatie"];
    case "FORBIDDEN": return [];
    default: return ["Aproba", "Respinge"];
  }
}

/** Randare pentru user: mesaj scurt + butoane (SAU optiuni numerotate). Fara JSON/payload. */
export function renderCard(card, { channelSupportsButtons = true } = {}) {
  const lines = [card.title, "", card.summary].filter((x) => x !== undefined);
  if (card.unknowns?.length) lines.push(`Necunoscut: ${card.unknowns.slice(0, 3).join("; ")}`);
  const btns = buttonsFor(card);
  const body = lines.join("\n").trim();
  if (!btns.length) return { text: body, buttons: [] };
  if (channelSupportsButtons) return { text: body, buttons: btns.map((label, i) => ({ label, action_id: `a${i}` })) };
  // Fallback: optiuni numerotate (mapate la card, nu text liber).
  return { text: body + "\n\n" + btns.map((b, i) => `${i + 1}. ${b}`).join("\n"), buttons: btns.map((label, i) => ({ label, action_id: `a${i}`, index: i + 1 })) };
}

/** Optiuni de termen (nu inventa deadline daca userul nu alege + fara deadline_basis). */
export const DEADLINE_OPTIONS = ["Fara termen explicit", "Azi", "Maine", "Alege data"];
