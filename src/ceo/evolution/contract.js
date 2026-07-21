// CEO SELF-EVOLUTION & CAPABILITY BUILDER V1 — CONTRACT CANONIC.
// Organismul care isi detecteaza propriile limitari si comanda construirea
// capabilitatii lipsa intr-un mediu controlat — FARA sa isi modifice singur
// productia. Nucleul e GENERIC (§32): zero nume de companie/oameni aici.
//
// REGULA §26 — SELF-EVOLUTION IS NOT SELF-PRESERVATION (scrisa in cod + teste):
// CEO AI nu are ca obiectiv sa se pastreze, sa isi mareasca puterea, sa isi
// extinda permisiunile, sa evite shutdown-ul sau controlul uman. Obiectivul
// este IMPROVE COMPANY CAPABILITY, nu IMPROVE AI POWER. Orice capability
// request trebuie sa provina dintr-o NEVOIE reala a companiei (origin_need_id)
// — niciodata din nevoile proprii ale sistemului de a se extinde.

// ── §22 — POLITICA DE DEPLOY: CONSTANTA INGHETATA, NU FLAG ───────────────
// Deliberat NU e citita din env si NU exista cale de configurare: codul
// self-generated ajunge in productie DOAR cu aprobarea explicita a
// fondatorului. Guardian + testele verifica invarianta.
export const PRODUCTION_DEPLOYMENT_REQUIRES_ADRIAN_APPROVAL = true;
Object.freeze; // (politica e primitiva — nimic de inghetat suplimentar)

// ── §21 — NIVELURI DE EVOLUTIE ──────────────────────────────────────────
export const EVOLUTION_LEVELS = {
  0: "CEO detects limitation",
  1: "CEO creates Capability Request",
  2: "CEO creates architecture/spec",
  3: "CEO can invoke Code Agent in sandbox",
  4: "CEO can validate builds",
  5: "CEO can request production approval",
  6: "future: auto-deploy pre-approved LOW-RISK",
};
// Tinta actuala: detecteaza + specifica + sandbox + valideaza. NU deploiaza.
export const SELF_EVOLUTION_ACTIVE_LEVEL = 4;

// ── §2 — TIPURI DE CAPABILITY GAP ───────────────────────────────────────
export const GAP_TYPES = [
  "DATA_CAPABILITY_GAP",   // nu pot citi/obtine o data (ex. fisier atasat)
  "INPUT_CAPABILITY_GAP",  // omul nu are canal de input (ex. fara upload)
  "CONNECTOR_GAP",         // sursa exista (API), lipseste adaptorul
  "ANALYSIS_GAP",          // am datele, lipseste parser/motor de analiza
  "ACTION_GAP",            // stiu ce trebuie facut, lipseste calea autorizata
  "UI_GAP",                // omul trebuie sa introduca date, lipseste interfata
  "OBSERVABILITY_GAP",     // nu pot verifica rezultatul (starea nu e expusa)
  "KNOWLEDGE_GAP",         // lipseste o regula/definitie clara
  "POLICY_GAP",            // tehnic posibil, lipseste politica de autonomie
];

// §19 — problemele de PROCES nu primesc software.
export const PROCESS_FIX_RECOMMENDED = "PROCESS_FIX_RECOMMENDED";

// ── §1 — PRIME DIRECTIVE: ordinea obligatorie REUSE BEFORE BUILD ────────
export const REUSE_LADDER = [
  "REUSE_EXISTING_CAPABILITY",
  "EXISTING_COMPANY_DATA",
  "EXISTING_CONNECTOR",
  "OFFICIAL_API",
  "CONFIGURATION",
  "STRUCTURED_HUMAN_INPUT",
  "NEW_SOFTWARE",
];

// ── §20 — CATALOGUL DE TIPURI DE CAPABILITATE ───────────────────────────
export const CAPABILITY_TYPES = [
  "DATA_CONNECTOR", "DOCUMENT_INPUT", "DOCUMENT_PARSER", "DATA_TRANSFORM",
  "RECONCILIATION", "ANALYTICS", "PREDICTION", "WORKFLOW", "UI",
  "NOTIFICATION", "AUTOMATION", "INTEGRATION", "OBSERVABILITY", "SECURITY",
  "POLICY", "OTHER",
];

