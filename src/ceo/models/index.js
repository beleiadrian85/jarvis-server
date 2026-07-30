// MULTI-MODEL INTELLIGENCE — fatada publica (§10-§19). Gated de config.multiModel.
// Modelele = MOTOARE de rationament peste memoria/faptele JARVIS. NU sunt surse de
// adevar, NU scriu memoria, NU ating Operational. Orice rezultat e inferenta si trece
// separat prin ManagerialDecisionEnvelope inainte de a deveni actiune.
import { config } from "../../config.js";
import { consultModel, multiModelEnabled } from "./gateway.js";
import { reviewOutput, reviewerEnabled } from "./reviewer.js";
import { route } from "./router.js";
import { enabledProviders, PROVIDERS } from "./registry.js";
import { spentToday } from "./costGuard.js";

/** Consulta cel mai potrivit model + (optional) un al doilea care verifica. */
export async function ask(p = {}) {
  const primary = await consultModel(p);
  if (!primary.ok) return { ...primary, review: null };
  let review = null;
  if (reviewerEnabled()) {
    review = await reviewOutput({ question: p.query, primaryOutput: primary.output, primaryProvider: primary.provider, sensitivity: p.sensitivity }).catch(() => null);
  }
  return { ...primary, review };
}

/** Stare multi-model pentru UI/health. */
export async function modelsStatus() {
  return {
    enabled: multiModelEnabled(),
    providers_active: enabledProviders(),
    providers_all: Object.values(PROVIDERS).map((p) => ({ id: p.id, label: p.label, trust: p.trust })),
    reviewer: reviewerEnabled(),
    cost: await spentToday().catch(() => null),
    data_routing: config.multiModel?.dataRouting !== false,
  };
}

export { consultModel, reviewOutput, route, multiModelEnabled };
