import assert from "node:assert/strict";
import fs from "node:fs";
import { composeResponse } from "../src/responseComposer.js";

const FULL = {
  route: "strategy",
  executiveBrief: {
    summary: "cash 30z: 536595, deficit din 2026-08-05.",
    topPriorities: [
      { impact: "cash", text: "Acoperă deficitul din 2026-08-05." },
      { impact: "sales", text: "Forțează avansurile pe 6 rezervări." },
    ],
    criticalRisks: [
      { level: "🔴", descriere: "Sold negativ proiectat din 2026-08-05" },
      { level: "🟠", descriere: "7 task-uri întârziate" },
    ],
    missingInformation: ["soldul bancar curent"],
    contradictions: ["Lansare cu date contradictorii: iunie vs septembrie"],
    confidence: 0.75,
  },
  strategyResult: { actions: ["Sună banca pentru linia de credit"], questions: ["Ai lansat deja vânzările?"] },
  approval: { needed: true, preview: "📋 TASK NOU — confirmi?" },
};

const KEYS = ["title", "summary", "sections", "actions", "warnings", "voiceSummary",
  "confidence", "needsApproval", "approvalPreview", "nextQuestions", "metadata"];

// 1) CONTEXT COMPLET — structura + ordine determinista a sectiunilor.
const r = composeResponse(FULL);
for (const k of KEYS) assert.ok(k in r, `lipseste ${k}`);
const order = r.sections.map((s) => s.type);
assert.deepEqual(order, ["critical", "important", "risk", "action", "approval", "question"]);
assert.equal(r.metadata.version, 1);
assert.equal(r.metadata.composer, "jarvis");
assert.equal(r.metadata.route, "strategy");
assert.equal(r.title, "Analiză strategică");
console.log("✅ context complet → ordine:", order.join(" > "));

// 2) 🔴 CE ARDE = cash + risc 🔴; RISCURI = doar 🟠.
const critical = r.sections.find((s) => s.type === "critical").items;
assert.ok(critical.some((i) => /deficit/.test(i)) && critical.some((i) => /Sold negativ/.test(i)));
const risk = r.sections.find((s) => s.type === "risk").items;
assert.ok(risk.every((i) => !/Sold negativ/.test(i)));
console.log("✅ CE ARDE (cash+🔴) separat de RISCURI (🟠)");

// 3) CONTEXT GOL.
const empty = composeResponse({});
assert.deepEqual(empty.sections, []);
assert.deepEqual(empty.actions, []);
assert.equal(empty.confidence, 0);
assert.equal(empty.needsApproval, false);
assert.equal(empty.voiceSummary, "Nimic urgent.");
assert.equal(empty.metadata.composer, "jarvis");
console.log("✅ context gol → totul gol, dar structura valida");

// 4) DUPLICATE eliminate.
const dup = composeResponse({ executiveBrief: {
  topPriorities: [{ impact: "cash", text: "X" }, { impact: "cash", text: "X" }],
  criticalRisks: [{ level: "🟠", descriere: "R" }, { level: "🟠", descriere: "R" }],
} });
assert.equal(dup.sections.find((s) => s.type === "critical").items.length, 1);
assert.equal(dup.sections.find((s) => s.type === "risk").items.length, 1);
console.log("✅ duplicate eliminate");

// 5) SECTIUNI GOALE nu apar.
const onlyRisk = composeResponse({ executiveBrief: { criticalRisks: [{ level: "🟠", descriere: "doar risc" }] } });
assert.deepEqual(onlyRisk.sections.map((s) => s.type), ["risk"]);
console.log("✅ sectiuni goale ascunse (doar 'risk')");

// 6) APPROVAL.
assert.equal(r.needsApproval, true);
assert.equal(r.approvalPreview, "📋 TASK NOU — confirmi?");
assert.ok(r.sections.some((s) => s.type === "approval"));
const noAppr = composeResponse({ executiveBrief: { criticalRisks: [{ level: "🔴", descriere: "x" }] } });
assert.equal(noAppr.needsApproval, false);
assert.equal(noAppr.approvalPreview, null);
console.log("✅ approval → sectiune + flag; fara approval → null");

// 7) WARNINGS din contradictii.
assert.ok(r.warnings.some((w) => /contradictorii/.test(w)));
console.log("✅ warnings din contradictii");

// 8) VOICESUMMARY ≤ 300 caractere, mereu.
const longRisk = "R".repeat(500);
const vlong = composeResponse({ executiveBrief: { criticalRisks: [{ level: "🔴", descriere: longRisk }] }, strategyResult: { actions: ["A".repeat(500)] } });
assert.ok(vlong.voiceSummary.length <= 300, "voiceSummary depaseste 300");
assert.ok(r.voiceSummary.length <= 300);
console.log("✅ voiceSummary ≤ 300 (real:", vlong.voiceSummary.length, ")");

// 9) DETERMINISM.
assert.deepEqual(composeResponse(FULL), composeResponse(FULL));
console.log("✅ pur & determinist");

// 10) INPUT INVALID.
for (const bad of [null, undefined, 42, "text", [], { executiveBrief: "nu-i obiect", strategyResult: 7 }]) {
  const x = composeResponse(bad);
  for (const k of KEYS) assert.ok(k in x, `input invalid: lipseste ${k}`);
  assert.ok(Array.isArray(x.sections) && Array.isArray(x.actions));
  assert.ok(x.voiceSummary.length <= 300);
}
console.log("✅ rezilienta la input invalid");

// 11) EGRESS = NU.
const src = fs.readFileSync(new URL("../src/responseComposer.js", import.meta.url), "utf8");
assert.ok(!/\bfetch\s*\(/.test(src) && !/https?:\/\//.test(src) && !/^\s*import\s/m.test(src) && !/\brequire\s*\(/.test(src));
console.log("✅ EGRESS = NU (fara fetch / URL / import / require)");

console.log("TOATE TRECUTE — responseComposer (C10, inert, zero egress)");
