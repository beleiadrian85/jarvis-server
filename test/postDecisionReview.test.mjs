import assert from "node:assert/strict";
import fs from "node:fs";
import { reviewDecision } from "../src/postDecisionReview.js";

// Coerent: riscul 🔴 apare in raspuns, contradictie semnalata.
const okReview = reviewDecision({
  brief: { criticalRisks: [{ level: "🔴", descriere: "Sold negativ" }], contradictions: ["c1"] },
  response: { sections: [{ type: "critical", items: ["Sold negativ acum"] }], warnings: ["c1"], confidence: 0.8 },
  trace: { active: false },
});
assert.equal(okReview.consistent, true);
assert.deepEqual(okReview.issues, []);
console.log("✅ coerent → fara issues");

// Incoerent: risc 🔴 absent din raspuns.
const bad = reviewDecision({
  brief: { criticalRisks: [{ level: "🔴", descriere: "Sold negativ" }], contradictions: [] },
  response: { sections: [{ type: "important", items: ["altceva"] }], warnings: [] },
});
assert.equal(bad.consistent, false);
assert.ok(bad.issues.some((i) => /absent din raspuns/.test(i)));
console.log("✅ risc 🔴 lipsa → issue");

// Contradictii nesemnalate → issue.
const c = reviewDecision({ brief: { contradictions: ["x"] }, response: { sections: [], warnings: [] } });
assert.ok(c.issues.some((i) => /contradictii/.test(i)));
console.log("✅ contradictii nesemnalate → issue");

// Note: incredere scazuta + approval pe strategie.
const note = reviewDecision({ brief: {}, response: { needsApproval: true, confidence: 0.2 }, trace: { active: true } });
assert.ok(note.notes.some((n) => /approvalGate/.test(n)));
assert.ok(note.notes.some((n) => /incredere scazuta/.test(n)));
console.log("✅ note (approvalGate + incredere scazuta)");

// determinist + input invalid + reviewedAt null.
assert.equal(reviewDecision().reviewedAt, null);
for (const bad2 of [null, undefined, 42, "x"]) { const r = reviewDecision(bad2); assert.ok(Array.isArray(r.issues)); }
console.log("✅ determinist + rezilient");

const src = fs.readFileSync(new URL("../src/postDecisionReview.js", import.meta.url), "utf8");
assert.ok(!/\bfetch\s*\(/.test(src) && !/https?:\/\//.test(src) && !/^\s*import\s/m.test(src) && !/\brequire\s*\(/.test(src));
console.log("✅ EGRESS=NU\nTOATE TRECUTE — postDecisionReview");
