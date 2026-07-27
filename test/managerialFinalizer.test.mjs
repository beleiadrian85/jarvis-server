// CANONICAL FINALIZER + SEMANTIC CLAIM VALIDATOR + PROACTIVE (Final Hardening).
// Teste adversariale — incearca sa ocoleasca regex-urile prin paraphrase semantice.
// node test/managerialFinalizer.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

import { validateClaims } from "../src/ceo/managerialClaimValidator.js";
import { finalizeManagerialOutput, assertResponseTraceability, warrantsProactiveSend, proactiveStructure } from "../src/ceo/managerialFinalizer.js";
import { checkManagerialResponse } from "../src/ceo/qualityGate.js";

let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(`${c ? "✅" : "❌"} ${n}. ${m}`); if (!c) failed++; };
const bad = (reply, type, label) => { const v = validateClaims(reply); ok(v.violations.some((x) => x.type === type), label); };
const clean = (reply, label) => ok(validateClaims(reply).violations.length === 0, label);

// ── FOUNDER FILTER SEMANTIC (adversarial — paraphrase soft, cu diacritice) ──
bad("Ar fi util să vorbești cu Dana despre sold.", "FOUNDER_FILTER", "adversarial: 'ar fi util să vorbești cu Dana' → FOUNDER_FILTER");
bad("Poate intervenția ta ar accelera reconcilierea.", "FOUNDER_FILTER", "adversarial: 'intervenția ta' → FOUNDER_FILTER");
bad("Recomand să verifici personal cu Nelu.", "FOUNDER_FILTER", "adversarial: 'verifici personal' → FOUNDER_FILTER");
bad("Cel mai simplu ar fi să îi ceri tu situația.", "FOUNDER_FILTER", "adversarial: 'să îi ceri tu' → FOUNDER_FILTER");
bad("Ai putea să suni tu furnizorul.", "FOUNDER_FILTER", "adversarial: 'ai putea să suni tu' → FOUNDER_FILTER");
// Legitim (are founder_reason) → NU e violare.
clean("Doar tu poți aproba decizia de capital pentru achiziția Mârșa.", "founder cu motiv real (capital/autoritate) → OK");

// ── DEADLINE SEMANTIC ───────────────────────────────────────────
bad("Rezolvăm în următoarele două ore.", "FABRICATED_DEADLINE", "deadline: 'în următoarele două ore' fără bază → FAIL");
bad("Trimite până la prânz.", "FABRICATED_DEADLINE", "deadline: 'până la prânz' fără bază → FAIL");
bad("Urgent, în 30 de minute.", "FABRICATED_DEADLINE", "deadline: 'în 30 de minute' fără SLA → FAIL");
clean("Conform task-ului scadent pe 30 iulie, urmăresc până atunci.", "deadline cu bază (task scadent) → OK");

// ── EXECUTION SEMANTIC ──────────────────────────────────────────
bad("Urmăresc situația.", "EXECUTION_WITHOUT_RECEIPT", "execution: 'urmăresc situația' fără mecanism → FAIL");
bad("Voi alerta când se schimbă.", "EXECUTION_WITHOUT_RECEIPT", "execution: 'voi alerta' fără job → FAIL");
bad("Mă asigur că Dana răspunde.", "EXECUTION_WITHOUT_RECEIPT", "execution: 'mă asigur că Dana răspunde' fără follow-up → FAIL");
ok(validateClaims("Am creat solicitarea către Dana.", { receipts: [{ id: "OP1" }] }).violations.length === 0, "execution: 'am creat' CU receipt → OK");

// ── PSYCHOLOGICAL ───────────────────────────────────────────────
bad("Nelu pare dezinteresat.", "PSYCH_INFERENCE", "psych: 'pare dezinteresat' → FAIL");
bad("Echipa nu mai are motivație.", "PSYCH_INFERENCE", "psych: 'nu mai are motivație' → FAIL");

