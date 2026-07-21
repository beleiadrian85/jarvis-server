// NERVOUS SYSTEM V1 §5, §6, §10 — TASK ORCHESTRATOR.
// Transforma o NEVOIE validata + o tinta de delegare intr-un TASK CEO complet:
// forma interna cu toate campurile de management (§5), forma umana scurta —
// omul NU vede eseul (§6) — si payload-ul MCP create_task gata de scris prin
// operationalWrite. Tot aici se decide banda de autonomie (§10): shadow /
// autonom pe informatie / aprobare obligatorie.
// MODUL PUR: functii deterministe peste argumente — ZERO IO, zero nume
// hardcodate; oamenii si proiectele vin exclusiv prin argumente.
import { idempotencyKey, taskClassFor, priorityToOperational, VERIFICATION_METHODS } from "./contract.js";

// ── CONSTANTE INTERNE ───────────────────────────────────────────────────

// Orizont implicit (zile) cand nevoia nu are urgency_days — conservator:
// nu forteaza prioritate pe urgenta inventata, doar da un termen de lucru.
const DEFAULT_HORIZON_DAYS = 7;

// Maparea task_type → metoda de verificare (§14); restul cad pe confirmare umana.
const VERIFICATION_BY_TASK_TYPE = {
  CASH_DATA: "DATA",
  INVOICE_CLARIFICATION: "DATA",
  PROGRESS_UPDATE: "USER_CONFIRMATION",
};

// Pasul urmator determinist la esec (§16-§17) — text fix, fara improvizatie.
const NEXT_STEP_IF_FAILED = "follow-up conform politicii, apoi escaladare pe escalation_path";

// ── HELPERI INTERNI ─────────────────────────────────────────────────────

/** Titlu scurt (max ~60 caractere), taiat la limita de cuvant. */
function shortTitle(s, max = 60) {
  const t = String(s || "").trim().replace(/\s+/g, " ");
  if (!t) return "UNKNOWN";
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > 20 ? cut.slice(0, sp) : cut).replace(/[,;:\-\s]+$/, "");
}

/** O SINGURA fraza dintr-un text (pana la primul semn de final de fraza). */
function oneSentence(s) {
  const t = String(s || "").trim().replace(/\s+/g, " ");
  if (!t) return "UNKNOWN";
  const m = /^[^.!?]*[.!?]?/.exec(t);
  const first = (m ? m[0] : t).trim();
  return first || t;
}

/** Primul element de evidenta ca text; lipsa dovezii = UNKNOWN, nu inventie. */
function triggerFrom(need) {
  const e = Array.isArray(need.evidence) && need.evidence.length ? need.evidence[0] : null;
  if (e == null) return "UNKNOWN";
  if (typeof e === "string") return e;
  return e.source || e.summary || e.title || JSON.stringify(e);
}

/** Severitate derivata din scorul de valoare; fara scor = UNKNOWN. */
function severityFor(score) {
  const s = Number(score);
  if (score == null || !Number.isFinite(s)) return "UNKNOWN";
  if (s >= 75) return "CRITICAL";
  if (s >= 55) return "HIGH";
  if (s >= 35) return "MEDIUM";
  return "LOW";
}

/** Metoda de verificare pentru un task_type — garantat din VERIFICATION_METHODS. */
function verificationFor(taskType) {
  const v = VERIFICATION_BY_TASK_TYPE[taskType] || "USER_CONFIRMATION";
  return VERIFICATION_METHODS.includes(v) ? v : "USER_CONFIRMATION";
}

