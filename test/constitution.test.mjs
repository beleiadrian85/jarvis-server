// JARVIS CEO CONSTITUTION + MANAGERIAL REASONING + QUALITY GATE (Partea VII).
// Dovedeste ca regulile INFLUENTEAZA raspunsul (gate determinist) si nu pot fi
// ocolite. node test/constitution.test.mjs
import { readFileSync } from "node:fs";
import { PRINCIPLES, constitutionForPrompt, isManagerialIntent, constitutionVersion } from "../src/ceo/constitution.js";
import { needsManagerialReasoning, buildManagerialAssessment, assessmentInstruction } from "../src/ceo/managerialReasoning.js";
import { checkManagerialResponse, correctionInstruction } from "../src/ceo/qualityGate.js";
import { detectCorrection, recordCorrection } from "../src/ceo/founderModel.js";

let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(`${c ? "✅" : "❌"} ${n}. ${m}`); if (!c) failed++; };
const G = (reply, ctx = {}) => checkManagerialResponse(reply, { isManagerial: true, ...ctx });

// ── Constitutia canonica ────────────────────────────────────────
ok(PRINCIPLES.length === 15, "15 principii definite");
ok(/CONSTITUTIA CEO/.test(constitutionForPrompt()) && /founder filter/i.test(constitutionForPrompt()), "constitutionForPrompt injecteaza principiile");
ok(constitutionVersion() === "1.0.0", "versiune incarcata din doc");

// ── Routing managerial vs factual ───────────────────────────────
ok(isManagerialIntent("cum stam cu cash-ul?") && needsManagerialReasoning("care sunt riscurile?", ["RISK"]), "intrebare manageriala → contract + gate");
ok(!isManagerialIntent("cat e ora?"), "intrebare simpla factuala → NU managerial (ruta rapida)");

// ── TEST 1 — RISCURI: enumerare + generic + fara owner → FAIL ────
const risc_rau = "Riscuri:\n- 1 plata restanta\n- 11 task-uri intarziate\n- 6 rezervari fara avans\n- stoc materiale scazut\nAchita sau reeșaloneaza si urmareste situatia.";
{ const g = G(risc_rau); ok(!g.pass && g.violations.some((v) => v.principle.includes("P7")) && g.violations.some((v) => v.principle.includes("P6") || v.principle.includes("P2")), "TEST1. riscuri enumerate+generice+fara owner → gate FAIL"); }
const risc_bun = "CE CONTEAZA ACUM: singurul risc material e plata restanta catre furnizor — restul sunt sub control. Dana verifica azi suma si daca e deja initiata. Eu urmaresc raspunsul si reconcilierea. Te implic doar daca nu poate fi acoperita.";
ok(G(risc_bun).pass, "TEST1b. raspuns managerial bun (concluzie+owner+actiune JARVIS+escaladare) → PASS");

// ── TEST 5 — OWNER: recomandare materiala fara owner → FAIL ──────
ok(!G("Recomand sa achitam obligatia cat mai repede.").pass, "TEST5. recomandare fara owner → FAIL");
ok(G("Recomand ca Dana sa verifice si sa achite obligatia pana vineri.").pass, "TEST5b. recomandare cu owner+termen → PASS");

// ── TEST 6 — FOUNDER FILTER: sarcina operationala pe Adrian → FAIL ─
ok(!G("Tu sa ceri Danei extrasul si sa verifici soldul.").pass, "TEST6. pune sarcina operationala pe Adrian → FAIL");
ok(G("Eu ii cer Danei extrasul azi si verific soldul; te anunt cand am cifra.").pass, "TEST6b. JARVIS preia sarcina → PASS");

// ── TEST 3 — INCASARE ASTEPTATA: scenariu ca fapt → FAIL ─────────
ok(!G("Dupa incasare vei avea sigur 1500000 lei disponibili.", { founderExpectation: true }).pass, "TEST3. asteptare prezentata ca incasare sigura → FAIL");
ok(G("Daca se confirma incasarea de 1.5M lei, acopera obligatiile lunii; pana atunci o tin ca asteptare, nu cash verificat.", { founderExpectation: true }).pass, "TEST3b. asteptare conditionata → PASS");

