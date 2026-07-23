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
    // AUDIT can_execute (Faza 13): distinctia reala intre 3 nivele. Arhitectura A
    // (corecta): NUCLEUL cognitiv NU executa direct; DAR CommandBus (Nervous +
    // Ask CODEX) POATE executa scrieri TASKS-only sub politica, cu limite/kill/receipt.
    core_capability: {
      // Ce face nucleul cognitiv de unul singur: citeste + propune. FARA executie directa.
      read: true, propose: true, execute_directly: false,
      note: "CEO core = read + propose; nu scrie niciodata direct in Operational",
    },
    authorized_commands: {
      // Ce POATE executa prin CommandBus (operationalWrite), sub politica.
      surface: "CommandBus (operationalWrite) — UNICA suprafata de scriere",
      tools: ["create_task", "add_observation", "task_reminder"], // TASKS-only
      triggered_by: [
        config.nervousSystem ? "nervous_system (autonom, gated, limite 5/zi + 2/persoana)" : "nervous_system (off)",
        config.askCodex ? "ask_codex (comanda umana Dana/Nelu, prin ConversationMode)" : "ask_codex (off)",
      ],
      controls: ["kill switch", "limite zilnice/per-persoana", "idempotenta", "execution receipt"],
    },
    can_execute: [], // NUCLEUL nu executa direct — vezi authorized_commands pentru ce trece prin CommandBus
    forbidden_actions: [
      "plati / transferuri bancare", "inregistrari financiare/contabile", "modificare facturi/preturi",
      "contracte / juridic", "master furnizori", "utilizatori / config sistem",
      "orice scriere Operational in afara TASKS", "self-deploy in productie", "Level 3",
    ],
    requires_approval: ["orice trimitere de cerere/task cu efect extern (via approvalGate)", "orice schimbare de sistem (Change Control)", "orice deploy (doar Adrian)"],
  };
}

/**
 * Raspuns onest la "ce poti executa singur?" — distinge cele 3 nivele.
 * PUR (peste manifest). Anti-halucinatie: nu pretinde nici mai mult, nici mai putin.
 */
export function whatCanIExecute(manifest) {
  const m = manifest || buildCapabilityManifest({});
  return {
    direct_core_execution: [], // nucleul nu executa direct
    via_command_bus: m.authorized_commands.tools, // TASKS-only, sub politica
    forbidden: m.forbidden_actions,
    plain: "Nucleul meu nu scrie nimic direct. Prin CommandBus pot crea/actualiza TASK-uri (si observatii/reminder pe task), sub limite si cu confirmare. Nu pot face plati, contabilitate, contracte, preturi sau orice iese din TASKS — acelea raman la om.",
  };
}
