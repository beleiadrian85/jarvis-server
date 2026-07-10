import assert from "node:assert/strict";

process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

const mod = await import("../src/openai.js");

// 1) Exportat corect (modulul se incarca inert, fara side-effecte).
assert.equal(typeof mod.callOpenAI, "function");
console.log("✅ callOpenAI e functie");

// 2) INERT: NU apelam callOpenAI aici (ar face un apel real la OpenAI / cost).
//    Verificam doar ca sursa nu expune tool-uri/function-calling (zero executie).
const src = (await import("node:fs")).readFileSync(new URL("../src/openai.js", import.meta.url), "utf8");
assert.ok(!/["']tools["']\s*:/.test(src), "openai.js NU trebuie sa trimita tools");
assert.ok(!/function_call|functions\s*:/.test(src), "openai.js NU trebuie sa foloseasca function-calling");
console.log("✅ fara tools / function-calling (ChatGPT nu executa nimic)");

console.log("TOATE TRECUTE — openai client (C7, inert)");
