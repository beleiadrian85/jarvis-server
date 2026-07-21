// CEO AUTONOMOUS MANAGEMENT NERVOUS SYSTEM V1 — CONTRACT.
// Keystone-ul intregului strat: constante canonice + forme (shapes) + helperi
// PURI partajati de toate motoarele. NIMIC specific companiei aici (numele
// oamenilor/compania traiesc DOAR in companyConfig.js). Nucleul e GENERIC:
// o companie noua = alt config, nu alt cod (productizare, §29-30).
//
// REGULA STRUCTURALA A FAZEI: FULL READ / TASKS-ONLY WRITE.
// CEO AI poate CITI orice sursa permisa; poate SCRIE exclusiv Task-uri in
// Operational, si doar prin operationalWrite.js (singura suprafata de scriere).

// ── Tipurile canonice de NEVOIE produse de Need Engine (§3) ─────────────
export const NEED_TYPES = ["OBSERVATION", "INFORMATION_NEED", "ACTION_NEED", "DECISION_NEED", "SYSTEM_NEED", "NO_ACTION"];

// ── Tinta de delegare (§7). RESPONSIBILITY_UNKNOWN = nu ghicim (§8). ─────
// GENERIC (§29): persoanele concrete vin prin person_id din config, niciodata
// ca literal in nucleu. FOUNDER/MANAGER/PERSON sunt roluri, nu nume.
export const DELEGATION_TARGETS = ["SYSTEM", "FOUNDER", "MANAGER", "PERSON", "BOARD", "OTHER_ROLE", "NO_ACTION", "RESPONSIBILITY_UNKNOWN"];

// ── Clasa de autonomie a unui task (§10). ───────────────────────────────
// INFORMATION_TASK = candidat la creare autonoma (dupa flag + shadow validat).
// ACTION_TASK / DECISION_TASK = intotdeauna prin aprobare, niciodata autonom.
export const AUTONOMY_CLASS = ["INFORMATION_TASK", "ACTION_TASK", "DECISION_TASK"];

// ── Ciclul de viata al unui task CEO (§13). Mapat peste statusurile reale
// Operational, nu inventat pe deasupra lor. ─────────────────────────────
export const CEO_TASK_LIFECYCLE = [
  "DETECTED", "VALIDATED", "PROPOSED", "CREATED", "ASSIGNED", "ACKNOWLEDGED",
  "IN_PROGRESS", "RESULT_SUBMITTED", "VERIFICATION", "COMPLETED",
  "FAILED", "BLOCKED", "EXPIRED", "NO_LONGER_NEEDED", "ESCALATED",
];

// Statusurile reale din tabela Operational `tasks` (constraint DB) → faza din
// ciclul CEO. Sursa: audit live opsdb (nou/in_lucru/blocat/rezolvat/
// rezolvat_partial/acceptat/respins + 'oprit' din UI).
export const OPERATIONAL_STATUS_MAP = {
  nou: "ASSIGNED",
  in_lucru: "IN_PROGRESS",
  blocat: "BLOCKED",
  rezolvat: "RESULT_SUBMITTED",
  rezolvat_partial: "IN_PROGRESS",
  acceptat: "COMPLETED",
  respins: "IN_PROGRESS", // in Operational, respins = "Respins / Revine" (seen=0, task-ul se reia)
  oprit: "EXPIRED",
};

// Statusuri Operational considerate "inchise" (nu mai sunt work activ) —
// identic cu CLOSED_STATUSES din Operational (utils/constants.js).
export const OPERATIONAL_CLOSED_STATUSES = ["acceptat", "oprit"];

// Faze CEO considerate inchise — o intrare cu lifecycle inchis NU mai
// blocheaza dedup-ul unei nevoi recurente (soldul se cere din nou maine).
export const CLOSED_LIFECYCLES = ["COMPLETED", "FAILED", "EXPIRED", "NO_LONGER_NEEDED"];

// ── Metode de verificare a rezultatului (§14). ──────────────────────────
export const VERIFICATION_METHODS = ["DATA", "STATE_CHANGE", "DOCUMENT", "USER_CONFIRMATION", "SYSTEM_CONFIRMATION", "DEPENDENCY_RESOLVED"];

// ── Actiuni de follow-up (§16) si de escaladare (§17). ──────────────────
export const FOLLOWUP_ACTIONS = ["REMINDER", "REASSIGN", "EXTEND", "ESCALATE", "CANCEL", "NO_ACTION"];

