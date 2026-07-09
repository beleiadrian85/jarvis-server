import assert from "node:assert/strict";
import { classify } from "../src/decisionEngine.js";

// Context tipic: firma conectata, ChatGPT INACTIV (hasStrategy=false).
const OP = { hasOperational: true, hasGoogle: true, hasStrategy: false };

const cases = [
  ["salut", "simple", null],
  ["cash forecast", "report", "cash"],
  ["ce riscuri am acum", "report", "risk"],
  ["ce face Nelu la task-uri", "operational_read", null],
  ["consiliu: sa vand terenul din Marsa", "council", null],
];

for (const [txt, route, kind] of cases) {
  const d = classify(txt, OP);
  assert.equal(d.route, route, `"${txt}" → ${d.route}, asteptat ${route}`);
  if (kind) assert.equal(d.kind, kind, `"${txt}" kind ${d.kind}, asteptat ${kind}`);
  console.log(`✅ "${txt}" → ${d.route}${d.kind ? "/" + d.kind : ""}`);
}

// Strategie cu ChatGPT INACTIV → ruta strategy, dar fallback pe Claude.
const s = classify("ce ai face in locul meu", OP);
assert.equal(s.route, "strategy");
assert.equal(s.provider, "claude", "cu hasStrategy=false, provider trebuie Claude");
assert.equal(s.active, false, "cu hasStrategy=false, strategy trebuie inactiva");
console.log(`✅ "ce ai face in locul meu" → strategy (provider ${s.provider}, active ${s.active})`);

// Bonus: cand ChatGPT devine activ (flag on) → provider chatgpt, active true.
const s2 = classify("ce ai face in locul meu", { ...OP, hasStrategy: true });
assert.equal(s2.provider, "chatgpt");
assert.equal(s2.active, true);
console.log(`✅ cu hasStrategy=true → strategy (provider ${s2.provider}, active ${s2.active})`);

// Actiune cu efect → approvalGate obligatoriu (requiresApproval), nu executie directa.
const act = classify("creeaza task: suna furnizorul", OP);
assert.equal(act.route, "action_propose");
assert.equal(act.requiresApproval, true);
console.log(`✅ "creeaza task ..." → ${act.route} (requiresApproval=${act.requiresApproval})`);

console.log("TOATE TRECUTE — decisionEngine");