/** Deadline YYYY-MM-DD: asOf + urgency_days, minim asOf+1 zi. */
function deadlineFrom(asOf, urgencyDays) {
  const base = asOf ? new Date(asOf) : new Date();
  const b = isNaN(base) ? new Date() : base;
  const u = Number(urgencyDays);
  const days = urgencyDays != null && Number.isFinite(u) ? Math.max(1, Math.ceil(u)) : DEFAULT_HORIZON_DAYS;
  return new Date(b.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

// ── CONSTRUCTIA TASK-ULUI CEO (§5, §6) ──────────────────────────────────

/**
 * Construieste task-ul CEO complet dintr-o nevoie + delegare:
 * { internal, human, operational_payload, idempotency_key, autonomy_class }.
 * internal = fisa completa de management (§5); human = 4 campuri, fara eseu
 * (§6); operational_payload = payload MCP create_task real, gata de scris.
 */
export function buildCeoTask(need = {}, delegation = {}, { asOf = null, formUrl = "", episodeId = null, projects = [], defaultProject = "Altele", createdByUserId = null } = {}) {
  const idemKey = idempotencyKey(need);
  const autonomyClass = taskClassFor(need.task_type);
  const deadline = deadlineFrom(asOf, need.urgency_days);
  const verificationMethod = verificationFor(need.task_type);

  // De ce: consecinta materiala + schimbarea asteptata (§4: NEED→ACTION→CHANGE).
  const whyParts = [need.material_consequence, need.expected_change].filter(Boolean);
  const why = whyParts.length ? whyParts.join(" → ") : "UNKNOWN";
  const taskTitle = String(need.title || need.summary || "").trim() || "UNKNOWN";
  const expectedResult = String(need.expected_change || need.summary || "").trim() || "UNKNOWN";
  const trigger = triggerFrom(need);

  const internal = {
    task_title: taskTitle,
    owner: delegation.person_id ?? null,
    why,
    trigger,
    source: "ceo-nervous-system",
    expected_result: expectedResult,
    deadline,
    priority: priorityToOperational(need.value?.total, need.urgency_days),
    severity: need.severity || severityFor(need.value?.total),
    confidence: need.confidence ?? null,
    verification_method: verificationMethod,
    dependencies: need.dependencies || [],
    next_step_if_failed: NEXT_STEP_IF_FAILED,
    escalation_path: delegation.escalation_path ?? null,
    created_by: "CEO_AI",
    ceo_need_id: need.need_id ?? null,
    ceo_episode_id: episodeId,
    idempotency_key: idemKey,
    autonomy_class: autonomyClass,
    task_type: need.task_type ?? null,
  };

  // Forma umana (§6): titlu scurt imperativ, un singur "de ce", termen, rezultat.
  const human = {
    title: shortTitle(taskTitle),
    why: oneSentence(need.material_consequence || need.summary),
    deadline,
    expected_result: oneSentence(expectedResult),
  };

  // Payload-ul MCP create_task real — singurul lucru care pleaca spre Operational.
  const description =
    `De ce: ${human.why}\nRezultat asteptat: ${human.expected_result}\nTermen: ${deadline}` +
    (formUrl ? `\nFormular: ${formUrl}` : "") +
    `\n\n[CEO AI] Nevoie: ${internal.ceo_need_id} · Trigger: ${trigger}`;

  const operational_payload = {
    title: human.title,
    description,
    assignee: delegation.person_id ?? null,
    ...(createdByUserId != null ? { created_by: createdByUserId } : {}),
    project: projects.includes(need.project_hint) ? need.project_hint : defaultProject,
    priority: internal.priority,
    deadline,
    acceptance_criteria: `${human.expected_result} (verificare: ${verificationMethod})`,
  };

  return { internal, human, operational_payload, idempotency_key: idemKey, autonomy_class: autonomyClass };
}

// ── BANDA DE AUTONOMIE (§10) ────────────────────────────────────────────

/**
 * Decide banda de executie a unui task CEO:
 *  - SHADOW: orice mod diferit de "information" — simulare, zero scrieri;
 *  - AUTONOMOUS_OK: DOAR mod "information" + flag activ + INFORMATION_TASK;
 *  - NEEDS_APPROVAL: orice ACTION_TASK/DECISION_TASK, intotdeauna (§10),
 *    si orice INFORMATION_TASK cat timp flagul autonom e stins.
 * Accepta atat rezultatul buildCeoTask cat si forma interna direct.
 */
export function classifyForAutonomy(task, { mode = "shadow", autonomousInfoEnabled = false } = {}) {
  const cls = task?.autonomy_class || task?.internal?.autonomy_class || taskClassFor(task?.task_type);

  if (mode !== "information") {
    return { lane: "SHADOW", why: `mod "${mode}": doar simulare, nicio scriere in Operational` };
  }
  if (cls !== "INFORMATION_TASK") {
    return { lane: "NEEDS_APPROVAL", why: `clasa ${cls} cere aprobare umana intotdeauna (§10)` };
  }
  if (!autonomousInfoEnabled) {
    return { lane: "NEEDS_APPROVAL", why: "flag de autonomie pe informatie inactiv — cere aprobare" };
  }
  return { lane: "AUTONOMOUS_OK", why: "INFORMATION_TASK in mod information cu flag activ" };
}
