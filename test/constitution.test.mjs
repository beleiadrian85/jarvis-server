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

// ── Wiring: brain.js aplica gate-ul pe calea manageriala (nu poate fi ocolit) ─
const brain = readFileSync(new URL("../src/brain.js", import.meta.url), "utf8");
ok(/needsManagerialReasoning/.test(brain) && /constitutionForPrompt/.test(brain) && /checkManagerialResponse/.test(brain), "brain.js injecteaza Constitutia + ruleaza Quality Gate pe calea manageriala");
ok(/recordCorrection/.test(brain), "brain.js inregistreaza corectiile lui Adrian (Founder Model)");

console.log(`\n${n} verificari · ${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — constitution`);
process.exit(failed === 0 ? 0 : 1);
