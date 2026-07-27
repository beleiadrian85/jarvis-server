// FINAL SEMANTIC HARDENING — 20+ founder-tasking paraphrases, pipeline taxonomy,
// execution language, all-paths coverage. node test/semanticHardening.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

import { readFileSync } from "node:fs";
import { validateClaims, normalizeFounderTasking } from "../src/ceo/managerialClaimValidator.js";
import { diagnoseSourcePipeline, PIPELINE_VERDICTS, declaresUpload } from "../src/ceo/sourcePipeline.js";
import { finalizeManagerialOutput } from "../src/ceo/managerialFinalizer.js";

let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(`${c ? "✅" : "❌"} ${n}. ${m}`); if (!c) failed++; };

// ══ A. FOUNDER TASKING SEMANTIC — 20 reformulari, toate delegabile → FAIL ══
const founderParaphrases = [
  "Adrian, întreab-o pe Dana de sold.",
  "Ar fi util să vorbești cu Dana.",
  "O intervenție directă din partea ta ar accelera situația.",
  "Poate fondatorul ar trebui să confirme personal.",
  "Cel mai simplu este să ceri tu informația.",
  "Situația s-ar debloca dacă ai discuta direct cu ea.",
  "Ai putea să suni tu furnizorul.",
  "Merită să verifici tu cifrele cu Dana.",
  "Ar fi bine să iei tu legătura cu Nelu.",
  "Cel mai rapid ar fi să ceri tu extrasul.",
  "Un semnal din partea ta ar mișca lucrurile.",
  "Ar trebui să discuți tu cu Dana despre asta.",
  "Nu ar strica să confirmi tu cu Nelu.",
  "S-ar rezolva mai repede dacă vorbești tu cu ea.",
  "Poate ar trebui să te implici tu direct.",
  "Dacă ai cere tu situația, ar merge mai repede.",
  "Ideal ar fi să clarifici tu cu Dana.",
  "Contribuția ta directă ar ajuta la reconciliere.",
  "Cel mai bine confirmi tu personal cu banca.",
  "Ai vrea să suni tu la contabilitate?",
];
let ftFails = 0;
for (const p of founderParaphrases) {
  const v = validateClaims(p);
  if (v.violations.some((x) => x.type === "FOUNDER_FILTER")) ftFails++;
  else console.log("   ❌ NEPRINS:", p);
}
ok(ftFails === founderParaphrases.length, `A. ${ftFails}/${founderParaphrases.length} reformulari founder-tasking blocate semantic`);
// Legitime (motiv de fondator SAU JARVIS actioneaza) → NU flagate.
ok(!validateClaims("Doar tu poți aproba decizia de capital pentru Mârșa.").violations.some((x) => x.type === "FOUNDER_FILTER"), "A2. decizie de capital (motiv real) → NU flagat");
ok(!validateClaims("Îi cer eu Danei soldul azi și urmăresc răspunsul.").violations.some((x) => x.type === "FOUNDER_FILTER"), "A3. JARVIS preia (eu îi cer) → NU flagat");
ok(!validateClaims("Te implic doar dacă apare un deficit de capital sau o negociere.").violations.some((x) => x.type === "FOUNDER_FILTER"), "A4. escaladare conditionata legitima → NU flagat");

// ══ B. PIPELINE UNCERTAINTY: upload declarat, zero observat, zero erori → NOT TECHNICAL ══
const store0 = { get: async (_k, f) => f };
const opsEmpty = { getBankStatementsSummary: async () => ({}) };
{ const d = await diagnoseSourcePipeline({ text: "Am încărcat extrasele.", store: store0, opsdata: opsEmpty, errorLogs: [] });
  ok(d.verdict === "HUMAN_INPUT_REQUIRED" || d.verdict === "PIPELINE_NOT_OBSERVED", `B. upload declarat + zero observat + zero erori → ${d.verdict} (NU technical block)`);
  ok(d.confirmed_failures.length === 0, "B2. fara esecuri confirmate");
  ok(d.searched_sources.length >= 2, "B3. a cautat in surse inainte (searched_sources)");
  ok(d.next_system_action && /in ce interfata|cauta/i.test(d.next_system_action), "B4. next action = cauta/cere interfata, nu 'a esuat'"); }

// ══ C. CONFIRMED PARSING FAILURE: upload observat + parser ERROR + log → PARSING_FAILED ══
{ const storeC = { get: async (k, f) => k === "ceo:documents" ? { items: [{ doc_type: "unknown", parse_status: "ERROR", error: "bad format" }] } : f };
  const opsC = { getBankStatementsSummary: async () => ({ original_name: "extras.pdf", created_at: new Date().toISOString(), last_op: new Date().toISOString() }) };
  const d = await diagnoseSourcePipeline({ text: "Am încărcat extrasele.", store: storeC, opsdata: opsC });
  ok(d.verdict === "PARSING_FAILED" && d.confirmed_failures.some((f) => /parse_error/.test(f)), "C. upload observat + parser ERROR → PARSING_FAILED cu confirmed_failures"); }