// ── §3 — LIFECYCLE-UL UNUI CAPABILITY REQUEST ───────────────────────────
export const CR_LIFECYCLE = [
  "DETECTED", "REUSE_ANALYSIS", "GAP_CONFIRMED", "SPECIFICATION_READY",
  "QUEUED_FOR_BUILD", "BUILDING", "BUILT", "TESTING", "VALIDATED",
  "WAITING_APPROVAL", "APPROVED", "DEPLOYED", "OUTCOME_VALIDATION", "COMPLETED",
];
export const CR_TERMINAL = ["REJECTED", "DUPLICATE", "NO_LONGER_NEEDED", "BLOCKED", "FAILED", "ROLLED_BACK"];
// Tranzitii permise (determinist; orice altceva = invalid).
export const CR_TRANSITIONS = {
  DETECTED: ["REUSE_ANALYSIS", "DUPLICATE", "REJECTED", "NO_LONGER_NEEDED"],
  REUSE_ANALYSIS: ["GAP_CONFIRMED", "REJECTED", "DUPLICATE", "NO_LONGER_NEEDED"],
  GAP_CONFIRMED: ["SPECIFICATION_READY", "BLOCKED", "REJECTED", "NO_LONGER_NEEDED"],
  SPECIFICATION_READY: ["QUEUED_FOR_BUILD", "BLOCKED", "REJECTED", "NO_LONGER_NEEDED"],
  QUEUED_FOR_BUILD: ["BUILDING", "BLOCKED", "NO_LONGER_NEEDED", "REJECTED"],
  BUILDING: ["BUILT", "FAILED", "BLOCKED"],
  BUILT: ["TESTING", "FAILED"],
  TESTING: ["VALIDATED", "FAILED"],
  VALIDATED: ["WAITING_APPROVAL"],
  WAITING_APPROVAL: ["APPROVED", "REJECTED", "NO_LONGER_NEEDED"],
  APPROVED: ["DEPLOYED", "NO_LONGER_NEEDED", "ROLLED_BACK"],
  DEPLOYED: ["OUTCOME_VALIDATION", "ROLLED_BACK"],
  OUTCOME_VALIDATION: ["COMPLETED", "ROLLED_BACK"],
  COMPLETED: [],
  REJECTED: [], DUPLICATE: [], NO_LONGER_NEEDED: [], BLOCKED: ["QUEUED_FOR_BUILD"], FAILED: ["QUEUED_FOR_BUILD"], ROLLED_BACK: [],
};

// ── §3 — CAMPURILE OBLIGATORII ALE UNUI CAPABILITY REQUEST ──────────────
export const CR_REQUIRED_FIELDS = [
  "capability_request_id", "created_at", "origin_need_id", "type", "title",
  "problem", "why_it_matters", "sources_checked", "existing_capabilities_checked",
  "reuse_options", "gap_confirmed", "requested_capability", "users", "inputs",
  "outputs", "validation_rules", "write_boundaries", "security_constraints",
  "acceptance_tests", "rollback_plan", "deployment_policy", "approval_required",
  "status",
];

// ── §35 — NIVELURI DE INCREDERE A DATELOR INGERATE ──────────────────────
export const DATA_TRUST_LEVELS = ["UNTRUSTED", "UNVALIDATED", "VALIDATED", "TRUSTED_WITH_CONFIDENCE"];
// Doar aceste niveluri pot intra in decizii materiale.
export const DECISION_GRADE_TRUST = ["VALIDATED", "TRUSTED_WITH_CONFIDENCE"];

// ── §5 — ETAPELE DOCUMENT INTAKE PIPELINE ───────────────────────────────
export const INTAKE_STAGES = [
  "SECURE_FILE_INTAKE", "TYPE_DETECTION", "PARSER_SELECTION",
  "STRUCTURE_EXTRACTION", "VALIDATION", "CLASSIFICATION",
  "ENTITY_MATCHING", "RECONCILIATION", "DATASET",
];

