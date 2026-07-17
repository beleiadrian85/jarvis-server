// Teste Executive Board — functiile PURE (fara env, fara IO, fara LLM).
// node test/executiveBoard.test.mjs
import { ROLES, ROLE_IDS, LLM_ROLE_IDS } from "../src/executiveBoard/boardRoles.js";
import { classifyDecision, selectDirectors, SELECTION } from "../src/executiveBoard/boardRouter.js";
import { validateDirectorOutput, validateRecommendation } from "../src/executiveBoard/boardValidator.js";
import { founderPerspective, matchPrinciples, FOUNDER_PRINCIPLES } from "../src/executiveBoard/founderVoice.js";
import { guardianReview, reviewFounderOverride } from "../src/executiveBoard/guardian.js";
import { synthesize, applyFounderOverride } from "../src/executiveBoard/boardSynthesis.js";
import { buildBoardSystem, buildBoardUser } from "../src/executiveBoard/prompts.js";

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

const D = (role, position, over = {}) => ({
  role, position, confidence: 70,
  arguments: ["argument"], evidence: ["[operational] date"], risks: [],
  conditions: position === "approve_with_conditions" ? [`conditie-${role}`] : [],
  alternatives: [], unanswered_questions: [], ...over,
});

// ── Roluri ───────────────────────────────────────────────────────────────
ok(ROLE_IDS.length === 12, `12 roluri definite (${ROLE_IDS.length})`);
ok(ROLES.GUARDIAN.llm === false && ROLES.FOUNDER_VOICE.llm === false, "Guardian + Founder Voice = deterministe (nu LLM)");
ok(LLM_ROLE_IDS.length === 10, "10 perspective LLM");
ok(ROLE_IDS.every((id) => ROLES[id].question && ROLES[id].personality), "fiecare rol are intrebare + personalitate");

// ── Test 3: selectia directorilor pe tipul deciziei ─────────────────────
ok(classifyDecision("Angajam un om nou pe santier?") === "hiring", "clasificare: angajare");
ok(classifyDecision("Semnam contractul cu antreprenorul X?") === "contract", "clasificare: contract");
ok(classifyDecision("Lansam campanie Google Ads pentru Corp 3?") === "marketing", "clasificare: marketing");
ok(classifyDecision("Migrare server si automatizare facturare?") === "technical", "clasificare: tehnic");
ok(classifyDecision("Cumparam terenul de langa Hipodrom, investitie noua?") === "investment", "clasificare: investitie");
ok(classifyDecision("Ce facem cu situatia de azi?") === "general", "clasificare: general (implicit)");
ok(JSON.stringify(selectDirectors("investment")) === JSON.stringify(["CEO","CFO","COO","CRO","CLO","CSO","CMO","GUARDIAN","FOUNDER_VOICE","INNOVATION"]), "matrice: investitie → 10 directori");
ok(JSON.stringify(selectDirectors("hiring")) === JSON.stringify(["CEO","COO","CHRO","CFO","GUARDIAN","FOUNDER_VOICE"]), "matrice: angajare → 6 directori");
ok(JSON.stringify(selectDirectors("technical")) === JSON.stringify(["CEO","CTO","COO","CRO","GUARDIAN"]), "matrice: tehnic → 5");
ok(JSON.stringify(selectDirectors("marketing")) === JSON.stringify(["CEO","CMO","CSO","CFO","CRO"]), "matrice: marketing → 5");
ok(JSON.stringify(selectDirectors("contract")) === JSON.stringify(["CEO","CLO","CFO","COO","CRO"]), "matrice: contract → 5");
ok(selectDirectors("necunoscut").length === SELECTION.general.length, "tip necunoscut → selectia generala");

// ── Test 4: validarea structurii directorului ────────────────────────────
ok(validateDirectorOutput(D("CFO", "approve")).valid, "director valid acceptat");
ok(!validateDirectorOutput(D("CFO", "poate")).valid, "position invalida respinsa");
ok(!validateDirectorOutput(D("CFO", "approve", { confidence: 150 })).valid, "confidence >100 respins");
ok(!validateDirectorOutput({ role: "CFO", position: "approve", confidence: 50 }).valid, "campuri array lipsa respinse");
ok(!validateDirectorOutput(D("CFO", "reject", { arguments: [] })).valid, "pozitie fara argumente respinsa");