// ── Stari de incarcare a oamenilor (§20). ───────────────────────────────
export const LOAD_STATES = ["OVERLOADED", "UNDERUTILIZED", "BLOCKED", "WRONG_OWNER", "DEPENDENCY_BOTTLENECK", "FOUNDER_BOTTLENECK", "BALANCED"];

// ── Taxonomia tipurilor de task (generica; pe ea se face memoria org. si
// delegation confidence per PERSON+TASK_TYPE, §21). ─────────────────────
export const TASK_TYPES = {
  // INFORMATION (candidati la autonomie dupa validare)
  CASH_DATA: { class: "INFORMATION_TASK", label: "date de cash / solduri" },
  INVOICE_CLARIFICATION: { class: "INFORMATION_TASK", label: "clarificare factura" },
  PROGRESS_UPDATE: { class: "INFORMATION_TASK", label: "progres lucrare" },
  DEADLINE_CONFIRM: { class: "INFORMATION_TASK", label: "confirmare termen" },
  SUPPLIER_STATUS: { class: "INFORMATION_TASK", label: "status furnizor" },
  MISSING_INFO: { class: "INFORMATION_TASK", label: "informatie lipsa" },
  // ACTION (intotdeauna aprobare)
  CONTACT_SUPPLIER: { class: "ACTION_TASK", label: "contacteaza furnizor" },
  REQUEST_OFFER: { class: "ACTION_TASK", label: "cere oferta" },
  OPERATIONAL_FIX: { class: "ACTION_TASK", label: "rezolva problema operationala" },
  SALES_ACTION: { class: "ACTION_TASK", label: "actiune vanzari" },
  // DECISION (intotdeauna fondator/Board)
  FOUNDER_DECISION: { class: "DECISION_TASK", label: "decizie fondator" },
  BOARD_DECISION: { class: "DECISION_TASK", label: "decizie Board" },
  // SYSTEM (improvement — nu e task pentru un om)
  SYSTEM_IMPROVEMENT: { class: "ACTION_TASK", label: "imbunatatire sistem" },
};

export function taskClassFor(taskType) {
  return TASK_TYPES[taskType]?.class || "ACTION_TASK";
}

// ── TASK_VALUE_SCORE (§4). Un task se creeaza doar daca NO ACTION →
// MATERIAL CONSEQUENCE. Dimensiuni de scor (0-100 total). ────────────────
export const TASK_VALUE_FIELDS = [
  "financial_impact", "risk", "urgency", "dependencies",
  "information_value", "operational_impact", "reversibility", "cost_of_inaction",
];
// Sub acest prag → AUDIT_ONLY (se consemneaza, NU devine task).
export const TASK_VALUE_THRESHOLD = 35;

// ── Maparea severitate/urgenta → prioritate Operational (enum real DB). ──
export const OPERATIONAL_PRIORITIES = ["critic", "ridicat", "normal", "scazut"];
export function priorityToOperational(score = 0, urgencyDays = null) {
  if (score >= 75 || (urgencyDays != null && urgencyDays <= 1)) return "critic";
  if (score >= 55 || (urgencyDays != null && urgencyDays <= 3)) return "ridicat";
  if (score >= 35) return "normal";
  return "scazut";
}

// ── Proiectele reale Operational (enum DB) — pentru rutarea task-ului. ───
export const OPERATIONAL_PROJECTS = ["C3 Cl. Șurii Mici", "Hipodromului", "Birou", "Marșa", "Altele"];

// ── Modul de autonomie al scrierii (§11). SHADOW nu scrie NICIODATA. ─────
export const TASK_AUTONOMY_MODES = ["shadow", "information"];

// ── FORMA CANONICA A UNEI NEVOI (produsa de needEngine, consumata de tot). ─
// {
//   need_id,            // determinist: "need:<domain>:<slug>"
//   type,               // NEED_TYPES
//   title,              // scurt, uman
//   summary,            // ce anume lipseste/e in neregula
//   domain,             // CASH / SALES / PROJECT / SMARTBILL / PEOPLE / ...
//   task_type,          // cheie din TASK_TYPES (sau null pentru OBSERVATION/NO_ACTION)
//   evidence: [],       // [source] concrete, niciodata inventate
//   material_consequence,  // ce se strica daca NU facem nimic (obligatoriu pt. task)
//   expected_change,    // ce stare se schimba daca actionam (§4: NEED→ACTION→CHANGE)
//   suggested_owner_hint,  // hint (nume) DOAR daca deriva din date; altfel null (nu ghicim)
//   urgency_days,       // number | null
//   confidence,         // 0-100 (increderea in semnal)
//   reasoning: {}       // raspunsurile la cele 15 intrebari (metabolism, §3)
// }

