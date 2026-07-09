import assert from "node:assert/strict";

// operationalFastPath → config (transitiv); env dummy inainte (import dinamic).
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

const { detectTaskIntent } = await import("../src/operationalFastPath.js");

// 1) Intrebari SIMPLE de task-uri → fast path (intent detectat).
const nelu = detectTaskIntent("ce face Nelu");
assert.equal(nelu?.kind, "person");
assert.equal(nelu?.person, "nelu");
console.log("✅ ce face Nelu → person/nelu");

const count = detectTaskIntent("cate task-uri are Nelu");
assert.equal(count?.kind, "person");
assert.equal(count?.count, true);
console.log("✅ cate task-uri are Nelu → count");

assert.equal(detectTaskIntent("ce e intarziat")?.kind, "overdue");
console.log("✅ ce e intarziat → overdue");

assert.equal(detectTaskIntent("ce trebuie terminat azi")?.kind, "today");
console.log("✅ ce trebuie terminat azi → today");

const adrian = detectTaskIntent("task-urile lui Adrian");
assert.equal(adrian?.kind, "person");
assert.equal(adrian?.person, "adrian");
console.log("✅ task-urile lui Adrian → person/adrian");

// 2) Intrebare COMPLEXA/analitica → NU fast path (ramane la Claude+MCP).
assert.equal(detectTaskIntent("cum se leaga intarzierile lui Nelu de cash-flow"), null);
console.log("✅ 'cum se leaga ... de cash-flow' → null (Claude+MCP)");

// 3) Mesaje care nu-s despre task-uri → null.
for (const m of ["salut", "cum merg vanzarile", "de ce e blocat proiectul"]) {
  assert.equal(detectTaskIntent(m), null, `"${m}" nu trebuie sa fie task fast-path`);
}
console.log("✅ ne-task / analitic → null");

console.log("TOATE TRECUTE — operationalFastPath (O1)");
