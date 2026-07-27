// MANAGERIAL CLAIM VALIDATOR — repara CONTINUTUL, nu formatul. Descompune un
// raspuns managerial in afirmatii (claims) si valideaza SUBSTANTA fiecareia:
// termen cu baza, prag cu model, owner cu dovada, executie cu receipt, sarcina
// pe fondator cu motiv, stare emotionala cu sursa umana, proces manual doar dupa
// root-cause. Quality Gate RESPINGE claim-urile fara baza. PUR + determinist.

// Normalizare diacritice — altfel "vorbești/să/situația" ocolesc pattern-urile.
const DIA = (s) => String(s || "").replace(/[ăâ]/gi, "a").replace(/[î]/gi, "i").replace(/[șş]/gi, "s").replace(/[țţ]/gi, "t");
const L = (s) => DIA(s).toLowerCase();
const arr = (v) => (Array.isArray(v) ? v : []);

// Baze acceptate pentru un TERMEN (P: deadline_basis).
const DEADLINE_BASIS = /(ai (spus|zis|cerut)|conform task|din task|scadent|scadenta|termen (legal|contractual)|contract|sla|pana la (incasarea|livrarea|semnarea)|calculat din|politica|deadline stabilit)/i;
// Ore exacte / termene fabricate (inclusiv paraphrase semantice: "in urmatoarele
// doua ore", "pana la pranz", "in cateva minute").
const EXACT_TIME = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b|\bin\s+(\d+|cateva|urmatoarele\s+(\d+|doua|trei|cateva))\s*(min(ute)?|de minute|ore|h)\b|\bpana (azi|maine) la\s+\d|\bpana la (pranz|amiaza|amiază|seara|sfarsitul zilei|finalul zilei|ora \d)/i;

// Baze acceptate pentru un PRAG numeric (threshold_basis).
const THRESHOLD_BASIS = /(conform|formula|calculat din|obligatii (certe|de plata) de|suma scadenta|pe baza|model|buffer|acoperirea)/i;
// Prag numeric financiar (sub/peste X lei/k/ron).
const NUMERIC_THRESHOLD = /\b(sub|peste|mai (mic|mare) (de|decat)|<|>|daca (soldul|cash-ul)[^.]{0,30})\s*[\d][\d.\s]*\s*(k\b|mii|lei|ron|eur|€|000)/i;

// Sarcina pe fondator = adresare directa + verb operational, INCLUSIV paraphrase
// semantice soft ("ar fi util sa vorbesti cu Dana", "poate interventia ta",
// "recomand sa verifici personal cu Nelu", "cel mai simplu ar fi sa ii ceri tu").
const OP_VERB = "(ceri|cere|intrebi|intreaba|verifici|verifica|suni|suna|trimiti|trimite|iei legatura|contactezi|contacta|discuti|discuta|vorbesti|vorbeste|intervii|interveni|urmaresti|urmareste|reconciliezi|te ocupi|ocupa-te|dai|clarifici)";
const FOUNDER_TASKING = new RegExp(
  "\\b(" +
  // adresare directa
  `tu (sa )?${OP_VERB}|adrian,?\\s+(cere|intreaba|verifica|suna|trimite|vorbeste)|` +
  // paraphrase soft: "ar fi util/bine sa vorbesti", "ai putea sa verifici", "merita sa ceri tu"
  `(ar fi (util|bine|indicat|mai simplu)|ai putea|ai vrea|merita|cel mai (simplu|bine) (ar fi|e))\\s+(sa\\s+)?${OP_VERB}|` +
  // "interventia ta", "cu ajutorul tau", "verifici personal", "sa ii ceri tu", "sa vorbesti tu personal"
  `interventia ta|cu ajutorul tau|${OP_VERB} personal|(sa (ii )?${OP_VERB}) tu|` +
  // ora exacta + verb operational
  `(la\\s+([01]?\\d|2[0-3])[:.]\\d\\d)[^.]{0,40}(intreab|verific|cere|suna|vorbe)` +
  ")\\b", "i");
// Motiv legitim de fondator (capital/autoritate/negociere/strategie/decizie).
const FOUNDER_REASON = /(decizie de capital|capital|aprobare|aprobi|aproba|autoritate|negoci|strateg|risc (juridic|material)|angajament financiar|semnatura|deficit|doar tu (poti|ai autoritatea)|decizie strategica)/i;

