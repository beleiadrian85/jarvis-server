import assert from "node:assert/strict";
import fs from "node:fs";
import { validateResponse } from "../src/responseValidator.js";

const OK = {
  title: "T", summary: "S",
  sections: [{ type: "critical", title: "🔴", priority: 1, items: ["x"] }],
  actions: [], warnings: [], voiceSummary: "scurt", confidence: 0.7,
  needsApproval: false, approvalPreview: null, nextQuestions: [],
  metadata: { version: 1, composer: "jarvis", route: "strategy" },
};

// 1) Raspuns valid.
const v = validateResponse(OK);
assert.equal(v.valid, true);
assert.deepEqual(v.errors, []);
console.log("✅ raspuns valid");

// 2) Camp lipsa → invalid.
const { voiceSummary, ...noVoice } = OK;
const r2 = validateResponse(noVoice);
assert.equal(r2.valid, false);
assert.ok(r2.errors.some((e) => /voiceSummary/.test(e)));
console.log("✅ camp lipsa → invalid");

// 3) voiceSummary > 300 → invalid.
const r3 = validateResponse({ ...OK, voiceSummary: "x".repeat(301) });
assert.equal(r3.valid, false);
assert.ok(r3.errors.some((e) => /voiceSummary > 300/.test(e)));
console.log("✅ voiceSummary > 300 → invalid");

// 4) confidence in afara [0,1] → invalid.
assert.equal(validateResponse({ ...OK, confidence: 1.5 }).valid, false);
assert.equal(validateResponse({ ...OK, confidence: "x" }).valid, false);
console.log("✅ confidence invalid → eroare");

// 5) sectiune goala / duplicata → warning (nu eroare).
const r5 = validateResponse({ ...OK, sections: [
  { type: "risk", title: "r", items: [] },
  { type: "risk", title: "r", items: ["a"] },
] });
assert.equal(r5.valid, true);
assert.ok(r5.warnings.some((w) => /goala/.test(w)) && r5.warnings.some((w) => /duplicata/.test(w)));
console.log("✅ sectiune goala/duplicata → warning");

// 6) needsApproval fara preview → warning.
const r6 = validateResponse({ ...OK, needsApproval: true, approvalPreview: null });
assert.ok(r6.warnings.some((w) => /approvalPreview/.test(w)));
console.log("✅ needsApproval fara preview → warning");

// 7) Input invalid → invalid, nu crapa.
for (const bad of [null, undefined, 42, "x", []]) {
  const r = validateResponse(bad);
  assert.equal(r.valid, false);
}
console.log("✅ input invalid → invalid, robust");

// 8) EGRESS = NU.
const src = fs.readFileSync(new URL("../src/responseValidator.js", import.meta.url), "utf8");
assert.ok(!/\bfetch\s*\(/.test(src) && !/https?:\/\//.test(src) && !/^\s*import\s/m.test(src) && !/\brequire\s*\(/.test(src));
console.log("✅ EGRESS = NU");

console.log("TOATE TRECUTE — responseValidator (inert)");
