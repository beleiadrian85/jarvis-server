// MULTI-MODEL REGISTRY (§10-§15) — modelele sunt MOTOARE de rationament, NU surse
// de adevar. Fiecare provider are: nivel de incredere (trust) pentru Data Routing,
// flag de activare (implicit OFF), cost estimativ. Niciun provider nu scrie memoria
// sau Operational. PUR (definitii); apelul real e injectat de gateway.
import { config } from "../../config.js";

// trust: 'external' (cloud tert) | 'private' (gazduit de noi) | 'local'
// providerul determina ce clase de date pot ajunge la el (vezi dataPolicy).
export const PROVIDERS = {
  anthropic: { id: "anthropic", label: "Claude (Anthropic)", trust: "external", strengths: ["managerial", "reasoning", "safety"], flag: "anthropic", costPer1kIn: 0.003, costPer1kOut: 0.015 },
  openai: { id: "openai", label: "ChatGPT (OpenAI)", trust: "external", strengths: ["strategy", "brainstorm", "drafting"], flag: "openai", costPer1kIn: 0.0025, costPer1kOut: 0.01 },
  google: { id: "google", label: "Gemini (Google)", trust: "external", strengths: ["long_context", "research"], flag: "google", costPer1kIn: 0.0012, costPer1kOut: 0.005 },
  private: { id: "private", label: "Model privat (self-hosted)", trust: "private", strengths: ["restricted_data"], flag: "privateModel", costPer1kIn: 0, costPer1kOut: 0 },
};

/** E activat providerul? (flag global multi-model + flag specific). */
export function providerEnabled(id) {
  const mm = config.multiModel || {};
  if (!mm.enabled) return false;
  const p = PROVIDERS[id];
  if (!p) return false;
  if (id === "anthropic") return mm.anthropic === true && !!config.anthropicKey;
  if (id === "openai") return mm.openai === true && !!config.openaiKey;
  if (id === "google") return mm.google === true && !!config.googleAiKey;
  if (id === "private") return mm.privateModel === true && !!config.privateModelUrl;
  return false;
}

/** Providerii activi acum (au flag + credentiale). */
export function enabledProviders() {
  return Object.keys(PROVIDERS).filter(providerEnabled);
}

/** Estimare cost USD pentru un apel (aproximativ, dupa tokeni estimati). */
export function estimateCost(id, { inTokens = 0, outTokens = 0 } = {}) {
  const p = PROVIDERS[id];
  if (!p) return 0;
  return (inTokens / 1000) * p.costPer1kIn + (outTokens / 1000) * p.costPer1kOut;
}