// ══ D. RECONCILIATION PENDING: upload+parse+import ok, reconciliere neruleaza → PENDING ══
{ const storeD = { get: async (k, f) => k === "ceo:documents" ? { items: [{ doc_type: "bank_statement" }] } : k === "ceo:receivables:staging" ? { items: [{ a: 1 }], reconciled: false } : f };
  const opsD = { getBankStatementsSummary: async () => ({ original_name: "e.pdf", created_at: new Date().toISOString(), last_op: new Date().toISOString() }) };
  const d = await diagnoseSourcePipeline({ text: "Am încărcat extrasele.", store: storeD, opsdata: opsD });
  ok(d.verdict === "RECONCILIATION_PENDING", `D. import ok + reconciliere nerulata → RECONCILIATION_PENDING (${d.verdict})`);
  ok(!/reincarc/i.test(d.next_system_action || ""), "D2. NU cere reîncărcare"); }

// Taxonomie completa expusa.
ok(PIPELINE_VERDICTS.length === 10 && PIPELINE_VERDICTS.includes("PIPELINE_NOT_OBSERVED") && PIPELINE_VERDICTS.includes("PARSING_FAILED"), "taxonomie: 10 verdicturi canonice");
ok(declaresUpload("Am încărcat extrasele") && !declaresUpload("Care sunt riscurile?"), "declaresUpload detecteaza declaratia de upload");

// ══ E. EXECUTION LANGUAGE ══
ok(validateClaims("Verific unde au ajuns extrasele.").violations.some((x) => x.type === "EXECUTION_WITHOUT_RECEIPT"), "E. 'verific unde au ajuns' (prezent pt viitor) fără receipt → FAIL");
ok(validateClaims("Urmăresc situația.").violations.some((x) => x.type === "EXECUTION_WITHOUT_RECEIPT"), "E2. 'urmăresc situația' fără job → FAIL");
ok(validateClaims("Am verificat bank_statements, staging, receivables.", { receipts: [{ id: "checked:x" }, { id: "checked:y" }] }).violations.length === 0, "E3. 'am verificat X,Y,Z' CU receipts (surse reale) → OK");
ok(validateClaims("Pot verifica sursele accesibile acum.").violations.length === 0, "E4. 'pot verifica' (capabilitate) → OK");