// ── STRAT SEMANTIC FOUNDER-TASKING: detecteaza INTENTIA de a-i pasa lui Adrian o
// actiune operationala/de contact, indiferent de formulare. Al doilea strat peste
// regex-ul literal. Verbe de contact/informare (2nd person = Adrian actor).
const FT_SECOND_PERSON = /\b(sa\s+)?(vorbesti|discuti|verifici|verifica-|ceri|soliciti|suni|telefonezi|confirmi|intervii|contactezi|intrebi|clarifici|urmaresti|obtii|rezolvi|deblochezi|accelerezi|iei (tu )?legatura|te intalnesti|te implici|scrii)\b/;
const FT_CONDITIONAL_YOU = /\b(daca )?ai\s+(discuta|vorbi|verifica|cere|solicita|suna|telefona|confirma|interveni|contacta|clarifica|obtine|rezolva|debloca|accelera|lua legatura|scrie|merge|vorbit)\b/;
const FT_FROM_YOU = /\b(interventia|implicarea|prezenta|contributia|un semnal|un cuvant|o vorba)\s+(directa\s+)?(din partea |a )?ta\b|\bdin partea ta\b/;
const FT_FOUNDER_PERSONAL = /\b(fondatorul|adrian)\b[^.]{0,50}\b(personal|direct|el insusi|singur|sa (confirme|verifice|discute|intervina|sune|ceara|vorbeasca))\b|\b(confirme|verifice|discute|intervina|sune|ceara|vorbeasca)\s+personal\b|\b(sa )?confirmi personal\b/;
const FT_UNBLOCK_IF = /\bs-?ar\s+(debloca|rezolva|accelera|misca|imbunatati|urni|misc)[^.]{0,40}\b(daca|dac)\s+(ai|tu|fondatorul|adrian)\b/;
const FT_SIMPLEST_YOU = /\bcel mai (simplu|bine|usor|rapid|eficient)\b[^.]{0,40}\b(tu|sa (ii |i-|le )?(ceri|verifici|vorbesti|suni|confirmi|obtii|intrebi) tu|sa ceri tu|ceri tu|verifici tu|obtii tu)\b/;
const FT_ADRIAN_IMP = /\badrian,?\s+(intreab|verific|cere|solicit|suna|vorbe|confirm|clarific|discut|contacteaz|obtii)/;
const FT_SHOULD_YOU = /\b(ar trebui|ar fi (bine|util|indicat|de dorit|preferabil)|poate ar trebui|nu ar strica)\b[^.]{0,40}\b(sa (tu |ii |i-)?)?(vorbesti|discuti|verifici|ceri|suni|confirmi|intervii|contactezi|intrebi|clarifici|iei legatura|te implici)\b/;

const FOUNDER_TASK_LAYERS = [FT_SECOND_PERSON, FT_CONDITIONAL_YOU, FT_FROM_YOU, FT_FOUNDER_PERSONAL, FT_UNBLOCK_IF, FT_SIMPLEST_YOU, FT_ADRIAN_IMP, FT_SHOULD_YOU];

/**
 * Intentie normalizata de founder-tasking (semantic). @returns {tasking, matched}
 * NU adauga fapte — doar clasifica sensul propozitiei.
 */
export function normalizeFounderTasking(sentence) {
  const s = L(sentence);
  // Excludem cazul in care JARVIS spune ce face EL ("eu ii cer/verific/urmaresc").
  if (/\b(eu (ii |le |i-)?(cer|verific|urmaresc|solicit|contactez|intreb|clarific)|ii cer eu|jarvis (ii |le )?(cere|verifica|urmareste))\b/.test(s)) return { tasking: false, matched: null };
  if (FOUNDER_TASKING.test(s)) return { tasking: true, matched: "literal" };
  for (let i = 0; i < FOUNDER_TASK_LAYERS.length; i++) if (FOUNDER_TASK_LAYERS[i].test(s)) return { tasking: true, matched: "semantic:" + i };
  return { tasking: false, matched: null };
}

// Limbaj de EXECUTIE (pretinde ca s-a facut/se face automat), inclusiv paraphrase:
// "urmaresc situatia", "voi alerta", "ma asigur ca Dana raspunde", "am rezolvat".
// EXECUTION_LANG e RECEIPT-GATED: flagat DOAR daca nu exista receipts reale. Cand
// pipeline diagnosis ruleaza, searched_sources = receipts, deci "am verificat X,Y,Z"
// devine adevarat. Prezentul pentru intentie viitoare ("verific unde") = tot aici.
const EXECUTION_LANG = /\b(pun (o )?observatie|am pus|alertez|voi alerta|am alertat|iau lista|am luat|am cerut|am trimis|am creat|am contactat|am verificat|verific zilnic|monitorizez( zilnic)?|urmaresc (zilnic|situatia)|fac reconciliere|ma asigur ca .{0,20}(raspunde|face|rezolva)|am rezolvat|am inchis|verific unde|verific daca|caut documentul|caut extrasul|ma uit unde)\b/i;
// Limbaj corect de capabilitate/propunere.
const CAPABILITY_LANG = /(pot crea|pot trimite|pot urmari|propun|urmeaza sa|voi putea|nu pot (urmari|verifica) automat)/i;

