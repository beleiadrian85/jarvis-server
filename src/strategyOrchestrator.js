/**
 * Strategy Orchestrator (INERT). COORDONEAZA modulele pure pentru o cerere de
 * strategie, in ordinea arhitecturii:
 *   modelRouter → executiveBrief → strategyEngine → providerAdapter →
 *   responseComposer → executionTrace.
 *
 * NU apeleaza niciun provider (`executes: false`), NU face fetch/IO.
 * Importa DOAR module pure/inerte (fara config/DB/fetch) → zero egress.
 * Nu preia responsabilitatea niciunui modul — doar le inlantuie.
 */
import { routeModel } from "./modelRouter.js";
import { buildExecutiveBrief } from "./executiveBrief.js";
import { strategyDecision } from "./strategyEngine.js";
import { buildProviderRequest } from "./providerAdapter.js";
import { composeResponse } from "./responseComposer.js";
import { buildTrace } from "./executionTrace.js";

export function orchestrateStrategy(input) {
  const inp = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const route = String(inp.route || "strategy");
  const caps = obj(inp.capabilities);
  const state = obj(inp.state);
  const options = obj(inp.options);

  // 1) Cine raspunde (provider) + fallback.
  const router = routeModel({ route, capabilities: caps, executiveBrief: inp.executiveBrief, options });

  // 2) Sinteza (brief) din datele deja colectate.
  const brief = buildExecutiveBrief(state);

  // 3) Payload-ul de strategie (NU se trimite).
  const strat = strategyDecision(
    { question: String(inp.question || ""), cash: safe(brief.financialSnapshot), sales: safe(brief.salesSnapshot), risks: safe(brief.criticalRisks) },
    { provider: router.provider, active: router.active },
  );

  // 4) Traducerea in request specific provider (executes:false).
  const request = buildProviderRequest(router.provider, {
    system: strat.prompt.system, user: strat.prompt.user, model: options.model, maxTokens: options.maxTokens,
  });

  // 5) Forma raspunsului (JARVIS o decide, nu modelul).
  const response = composeResponse({ route, executiveBrief: brief, strategyResult: {}, approval: inp.approval });

  // 6) Trace.
  const trace = buildTrace({ decision: { route, provider: router.provider }, context: inp.context, brief, strategy: strat, router, response });

  return {
    route,
    provider: router.provider,
    active: router.active,
    canExecute: router.canExecute,
    request,   // gata de trimis de un strat de executie ulterior (post-activare)
    brief,
    response,
    trace,
    executes: false,
  };
}

function obj(v) { return v != null && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function safe(v) { try { return JSON.stringify(v); } catch { return ""; } }