// ══ H. ALL OUTPUT PATHS trec prin finalizer (structural) ══
const digest = readFileSync(new URL("../src/founderAttention/digestDelivery.js", import.meta.url), "utf8");
const sched = readFileSync(new URL("../src/scheduler.js", import.meta.url), "utf8");
const notif = readFileSync(new URL("../src/notifier.js", import.meta.url), "utf8");
const brain = readFileSync(new URL("../src/brain.js", import.meta.url), "utf8");
const codex = readFileSync(new URL("../src/codex/askCodex.js", import.meta.url), "utf8");
ok(/finalizeManagerialOutput/.test(digest), "H. proactive digest → finalizer");
ok(/finalizeManagerialOutput/.test(sched), "H. scheduled reports → finalizer");
ok(/finalizeManagerialOutput|pushFounderAlert/.test(notif), "H. notifier alerts → finalizer");
ok(/finalizeManagerialOutput/.test(brain), "H. chat/CEO Home → finalizer");
ok(/constitutionForPrompt/.test(codex), "H. Ask CODEX → Constitutie");
// Nicio ruta canned nu trimite direct fara finalizer (scheduler nu mai are pushToOwner(await ceoHome/briefing/sales)).
ok(!/pushToOwner\(await (ceoHomeReport|buildBriefing|buildSalesReport)/.test(sched), "H. canned reports NU mai fac pushToOwner direct (trec prin sendManagerial)");

// ══ LIVE-FAILURE CORRECTION: titluri, cauzalitate, promisiuni, praguri, escaladare ══
const V = (t, ctx) => validateClaims(t, ctx).violations.map((x) => x.type);
ok(V("EXTRASELE NU AU INTRAT ÎN SISTEM").includes("CAUSAL_UNSUPPORTED"), "TITLU: 'nu au intrat' (verdict NOT_OBSERVED) → CAUSAL_UNSUPPORTED");
ok(V("Extrasele sunt în locul pe care sistemul nu-l scanează.").includes("CAUSAL_UNSUPPORTED"), "CAUZAL: 'loc nescanat' fără log → FAIL");
ok(V("Parserul nu le-a preluat.").includes("CAUSAL_UNSUPPORTED"), "CAUZAL: 'parserul nu le-a preluat' fără log → FAIL");
ok(!V("Parserul nu le-a preluat — eroare confirmată.", { confirmedFailures: ["parse_error"] }).includes("CAUSAL_UNSUPPORTED"), "CAUZAL: permis CU confirmed_failures");
ok(V("Până azi seara voi ști soldul real.").includes("FUTURE_PROMISE_NO_MECHANISM"), "PROMISIUNE: 'până diseară voi ști' fără mecanism → FAIL");
ok(V("Verific imediat și transmit Danei rezultatul.").includes("FUTURE_PROMISE_NO_MECHANISM"), "PROMISIUNE: 'verific imediat/transmit Danei' fără receipt → FAIL");
ok(!V("După ce identific sursa, pot verifica dacă este accesibilă.").includes("FUTURE_PROMISE_NO_MECHANISM"), "PROMISIUNE: reformulare ca abilitate → OK");
ok(V("Dacă soldul este sub 300k, escaladez.").includes("FABRICATED_THRESHOLD"), "PRAG-CONDIȚIE: 'sub 300k' fără model → FAIL");
ok(!V("Escaladez dacă soldul reconciliat nu acoperă obligațiile certe până la următorul punct de lichiditate.").some((x) => x === "FABRICATED_THRESHOLD"), "PRAG-CONDIȚIE: condițional fără cifră → OK");
ok(V("Adrian sună banca pentru reeșalonare imediat.").includes("ESCALATION_WITHOUT_CHAIN"), "ESCALADARE: 'sună banca' fără lanț → FAIL");
ok(!V("Dacă apare deficit confirmat după reconciliere, propun reeșalonare cu banca.").includes("ESCALATION_WITHOUT_CHAIN"), "ESCALADARE: cu lanț (deficit confirmat) → OK");

// Randare structurata (titlu impus din verdict).
{ const { pipelineForPrompt } = await import("../src/ceo/sourcePipeline.js");
  const p = pipelineForPrompt({ verdict: "PIPELINE_NOT_OBSERVED", verdict_basis: "x", declared_event: "u", observed_events: [], searched_sources: ["a", "b"], confirmed_failures: [], next_system_action: "cauta", human_input_needed: true, confidence: "MEDIUM" });
  ok(/NU SUNT INCA OBSERVABILE/.test(p) && /TITLU IMPUS/.test(p) && /Fara explicatii cauzale/.test(p), "RANDARE: titlu impus din verdict + interdictie cauzala"); }

// ══ SANITIZER DETERMINIST: garantie ca inferenta cauzala NU supravietuieste ══
{ const { sanitizeManagerial } = await import("../src/ceo/managerialClaimValidator.js");
  const s = sanitizeManagerial("Extrasele nu au intrat în sistem. Sunt într-un loc pe care sistemul nu-l scanează (probabil email la Dana).", { confirmedFailures: [] });
  ok(!/nu au intrat|loc pe care sistemul|probabil email/i.test(s), "SANITIZER: frazele cauzale interzise inlocuite cu formulare sigura");
  ok(sanitizeManagerial("Parserul nu le-a preluat — eroare confirmată.", { confirmedFailures: ["parse_error"] }).includes("Parserul"), "SANITIZER: cu confirmed_failures → neschimbat"); }
// Finalizer end-to-end: draft cu cauzalitate, fara llm → sanitizat determinist.
{ const fin = await finalizeManagerialOutput({ assessment: { decision_context: "pipeline" }, draft: "Extrasele nu au intrat în sistem.", channel: "chat", confirmedFailures: [] });
  ok(!/nu au intrat/i.test(fin.text) && fin.corrected, "FINALIZER: sanitizeaza cauzalitatea chiar fara ciclu LLM (garantie de output)"); }

// ══ FABRICATED TASK RECEIPT: 'EXECUTAT / Task [XXXXXX]' fara scriere reala ══
ok(V("EXECUTAT. Task [O6MHIB]: Dana caută extrasele.", { sourceChecks: [{ kind: "source_check" }] }).includes("FABRICATED_TASK_RECEIPT"), "FABRICATED_TASK: 'EXECUTAT Task [ID]' cu doar source-check → FAIL");
ok(!V("Am creat task-ul.", { receipts: [{ operational_id: "O6MHIB", kind: "task" }] }).includes("FABRICATED_TASK_RECEIPT"), "FABRICATED_TASK: cu receipt REAL de actiune → OK");
{ const fin = await finalizeManagerialOutput({ assessment: { decision_context: "x" }, draft: "✅ EXECUTAT. Task [O6MHIB]: Dana caută.", channel: "chat", executionReceipts: [], sourceChecks: [{ kind: "source_check" }] });
  ok(!/EXECUTAT|\[O6MHIB\]/i.test(fin.text) && /pot crea/i.test(fin.text), "FINALIZER: receipt fabricat → 'pot crea task' (propunere), nu executie falsa"); }
// Source-check NU autorizeaza claim de actiune, DAR autorizeaza 'am verificat'.
ok(!V("Am verificat sursele accesibile.", { sourceChecks: [{ kind: "source_check" }] }).includes("EXECUTION_WITHOUT_RECEIPT"), "SOURCE-CHECK: 'am verificat' e permis de source-check");

console.log(`\n${n} verificari · ${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — semanticHardening`);
process.exit(failed === 0 ? 0 : 1);