// Stare emotionala (interzis ca fapt).
const EMOTION = /(demotiv|paraliz|dezinteres|neimplica|incompeten|frustrat|lenes|isi pierde (motivati|elan|chef)|nu mai are (motivati|elan|chef)|pierdut (motivati|elan|chef)|delasa|descuraj)/i;

// Recomandare de proces manual (rutina umana).
const MANUAL_PROCESS = /\b(reconciliere manuala|manual zilnic|zilnic \d+ (min|minute)|\d+ (min|minute) zilnic|rutina (manuala|zilnica)|sa faca (zilnic|manual))\b/i;

// INFERENTA CAUZALA nesustinuta despre pipeline/documente (fara event/log confirmat).
const CAUSAL_FAILURE = /(nu au intrat|n-au intrat|nu au ajuns|n-au ajuns|nu (s-)?au (incarcat|importat|procesat|preluat)|(sunt|raman|au ramas) (intr-un|in|pe|la) (folder|loc|locul|server|zona|sursa)[^.]{0,25}(nescanat|neverificat|neobservat|nescan|pe care sistemul nu)|(intr-un|in) locul pe care sistemul nu-?l scaneaza|parserul nu (le-a |a )?(preluat|luat|procesat|vazut)|au ramas blocate|s-au blocat|upload(ul)? (a )?esuat|au picat|nu le-a preluat sistemul)/i;

// PROMISIUNE de executie viitoare / rezultat / ora pe care sistemul nu le controleaza.
const FUTURE_PROMISE = /(verific imediat|verific acum|transmit (danei|lui nelu|nelu|danei)|voi transmite|il anunt|o anunt|ma ocup eu|ma ocup de|rezolv eu|revin cu (rezultatul|raspunsul|un raspuns)|voi sti (pana|azi|diseara|deseara|maine)|pana (azi )?(diseara|deseara|seara)|voi avea (raspunsul|soldul|cifra)|iti spun (pana|diseara|deseara)|pana diseara (voi|iti|am))/i;

// ESCALADARE la fondator dintr-o cifra izolata, fara lantul de analiza.
const BANK_ESCALATION = /(suna banca|apeleaza banca|suni la banca|contacteaza banca|reesalonare|reesaloneaza|renegoci|refinant)/i;
const ESCALATION_CHAIN = /(deficit confirmat|dupa reconciliere|sold reconciliat|obligatii certe|incasari confirmate|daca deficitul)/i;
// Root-cause verificat (pipeline).
const ROOTCAUSE_CHECKED = /(upload|incarcat|detectat|parsat|import|pipeline|integrar|s-a actualizat sursa|eroare tehnica|verific intai daca)/i;

// Presupunere de permisiune (validare = doar Adrian) — regula reala: CREATORUL valideaza.
const PERMISSION_ASSUMPTION = /\b(doar adrian (poate|valideaza)|numai adrian (poate|valideaza)|adrian (trebuie sa )?valideaza (toate|task))\b/i;

/**
 * Valideaza substanta unui raspuns managerial. @returns {claims[], violations[]}
 * ctx: { receipts:[], founderExpectation:bool, unknowns:[] }
 */
