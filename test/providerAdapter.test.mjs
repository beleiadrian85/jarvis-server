import assert from "node:assert/strict";
import fs from "node:fs";
import { buildProviderRequest, supportedProviders } from "../src/providerAdapter.js";

const payload = { system: "esti strateg", user: "ce fac?", model: "m1", maxTokens: 500 };

// 1) claude → format anthropic (system separat), executes=false.
const c = buildProviderRequest("claude", payload);
assert.equal(c.format, "anthropic");
assert.equal(c.executes, false);
assert.equal(c.body.system, "esti strateg");
assert.equal(c.body.messages[0].content, "ce fac?");
assert.equal(c.body.max_tokens, 500);
console.log("✅ claude → anthropic body, executes=false");

// 2) chatgpt → format openai (system in messages).
const g = buildProviderRequest("chatgpt", payload);
assert.equal(g.format, "openai");
assert.equal(g.executes, false);
assert.equal(g.body.messages[0].role, "system");
assert.equal(g.body.messages[1].content, "ce fac?");
console.log("✅ chatgpt → openai body");

// 3) deterministic / none → fara request de model.
for (const p of ["deterministic", "none", "xyz"]) {
  const r = buildProviderRequest(p, payload);
  assert.equal(r.format, "none");
  assert.equal(r.body, null);
  assert.equal(r.executes, false);
}
console.log("✅ deterministic/none/necunoscut → fara request");

// 4) supportedProviders.
assert.deepEqual(supportedProviders().sort(), ["chatgpt", "claude", "deterministic", "none"]);
console.log("✅ supportedProviders");

// 5) determinism + input invalid.
assert.deepEqual(buildProviderRequest("claude", payload), buildProviderRequest("claude", payload));
for (const bad of [null, 42, "x", []]) { const r = buildProviderRequest("claude", bad); assert.ok("body" in r); }
console.log("✅ determinist + rezilient");

// 6) EGRESS = NU (fara fetch/URL/import/require).
const src = fs.readFileSync(new URL("../src/providerAdapter.js", import.meta.url), "utf8");
assert.ok(!/\bfetch\s*\(/.test(src) && !/https?:\/\//.test(src) && !/^\s*import\s/m.test(src) && !/\brequire\s*\(/.test(src));
console.log("✅ EGRESS = NU");

console.log("TOATE TRECUTE — providerAdapter (inert)");
