// MULTI-MODEL REGISTRY (§10-§15) — modelele sunt MOTOARE de rationament, NU surse
// de adevar. Fiecare provider are un ModelCapabilityProfile: capabilitati, clase de
// date permise (matrice de acces), trust, cost, latenta, flag (implicit OFF). Niciun
// provider nu scrie memoria sau Operational. PUR (definitii); apelul e injectat.
import { config } from "../../config.js";
import { hasKeyCached } from "./keyStore.js";

// data_classifications_allowed = matricea de acces la date (§19). RESTRICTED lipseste
// din listele externilor => nu ajunge niciodata la un model extern.
export const PROVIDERS = {
  anthropic: {
    id: "anthropic", label: "Claude (Anthropic)", trust: "external", flag: "anthropic",
    capabilities: ["reasoning", "managerial", "structured_output", "document_analysis", "safety"],
    data_classifications_allowed: ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "HIGHLY_CONFIDENTIAL"],
    supports_tools: true, supports_json_schema: true, cost_class: "MEDIUM", latency_class: "MEDIUM",
    costPer1kIn: 0.003, costPer1kOut: 0.015,
  },
  openai: {
    id: "openai", label: "ChatGPT (OpenAI)", trust: "external", flag: "openai",
    capabilities: ["reasoning", "strategy", "structured_output", "brainstorm", "drafting"],
    data_classifications_allowed: ["PUBLIC", "INTERNAL", "CONFIDENTIAL"],
    supports_tools: true, supports_json_schema: true, cost_class: "MEDIUM", latency_class: "MEDIUM",
    costPer1kIn: 0.0025, costPer1kOut: 0.01,
  },
  google: {
    id: "google", label: "Gemini (Google)", trust: "external", flag: "google",
    capabilities: ["long_context", "research", "document_analysis"],
    data_classifications_allowed: ["PUBLIC", "INTERNAL"],
    supports_tools: false, supports_json_schema: true, cost_class: "LOW", latency_class: "MEDIUM",
    costPer1kIn: 0.0012, costPer1kOut: 0.005,
  },
  private: {
    id: "private", label: "Model privat (self-hosted)", trust: "private", flag: "privateModel",
    capabilities: ["reasoning", "restricted_data", "document_analysis"],
    data_classifications_allowed: ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "HIGHLY_CONFIDENTIAL", "RESTRICTED"],
    supports_tools: false, supports_json_schema: false, cost_class: "NONE", latency_class: "HIGH",
    costPer1kIn: 0, costPer1kOut: 0,
  },
};

/** Profilul canonic (§10), inclusiv starea de activare. */
export function capabilityProfile(id) {
  const p = PROVIDERS[id]; if (!p) return null;
  return {
    provider: p.id, model: modelFor(id), capabilities: p.capabilities,
    data_classifications_allowed: p.data_classifications_allowed,
    supports_tools: p.supports_tools, supports_json_schema: p.supports_json_schema,
    max_context: null, cost_class: p.cost_class, latency_class: p.latency_class,
    trust: p.trust, enabled: providerEnabled(id),
  };
}
export function allProfiles() { return Object.keys(PROVIDERS).map(capabilityProfile); }

function modelFor(id) {
  if (id === "openai") return config.strategyModel;
  if (id === "google") return config.googleModel;
  if (id === "anthropic") return config.model || "claude";
  if (id === "private") return config.privateModel;
  return null;
}

/** Providerul are voie sa vada aceasta clasa de date? (matrice de acces §19) */
export function providerAllowsClass(id, sensitivity) {
  const p = PROVIDERS[id]; if (!p) return false;
  return p.data_classifications_allowed.includes(String(sensitivity || "INTERNAL").toUpperCase());
}

const _ORDER = { PUBLIC: 0, INTERNAL: 1, CONFIDENTIAL: 2, HIGHLY_CONFIDENTIAL: 3, RESTRICTED: 4 };
/** Clasa MAXIMA de date admisa de un provider (pentru plafonarea egress-ului). */
export function providerMaxClass(id) {
  const p = PROVIDERS[id]; if (!p) return "PUBLIC";
  return p.data_classifications_allowed.reduce((mx, c) => (_ORDER[c] > _ORDER[mx] ? c : mx), "PUBLIC");
}

/** E activat providerul? (flag global multi-model + flag specific + credentiale). */
export function providerEnabled(id) {
  const mm = config.multiModel || {};
  if (!mm.enabled) return false;
  const p = PROVIDERS[id];
  if (!p) return false;
  // Cheia poate veni din env (config) SAU din wizard (stocata criptat, cache sincron).
  if (id === "anthropic") return mm.anthropic === true && (!!config.anthropicKey || hasKeyCached("anthropic"));
  if (id === "openai") return mm.openai === true && (!!config.openaiKey || hasKeyCached("openai"));
  if (id === "google") return mm.google === true && (!!config.googleAiKey || hasKeyCached("google"));
  if (id === "private") return mm.privateModel === true && !!config.privateModelUrl;
  return false;
}

/** Providerii activi acum (au flag + credentiale). */
export function enabledProviders() { return Object.keys(PROVIDERS).filter(providerEnabled); }

/** Estimare cost USD pentru un apel (aproximativ, dupa tokeni estimati). */
export function estimateCost(id, { inTokens = 0, outTokens = 0 } = {}) {
  const p = PROVIDERS[id]; if (!p) return 0;
  return (inTokens / 1000) * p.costPer1kIn + (outTokens / 1000) * p.costPer1kOut;
}
