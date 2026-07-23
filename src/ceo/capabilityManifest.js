// CEO AI — COMPANY CAPABILITY MANIFEST (G). PUR peste config + data map.
// Pentru orice instanta de companie: ce module exista, ce surse sunt conectate,
// ce roluri, ce poate observa/propune/executa si ce cere aprobare.
// Fundatia NEW COMPANY ONBOARDING (<24h): manifest = radiografia instantei.
import { COMPANY } from "./companyConfig.js";
import { buildDataMap } from "./companyDataMap.js";
import { config } from "../config.js";

export function buildCapabilityManifest({ world = null } = {}) {
  const map = buildDataMap({ world });
  return {
    company: { id: COMPANY.id, name: COMPANY.name, brand: COMPANY.brand, timezone: COMPANY.timezone },
    roles: COMPANY.people.map((p) => ({ id: p.id, name: p.name, role: p.role })),
    modules: {
      observation_engine: config.observationEngine ? "shadow" : "off",
      proactive_pipeline: config.proactiveCeoPipeline ? "shadow" : "off",
      founder_gate: config.founderAttentionGate ? "shadow" : "off",
      daily_digest: config.founderDailyDigest ? "active" : "off",
      executive_board: config.executiveBoard ? "active" : config.executiveBoardShadow ? "shadow" : "off",
      decision_engine_6plus1: "available",
      cash_intelligence: "available",
      receivables_engine: "available",
      financing_register: "available",
      priority_engine: "available",
      command_center: "read-only + approval inbox",
      // Straturi cognitive V1 (self-model aliniat cu code truth).
      external_intelligence: config.externalIntel ? "active" : "off",
      change_events: "available",       // OPERATIONAL→JARVIS, evenimente canonice
      data_trust_score: "available",     // incredere per domeniu (5 dimensiuni)
      founder_decision_model: "available", // invata Adrian, nu yes-man
      model_reasoning_tiers: "available",  // TIER 0-3 explicit
      cognitive_trace: "available",        // trace factual per interactiune
      untrusted_input_guard: "available",  // anti prompt/tool injection
      data_contract: "available",          // contract Operational→JARVIS
      self_evolution: config.selfEvolution ? "active (sandbox, no self-deploy)" : "off",
      nervous_system: config.nervousSystem ? "active (TASKS-ONLY write)" : "off",
    },
    sources: Object.fromEntries(map.domains.map((d) => [d.domain, d.connected])),
    data_health: map.healthScore,
    can_observe: map.domains.filter((d) => d.connected !== "NOT_CONNECTED").map((d) => d.domain),
    can_propose: ["information_request", "task_proposal", "system_improvement", "decision_analysis"],
    can_execute: [], // NIMIC autonom — regula permanenta
    requires_approval: ["orice trimitere de cerere/task", "orice actiune cu efect (via approvalGate)", "orice schimbare de sistem (Change Control)"],
  };
}