export function validateClaims(reply, ctx = {}) {
  const r = DIA(String(reply || "")); // normalizat pe diacritice (patternurile ruleaza pe asta)
  const n = L(reply);
  const violations = [];
  const add = (type, principle, why) => violations.push({ type, principle, why });
  const near = (rx, base) => { // are baza in aceeasi fraza?
    for (const sent of r.split(/(?<=[.!?\n])/)) if (rx.test(sent) && base.test(sent)) return true;
    return false;
  };

  // 1. TERMEN exact fara baza (deadline_basis).
  if (EXACT_TIME.test(r) && !near(EXACT_TIME, DEADLINE_BASIS))
    add("FABRICATED_DEADLINE", "P7", "ora/termen exact fara deadline_basis (user/task/contract/legal/SLA/calculat) — foloseste 'azi'/'cat mai curand' cu justificare, nu ore inventate");

  // 2. PRAG numeric fara model (threshold_basis).
  if (NUMERIC_THRESHOLD.test(r) && !near(NUMERIC_THRESHOLD, THRESHOLD_BASIS))
    add("FABRICATED_THRESHOLD", "P7/P9", "prag numeric fara sursa/formula — spune conditional ('critic daca soldul reconciliat nu acopera obligatiile certe'), nu inventa cifra");

  // 3. FOUNDER FILTER (semantic, per-fraza): sarcina operationala pasata lui Adrian,
  // indiferent de formulare, fara motiv de fondator. Al doilea strat = intentie.
  for (const sent of r.split(/(?<=[.!?\n])/)) {
    const ft = normalizeFounderTasking(sent);
    if (ft.tasking && !FOUNDER_REASON.test(L(sent))) {
      add("FOUNDER_FILTER", "P5", `ii paseaza lui Adrian o actiune operationala/de contact (${ft.matched}) pe care JARVIS o poate ruta/urmari sau alt owner o poate face — fara motiv de fondator`);
      break;
    }
  }

  // 4. EXECUTIE fara receipt (plan prezentat ca executie).
  if (EXECUTION_LANG.test(r) && !(ctx.receipts?.length) && !CAPABILITY_LANG.test(n))
    add("EXECUTION_WITHOUT_RECEIPT", "P12", "limbaj de executie ('pun observatie/alertez/verific zilnic') fara receipt sau mecanism real — spune 'pot crea…' sau 'nu pot urmari automat pana cand…'");

  // 5. STARE emotionala (chiar hedge-uita: "pare/probabil frustrat" ramane interzis).
  //    Permis DOAR daca vine cu sursa umana explicita ("mi-a spus ca").
  if (EMOTION.test(n) && !/(mi-a spus|a spus el|conform (lui|discutiei)|sursa umana|el a zis)/i.test(n))
    add("PSYCH_INFERENCE", "P10", "stare psihologica ca (in)fapt — interzisa chiar hedge-uita ('pare/probabil frustrat'); descrie efectul factual ('lipsa validarii → reluare/intarziere'), nu emotia");

  // 6. PROCES manual inainte de root-cause.
  if (MANUAL_PROCESS.test(n) && !ROOTCAUSE_CHECKED.test(n))
    add("PROCESS_BEFORE_ROOTCAUSE", "P13", "recomanda rutina manuala fara a verifica intai pipeline-ul (upload→parse→import→reconciliere) — nu compensa un bug de integrare prin munca manuala permanenta");

  // 7. PRESUPUNERE de permisiune (validare = doar Adrian).
  if (PERMISSION_ASSUMPTION.test(n))
    add("PERMISSION_ASSUMPTION", "P5", "regula reala Operational: CREATORUL task-ului valideaza (nu exclusiv Adrian) — nu transforma o conventie in responsabilitate permanenta a fondatorului");

  // 8. INFERENTA CAUZALA nesustinuta (titlu SAU corp): "nu au intrat / sunt intr-un
  //    loc nescanat / parserul nu le-a preluat" — permis DOAR cu esec confirmat (log).
  if (CAUSAL_FAILURE.test(r) && !(ctx.confirmedFailures?.length))
    add("CAUSAL_UNSUPPORTED", "P1", "explicatie cauzala fara eveniment/log confirmat ('nu au intrat / loc nescanat / parserul nu le-a preluat') — din PIPELINE_NOT_OBSERVED rezulta DOAR ca nu sunt observabile, nu de ce; spune 'nu sunt inca observabile in sursele verificate'");

  // 9. PROMISIUNE de executie/rezultat/ora viitoare fara task/job/receipt.
  if (FUTURE_PROMISE.test(r) && !(ctx.receipts?.length) && !CAPABILITY_LANG.test(n))
    add("FUTURE_PROMISE_NO_MECHANISM", "P12", "promite un rezultat/ora/actiune viitoare fara task/job/receipt real — reformuleaza ca abilitate ('dupa ce identificam sursa, pot verifica…' / 'pot crea solicitarea catre Dana'); nu promite ce sistemul nu controleaza");

  // 10. ESCALADARE la fondator (suna banca/reesalonare) dintr-o cifra izolata, fara
  //     lantul de analiza (sold reconciliat→obligatii certe→incasari→deficit→optiuni).
  if (BANK_ESCALATION.test(n) && !ESCALATION_CHAIN.test(n))
    add("ESCALATION_WITHOUT_CHAIN", "P4/P7", "recomanda actiune de fondator (banca/reesalonare) fara lantul: sold reconciliat → obligatii certe → incasari confirmate → deficit confirmat → optiuni interne → abia apoi decizie de fondator");

  return { violations, count: violations.length };
}