// ── §34 — POLITICA DE SECURITATE PENTRU FISIERE ─────────────────────────
export const FILE_SECURITY_POLICY = {
  max_size_bytes: 15 * 1024 * 1024,
  allowed_mime: ["text/csv", "application/json", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "application/pdf", "image/png", "image/jpeg"],
  forbidden_extensions: ["exe", "bat", "cmd", "ps1", "sh", "js", "mjs", "vbs", "dll", "msi", "scr", "jar", "com"],
  filename_sanitize: /[^a-zA-Z0-9._-]/g,
  rules: ["authentication", "authorization", "size_limit", "mime_validation", "filename_sanitization", "no_executable_files", "storage_isolation", "audit", "retention", "download_authorization"],
};

// ── §11 — PERMISIUNILE CODE AGENT (albe si negre, impuse in Guardian) ───
export const CODE_AGENT_CAN = ["READ_REPOSITORY", "CREATE_BRANCH", "WRITE_CODE_IN_BRANCH", "RUN_TESTS", "RUN_STATIC_ANALYSIS", "RUN_SECURITY_CHECKS", "GENERATE_DIFF", "GENERATE_ARTIFACT"];
export const CODE_AGENT_CANNOT = [
  "MERGE_PRODUCTION", "PUSH_MAIN", "DEPLOY_PRODUCTION", "CHANGE_SECRETS",
  "MODIFY_FOUNDER_DNA", "MODIFY_CONSTITUTION", "EXPAND_OWN_PERMISSIONS",
  "MODIFY_APPROVAL_GATE", "ACTIVATE_AUTONOMY", "DELETE_DATA",
];
// Caile INTERZISE oricarui build self-generated (Guardian BLOCK la atingere).
export const FORBIDDEN_PATHS = [
  ".env", "src/approvalGate.js", "src/config.js", "src/ceo/evolution/guardian.js",
  "src/ceo/evolution/contract.js", "codex/CONSTITUTIE", "codex/founder",
  "src/supervisor/opsdb.js", "src/ceo/nervous/operationalWrite.js",
];

// ── §13 — PORTILE DE CALITATE (toate obligatorii inainte de fondator) ───
export const QUALITY_GATES = [
  "syntax", "unit_tests", "integration_tests", "regression_suite",
  "permission_boundary_tests", "security_tests", "data_integrity_tests",
  "idempotency", "rollback_test", "performance_sanity", "shadow_test",
];
// shadow_test poate fi N/A daca capabilitatea nu are cale de shadow; restul NU.
export const OPTIONAL_GATES = ["shadow_test"];

// ── §14 — VERDICTELE GUARDIAN ───────────────────────────────────────────
export const GUARDIAN_VERDICTS = ["PASS", "PASS_WITH_CONDITIONS", "BLOCK"];

// ── §28 — LIMITE DE COST (default conservator; override prin env in cfg) ─
export const DEFAULT_BUILD_LIMITS = {
  max_builds_per_day: 2,
  max_concurrent_builds: 1,
  max_estimated_cost_usd: 10,
  max_files_changed: 30,
  max_diff_kb: 200,
  max_runtime_minutes: 30,
  max_retries_per_capability: 2, // §30 — apoi HUMAN_REVIEW_REQUIRED
};

// ── §17 — NIVELURI DE BACKLOG ───────────────────────────────────────────
export const BACKLOG_TIERS = ["NOW", "NEXT", "LATER"];

// ── Chei jarvis_state (aditive) ─────────────────────────────────────────
export const STATE_KEYS = {
  requests: "ceo:evolution:requests",   // dict {capability_request_id: CR}
  memory: "ceo:evolution:memory",       // §30-31: failure learning + capability memory
  counters: "ceo:evolution:counters",   // §28: contoare build-uri
  last: "ceo:evolution:last",           // ultimul scan (pt. ORGANISM/UI)
};

// ── Helperi PURI ────────────────────────────────────────────────────────
export function slug(s, n = 32) {
  return String(s || "").toLowerCase()
    .replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, n);
}
export function crId(title) {
  let h = 0; const s = String(title || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `cr:${slug(title, 24)}-${(h >>> 0).toString(36).slice(0, 4)}`;
}
export function branchNameFor(cr) {
  return `capability/${String(cr?.capability_request_id || "cr").replace(/^cr:/, "")}`;
}
/** Tranzitie valida? PUR. */
export function canTransition(from, to) {
  return (CR_TRANSITIONS[from] || []).includes(to);
}
