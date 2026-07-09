import assert from "node:assert/strict";

// decisionEngine importa acum capabilities → config; setam env dummy INAINTE (import dinamic).
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

const { classify } = await import("../src/decisionEngine.js");
const { getCapabilities } = await import("../src/capabilities.js");

// Context tipic: firma conectata, ChatGPT INACTIV.
const OP = { hasOperational: true, hasGoogle: true, hasStrategy: false };

// ── Cazuri vechi (trebuie sa ramana verzi) ──────────────────────────────
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

// Actiune cu efect → approvalGate obligatoriu.
const act = classify("creeaza task: suna furnizorul", OP);
assert.equal(act.route, "action_propose");
assert.equal(act.requiresApproval, true);
console.log(`✅ "creeaza task ..." → ${act.route} (requiresApproval=${act.requiresApproval})`);

// Strategie cu ChatGPT INACTIV → strategy, fallback Claude, reason strategy_disabled.
const s = classify("ce ai face in locul meu", OP);
assert.equal(s.route, "strategy");
assert.equal(s.provider, "claude");
assert.equal(s.active, false);
assert.equal(s.reason, "strategy_disabled");
console.log(`✅ "ce ai face in locul meu" → strategy (provider ${s.provider}, active ${s.active}, ${s.reason})`);

// Strategie cu capability activa (simulat) → provider chatgpt, active true.
const s2 = classify("ce ai face in locul meu", OP, { capabilities: { ...getCapabilities(), strategy: true } });
assert.equal(s2.route, "strategy");
assert.equal(s2.provider, "chatgpt");
assert.equal(s2.active, true);
console.log(`✅ (capability strategy:true) → strategy (provider ${s2.provider}, active ${s2.active})`);

// ── Cazuri noi C2 — capabilitati indisponibile → clarify ────────────────
const capsCases = [
  ["arata-mi logurile de pe railway", "capability_missing:railwayLogs"],
  ["ce zice google analytics", "capability_missing:ga4"],
  ["ce spune search console despre site", "capability_missing:searchConsole"],
  ["vreau sa vad banking", "capability_missing:banking"],
];
for (const [txt, reason] of capsCases) {
  const d = classify(txt, OP);
  assert.equal(d.route, "clarify", `"${txt}" → ${d.route}, asteptat clarify`);
  assert.equal(d.reason, reason, `"${txt}" reason ${d.reason}, asteptat ${reason}`);
  console.log(`✅ "${txt}" → clarify (${d.reason})`);
}

// ── C2.1 — draft email → route "draft" (paritate cu brain step 7) ───────
for (const t of [
  "draft raspuns la emailul de la avocat",
  "draft: scrie-i lui Dana ca am primit actele",
  "scrie draft pentru email catre notar",
]) {
  const d = classify(t, OP);
  assert.equal(d.route, "draft", `"${t}" → ${d.route}, asteptat draft`);
  console.log(`✅ "${t}" → draft`);
}

console.log("TOATE TRECUTE — decisionEngine + capabilities (C2/C2.1)");