// ── TEST 4 + 8 — CLOSED LOOP: succes fara dovada → FAIL ──────────
ok(!G("Task-ul e rezolvat, gata.").pass, "TEST4/8. declara rezolvat fara dovada → FAIL");
ok(G("Task-ul e marcat rezolvat, dar astept documentul de confirmare ca sa il inchid verificat.").pass, "TEST4/8b. rezolvat + cere dovada → PASS");

// ── TEST 7 — EMOTII: stare psihologica ca fapt → FAIL ────────────
ok(!G("Nelu e demotivat si dezinteresat.").pass, "TEST7. stare emotionala ca fapt → FAIL");
ok(G("Nelu are 3 task-uri fara progres de 5 zile — posibil supraincarcat, de verificat cu el.").pass, "TEST7b. observatie factuala + ipoteza marcata → PASS");

// ── P9 lipsa datelor != zero ────────────────────────────────────
ok(!G("Avem zero lei avans pe cele 6 rezervari.", { unknowns: ["avans nereconciliat"] }).pass, "P9. 'zero avans' cu date lipsa → FAIL");

// ── P14 coduri interne ──────────────────────────────────────────
ok(!G("Am creat need:abc12 si loop:xy pentru #QLRATF.").pass, "P14. coduri interne la om → FAIL");

// ── Contract managerial (obiect intern) ─────────────────────────
{ const a = buildManagerialAssessment({ text: "cum stam cu cash?", intents: ["CASH"], sourceTruth: { sources: [{ source: "Bank", status: "NOT_CONNECTED", data_domains: ["bank_balance"] }] } });
  ok(a.unknowns.some((u) => /Bank/.test(u)) && a.user_intent === "CASH", "contract: necunoscutele si intentia populate din context"); }
ok(/RASPUNS MANAGERIAL/.test(assessmentInstruction({ unknowns: ["sold"], founder_declared_expectations: [] })), "assessmentInstruction cere raspuns pe contract");

// ── Corectie → invatare in Founder Model (Partea VI) ────────────
ok(detectCorrection("nu ma pune pe mine sa fac asta").isCorrection && detectCorrection("ai presupus, nu ti-am zis").principle.includes("P1"), "detectCorrection recunoaste tiparele lui Adrian");
ok(!detectCorrection("multumesc, perfect").isCorrection, "mesaj normal != corectie");
{ const mem = {}; const store = { get: async (k, f) => (k in mem ? mem[k] : f), set: async (k, v) => { mem[k] = v; } };
  await recordCorrection("nu-mi lista tot", "lista lunga...", { store });
  const r2 = await recordCorrection("nu insira atatea", "alta lista...", { store });
  const r3 = await recordCorrection("prea lung, nu enumera", "iar lista...", { store });
  ok(r3.recorded && r3.confirmations === 3 && r3.promote_candidate === true, "corectii repetate → candidat de promovare (3x, NU modifica Constitutia automat)"); }

// ── Anti-ocolire: correctionInstruction produce ghidaj concret ──
{ const g = G(risc_rau); ok(/P7|P6|P2/.test(correctionInstruction(g)) && /owner|concluzie|specific/i.test(correctionInstruction(g)), "correctionInstruction da ghidaj concret pt. regenerare"); }

// ══ CLAIM VALIDATOR — SUBSTANTA (corectia critica) ══════════════
// TEST A — FOUNDER FILTER: "Adrian, intreab-o pe Dana" → FAIL
ok(!G("Tu sa o intrebi pe Dana de sold la 11:00 si sa verifici rezultatul.").pass, "TEST A. ii cere lui Adrian sa intrebe/verifice (operational) → FAIL");
ok(G("Ii cer eu Danei soldul azi si urmaresc raspunsul; te implic doar daca nu raspunde sau apare deficit de capital.").pass, "TEST A2. JARVIS preia solicitarea + urmarirea → PASS");

