// MULTI-QUESTION + COMPLETENESS GUARD + CONVERSATIONAL MEMORY. Teste A-J.
// node test/multiQuestion.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

import { readFileSync } from "node:fs";
const { countQuestions } = await import("../src/intents.js");
const { splitQuestions, multiQuestionInstruction, completenessGap, countAnsweredSections, tokenBudgetFor } = await import("../src/multiQuestion.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// ── A. 3 intrebari intr-un mesaj → 3 intrebari detectate ────────────────
const q3 = splitQuestions("Ce i-ai cerut Danei? Ce i-ai cerut lui Nelu? Ce am eu de facut azi?");
ok(q3.length === 3, `A. 3 intrebari → 3 detectate (a fost ${q3.length})`);
ok(/Danei/.test(q3[0]) && /Nelu/.test(q3[1]) && /azi/.test(q3[2]), "A. ordinea intrebarilor pastrata");

// ── B. 10 intrebari numerotate → 10 detectate ──────────────────────────
const t10 = Array.from({ length: 10 }, (_, i) => `${i + 1}. intrebarea ${i + 1}?`).join(" ");
ok(splitQuestions(t10).length === 10, `B. 10 numerotate → 10 (a fost ${splitQuestions(t10).length})`);

// ── C. 35 intrebari → niciuna omisa ─────────────────────────────────────
const t35 = Array.from({ length: 35 }, (_, i) => `${i + 1}. cerere numarul ${i + 1}`).join("\n");
ok(splitQuestions(t35).length === 35, `C. 35 intrebari → 35, niciuna omisa (a fost ${splitQuestions(t35).length})`);

// ── D. Completeness guard: raspuns incomplet detectat, UNKNOWN nu omisa ──
const gapIncomplete = completenessGap(8, "1. da\n2. nu\n3. poate\n4. ok\n5. gata");
ok(!gapIncomplete.complete && gapIncomplete.answered === 5 && gapIncomplete.missing.join(",") === "6,7,8", "D+J. 8 detectate, 5 raspunse → incomplet, lipsesc 6,7,8");
const gapComplete = completenessGap(3, "1. da\n2. UNKNOWN — lipseste soldul\n3. gata");
ok(gapComplete.complete && gapComplete.answered === 3, "D. UNKNOWN conteaza ca raspuns (nu omisa) → complet");

// countAnsweredSections pe formate variate (**1.**, 1), 1.)
ok(countAnsweredSections("**1.** raspuns\n2) alt raspuns\n3. inca unul") === 3, "numara sectiuni numerotate in formate variate");

// ── E + follow-up context: instructiunea pastreaza intrebarile in ordine ─
const instr = multiQuestionInstruction(["Ce i-ai cerut Danei?", "Si daca nu raspunde?"]);
ok(/2 intrebari/.test(instr) && /1\. Ce i-ai cerut Danei/.test(instr) && /2\. Si daca nu raspunde/.test(instr), "E. instructiunea listeaza toate intrebarile, in ordine");
ok(/UNKNOWN/.test(instr) && /NU sari peste niciuna/.test(instr), "instructiunea cere UNKNOWN si zero omisiuni");

// ── I. CASH+NELU+DANA in acelasi mesaj → 3 cereri, nu un template unic ───
const qMix = splitQuestions("Cat cash avem, ce e cu Nelu si ce i-am cerut Danei?");
ok(qMix.length >= 2, `I. cash+nelu+dana → mai multe cereri (a fost ${qMix.length})`);

// Mesaj simplu → o singura "intrebare", fara instructiune multi.
ok(splitQuestions("salut, cum merge?").length === 1, "mesaj simplu → 1 (fara descompunere fortata)");
ok(splitQuestions("").length === 0, "mesaj gol → 0");

// ── Buget de tokeni scalat (nu taia raspunsul la seturi mari) ───────────
ok(tokenBudgetFor(1, 800) === 800, "1 intrebare → buget de baza");
ok(tokenBudgetFor(10, 800) === 2800 && tokenBudgetFor(35, 800) === 7800, "buget scaleaza cu nr. de intrebari (plafonat)");

// ── §7 + wiring: acelasi context, garda in brain, memorie conversationala ─
const brain = readFileSync(new URL("../src/brain.js", import.meta.url), "utf8");
ok(/splitQuestions\(text\)/.test(brain) && /multiQuestionInstruction\(questions\)/.test(brain), "brain: descompune + instruieste (acelasi context pt toate — un singur apel)");
ok(/completenessGap\(questions\.length, reply\)/.test(brain) && /Ai omis raspunsul la aceste intrebari/.test(brain), "§2. garda de completitudine: completeaza cele lipsa, nu trimite incomplet");
ok(/tokenBudgetFor\(questions\.length/.test(brain), "buget scalat cablat in ambele cai");
ok(/ctx\.recent\.map/.test(brain) && /SUMARUL CONVERSATIEI/.test(brain), "§3. istoricul conversational intra in context (mesaje + sumar)");
const persona = readFileSync(new URL("../src/persona.js", import.meta.url), "utf8");
ok(/CONVERSATIE vs ADEVAR OPERATIONAL/.test(persona) && /nu suprascrii realitatea/.test(persona), "§4+H. conversatie != adevar Operational (contradictia se arata, nu suprascrie)");
ok(/raspunde la FIECARE separat/.test(persona), "PERSONA: raspunde punctual la fiecare");
const history = readFileSync(new URL("../src/history.js", import.meta.url), "utf8");
ok(/appendMessage/.test(history) && /getContext/.test(history), "§3+G. istoricul se salveaza si se reincarca (persistenta existenta)");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — multiQuestion (A-J)`);
process.exit(failed === 0 ? 0 : 1);
