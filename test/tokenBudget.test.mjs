import assert from "node:assert/strict";
import fs from "node:fs";
import { estimateTokens, fitsBudget, enforceBudget } from "../src/tokenBudget.js";

assert.equal(estimateTokens("abcd"), 1);
assert.equal(estimateTokens(""), 0);
assert.equal(estimateTokens(null), 0);
console.log("✅ estimateTokens (~4 car/token)");

assert.equal(fitsBudget("abcd".repeat(10), 100).withinBudget, true);
assert.equal(fitsBudget("x".repeat(1000), 10).withinBudget, false);
assert.equal(fitsBudget("x", null).withinBudget, true); // fara buget → mereu ok
console.log("✅ fitsBudget");

const e = enforceBudget("x".repeat(1000), 10);
assert.equal(e.truncated, true);
assert.equal(e.action, "truncate");
assert.ok(e.estimated <= 10 + 1);
assert.ok(e.text.endsWith("…"));
const ok = enforceBudget("scurt", 100);
assert.equal(ok.truncated, false);
assert.equal(ok.action, "ok");
console.log("✅ enforceBudget (truncate/ok)");

assert.deepEqual(enforceBudget("abc", 100), enforceBudget("abc", 100)); // determinist
const src = fs.readFileSync(new URL("../src/tokenBudget.js", import.meta.url), "utf8");
assert.ok(!/\bfetch\s*\(/.test(src) && !/https?:\/\//.test(src) && !/^\s*import\s/m.test(src) && !/\brequire\s*\(/.test(src));
console.log("✅ determinist + EGRESS=NU\nTOATE TRECUTE — tokenBudget");
