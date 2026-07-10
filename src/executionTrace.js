/**
 * Execution Trace (INERT, PUR).
 *
 * buildTrace(stages) — din output-urile etapelor pipeline-ului construieste un
 * trace structurat (telemetrie / explainability). NU face IO; doar aseaza in
 * forma. Logarea/persistarea = alt strat (nu responsabilitatea acestui modul).
 *
 * GARANTII: zero importuri, IO, fetch, node:*, config, DB. Pur si determinist.
 */

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const len = (v) => (Array.isArray(v) ? v.length : 0);

export function buildTrace(stages) {
  const s = isObj(stages) ? stages : {};
  const steps = [];

  if (s.decision !== undefined) steps.push({ stage: "decisionEngine", route: pick(s.decision, "route"), provider: pick(s.decision, "provider") });
  if (s.context !== undefined) steps.push({ stage: "contextBuilder", sources: sourcesOf(s.context) });
  if (s.brief !== undefined) steps.push({ stage: "executiveBrief", confidence: pick(s.brief, "confidence"), priorities: len(s.brief && s.brief.topPriorities), risks: len(s.brief && s.brief.criticalRisks), missing: len(s.brief && s.brief.missingInformation) });
  if (s.strategy !== undefined) steps.push({ stage: "strategyEngine", provider: pick(s.strategy, "provider"), active: !!(s.strategy && s.strategy.active), estimatedTokens: pick(s.strategy, "estimatedTokens") });
  if (s.router !== undefined) steps.push({ stage: "modelRouter", provider: pick(s.router, "provider"), fallback: pick(s.router, "fallback"), canExecute: !!(s.router && s.router.canExecute) });
  if (s.response !== undefined) steps.push({ stage: "responseComposer", sections: (s.response && Array.isArray(s.response.sections) ? s.response.sections.map((x) => x && x.type) : []), voice: !!(s.response && s.response.voiceSummary) });

  return {
    route: pick(s.decision, "route"),
    provider: pick(s.router, "provider"),
    fallback: pick(s.router, "fallback"),
    active: !!(s.router && s.router.active),
    egress: false,
    steps,
    metadata: { version: 1, tracer: "jarvis" },
  };
}

function pick(obj, key) { return isObj(obj) && obj[key] !== undefined ? obj[key] : null; }

function sourcesOf(ctx) {
  if (!isObj(ctx)) return [];
  return Object.keys(ctx).filter((k) => ctx[k] === true && k !== "date");
}
