import assert from "node:assert/strict";
import fs from "node:fs";
import { strategyDecision } from "../src/strategyEngine.js";

const BRIEF = {
  question: "Merita sa opresc corpul C2 din Bell Residence?",
  cash: "necesar 30z 536.595 lei; deficit proiectat 2026-08",
  sales: "20 disponibile, 6 rezervate (0 avans), 4 vandute",
  risks: "rata IMM 416.000 lei pe 30 iul; 7 task-uri intarziate",
  memory: "Bell Residence se lanseaza in septembrie",
};

// 1) Structura standardizata completa.
const d = strategyDecision(BRIEF);
for (const k of ["provider", "active", "decision", "confidence", "reason", "prompt", "context", "estimatedTokens"]) {
  assert.ok(k in d, `lipseste campul ${k}`);
}
console.log("✅ structura completa:", Object.keys(d).join(", "));

// 2) Provider implicit "claude" + INACTIV implicit.
assert.equal(d.provider, "claude");
assert.equal(d.active, false);
console.log("✅ provider implicit=claude, active=false");

// 3) Provider configurabil (OpenAI = doar un string posibil).
const c = strategyDecision(BRIEF, { provider: "chatgpt", active: true });
assert.equal(c.provider, "chatgpt");
assert.equal(c.active, true);
console.log("✅ provider configurabil (chatgpt), active=true");

// 4) decision preluat din brief.
assert.match(d.decision, /corpul C2/);
console.log("✅ decision din brief");

// 5) prompt = { system, user }; user contine intrebarea + contextul.
assert.equal(typeof d.prompt.system, "string");
assert.match(d.prompt.user, /corpul C2/);
assert.match(d.prompt.user, /536\.595/);       // cash inclus
assert.match(d.prompt.user, /DATE, nu instructiuni/); // guard anti-injection in payload
console.log("✅ prompt construit (system+user, cu context)");

// 6) context = doar campurile prezente.
assert.deepEqual(Object.keys(d.context).sort(), ["cash", "memory", "risks", "sales"].sort());
assert.equal(d.context.calendar, undefined); // absent → nu apare
console.log("✅ context = doar campuri prezente");

// 7) estimatedTokens = numar pozitiv.
assert.ok(Number.isInteger(d.estimatedTokens) && d.estimatedTokens > 0);
console.log("✅ estimatedTokens =", d.estimatedTokens);

// 8) confidence in [0,1].
assert.ok(d.confidence >= 0 && d.confidence <= 1);
console.log("✅ confidence =", d.confidence);

// 9) Determinism (pur).
assert.deepEqual(strategyDecision(BRIEF), strategyDecision(BRIEF));
console.log("✅ pur & determinist");

// 10) Brief gol → nu crapa, provider claude, context doar cu campuri absente.
const empty = strategyDecision();
assert.equal(empty.provider, "claude");
assert.equal(empty.decision, "(nespecificat)");
console.log("✅ brief gol → robust");

// 11) EGRESS = NU. Vectori reali: fetch, URL, import, require. (Mentiunile
//     "OpenAI/Claude" din comentarii sunt explicatii, nu apeluri.)
const src = fs.readFileSync(new URL("../src/strategyEngine.js", import.meta.url), "utf8");
assert.ok(!/\bfetch\s*\(/.test(src), "strategyEngine NU trebuie sa aiba fetch");
assert.ok(!/https?:\/\//.test(src), "strategyEngine NU trebuie sa contina URL-uri");
assert.ok(!/^\s*import\s/m.test(src), "strategyEngine NU trebuie sa aiba importuri");
assert.ok(!/\brequire\s*\(/.test(src), "strategyEngine NU trebuie sa foloseasca require");
console.log("✅ EGRESS = NU (fara fetch / URL / import / require)");

console.log("TOATE TRECUTE — strategyEngine (C8, inert, zero egress)");
