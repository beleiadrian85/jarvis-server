// EXTERNAL INTELLIGENCE (Fazele 23-26, I14). node test/externalIntel.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

import { readFileSync } from "node:fs";
const { buildExternalBrief, externalForPrompt, asksExternal, EXTERNAL_TOPICS } = await import("../src/ceo/externalIntel.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// Registrul de topicuri (§24) — relevante Bell/Profi Concept.
ok(EXTERNAL_TOPICS.length >= 6 && EXTERNAL_TOPICS.every((t) => t.key && t.label && t.why_matters), "§24. registru de topicuri cu relevanta declarata");
ok(EXTERNAL_TOPICS.some((t) => /eur_ron|dobanzi|credit/i.test(t.key)), "topicuri financiare cheie (curs, dobanzi, credit)");

// LLM injectat → brief cu mapare externa→interna (§25).
const fakeLLM = async () => JSON.stringify({ signals: [
  { topic: "eur_ron", headline: "EUR/RON urca la 5.10", source: "ZF", published: "2026-07-20", reliability: "high", confidence: 80, exposed_areas: ["cash", "pricing"], internal_impact: "preturile Bell in EUR devin mai scumpe in RON pentru cumparatori", urgency: "medium", recommendation: "monitorizeaza conversia rezervarilor" },
  { topic: "dobanzi_bnr", headline: "BNR mentine dobanda", source: "Agerpres", published: "2026-07-18", reliability: "high", confidence: 75, exposed_areas: ["financing"], internal_impact: "costul creditelor ipotecare ramane stabil", urgency: "low", recommendation: "fara actiune" },
]});
const brief = await buildExternalBrief({ llm: fakeLLM });
ok(brief.signals.length === 2, "brief parseaza semnalele din web search");
ok(brief.signals.every((s) => s.kind === "EXTERNAL_SIGNAL"), "I14. fiecare semnal e marcat EXTERNAL (NU fapt intern)");
ok(brief.signals[0].internal_impact && brief.signals[0].exposed_areas.length, "§25. mapare externa→interna (impact + zone expuse)");
ok(brief.signals.every((s) => s.source && s.retrieved_at && s.confidence != null), "§26. provenienta obligatorie (sursa, data, incredere)");
ok(/NU fapte interne/i.test(brief.note), "brief-ul declara explicit: semnale, nu fapte interne");

// Web search esuat → zero semnale, NU inventeaza.
const failLLM = async () => { throw new Error("web down"); };
const b2 = await buildExternalBrief({ llm: failLLM });
ok(b2.signals.length === 0 && /nu inventez/i.test(b2.note), "web search esuat → zero semnale, nu inventeaza");

// Rezumatul pt chat: doar semnale materiale + framing anti-halucinatie.
const p = externalForPrompt(brief);
ok(/NU fapte interne/i.test(p) && /EUR\/RON/.test(p), "rezumatul pt chat marcheaza extern + include semnalul material");

// Detectia intrebarilor externe.
ok(asksExternal("Ce se intampla in piata care ne afecteaza?") && asksExternal("cum sta cursul euro?"), "detecteaza intrebarile despre lumea externa");
ok(!asksExternal("cate task-uri are Nelu?"), "intrebare interna → NU externa");

// Gated + wiring.
const cfg = readFileSync(new URL("../src/config.js", import.meta.url), "utf8");
ok(/externalIntel:.*CEO_EXTERNAL_INTEL_ENABLED/.test(cfg), "flag CEO_EXTERNAL_INTEL_ENABLED (implicit OFF)");
const brain = readFileSync(new URL("../src/brain.js", import.meta.url), "utf8");
ok(/asksExternal\(text\)/.test(brain) && /config\.externalIntel/.test(brain), "chat injecteaza intelligence extern (gated) la intrebari externe");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — externalIntel`);
process.exit(failed === 0 ? 0 : 1);