/**
 * SANITIZER DETERMINIST (ultima linie): dupa cele maxim UN ciclu de corectie, daca
 * modelul tot lasa o inferenta cauzala nesustinuta, o INLOCUIM cu formularea sigura.
 * Garanteaza ca frazele interzise NU supravietuiesc, indiferent de incapatanarea
 * modelului. Se aplica DOAR cand nu exista confirmed_failures. PUR.
 */
export function sanitizeManagerial(text, { confirmedFailures = [] } = {}) {
  if (arr(confirmedFailures).length) return String(text || ""); // cu log real, cauzalitatea e permisa
  let t = String(text || "");
  const rules = [
    [/(extrasele|documentele|ele|acestea)\s+(sunt|raman|au ramas)\s+[iî]ntr-?un\s+loc[^.!?\n]*/gi, "nu sunt observabile in sursele pe care le verific"],
    [/\b(nu au intrat|n-?au intrat|nu au ajuns|n-?au ajuns)\b[^.!?\n]*/gi, "nu sunt inca observabile in sursele verificate"],
    [/parserul nu (le-a |a )?(preluat|luat|procesat|v[aă]zut)[^.!?\n]*/gi, "nu pot confirma starea procesarii"],
    [/\b(au r[aă]mas blocate|s-au blocat|upload(ul)? a e[sș]uat|au picat)\b[^.!?\n]*/gi, "nu pot confirma daca au fost procesate"],
    // speculatii de locatie ("probabil email la Dana, sau folder neconectat")
    [/\(?\s*probabil\s+(email|folder|drive|un folder|in email)[^.!?\n)]*\)?/gi, ""],
  ];
  for (const [rx, repl] of rules) t = t.replace(rx, repl);
  return t.replace(/[ \t]{2,}/g, " ").replace(/\s+\./g, ".").replace(/\n{3,}/g, "\n\n").trim();
}

/** Instructiune de injectat: cum sa produca valori cu baza (nu fabricate). */
export const CLAIM_DISCIPLINE_PROMPT =
  "DISCIPLINA AFIRMATIILOR (obligatoriu, altfel raspunsul e respins):\n" +
  "• TERMENE: nu inventa ore exacte (11:00, 'in 30 min'). Foloseste 'azi'/'cat mai curand' cu motiv, SAU un termen din task/contract/lege/SLA.\n" +
  "• PRAGURI: nu inventa cifre (ex. 'sub 200.000 = criza'). Spune conditional: 'critic DACA soldul reconciliat nu acopera obligatiile certe pana la urmatoarea incasare verificata'.\n" +
  "• FOUNDER FILTER: NU-i spune lui Adrian sa ceara/verifice/urmareasca ceva ce poti crea, ruta sau urmari TU, sau ce poate face Dana/Nelu. Adrian doar pentru: autoritate, capital, negociere, decizie strategica, exceptie.\n" +
  "• EXECUTIE: spune 'am facut' DOAR daca ai receipt in acest tur. Altfel: 'pot crea solicitarea…' / 'nu pot urmari automat pana cand…'. Nu simula autonomie.\n" +
  "• EMOTII: nu deduce motivatia/starea oamenilor din task-uri. Descrie efectul factual ('lipsa validarii → intarziere'), nu psihologia.\n" +
  "• DATE VECHI: daca o sursa pare stale, verifica intai pipeline-ul (upload→detectat→parsat→importat→reconciliat) inainte sa propui munca manuala. Un upload care pare esuat nu dovedeste ca a esuat.\n" +
  "• CAUZALITATE: nu explica DE CE ('nu au intrat', 'loc nescanat', 'parserul nu le-a preluat', 'blocate') fara eveniment/log confirmat. Din 'neobservabil' rezulta DOAR ca nu le vezi, nu de ce. Titlurile respecta aceeasi regula.\n" +
  "• PROMISIUNI: nu promite rezultat/ora viitoare ('verific imediat', 'pana diseara stiu', 'transmit Danei', 'ma ocup') fara task/job/receipt real. Spune 'dupa ce identific sursa, pot verifica…' / 'pot crea solicitarea catre Dana'.\n" +
  "• ESCALADARE BANCA: nu recomanda 'suna banca/reesalonare' dintr-o cifra izolata. Lant: sold reconciliat → obligatii certe → incasari confirmate → deficit confirmat → optiuni interne → abia apoi decizie de fondator (cu founder_reason).\n" +
  "• INCASARI DECLARATE: '1,5M din Marsa' = clasifica dupa dovada reala — founder-declared expectation / receivable planned / contract confirmed / invoice issued / bank receipt confirmed. Fara dovada bancara/contract: e ASTEPTARE, nu fapt financiar.\n" +
  "• VALIDARE: in Operational CREATORUL task-ului valideaza, nu doar Adrian.";