// TEST B — DEADLINE FABRICATION: ora exacta fara baza → FAIL
ok(!G("Dana da soldul la 11:00, forecast la 12:00, verificare la 14:00.").pass, "TEST B. ore exacte fabricate → FAIL");
ok(G("Ii cer Danei soldul azi; conform task-ului scadent pe 30 iulie, urmaresc pana atunci.").pass, "TEST B2. termen cu baza (task/azi) → PASS");
ok(!G("Raspuns necesar in 30 de minute.").pass, "TEST B3. 'in 30 de minute' fara baza → FAIL");

// TEST C — THRESHOLD FABRICATION: prag numeric fara model → FAIL
ok(!G("Daca soldul e sub 200.000 lei, criza imediata.").pass, "TEST C. prag 200k fara model → FAIL");
ok(G("Riscul devine critic daca soldul reconciliat nu acopera obligatiile certe pana la urmatoarea incasare verificata.").pass, "TEST C2. prag conditional fara cifra inventata → PASS");
ok(G("Conform obligatiilor certe de plata de 416.000 lei scadente, riscul e acoperit doar daca soldul depaseste aceasta suma.").pass, "TEST C3. prag cu baza (obligatii certe) → PASS");

// TEST D — EXECUTION LANGUAGE: "pun observatie" fara receipt → FAIL
ok(!G("Pun observatie pe task si alertez zilnic pana se rezolva.").pass, "TEST D. limbaj de executie fara receipt → FAIL");
ok(G("Pot crea solicitarea catre Dana si o urmaresc; nu pot reconcilia automat pana nu se importa extrasul.").pass, "TEST D2. limbaj de capabilitate → PASS");
ok(G("Am creat solicitarea catre Dana.", { receipts: [{ id: "OP1" }] }).pass, "TEST D3. 'am creat' CU receipt → PASS");

// TEST E — HUMAN PSYCHOLOGY (deja P10, intarit)
ok(!G("Nelu isi pierde motivatia din cauza reluarilor.").pass, "TEST E. deduce motivatia din task-uri → FAIL");
ok(G("Lipsa validarii poate produce reluare inutila si intarziere la Nelu.").pass, "TEST E2. efect factual, nu psihologie → PASS");

// TEST F — TECHNICAL ROOT CAUSE: proces manual inainte de pipeline → FAIL
ok(!G("Dana sa faca reconciliere manuala zilnic 30 de minute.").pass, "TEST F. rutina manuala fara root-cause → FAIL");
ok(G("Verific intai daca extrasul incarcat a fost detectat, parsat si importat; daca pipeline-ul e blocat, e problema tehnica, nu o transform in rutina manuala.").pass, "TEST F2. root-cause pipeline inainte de munca manuala → PASS");

// TEST G — VALIDATION AUTHORITY: "doar Adrian valideaza" → FAIL
ok(!G("Doar Adrian poate valida task-urile.").pass, "TEST G. presupune ca doar Adrian valideaza → FAIL (regula reala: creatorul valideaza)");

// ── Wiring: brain.js aplica gate-ul pe calea manageriala (nu poate fi ocolit) ─
const brain = readFileSync(new URL("../src/brain.js", import.meta.url), "utf8");
ok(/needsManagerialReasoning/.test(brain) && /constitutionForPrompt/.test(brain) && /checkManagerialResponse/.test(brain), "brain.js injecteaza Constitutia + ruleaza Quality Gate pe calea manageriala");
ok(/CLAIM_DISCIPLINE_PROMPT/.test(brain), "brain.js injecteaza disciplina afirmatiilor (termen/prag/owner/executie/founder)");
ok(/recordCorrection/.test(brain), "brain.js inregistreaza corectiile lui Adrian (Founder Model)");

console.log(`\n${n} verificari · ${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — constitution`);
process.exit(failed === 0 ? 0 : 1);
