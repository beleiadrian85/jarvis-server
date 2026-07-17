// Teste wiring Executive Board — flag-uri, sesiune (LLM injectat), garzi de sursa.
// node test/executiveBoard.wiring.test.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";
delete process.env.EXECUTIVE_BOARD_ENABLED;
delete process.env.EXECUTIVE_BOARD_SHADOW_MODE;

const { config } = await import("../src/config.js");
const { getCapabilities } = await import("../src/capabilities.js");
const { boardMode, formatBoardReport, maybeShadowBoard } = await import("../src/executiveBoard/index.js");
const { runBoardMeeting, parseBoardJson, tokensForRoles } = await import("../src/executiveBoard/boardSession.js");
const { validateMeeting } = await import("../src/executiveBoard/boardValidator.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = (f) => readFileSync(path.join(__dirname, "..", "src", f), "utf8");
let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// ── Test 1: feature flag OFF implicit → comportament actual pastrat ─────
ok(config.executiveBoard === false, "EXECUTIVE_BOARD_ENABLED implicit OFF");
ok(config.executiveBoardShadow === false, "EXECUTIVE_BOARD_SHADOW_MODE implicit OFF");
ok(boardMode() === "off", "boardMode() = off implicit");
const brainSrc = SRC("brain.js");
ok(/const r = await runCouncil\(q\);/.test(brainSrc), "brain: council.js ramane calea implicita (flag OFF)");
ok(/"🏛️ CONSILIU JARVIS\\n\\n" \+ r/.test(brainSrc), "brain: raspunsul consiliului NESCHIMBAT cu flag OFF");
ok(/boardMode\(\) === "active"/.test(brainSrc), "brain: ruta Board doar pe mode=active (gated)");

// ── Test 2: shadow mode nu modifica raspunsul ───────────────────────────
ok(maybeShadowBoard("test") === undefined, "maybeShadowBoard cu mode=off → no-op sincron (zero apeluri)");
const idxSrc = SRC("executiveBoard/index.js");
ok(/boardMode\(\) !== "shadow"\) return;/.test(idxSrc), "shadow: garda de mode inainte de orice analiza");
ok(brainSrc.includes("maybeShadowBoard(q);") &&
   brainSrc.indexOf("const r = await runCouncil(q);") < brainSrc.indexOf("maybeShadowBoard(q);"),
   "shadow: council raspunde INTAI; Boardul analizeaza dupa, fire-and-forget");
ok(!/maybeShadowBoard[\s\S]{0,400}?(bot\.telegram|sendMessage|notif)/.test(idxSrc), "shadow: zero notificari");

// ── Test 12: Boardul NU poate apela actiuni de scriere (garda de sursa) ─
const BOARD_FILES = ["index.js", "boardRouter.js", "boardRoles.js", "boardSession.js",
  "boardSynthesis.js", "boardValidator.js", "founderVoice.js", "guardian.js", "prompts.js"]
  .map((f) => "executiveBoard/" + f);
for (const f of BOARD_FILES) {
  const s = SRC(f);
  ok(!/from\s+["'][^"']*(taskflow|approvalGate|mcp)\.js["']/.test(s), `${f}: zero importuri taskflow/approvalGate/mcp`);
}
const allBoard = BOARD_FILES.map(SRC).join("\n");
ok(!/(create_task|update_task|delete_task|restore_task|add_observation|import_price_references|create_task_from_obligation)/.test(allBoard),
   "executiveBoard/*: zero referinte la tool-uri de scriere Operational");
ok(!/proposeAction|executeConfirmed/.test(allBoard), "executiveBoard/*: nu propune si nu executa actiuni");

// ── Test 13: approvalGate ramane obligatoriu si nemodificat ─────────────
const gate = await import("../src/approvalGate.js");
for (const fn of ["proposeAction", "getPendingForChannel", "confirmActionById", "cancelActionById", "expireOldActions"])
  ok(typeof gate[fn] === "function", `approvalGate.${fn} intact`);
