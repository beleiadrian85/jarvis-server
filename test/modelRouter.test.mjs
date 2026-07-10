import assert from "node:assert/strict";
import fs from "node:fs";
import { routeModel } from "../src/modelRouter.js";

const KEYS = ["provider", "pipeline", "reason", "active", "canExecute", "requiresApproval",
  "estimatedCost", "estimatedLatency", "fallback", "metadata"];
const PROVIDERS = new Set(["claude", "chatgpt", "deterministic", "none"]);

// 1) Structura completa + provider valid.
const r = routeModel({ route: "operational_read" });
for (const k of KEYS) assert.ok(k in r, `lipseste ${k}`);
assert.ok(PROVIDERS.has(r.provider));
assert.equal(r.metadata.router, "jarvis");
assert.equal(r.metadata.version, 1);
console.log("✅ structura + provider valid");

// 2) STRATEGY activa → chatgpt (dar NU executa) + pipeline complet.
const strat = routeModel({ route: "strategy", capabilities: { strategy: true } });
assert.equal(strat.provider, "chatgpt");
assert.equal(strat.active, true);
assert.equal(strat.canExecute, false);          // ChatGPT nu executa niciodata
assert.equal(strat.fallback, "claude");
assert.deepEqual(strat.pipeline, ["decisionEngine", "contextBuilder", "executiveBrief", "strategyEngine", "responseComposer"]);
console.log("✅ strategy activa → chatgpt, canExecute=false, pipeline complet");

// 3) STRATEGY dezactivata → fallback claude.
const stratOff = routeModel({ route: "strategy", capabilities: { strategy: false } });
assert.equal(stratOff.provider, "claude");
assert.equal(stratOff.active, false);
assert.match(stratOff.reason, /dezactivata/);
console.log("✅ strategy off → claude (fallback)");

// 4) DETERMINISTIC routes → provider deterministic, cost none.
for (const route of ["report", "operationalFastPath", "clarify", "memory"]) {
  const d = routeModel({ route });
  assert.equal(d.provider, "deterministic", `${route} → ${d.provider}`);
  assert.equal(d.estimatedCost, "none");
}
console.log("✅ rute deterministe → deterministic, cost none");

// 5) FALLBACK: chatgpt indisponibil → claude.
const noGpt = routeModel({ route: "strategy", options: { chatgptAvailable: false } });
assert.equal(noGpt.provider, "claude");
console.log("✅ chatgpt indisponibil → claude");

// 6) FALLBACK: claude indisponibil → deterministic.
const noClaude = routeModel({ route: "operational_read", options: { claudeAvailable: false } });
assert.equal(noClaude.provider, "deterministic");
assert.match(noClaude.reason, /indisponibil/);
console.log("✅ claude indisponibil → deterministic");

// 7) APPROVAL necesar → canExecute=false.
const act = routeModel({ route: "action_propose" });
assert.equal(act.requiresApproval, true);
assert.equal(act.canExecute, false);
console.log("✅ action_propose → requiresApproval, canExecute=false");

// 8) canExecute=true pentru cale executabila fara approval (claude read/op).
const opok = routeModel({ route: "operational_read" });
assert.equal(opok.canExecute, true);
console.log("✅ operational_read → canExecute=true (fara approval)");

// 9) Lantul de fallback corect pentru fiecare provider.
assert.equal(routeModel({ route: "strategy", capabilities: { strategy: true } }).fallback, "claude");
assert.equal(routeModel({ route: "operational_read" }).fallback, "deterministic");
assert.equal(routeModel({ route: "report" }).fallback, "none");
console.log("✅ lant fallback: chatgpt→claude→deterministic→none");

// 10) DETERMINISM.
assert.deepEqual(routeModel({ route: "strategy", capabilities: { strategy: true } }),
                 routeModel({ route: "strategy", capabilities: { strategy: true } }));
console.log("✅ pur & determinist");

// 11) INPUT INVALID → nu crapa, provider valid.
for (const bad of [null, undefined, 42, "text", [], { route: 99, capabilities: "x", options: 7 }]) {
  const x = routeModel(bad);
  for (const k of KEYS) assert.ok(k in x, `input invalid: lipseste ${k}`);
  assert.ok(PROVIDERS.has(x.provider));
}
console.log("✅ rezilienta la input invalid");

// 12) EGRESS = NU.
const src = fs.readFileSync(new URL("../src/modelRouter.js", import.meta.url), "utf8");
assert.ok(!/\bfetch\s*\(/.test(src) && !/https?:\/\//.test(src) && !/^\s*import\s/m.test(src) && !/\brequire\s*\(/.test(src));
console.log("✅ EGRESS = NU (fara fetch / URL / import / require)");

console.log("TOATE TRECUTE — modelRouter (C11, inert, zero egress)");