// ── FORMA CANONICA A UNUI TASK CEO (produsa de taskOrchestrator, §5). ────
// internal: {
//   task_title, owner, why, trigger, source, expected_result, deadline,
//   priority, severity, confidence, verification_method, dependencies,
//   next_step_if_failed, escalation_path, created_by:"CEO_AI",
//   ceo_need_id, ceo_episode_id, idempotency_key, autonomy_class, task_type
// }
// human: { title, why, deadline, expected_result }   // §6 — omul NU vede eseul
// operational_payload: { title, description, assignee, created_by, project,
//                        priority, deadline, acceptance_criteria }  // pt. create_task

// ── Chei jarvis_state (aditive, nu suprascriu nimic existent). ──────────
export const STATE_KEYS = {
  tasks: "ceo:nervous:tasks",        // registrul task-urilor originate de CEO
  stream: "ceo:nervous:stream",      // activity stream auditabil (§26)
  memory: "ceo:nervous:memory",      // memoria organizationala (§21)
  selfeval: "ceo:nervous:selfeval",  // metrici auto-evaluare (§22)
  last: "ceo:nervous:last",          // ultimul snapshot de ciclu (pt. UI /organism)
  cooldown: "ceo:nervous:cooldown",  // cooldown-uri dedup (§12)
  limits: "ceo:nervous:limits",      // contoare zilnice/per-persoana (§34)
  respmap: "ceo:nervous:respmap",    // ultima harta de responsabilitati observata
};

// Limite implicite pentru activarea controlata (§34) — recomandari, override env.
export const DEFAULT_LIMITS = {
  daily_total: 5,
  per_person: 2,
  dedup_cooldown_hours: 20,   // nu cere aceeasi informatie de 2x intr-o zi de lucru
};

// ── Helperi PURI partajati ──────────────────────────────────────────────

/** Normalizare tokeni (diacritice ro) — identic cu nervousSystem.tokens, pt.
 *  similaritate semantica deterministca (fara embeddings). */
export function tokens(s) {
  return new Set(
    String(s || "").toLowerCase()
      .replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t")
      .split(/[^a-z0-9]+/).filter((x) => x.length > 3)
  );
}

/** Similaritate Jaccard 0..1 intre doua texte (dedup, §12). PUR.
 *  Tokenii se reduc la un pseudo-stem (primele 5 caractere) ca flexiunile
 *  romanesti sa se potriveasca ("soldurile" ≈ "solduri", "bancare" ≈ "banca"). */
export function textSimilarity(a, b) {
  const stem = (set) => new Set([...set].map((t) => t.slice(0, 5)));
  const A = stem(tokens(a)), B = stem(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Slug scurt determinist dintr-un text. PUR. */
export function slug(s, n = 40) {
  return String(s || "").toLowerCase()
    .replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, n);
}

/** Cheie de idempotenta deterministca pentru o nevoie (§5, §12, Q/R din §28).
 *  Aceeasi nevoie (domeniu + tip + esenta) → aceeasi cheie → un singur task. PUR. */
export function idempotencyKey(need) {
  const base = `${need.domain || "?"}|${need.task_type || need.type || "?"}|${slug(need.title || need.summary || "", 60)}`;
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) | 0;
  return `idem:${(h >>> 0).toString(36)}`;
}

/** Mapare status Operational → faza din ciclul CEO. PUR. */
export function mapOperationalStatus(status) {
  return OPERATIONAL_STATUS_MAP[String(status || "").toLowerCase()] || "IN_PROGRESS";
}

/** Numar de zile intre doua date ISO (poate fi negativ). PUR. */
export function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO), b = new Date(toISO);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

// ── COMPANY NERVOUS SYSTEM CONTRACT (§30) — primitivele generice cu care
// CEO AI invata o companie noua. Descriptiv; instanta reala vine din
// companyConfig.js + Founder DNA + People Map. ──────────────────────────
export const NERVOUS_CONTRACT_PRIMITIVES = [
  "COMPANY_SOURCES", "PEOPLE", "ROLES", "RESPONSIBILITIES", "NEEDS",
  "TASKS", "DECISIONS", "RESULTS", "METRICS", "POLICIES", "APPROVAL_LEVELS",
];
