import assert from "node:assert/strict";
import fs from "node:fs";
import { buildTrace } from "../src/executionTrace.js";

const STAGES = {
  decision: { route: "strategy", provider: "claude" },
  context: { operational: true, reports: true, memory: false, date: true },
  brief: { confidence: 0.75, topPriorities: [1, 2, 3], criticalRisks: [1, 2], missingInformation: ["x"] },
  strategy: { provider: "chatgpt", active: false, estimatedTokens: 132 },
  router: { provider: "claude", fallback: "deterministic", canExecute: true },
  response: { sections: [{ type: "critical" }, { type: "risk" }], voiceSummary: "scurt" },
};

// 1) Trace complet — toate etapele + top-level.
const t = buildTrace(STAGES);
assert.equal(t.route, "strategy");
assert.equal(t.provider, "claude");
assert.equal(t.fallback, "deterministic");
assert.equal(t.egress, false);
assert.equal(t.steps.length, 6);
assert.equal(t.metadata.tracer, "jarvis");
console.log("✅ trace complet:", t.steps.map((s) => s.stage).join(" > "));

// 2) contextBuilder → surse (fara 'date').
const ctxStep = t.steps.find((s) => s.stage === "contextBuilder");
assert.deepEqual(ctxStep.sources.sort(), ["operational", "reports"]);
console.log("✅ context sources:", ctxStep.sources.join(", "));

// 3) executiveBrief → contorizari.
const briefStep = t.steps.find((s) => s.stage === "executiveBrief");
assert.equal(briefStep.confidence, 0.75);
assert.equal(briefStep.priorities, 3);
assert.equal(briefStep.risks, 2);
console.log("✅ brief step contorizat");

// 4) Etape lipsa → nu apar (nu se inventeaza).
const partial = buildTrace({ decision: { route: "simple" } });
assert.equal(partial.steps.length, 1);
assert.equal(partial.provider, null);
console.log("✅ etape lipsa → doar cele prezente");

// 5) Determinism + input invalid.
assert.deepEqual(buildTrace(STAGES), buildTrace(STAGES));
for (const bad of [null, undefined, 42, "x", []]) {
  const r = buildTrace(bad);
  assert.ok(Array.isArray(r.steps) && r.egress === false);
}
console.log("✅ determinist + rezilient");

// 6) EGRESS = NU.
const src = fs.readFileSync(new URL("../src/executionTrace.js", import.meta.url), "utf8");
assert.ok(!/\bfetch\s*\(/.test(src) && !/https?:\/\//.test(src) && !/^\s*import\s/m.test(src) && !/\brequire\s*\(/.test(src));
console.log("✅ EGRESS = NU");

console.log("TOATE TRECUTE — executionTrace (inert)");