const REC_OK = synthesize({ directors: [D("CEO","approve"), D("CFO","approve")], dataQuality: "completa", reversibility: "reversibila" });
ok(validateRecommendation(REC_OK).valid, "recomandare sintetizata valida");
ok(!validateRecommendation({ ...REC_OK, recommendation: "POATE" }).valid, "recommendation in afara enumului respinsa");
ok(!validateRecommendation({ ...REC_OK, founder_decision_required: false }).valid, "founder_decision_required=false fara override respins (Boardul nu decide)");

// ── Test 8: Founder Voice nu inventeaza ──────────────────────────────────
const fvHire = founderPerspective("Angajam un om nou desi are performanta putin mai slaba dar caracter bun?");
ok(fvHire.position === "approve_with_conditions" && fvHire.principles.length > 0, "FV: principii documentate gasite la angajare");
ok(fvHire.principles.every((id) => FOUNDER_PRINCIPLES.some((p) => p.id === id)), "FV: citeaza DOAR principii din lista canonica F01-F40");
ok(fvHire.conditions.every((c) => /^F\d{2}:/.test(c)), "FV: conditiile sunt principii numerotate, nu opinii inventate");
const fvUnknown = founderPerspective("xyzzy plugh?");
ok(fvUnknown.position === "insufficient_data" && fvUnknown.confidence === 0, "FV: fara principii relevante → insufficient_data");
ok(fvUnknown.unanswered_questions.length > 0, "FV: semnaleaza ca preferinta fondatorului nu e documentata");
const fvRed = founderPerspective("Ascundem de clienti problema si mintim banca?");
ok(fvRed.position === "reject" && fvRed.principles.includes("F13"), "FV: linie rosie documentata → reject cu principiul citat");
ok(matchPrinciples("").length === 0, "FV: text gol → zero principii");

// ── Sinteza: reguli deterministe ─────────────────────────────────────────
const sDA = synthesize({ directors: [D("CEO","approve"), D("CFO","approve_with_conditions"), D("COO","approve")], dataQuality: "completa", reversibility: "reversibila" });
ok(sDA.recommendation === "DA" && sDA.conditions.includes("conditie-CFO"), "majoritate approve → DA cu conditiile CFO");
const sNU = synthesize({ directors: [D("CEO","reject"), D("CFO","reject"), D("COO","approve")], dataQuality: "completa", reversibility: "reversibila" });
ok(sNU.recommendation === "NU", "majoritate reject → NU");
// ── Test 9: dezacordurile nu sunt eliminate ─────────────────────────────
ok(sNU.major_disagreements.length === 1 && sNU.major_disagreements[0].role === "COO", "dezacordul COO pastrat in sinteza");
const sTie = synthesize({ directors: [D("CEO","approve"), D("CFO","reject")], dataQuality: "completa", reversibility: "reversibila" });
ok(sTie.recommendation === "AMANA", "egalitate → AMANA");
const sIrev = synthesize({ directors: [D("CEO","approve"), D("CFO","approve"), D("COO","reject")], dataQuality: "completa", reversibility: "ireversibila" });
ok(sIrev.recommendation === "AMANA" && sIrev.consensus_level === 67, "ireversibil cu consens <80% → AMANA (F24)");
// ── Test 10: date insuficiente ──────────────────────────────────────────
ok(synthesize({ directors: [], dataQuality: "completa" }).recommendation === "DATE_INSUFICIENTE", "zero pozitii valide → DATE_INSUFICIENTE");
ok(synthesize({ directors: [D("CEO","approve")], dataQuality: "slaba" }).recommendation === "DATE_INSUFICIENTE", "date slabe → DATE_INSUFICIENTE");
ok(REC_OK.founder_decision_required === true, "founder_decision_required mereu true la emitere");
// ── Test 5 (partea pura): riscurile CRO → limite de risc ────────────────
const sCro = synthesize({ directors: [D("CEO","approve"), D("CRO","approve_with_conditions", { risks: ["deficit lichiditate din 2026-08-01"] })], dataQuality: "completa", reversibility: "reversibila" });
ok(sCro.risk_limits.some((r) => r.includes("deficit lichiditate")) && sCro.stop_conditions.length > 0, "riscurile CRO devin risk_limits + stop_conditions");

// ── Test 20: determinism ────────────────────────────────────────────────
const din = () => ({ directors: [D("CEO","approve"), D("CFO","reject"), D("CRO","approve_with_conditions")], dataQuality: "partiala", reversibility: "partial_reversibila" });
ok(JSON.stringify(synthesize(din())) === JSON.stringify(synthesize(din())), "aceeasi intrare → aceeasi sinteza (determinist)");

