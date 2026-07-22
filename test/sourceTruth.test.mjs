// SOURCE TRUTH + ANTI-HALUCINATIE (§1, §2, §14-17, §25). node test/sourceTruth.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

import { readFileSync } from "node:fs";
const { buildSourceTruth, sourceTruthForPrompt, EVIDENCE_CLASS, FORBIDDEN_UNLESS_PROVEN } = await import("../src/ceo/sourceTruth.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// Contractul de evidenta (§1).
ok(EVIDENCE_CLASS.includes("FACT_VERIFIED") && EVIDENCE_CLASS.includes("UNKNOWN") && EVIDENCE_CLASS.includes("ACTION_EXECUTED") && EVIDENCE_CLASS.includes("ACTION_PLANNED"), "§1. contractul de evidenta acopera fact/unknown/plan/executie");
ok(FORBIDDEN_UNLESS_PROVEN.includes("am cerut") && FORBIDDEN_UNLESS_PROVEN.includes("voi extrage"), "§1. verbe interzise fara capability+evidence");

// Registrul (§2): fiecare sursa are read/write/limitari/evidence — pe dovezi.
const reg = await buildSourceTruth({});
const byName = Object.fromEntries(reg.sources.map((s) => [s.source, s]));
ok(byName["Operational"].write.startsWith("TASKS ONLY") || byName["Operational"].write === "NONE", "Operational: scriere TASKS-ONLY (granita)");
ok(/nu exista API bancar/i.test(byName["Bank (ING/BT/CEC)"].read), "Bank: fara API — NU pretinde acces la sold");
ok(byName["SmartBill"].limitations.some((l) => /bulk/i.test(l)), "SmartBill: limita reala (fara listare bulk) declarata");
ok(reg.sources.every((s) => s.status && s.read && s.write && Array.isArray(s.limitations) && s.evidence), "fiecare sursa are status/read/write/limitari/evidence");

// Rezumatul pentru prompt spune clar ce NU e conectat.
const prompt = sourceTruthForPrompt(reg);
ok(/NOT_CONNECTED/.test(prompt) && /NU pretinde acces peste asta/.test(prompt), "rezumatul pt chat interzice pretinderea de acces peste surse");
ok(/NU inventa ca 'iei tu din sistem'/.test(prompt), "rezumatul interzice 'iei tu din sistem' fara sursa");

// Injectat in chat + reguli anti-halucinatie in persona (§14-17, §23).
const brain = readFileSync(new URL("../src/brain.js", import.meta.url), "utf8");
ok(/buildSourceTruth\(\{\}\)/.test(brain) && /sourceTruthForPrompt/.test(brain), "chat-ul injecteaza SURSE REALE in system-prompt");
const persona = readFileSync(new URL("../src/persona.js", import.meta.url), "utf8");
ok(/REALITY BEFORE INTELLIGENCE/.test(persona), "persona: REALITY BEFORE INTELLIGENCE");
ok(/PLAN != EXECUTIE|plan.*executie/i.test(persona) && /am cerut.*DOAR daca exista o scriere/i.test(persona), "§1. plan != executie in persona");
ok(/LIPSA DATELOR != LIPSA IN REALITATE/.test(persona) && /avansul nu e inregistrat/i.test(persona), "§15-17. lipsa datelor != lipsa reala (avans 0)");
ok(/NU inventa 'Director Financiar'|Director Financiar/.test(persona) && /UNKNOWN pana la dovada/.test(persona), "§14. nu inventa organigrama — owneri UNKNOWN pana la dovada");
ok(/NU afirma reguli.*fara sursa/i.test(persona), "§15. nu inventa reguli de business fara sursa");
ok(/lichiditatea neta = UNKNOWN/i.test(persona), "§16. fara sold → lichiditate UNKNOWN");
ok(/nu arata coduri interne/i.test(persona), "§23. fara coduri interne catre om");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — sourceTruth (anti-halucinatie)`);
process.exit(failed === 0 ? 0 : 1);
