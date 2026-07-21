// CODE AGENT ORCHESTRATOR (§10-12, §33) — motor PUR de comanda a buildurilor.
// Rol: transforma un Capability Request validat intr-un BUILD_REQUEST complet
// (contractul §10) pentru un Code Agent extern, printr-o interfata GENERICA
// de provideri — NIMIC hardcodat in motor, providerul se alege prin argument.
// NU executa nimic real: simulateSandboxBuild produce doar un raport SIMULAT,
// fundatia contractuala pentru Level 3 (§21). Build real = stop-point care
// cere aprobarea fondatorului (§38). ZERO IO.

import { FORBIDDEN_PATHS, CODE_AGENT_CANNOT, branchNameFor } from "./contract.js";

// ── §10 — Registrul generic de provideri de Code Agent ──────────────────
// Interfata e generica: motorul nu stie nimic despre un provider anume;
// providerul folosit vine intotdeauna prin argument, nu din acest registru.
export const CODE_AGENT_PROVIDERS = [
  { name: "claude-code", kind: "cli", available: true, notes: "provider implicit" },
  { name: "codex", kind: "cli", available: false, notes: "provider viitor" },
];

// ── §11-12 — Constrangeri arhitecturale OBLIGATORII in orice build ──────
const MANDATORY_ARCHITECTURE_CONSTRAINTS = [
  "CORE generic — zero nume de companie",
  "FULL READ / TASKS-ONLY WRITE neatins",
  "flag-gated, shadow-first",
];

// ── §10 — BUILD_REQUEST ─────────────────────────────────────────────────

export function buildBuildRequest(cr = {}, { repository = "", provider = "claude-code", allowedPaths = [], testsRequired = [], asOf = null } = {}) {
  // Constrangerile obligatorii intra intotdeauna; cele din CR se adauga.
  const extra = Array.isArray(cr.architecture_constraints) ? cr.architecture_constraints : [];
  const architecture_constraints = [...new Set([...MANDATORY_ARCHITECTURE_CONSTRAINTS, ...extra])];

  return {
    capability_request_id: cr.capability_request_id ?? null,
    provider,
    repository,
    as_of: asOf,
    branch_policy: { branch: branchNameFor(cr), base: "main", direct_push_main: false },
    scope: cr.requested_capability ?? null,
    architecture_constraints,
    allowed_paths: Array.isArray(allowedPaths) ? [...allowedPaths] : [],
    forbidden_paths: [...FORBIDDEN_PATHS],
    tests_required: Array.isArray(testsRequired) ? [...testsRequired] : [],
    // §11 — lista neagra completa devine reguli de securitate ale buildului.
    security_rules: [...CODE_AGENT_CANNOT],
    write_boundaries: ["jarvis_state aditiv", "zero schema Operational"],
    acceptance_tests: Array.isArray(cr.acceptance_tests) ? [...cr.acceptance_tests] : cr.acceptance_tests ?? null,
    rollback: cr.rollback_plan ?? null,
    // §22 — politica e inghetata; Guardian blocheaza orice alta valoare.
    deployment_policy: "PRODUCTION_DEPLOYMENT_REQUIRES_ADRIAN_APPROVAL",
    external_knowledge_policy: "§33: doar documentatie oficiala/repo existent; endpoint necunoscut → NEED_RESEARCH, nu ghici",
  };
}

// ── §21 Level 3 — build SIMULAT in sandbox ──────────────────────────────
// NU executa nimic real; e doar forma contractuala a raportului pe care un
// Code Agent real l-ar produce. Un raport simulat NU demonstreaza nicio
// poarta de calitate — evaluateQualityGates il va pica (nedemonstrat = picat).

export function simulateSandboxBuild(buildRequest = {}, { outcome = "success" } = {}) {
  const success = outcome === "success";
  return {
    simulated: true,
    branch: buildRequest?.branch_policy?.branch ?? null,
    diff_summary: { files_changed: 0, insertions: 0, deletions: 0 },
    // outcome != "success" simuleaza un build picat (pt. teste de flux).
    tests: { passed: 0, failed: success ? 0 : 1 },
    security_report: "SIMULATED",
    risk_report: "SIMULATED",
    artifacts: [],
    deployment_recommendation: "WAITING_APPROVAL",
    note: "build real = stop-point care cere aprobarea fondatorului (§38)",
  };
}