// ── Test 7: Guardian detecteaza incalcari CODEX ─────────────────────────
const dirs = [D("CEO","approve"), D("CFO","reject")];
const synOk = synthesize({ directors: dirs, dataQuality: "completa", reversibility: "reversibila" });
ok(guardianReview({ directors: dirs, synthesis: synOk }).compliant === false || synOk.recommendation === "AMANA", "egalitate → AMANA (fara dezacord ascuns)");
const dirs2 = [D("CEO","approve"), D("COO","approve"), D("CFO","reject")];
const syn2 = synthesize({ directors: dirs2, dataQuality: "completa", reversibility: "reversibila" });
const gOk = guardianReview({ directors: dirs2, synthesis: syn2 });
ok(gOk.compliant && !gOk.blockEmission, "sinteza corecta cu dezacord raportat → conforma");
const synFalsified = { ...syn2, major_disagreements: [] }; // dezacordul CFO "netezit"
const gBad = guardianReview({ directors: dirs2, synthesis: synFalsified });
ok(gBad.blockEmission && gBad.issues.some((i) => i.includes("dezacord eliminat")), "dezacord eliminat din sinteza → Guardian BLOCHEAZA");
// ── Test 19: contradictia trebuie explicata ─────────────────────────────
const synContra = { ...syn2, contradicts_prior: { ref: "decizia #4", explanation: "" } };
ok(guardianReview({ directors: dirs2, synthesis: synContra }).blockEmission, "contradictie fara explicatie → Guardian BLOCHEAZA (F40)");
const synContraOk = { ...syn2, contradicts_prior: { ref: "decizia #4", explanation: "informatie noua: pretul terenului a scazut 20%" } };
ok(!guardianReview({ directors: dirs2, synthesis: synContraOk }).blockEmission, "contradictie explicata → se emite");
const gInvalid = guardianReview({ directors: [{ role: "CFO" }], synthesis: syn2 });
ok(gInvalid.blockEmission, "structura de director invalida → Guardian BLOCHEAZA");
ok(guardianReview({ directors: dirs2, synthesis: null }).blockEmission, "fara sinteza → blocat");

// ── Teste 16/17/18: fondatorul prevaleaza ───────────────────────────────
const unanimNo = synthesize({ directors: [D("CEO","reject"), D("CFO","reject"), D("CRO","reject")], dataQuality: "completa", reversibility: "reversibila" });
ok(unanimNo.recommendation === "NU" && unanimNo.consensus_level === 100, "Board unanim NU");
const over = applyFounderOverride(unanimNo, { decision: "DA", rationale: "am demontat argumentele: finantare noua confirmata" });
ok(over.founder_override?.applied === true, "override-ul fondatorului se aplica peste NU unanim (Boardul nu blocheaza)");
ok(over.risk_limits.length > 0 && over.stop_conditions.length > 0, "override → limite de risc + criterii de oprire OBLIGATORII (F28)");
ok(over.founder_decision_required === false, "dupa decizia fondatorului, nu se mai cere decizie");
const rev = reviewFounderOverride(over);
ok(rev.accepted === true, "Guardianul NU poate anula decizia fondatorului");
ok(reviewFounderOverride({ risk_limits: [], stop_conditions: [] }).warnings.length === 2, "override fara limite → Guardianul le CERE (warnings), dar accepta");

// ── Test 6 (instructiune): CFO separa profitul de cash ──────────────────
const sys = buildBoardSystem(["CEO", "CFO", "INNOVATION", "GUARDIAN"]);
ok(/CFO separa STRICT profitul de cash/.test(sys), "prompt: CFO instruit sa separe profitul de lichiditate");
ok(/NU exista date de profit/.test(sys), "prompt: CFO nu poate deduce profit din cash (date inexistente)");
ok(/minimum 6 scenarii/.test(sys), "prompt: INNOVATION analizeaza minim 6 scenarii");
ok(/NU inventezi cifre/.test(sys), "prompt: interdictie cifre inventate");
ok(!/GUARDIAN \(/.test(sys), "prompt: Guardianul (determinist) NU e trimis la LLM");
const usr = buildBoardUser({ question: "Q?", type: "general", dataBlock: "[riskEngine] risc X", memories: [], priorDecisions: [{ id: 1, decided_on: "2026-01-01", decision: "am decis Y" }] });
ok(usr.includes("[riskEngine] risc X") && usr.includes("am decis Y"), "prompt user: dosar determinist + decizii anterioare (F39-F40)");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — executiveBoard (pur)`);
process.exit(failed === 0 ? 0 : 1);