ok(/from ["']\.\/approvalGate\.js["']/.test(brainSrc), "brain: fluxul approvalGate neatins");

// ── Test 5 (sursa): CRO/CFO/CEO alimentati din engine-urile existente ───
const sess = SRC("executiveBoard/boardSession.js");
ok(/from ["']\.\.\/engines\/riskEngine\.js["']/.test(sess) && /assessRisks\(/.test(sess), "CRO ← riskEngine.assessRisks (reutilizat, nemodificat)");
ok(/from ["']\.\.\/engines\/cashForecast\.js["']/.test(sess) && /buildForecast\(/.test(sess), "CFO ← cashForecast.buildForecast");
ok(/from ["']\.\.\/engines\/healthScore\.js["']/.test(sess) && /computeHealth\(/.test(sess), "CEO ← healthScore.computeHealth");
ok(/from ["']\.\.\/predictionState\.js["']/.test(sess), "stare ← predictionState (cache + timeout existente)");

// ── Sesiune cu LLM injectat (fara retea) ────────────────────────────────
const DATA = {
  asOf: "2026-07-17", dataBlock: "[riskEngine] 🔴 2 plati restante — impact: penalitati",
  data_available: ["[operational] 4 obligatii"], data_missing: ["sold curent bancar"],
  dataQuality: "partiala",
  risks: [{ level: "🔴", key: "restante", descriere: "2 plati restante" }],
  health: { score: 60 }, taskGroups: { blocate: 0, azi: 1, intarziate: 2, ok: 5 }, cash: { restante: 2, scadente3: 1 },
};
const P = (role, position) => ({
  role, position, confidence: 75, arguments: [`analiza ${role}`],
  evidence: ["[operational] date reale"], risks: [], conditions: position === "approve_with_conditions" ? ["conditie"] : [],
  alternatives: [], unanswered_questions: [],
});
const fullAnswer = (roles) => JSON.stringify({
  problem: "P", purpose: "S", assumptions: ["ipoteza"], options: ["opt1", "opt2"],
  perspectives: roles.map((r, i) => P(r, i === 0 ? "approve" : "approve_with_conditions")),
  impact: { financial: "f", operational: "o", human: "h", legal: "l", brand_sales: "b" },
  reversibility: "reversibila", scenarios: { success: "s", failure: "e" }, risks: ["r1"], contradicts_prior: null,
});

// Test 14: exact UN apel LLM per sedinta.
let calls = 0;
const spyLlm = async ({ system, user }) => { calls++; spyLlm.lastUser = user; return fullAnswer(["CEO", "CFO", "COO", "CRO"]); };
const m1 = await runBoardMeeting("Ce facem cu situatia generala?", { llm: spyLlm, data: DATA, memories: [], priorDecisions: [], noCache: true, id: "bm-t1" });
ok(calls === 1, `exact UN apel LLM per sedinta (${calls})`);
ok(m1.recommendation && m1.recommendation.recommendation === "DA", "sedinta completa → recomandare emisa (DA)");
ok(validateMeeting(m1).valid, "obiectul-sedinta valid (cele 22 de puncte)");
ok(m1.founder_decision === null && m1.outcome === null && m1.lesson === null, "punctele 20-22 raman ale fondatorului (null la emitere)");
ok(m1.recommendation.founder_decision_required === true, "founder_decision_required=true — Boardul NU decide");
ok(spyLlm.lastUser.includes("[riskEngine] 🔴 2 plati restante"), "dosarul determinist (riskEngine) ajunge la directori");
ok(m1.perspectives.some((p) => p.role === "GUARDIAN"), "Guardian prezent (determinist)");

// Test 11: un director lipsa nu blocheaza sedinta.
const partialLlm = async () => fullAnswer(["CEO", "CFO", "COO"]); // CRO lipseste
const m2 = await runBoardMeeting("Alta intrebare generala?", { llm: partialLlm, data: DATA, memories: [], priorDecisions: [], noCache: true, id: "bm-t2" });
ok(m2.missing_perspectives.includes("CRO"), "CRO fara raspuns → marcat lipsa");
ok(m2.recommendation !== null, "sedinta continua si emite fara CRO");
ok(m2.perspectives.find((p) => p.role === "CRO")?.position === "insufficient_data", "perspectiva lipsa = insufficient_data, nu inventata");

// LLM picat total (timeout/fallback null) → sedinta rezista, DATE_INSUFICIENTE.
const deadLlm = async () => null;
const m3 = await runBoardMeeting("Intrebare cand modelul tace?", { llm: deadLlm, data: DATA, memories: [], priorDecisions: [], noCache: true, id: "bm-t3" });
ok(m3.recommendation?.recommendation === "DATE_INSUFICIENTE", "LLM picat → DATE_INSUFICIENTE (nu blocaj, nu inventie)");
ok(m3.missing_perspectives.length === 4, "toate perspectivele LLM marcate lipsa");

// Test 10: date esentiale lipsa → DATE_INSUFICIENTE.
const weak = { ...DATA, dataQuality: "slaba", data_missing: ["obligatii", "task-uri", "vanzari", "sold"] };
const m4 = await runBoardMeeting("Investim intr-un teren nou lang Hipodrom?", { llm: async () => fullAnswer(["CEO","CFO","COO","CRO","CLO","CSO","CMO","INNOVATION"]), data: weak, memories: [], priorDecisions: [], noCache: true, id: "bm-t4" });
ok(m4.recommendation?.recommendation === "DATE_INSUFICIENTE", "date slabe → DATE_INSUFICIENTE chiar cu directori pozitivi");

// Test 19 (wiring): contradictie neexplicata → Guardian blocheaza emiterea.
const contraLlm = async () => JSON.stringify({ ...JSON.parse(fullAnswer(["CEO", "CFO", "COO", "CRO"])), contradicts_prior: { ref: "decizia #2", explanation: "" } });
const m5 = await runBoardMeeting("Contrazicem decizia doi?", { llm: contraLlm, data: DATA, memories: [], priorDecisions: [], noCache: true, id: "bm-t5" });
ok(m5.recommendation === null && m5.blocked?.by === "GUARDIAN", "contradictie neexplicata → recomandare NEEMISA (blocata de Guardian)");
ok(formatBoardReport(m5).includes("RECOMANDARE NEEMISA"), "raportul explica blocarea");

// Test 20: determinism — aceeasi intrare, aceleasi date → structura identica.
const detLlm = async () => fullAnswer(["CEO", "CFO", "COO", "CRO"]);
const a = await runBoardMeeting("Determinism?", { llm: detLlm, data: DATA, memories: [], priorDecisions: [], noCache: true, id: "bm-det" });
const b = await runBoardMeeting("Determinism?", { llm: detLlm, data: DATA, memories: [], priorDecisions: [], noCache: true, id: "bm-det" });
ok(JSON.stringify(a) === JSON.stringify(b), "aceeasi intrare + aceleasi date → structura identica");

// Test 14b: cache — aceeasi analiza nu se repeta cand datele nu s-au schimbat.
let cacheCalls = 0;
const cLlm = async () => { cacheCalls++; return fullAnswer(["CEO", "CFO", "COO", "CRO"]); };
await runBoardMeeting("Cache unic 12345?", { llm: cLlm, data: DATA, memories: [], priorDecisions: [], id: "bm-c1" });
await runBoardMeeting("Cache unic 12345?", { llm: cLlm, data: DATA, memories: [], priorDecisions: [], id: "bm-c2" });
ok(cacheCalls === 1, `date neschimbate → analiza NU se repeta (apeluri LLM: ${cacheCalls})`);

// Raport text + [VOCE].
const rep = formatBoardReport(m1);
ok(rep.includes("EXECUTIVE BOARD") && /\[VOCE\]/.test(rep), "raport text cu [VOCE]");
ok(rep.includes("Decizia finala iti apartine"), "raportul afirma explicit: Boardul recomanda, Adrian decide");

// Capabilities declara starea Boardului.
const caps = getCapabilities();
ok(caps.executiveBoard === false && caps.executiveBoardShadow === false, "capabilities: board OFF + shadow OFF implicit");

// parseBoardJson tolerant.
ok(parseBoardJson('```json\n{"a":1}\n```')?.a === 1, "parseBoardJson: taie fence-urile markdown");
ok(parseBoardJson("text fara json") === null && parseBoardJson(null) === null, "parseBoardJson: invalid → null, fara exceptie");
// Regresie live: modelul emite uneori newline LITERAL in stringuri (JSON invalid).
ok(parseBoardJson('{"a":"linia unu\nlinia doi"}')?.a === "linia unu linia doi", "parseBoardJson: repara newline literal in string");
// Regresie live: JSON malformat la primul apel → EXACT o reincercare (max 2 apeluri).
let rCalls = 0;
const flakyLlm = async () => { rCalls++; return rCalls === 1 ? '{"problem":"taiat la juma' : fullAnswer(["CEO", "CFO", "COO", "CRO"]); };
const mR = await runBoardMeeting("Retry pe JSON malformat?", { llm: flakyLlm, data: DATA, memories: [], priorDecisions: [], noCache: true, id: "bm-retry" });
ok(rCalls === 2, `JSON malformat → exact o reincercare (apeluri: ${rCalls})`);
ok(mR.missing_perspectives.length === 0 && mR.recommendation !== null, "reincercarea recupereaza sedinta complet");

// Buget de tokeni dinamic: un board de 8 directori nu incape in bugetul unuia de 4
// (descoperit LIVE in shadow: investment cu 8 roluri → JSON trunchiat → DATE_INSUFICIENTE).
ok(tokensForRoles(8) > tokensForRoles(4), "bugetul de tokeni creste cu numarul de roluri");
ok(tokensForRoles(4) >= 4000, `board de 4 → minim 4000 tokeni (${tokensForRoles(4)})`);
ok(tokensForRoles(8) >= 7000 && tokensForRoles(20) <= 8000, `board de 8 → ~7600, plafonat la 8000 (${tokensForRoles(8)})`);

// Zero schema DB noua din modulele Board.
ok(!/CREATE TABLE|ALTER TABLE/i.test(allBoard), "executiveBoard/*: zero modificari de schema DB");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — executiveBoard (wiring)`);
process.exit(failed === 0 ? 0 : 1);
