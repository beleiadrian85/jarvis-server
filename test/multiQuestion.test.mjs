// MULTI-INTREBARE: JARVIS raspunde punctual la mai multe intrebari + istoric.
// node test/multiQuestion.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

import { readFileSync } from "node:fs";
const { countQuestions } = await import("../src/intents.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// O singura intrebare / mesaj simplu → NU multi.
ok(countQuestions("Cat cash am?") === 1, "o intrebare → 1");
ok(countQuestions("salut") === 0, "mesaj fara intrebare → 0");
ok(countQuestions("Multumesc, super treaba") === 0, "confirmare → 0");

// Mai multe intrebari (cu ?, cu 'si', liste numerotate) → multi (>=2).
ok(countQuestions("Ce facem cu Nelu? Si Dana ce a raspuns? Care e soldul?") >= 3, "trei intrebari cu ? → >=3");
ok(countQuestions("1. status C3 2. cash forecast 3. ce e blocat") >= 3, "lista numerotata → >=3");
ok(countQuestions("verifica task-urile lui Nelu si spune-mi ce e restant") >= 2, "doua cereri unite cu 'si' → >=2");
ok(countQuestions("Cum sta cash-flow-ul si ce riscuri avem pe 30 zile?") >= 2, "doua intrebari, un singur ? → >=2");

// Regula e in PERSONA + bugetul de tokeni creste la multi-intrebare.
const persona = readFileSync(new URL("../src/persona.js", import.meta.url), "utf8");
ok(/MAI MULTE INTREBARI/.test(persona) && /raspunde la FIECARE separat/.test(persona), "PERSONA: regula raspunde la fiecare intrebare separat");
const brain = readFileSync(new URL("../src/brain.js", import.meta.url), "utf8");
ok(/countQuestions\(text\)/.test(brain) && /multi \? 2000 : 800/.test(brain), "brain: buget de tokeni mai mare la multi-intrebare (nu taie raspunsul)");
ok(/multi \? 2600 : 1400/.test(brain), "brain: buget mai mare si pe calea cu tool-uri");

// Istoricul conversational e trimis modelului (context pastrat).
const brainCtx = /ctx\.recent\.map/.test(brain) && /SUMARUL CONVERSATIEI/.test(brain);
ok(brainCtx, "istoricul (ultimele mesaje + sumar) intra in contextul modelului");
const history = readFileSync(new URL("../src/history.js", import.meta.url), "utf8");
ok(/appendMessage/.test(history) && /getContext/.test(history), "istoricul se salveaza (appendMessage) si se reincarca (getContext)");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — multiQuestion`);
process.exit(failed === 0 ? 0 : 1);
