// SELF-EVOLUTION V1 — barrel. GATED: CEO_SELF_EVOLUTION_ENABLED=off → dormant.
// Scanarea ruleaza dupa ciclul Nervous (hook in nervous/cycle.js, best-effort)
// si manual prin POST /api/ceo/evolution-scan. Zero build real, zero deploy —
// politica de productie e constanta inghetata in contract.js (§22).
export { runEvolutionScan, decideCapability } from "./cycle.js";
export * from "./contract.js";
export { runReuseAnalysis, classifyGap, detectGapsFromSignals } from "./gapEngine.js";
export { buildCapabilityRequest, validateCapabilityRequest, transitionRequest, dedupCapability } from "./capabilityRequest.js";
export { scoreCapability, recommendBuild, rankBacklog } from "./roiEngine.js";
export { buildGraph, readiness, topologicalOrder } from "./dependencyGraph.js";
export { activeBuildLimits, checkBuildAllowed } from "./costControl.js";
export { recordBuildFailure, needsHumanReview, recordCapabilityOutcome, reviewCapabilityUsage } from "./capabilityMemory.js";
export { PARSER_REGISTRY, selectParser, listParsers, fileSecurityCheck } from "./parserRegistry.js";
export { discoverSchema, proposeMapping, extractDataset } from "./schemaDiscovery.js";
export { runIntake } from "./documentIntake.js";
export { CODE_AGENT_PROVIDERS, buildBuildRequest, simulateSandboxBuild } from "./codeAgentOrchestrator.js";
export { evaluateQualityGates } from "./qualityGate.js";
export { guardianReview, isForbiddenPath } from "./guardian.js";
