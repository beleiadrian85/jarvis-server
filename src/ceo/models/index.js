// MULTI-MODEL INTELLIGENCE — fatada publica (§10-§23). Gated de config.multiModel.
// Modelele = MOTOARE de rationament peste memoria/faptele JARVIS. NU sunt surse de
// adevar, NU scriu memoria, NU ating Operational. Orice rezultat e inferenta si trece
// separat prin ManagerialDecisionEnvelope inainte de a deveni actiune.
import { config } from "../../config.js";
import { consultModel, multiModelEnabled } from "./gateway.js";
import { reviewOutput, reviewerEnabled, arbitrate, arbiterEnabled } from "./reviewer.js";
import { needsReview } from "./riskTrigger.js";
import { route } from "./router.js";
import { enabledProviders, PROVIDERS, allProfiles, capabilityProfile } from "./registry.js";
import { spentToday, spentThisMonth, alertStatus } from "./costGuard.js";
import { modelsHealth } from "./health.js";
import { evaluationSummary } from "./evaluation.js";
import { recentModelAudit } from "./audit.js";

/**
 * Consulta modelul potrivit. Reviewerul se cheama DOAR daca riscul o justifica (§12);
 * arbitrul DOAR daca primary si reviewer sunt in dezacord material.
 */
export async function ask(p = {}) {
  const primary = await consultModel(p);
  if (!primary.ok) return { ...primary, review: null, arbiter: null };

  const risk = needsReview({ text: `${p.query} ${primary.output}`, task: p.task, confidence: p.confidence,
    contradictions: (primary.contradictions || []).length, willGenerateActionCard: p.willGenerateActionCard, material: p.material, forceReview: p.forceReview });

  let review = null, arbiter = null;
  if (risk.review && reviewerEnabled()) {
    review = await reviewOutput({ question: p.query, primaryOutput: primary.output, primaryProvider: primary.provider, sensitivity: p.sensitivity }).catch(() => null);
    // Dezacord material → arbitru (daca activat).
    if (review?.ok && review.agree === false && arbiterEnabled()) {
      arbiter = await arbitrate({ question: p.query, primaryOutput: primary.output, primaryProvider: primary.provider, reviewerProvider: review.reviewer, reviewText: review.raw, sensitivity: p.sensitivity }).catch(() => null);
    }
  }
  return { ...primary, review_triggered: risk.review, review_reasons: risk.reasons, review, arbiter };
}

/** Stare multi-model pentru UI/health. */
export async function modelsStatus() {
  return {
    enabled: multiModelEnabled(),
    providers_active: enabledProviders(),
    profiles: allProfiles(),
    reviewer: reviewerEnabled(), arbiter: arbiterEnabled(),
    cost: { today: await spentToday().catch(() => null), month: await spentThisMonth().catch(() => null), alert: await alertStatus().catch(() => null) },
    data_routing: config.multiModel?.dataRouting === true,
    evaluation: config.multiModel?.evaluation === true,
  };
}

export { consultModel, reviewOutput, arbitrate, route, multiModelEnabled, capabilityProfile, modelsHealth, evaluationSummary, recentModelAudit, needsReview };
