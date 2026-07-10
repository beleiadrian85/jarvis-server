import assert from "node:assert/strict";
import fs from "node:fs";
import { createMetrics } from "../src/providerMetrics.js";

const m = createMetrics();
m.record({ provider: "claude", ms: 2000, ok: true, tokens: 500 });
m.record({ provider: "claude", ms: 4000, ok: false, tokens: 300 });
m.record({ provider: "chatgpt", ms: 3000, ok: true, tokens: 800 });

const s = m.snapshot();
assert.equal(s.claude.calls, 2);
assert.equal(s.claude.errors, 1);
assert.equal(s.claude.avgMs, 3000);
assert.equal(s.claude.totalTokens, 800);
assert.equal(s.claude.errorRate, 0.5);
assert.equal(s.chatgpt.calls, 1);
console.log("✅ record + snapshot (calls/errors/avgMs/tokens/errorRate)");

m.reset();
assert.deepEqual(m.snapshot(), {});
console.log("✅ reset");

// izolare instante.
const a = createMetrics(), b = createMetrics();
a.record({ provider: "claude" });
assert.deepEqual(b.snapshot(), {});
console.log("✅ instante izolate");

// input invalid → nu crapa.
const x = createMetrics();
x.record();
x.record({ provider: null, ms: "x", tokens: null });
assert.ok(x.snapshot().unknown.calls >= 1);
console.log("✅ rezilient");

const src = fs.readFileSync(new URL("../src/providerMetrics.js", import.meta.url), "utf8");
assert.ok(!/\bfetch\s*\(/.test(src) && !/https?:\/\//.test(src) && !/^\s*import\s/m.test(src) && !/\brequire\s*\(/.test(src));
console.log("✅ EGRESS=NU\nTOATE TRECUTE — providerMetrics");
