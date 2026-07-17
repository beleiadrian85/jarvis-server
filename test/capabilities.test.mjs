import assert from "node:assert/strict";

// Env dummy INAINTE de a importa config (via capabilities) — import dinamic.
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

const { getCapabilities, supports, listUnavailable } = await import("../src/capabilities.js");
const { hasStrategy } = await import("../src/config.js");

const caps = getCapabilities();

// 1) Forma completa — exact 14 chei.
const KEYS = [
  "operational", "googleCalendar", "gmail", "drive", "memory",
  "railwayLogs", "ga4", "searchConsole", "banking", "strategy", "voice", "vision",
  "executiveBoard", "executiveBoardShadow",
];
for (const k of KEYS) assert.ok(k in caps, `lipseste cheia ${k}`);
assert.equal(Object.keys(caps).length, KEYS.length, "numar de chei neasteptat");

// 2) Toate valorile sunt boolean.
for (const [k, v] of Object.entries(caps)) assert.equal(typeof v, "boolean", `${k} nu e boolean`);

// 3) Capabilitatile neintegrate sunt false.
for (const k of ["railwayLogs", "ga4", "searchConsole", "banking"]) {
  assert.equal(caps[k], false, `${k} trebuie false`);
}
// strategy urmeaza flag-ul: false implicit, true DOAR cand OPENAI_API_KEY && STRATEGY_ROUTING=on.
assert.equal(caps.strategy, hasStrategy, "strategy trebuie sa reflecte hasStrategy");
// Executive Board (CODEX Faza 3): ambele implicit OFF (gated).
if (!process.env.EXECUTIVE_BOARD_ENABLED) assert.equal(caps.executiveBoard, false, "executiveBoard trebuie OFF implicit");
if (!process.env.EXECUTIVE_BOARD_SHADOW_MODE) assert.equal(caps.executiveBoardShadow, false, "executiveBoardShadow trebuie OFF implicit");

// 4) supports()
assert.equal(supports("strategy"), hasStrategy);
assert.equal(supports("ga4"), false);
assert.equal(supports("inexistent"), false, "cheie necunoscuta → false");
assert.equal(supports("vision"), caps.vision);
assert.equal(supports("memory"), caps.memory);

// 5) listUnavailable() = exact cheile cu valoare false.
const unavail = listUnavailable();
assert.deepEqual(
  [...unavail].sort(),
  Object.keys(caps).filter((k) => !caps[k]).sort(),
);
assert.ok(unavail.includes("banking") && unavail.includes("ga4"));
assert.equal(unavail.includes("strategy"), !hasStrategy, "strategy in unavailable doar cand e off");

console.log("✅ getCapabilities:", JSON.stringify(caps));
console.log("✅ supports() OK (cheie necunoscuta → false)");
console.log("✅ listUnavailable:", unavail.join(", "));
console.log("TOATE TRECUTE — capabilities");