// ── DASHBOARD DUMP (via quality gate) ───────────────────────────
{ const dump = "Situatia:\n- 1 plata restanta\n- 11 taskuri intarziate\n- 6 rezervari\n- stoc scazut\n- 3 leaduri noi";
  ok(!checkManagerialResponse(dump, { text: "ce conteaza acum?", isManagerial: true }).pass, "dashboard dump la 'ce conteaza acum?' fara dominant issue → FAIL"); }

// ── TRACEABILITY: afirmatie fara suport in assessment → gap ──────
{ const t = assertResponseTraceability("Tu să verifici personal cu Dana până la prânz.", { unknowns: [], founder_action: null });
  ok(!t.traceable && t.gaps.length >= 1, "traceability: sarcina pe Adrian + deadline inventat fara suport → gap"); }
{ const t2 = assertResponseTraceability("Îi cer eu Danei soldul azi și urmăresc; te implic doar la deficit de capital.", { unknowns: ["sold"], founder_action: { founder_reason: "deficit de capital" } });
  ok(t2.traceable, "traceability: raspuns corect legat de assessment → traceable"); }

// ── FINALIZER end-to-end: draft prost → corectat de llm mock ─────
{ const mockLLM = async () => "Îi cer eu Danei soldul azi și urmăresc răspunsul; te implic doar dacă apare deficit de capital.";
  const fin = await finalizeManagerialOutput({
    assessment: { decision_context: "sold vechi", unknowns: ["sold"], founder_action: { founder_reason: "deficit de capital" } },
    draft: "Tu să o întrebi pe Dana la 11:00 și să verifici personal.", channel: "chat", llm: mockLLM, messages: [],
  });
  ok(fin.corrected && !/la 11:00|verifici personal/i.test(fin.text), "finalizer: draft cu founder-tasking+deadline → corectat (1 ciclu)"); }

// ── FINALIZER: fara llm → valideaza + adapter, nu regenereaza ────
{ const fin = await finalizeManagerialOutput({ assessment: { decision_context: "x" }, draft: "Raspuns simplu.", channel: "telegram" });
  ok(fin.text === "Raspuns simplu." && fin.gate && fin.traceability, "finalizer fara llm: valideaza + channel adapter (nu regenereaza)"); }

// ── PROACTIVE: management by exception ──────────────────────────
ok(!warrantsProactiveSend({}), "proactive: fara schimbare materiala → NU trimite");
ok(warrantsProactiveSend({ thresholdBreach: true }), "proactive: prag depasit cu baza → trimite");
ok(warrantsProactiveSend({ slaBreach: true }), "proactive: SLA depasit → trimite");
// No-founder-action → mesaj explicit.
{ const msg = proactiveStructure({ changed: "Furnizorul X blocheaza livrarea", why: "afecteaza o incasare", done: "Am creat follow-up la Nelu", next: "Astept raspuns" });
  ok(/Nu ai nimic de facut acum/.test(msg), "proactive: fara decizie → 'Nu ai nimic de făcut acum.'"); }
{ const msg2 = proactiveStructure({ changed: "Deficit posibil", why: "obligatii > sold", decision: "Aprobi amanarea platii Y?" });
  ok(/DECIZIA TA/.test(msg2) && /CE S-A SCHIMBAT/.test(msg2), "proactive: cu decizie → structura CE S-A SCHIMBAT…DECIZIA TA"); }

// ── Simulare digest (10 intarziate, 8 fara impact, 1 rezolvat, 1 blocaj incasare) ─
{ // doar blocajul material + actiunea sa apara — verificam ca structura de exceptie e disponibila
  const relevant = proactiveStructure({ changed: "1 task blocheaza o incasare (unitatea A3)", why: "amana incasarea avansului", done: "Follow-up creat la comercial", next: "Verific raspunsul", back: "revin cand se misca" });
  ok(!/8 fara impact|10 intarziate/.test(relevant) && /incasare/.test(relevant), "digest simulat: doar blocajul material apare, nu tot volumul"); }

console.log(`\n${n} verificari · ${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — managerialFinalizer`);
process.exit(failed === 0 ? 0 : 1);
