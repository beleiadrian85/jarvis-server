import assert from "node:assert/strict";

// Env dummy INAINTE de a importa config (via capabilities) — import dinamic.
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

const { getCapabilities, supports, listUnavailable } = await import("../src/capabilities.js");

const caps = getCapabilities();

// 1) Forma completa — exact 12 chei.
const KEYS = [
  "operational", "googleCalendar", "gmail", "drive", "memory",
  "railwayLogs", "ga4", "searchConsole", "banking", "strategy", "voice", "vision",
];
for (const k of KEYS) assert.ok(k in caps, `lipseste cheia ${k}`);
assert.equal(Object.keys(caps).length, KEYS.length, "numar de chei neasteptat");

// 2) Toate valorile sunt boolean.
for (const [k, v] of Object.entries(caps)) assert.equal(typeof v, "boolean", `${k} nu e boolean`);

// 3) Capabilitatile neintegrate sunt false (inclusiv strategy — ChatGPT neactivat).
for (const k of ["railwayLogs", "ga4", "searchConsole", "banking", "strategy"]) {
  assert.equal(caps[k], false, `${k} trebuie false`);
}

// 4) supports()
assert.equal(supports("strategy"), false);
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
assert.ok(unavail.includes("strategy") && unavail.includes("banking") && unavail.includes("ga4"));

console.log("✅ getCapabilities:", JSON.stringify(caps));
console.log("✅ supports() OK (cheie necunoscuta → false)");
console.log("✅ listUnavailable:", unavail.join(", "));
console.log("TOATE TRECUTE — capabilities");
