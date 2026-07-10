import assert from "node:assert/strict";
import fs from "node:fs";
import { buildExecutiveBrief } from "../src/executiveBrief.js";

const FULL = {
  financial: { cash: { need30: 536595 }, obligations: [{ title: "rata IMM", amount: 416000 }], alerts: ["Sold negativ proiectat 2026-08-05"] },
  operational: { overdueTasks: Array.from({ length: 7 }, (_, i) => ({ title: "t" + i })), todayTasks: [], blockedTasks: [{ title: "blocat" }] },
  sales: { pipeline: [{}], reservations: Array.from({ length: 6 }, () => ({})), contracts: [], leads: [{}, {}] },
  projects: { active: [{ name: "Bell Residence C3" }], blocked: [], critical: [] },
  risks: [
    { level: "🔴", descriere: "Sold negativ proiectat din 2026-08-05", recomandare: "asigură lichiditate" },
    { level: "🟠", descriere: "7 task-uri întârziate" },
  ],
  memory: ["Bell Residence se lanseaza in septembrie"],
};

const KEYS = ["summary", "topPriorities", "criticalRisks", "financialSnapshot", "operationalSnapshot",
  "salesSnapshot", "projectSnapshot", "contradictions", "missingInformation", "recommendedDecision", "confidence", "metadata"];

// 1) CONTEXT COMPLET.
const b = buildExecutiveBrief(FULL);
for (const k of KEYS) assert.ok(k in b, `lipseste ${k}`);
assert.equal(b.recommendedDecision, null);
assert.ok("alerts" in b.financialSnapshot);
assert.ok("reservations" in b.salesSnapshot);
assert.equal(b.metadata.version, 1);
assert.equal(b.metadata.generatedAt, null);
assert.deepEqual(b.metadata.sourcesUsed.sort(), ["financial", "memory", "operational", "projects", "risks", "sales"]);
console.log("✅ context complet → structura + metadata");

// 2) PRIORITIZARE pe impact (cash primul).
assert.equal(b.topPriorities[0].impact, "cash");
assert.ok(b.topPriorities.some((p) => p.impact === "sales"));
assert.ok(b.topPriorities.length <= 5);
console.log("✅ prioritizare pe impact (cash > sales > executie)");

// 3) SORTARE RISCURI pe severitate.
assert.equal(b.criticalRisks[0].level, "🔴");
console.log("✅ riscuri sortate (🔴 primul)");

// 4) CONTEXT PARTIAL.
const partial = buildExecutiveBrief({ sales: { reservations: [{}, {}], contracts: [] } });
assert.ok("reservations" in partial.salesSnapshot);
assert.deepEqual(partial.financialSnapshot, {});
assert.ok(partial.missingInformation.includes("date financiare (cash-flow)"));
assert.ok(partial.metadata.missingSources.includes("financial"));
console.log("✅ context partial → snapshot partial + missing/metadata");

// 5) CONTEXT GOL.
const empty = buildExecutiveBrief({});
assert.equal(empty.confidence, 0);
assert.match(empty.summary, /Date insuficiente/);
assert.ok(empty.missingInformation.length >= 3);
assert.equal(empty.metadata.sourcesUsed.length, 0);
console.log("✅ context gol → confidence 0, missing marcat");

// 6) DUPLICATE eliminate.
const dup = buildExecutiveBrief({
  risks: [{ level: "🔴", descriere: "acelasi" }, { level: "🔴", descriere: "acelasi" }],
  contradictions: ["X", "X", "Y"],
});
assert.equal(dup.criticalRisks.length, 1);
assert.deepEqual(dup.contradictions, ["X", "Y"]);
console.log("✅ duplicate eliminate");

// 7) CONTRADICTII (luni de lansare divergente).
const contra = buildExecutiveBrief({ memory: ["lansam in septembrie", "lansam vanzarile in iunie"] });
assert.ok(contra.contradictions.some((c) => /contradictorii/.test(c)));
console.log("✅ contradictii detectate");

// 8) LIPSA INFORMATII marcata.
assert.ok(empty.missingInformation.includes("date vânzări"));
console.log("✅ lipsa informatii marcata explicit");

// 9) DETERMINISM.
assert.deepEqual(buildExecutiveBrief(FULL), buildExecutiveBrief(FULL));
console.log("✅ pur & determinist");

// 10) CONFIDENCE ∈ [0,1], creste cu completitudinea.
assert.ok(b.confidence >= 0 && b.confidence <= 1);
assert.ok(b.confidence > partial.confidence);
console.log("✅ confidence complet(", b.confidence, ") > partial(", partial.confidence, ")");

// 11) INPUT INVALID.
for (const bad of [null, undefined, 42, "text", [], { risks: "nu-i array", sales: 7, memory: null }]) {
  const r = buildExecutiveBrief(bad);
  for (const k of KEYS) assert.ok(k in r, `input invalid: lipseste ${k}`);
  assert.equal(r.recommendedDecision, null);
}
console.log("✅ rezilienta la input invalid");

// 12) EGRESS = NU.
const src = fs.readFileSync(new URL("../src/executiveBrief.js", import.meta.url), "utf8");
assert.ok(!/\bfetch\s*\(/.test(src) && !/https?:\/\//.test(src) && !/^\s*import\s/m.test(src) && !/\brequire\s*\(/.test(src));
console.log("✅ EGRESS = NU (fara fetch / URL / import / require)");

console.log("TOATE TRECUTE — executiveBrief v2 (C9, inert, zero egress)");
