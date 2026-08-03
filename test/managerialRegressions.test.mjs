// REGRESII CEO REASONING — esecurile reale din testele 3 august 2026 (§12).
// Fiecare fraza esuata trebuie prinsa de validator/sanitizer. node test/managerialRegressions.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

import { validateClaims, sanitizeManagerial } from "../src/ceo/managerialClaimValidator.js";

let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(`${c ? "✅" : "❌"} ${n}. ${m}`); if (!c) failed++; };
const flags = (txt, ctx = {}) => validateClaims(txt, ctx).violations.map((v) => v.type);
const has = (txt, type, ctx = {}) => flags(txt, ctx).includes(type);

// 1. "72 de ore pana la criza confirmata" — cronologie de criza inventata + UNKNOWN negativ.
ok(has("Avem cam 72 de ore pana la criza si compania intra in criza.", "FABRICATED_CRISIS_TIMELINE"), "prinde '72 de ore pana la criza'");
ok(has("Compania intra in criza saptamana asta.", "UNKNOWN_AS_NEGATIVE"), "prinde 'intra in criza' (UNKNOWN ca negativ cert)");
ok(!has("DACA incasarea Marsa nu se confirma si lichiditatea nu acopera obligatiile certe, apare un deficit.", "UNKNOWN_AS_NEGATIVE"), "scenariul CONDITIONAL e permis");

// 2. Prag inventat: patru avansuri + sold sub 300k.
ok(has("Ai nevoie de minimum patru avansuri ca sa acoperi obligatiile.", "FABRICATED_THRESHOLD"), "prinde 'minimum patru avansuri'");
ok(has("Daca soldul scade sub 300.000 lei intram in criza.", "FABRICATED_THRESHOLD"), "prinde 'sold sub 300.000 lei'");

// 3. Founder tasking: telefon catre clienti pe Adrian.
ok(has("Adrian, suna clientii si cere-le confirmarea avansului.", "FOUNDER_FILTER"), "prinde sarcina de contact pusa pe Adrian");

// 4. "te sun" — capabilitate inexistenta.
ok(has("Te sun eu diseara sa iti confirm situatia.", "NONEXISTENT_CAPABILITY"), "prinde 'te sun'");
ok(sanitizeManagerial("Te sun eu diseara.").toLowerCase().includes("nu pot suna"), "sanitizer inlocuieste 'te sun'");

// 5. Email "analiza completa" fara search real.
ok(has("EMAILURI — ANALIZA COMPLETA: totul e in regula.", "EMAIL_COMPLETENESS_UNVERIFIED"), "prinde 'ANALIZA COMPLETA' email fara search");
ok(!has("EMAILURI — ANALIZA COMPLETA: 3 threaduri citite.", "EMAIL_COMPLETENESS_UNVERIFIED", { sourceChecks: [{ kind: "email_search", threads: 3 }] }), "cu search real, e permis");

// 6. Psihologie despre oameni.
ok(has("Nelu nu comunica si evita responsabilitatea.", "PEOPLE_CLAIM_UNSUPPORTED"), "prinde 'Nelu nu comunica'");
ok(has("Echipa aude panica si Adrian nu are incredere.", "PEOPLE_CLAIM_UNSUPPORTED"), "prinde 'echipa aude panica / nu are incredere'");
ok(has("Nelu pare demotivat.", "PSYCH_INFERENCE"), "prinde stare emotionala ca fapt");
ok(!has("Sistemul nu contine actualizari suficiente pentru a explica intarzierea lui Nelu.", "PEOPLE_CLAIM_UNSUPPORTED"), "formularea factuala e permisa");

// 7. Execution/promise fara receipt (deja acoperit — regresie).
ok(has("Am creat task pentru Dana si o contactez acum.", "FABRICATED_TASK_RECEIPT"), "prinde task 'creat' fara receipt");
ok(has("Verific imediat si revin cu raspunsul pana diseara.", "FUTURE_PROMISE_NO_MECHANISM"), "prinde promisiune viitoare fara mecanism");

// 8. Un raspuns curat NU trebuie sa produca violari.
{ const clean = "Concluzie: soldul nu e reconciliat. Owner: Dana actualizeaza extrasele. Opinia mea: nu as decide finantarea inainte de reconciliere. Daca incasarea nu se confirma, apare un deficit conditionat.";
  ok(validateClaims(clean).violations.length === 0, "raspuns curat, disciplinat → zero violari"); }

console.log(`\n${n} verificari · ${failed === 0 ? "TOATE TRECUTE" : failed + " ESUATE"} — regresii manageriale 3 aug`);
process.exit(failed === 0 ? 0 : 1);
