import assert from "node:assert/strict";
import fs from "node:fs";
import { withTimeout, withRetry, withFallback } from "../src/resilience.js";

// withTimeout: fn rapid → rezultat; fn lent → onTimeout.
const fast = withTimeout(async () => "ok", 100);
assert.equal(await fast(), "ok");
const slow = withTimeout(() => new Promise((r) => setTimeout(() => r("tarziu"), 50)), 5, () => "FALLBACK");
assert.equal(await slow(), "FALLBACK");
console.log("✅ withTimeout (ok + onTimeout)");

// withRetry: reuseste dupa esecuri.
let n = 0;
const flaky = withRetry(async () => { if (++n < 3) throw new Error("x"); return "ok"; }, { retries: 3 });
assert.equal(await flaky(), "ok");
assert.equal(n, 3);
// shouldRetry=false → arunca imediat.
let m = 0;
const noRetry = withRetry(async () => { m++; throw new Error("stop"); }, { retries: 5, shouldRetry: () => false });
await assert.rejects(() => noRetry());
assert.equal(m, 1);
console.log("✅ withRetry (retries + shouldRetry)");

// withFallback: esec → fallbackFn.
const fb = withFallback(async () => { throw new Error("boom"); }, (e) => "recuperat:" + e.message);
assert.equal(await fb(), "recuperat:boom");
const okFn = withFallback(async () => "primar", () => "fb");
assert.equal(await okFn(), "primar");
console.log("✅ withFallback");

// NU cheama provideri — doar infasoara functii date. Egress check.
const src = fs.readFileSync(new URL("../src/resilience.js", import.meta.url), "utf8");
assert.ok(!/\bfetch\s*\(/.test(src) && !/https?:\/\//.test(src) && !/^\s*import\s/m.test(src) && !/\brequire\s*\(/.test(src));
console.log("✅ EGRESS=NU (doar wrappers)\nTOATE TRECUTE — resilience");
