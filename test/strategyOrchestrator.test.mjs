import assert from "node:assert/strict";
import fs from "node:fs";
import { orchestrateStrategy } from "../src/strategyOrchestrator.js";

const STATE = {
  financial: { cash: { need30: 536595 }, alerts: ["Sold negativ 2026-08-05"] },
  operational: { overdueTasks: [1, 2, 3], blockedTasks: [1] },
  sales: { reservations: [1, 2, 3, 4, 5, 6], contracts: [] },
  risks: [{ level: "🔴", descriere: "Sold negativ proiectat" }],
};

// 1) Strategy OFF (implicit) → provider claude, executes=false, request tradus.
const r = orchestrateStrategy({ route: "strategy", question: "tu ce ai face?", state: STATE, context: { operational: true, reports: true, memory: true, date: true }, capabilities: { strategy: false } });
assert.equal(r.provider, "claude");
assert.equal(r.executes, false);
assert.equal(r.request.executes, false);
assert.equal(r.request.format, "anthropic");   // claude
assert.ok(r.brief.confidence >= 0);
assert.ok(Array.isArray(r.response.sections));
assert.equal(r.trace.route, "strategy");
console.log("✅ strategy off → claude, request anthropic, executes=false");

// 2) Strategy ON (capabilitate) → provider chatgpt, request openai — dar tot executes=false (inert).
const g = orchestrateStrategy({ route: "strategy", question: "x", state: STATE, capabilities: { strategy: true } });
assert.equal(g.provider, "chatgpt");
assert.equal(g.request.format, "openai");
assert.equal(g.executes, false);              // orchestratorul NU trimite
assert.equal(g.request.executes, false);
console.log("✅ strategy on → chatgpt, request openai, DAR executes=false (inert)");

// 3) Trace complet (6 etape).
assert.equal(r.trace.steps.length, 6);
console.log("✅ trace:", r.trace.steps.map((s) => s.stage).join(" > "));

// 4) determinism + input invalid.
assert.deepEqual(orchestrateStrategy({ route: "strategy", state: STATE, capabilities: { strategy: false } }),
                 orchestrateStrategy({ route: "strategy", state: STATE, capabilities: { strategy: false } }));
for (const bad of [null, undefined, 42, "x", []]) { const x = orchestrateStrategy(bad); assert.equal(x.executes, false); }
console.log("✅ determinist + rezilient");

// 5) EGRESS = NU (importa DOAR module pure; fara fetch/URL/require).
const src = fs.readFileSync(new URL("../src/strategyOrchestrator.js", import.meta.url), "utf8");
assert.ok(!/\bfetch\s*\(/.test(src), "fara fetch");
assert.ok(!/https?:\/\//.test(src), "fara URL");
assert.ok(!/\brequire\s*\(/.test(src), "fara require");
console.log("✅ EGRESS=NU (coordoneaza module pure, nu trimite)\nTOATE TRECUTE — strategyOrchestrator");
