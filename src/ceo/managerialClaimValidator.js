// MANAGERIAL CLAIM VALIDATOR — repara CONTINUTUL, nu formatul. Descompune un
// raspuns managerial in afirmatii (claims) si valideaza SUBSTANTA fiecareia:
// termen cu baza, prag cu model, owner cu dovada, executie cu receipt, sarcina
// pe fondator cu motiv, stare emotionala cu sursa umana, proces manual doar dupa
// root-cause. Quality Gate RESPINGE claim-urile fara baza. PUR + determinist.

const L = (s) => String(s || "").toLowerCase();

// Baze acceptate pentru un TERMEN (P: deadline_basis).
const DEADLINE_BASIS = /(ai (spus|zis|cerut)|conform task|din task|scadent|scadenta|termen (legal|contractual)|contract|sla|pana la (incasarea|livrarea|semnarea)|calculat din|politica|deadline stabilit)/i;
// Ore exacte / termene fabricate.
const EXACT_TIME = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b|\bin\s+\d+\s*(min(ute)?|de minute|ore|h)\b|\bpana (azi|maine) la\s+\d/i;

// Baze acceptate pentru un PRAG numeric (threshold_basis).
const THRESHOLD_BASIS = /(conform|formula|calculat din|obligatii (certe|de plata) de|suma scadenta|pe baza|model|buffer|acoperirea)/i;
// Prag numeric financiar (sub/peste X lei/k/ron).
const NUMERIC_THRESHOLD = /\b(sub|peste|mai (mic|mare) (de|decat)|<|>|daca (soldul|cash-ul)[^.]{0,30})\s*[\d][\d.\s]*\s*(k\b|mii|lei|ron|eur|€|000)/i;

// Sarcina pe fondator = adresare directa + verb operational.
const FOUNDER_TASKING = /\b(tu (sa )?(ceri|cere|intrebi|intreaba|verifici|verifica|suni|suna|trimiti|trimite|iei legatura|urmaresti|urmareste|reconciliezi|dai)|adrian,?\s+(cere|intreaba|verifica|suna|trimite)|(la\s+([01]?\d|2[0-3])[:.]\d\d)[^.]{0,40}(intreab|verific|cere|suna))\b/i;
// Motiv legitim de fondator (capital/autoritate/negociere/strategie/decizie).
const FOUNDER_REASON = /(decizie de capital|capital|aprobare|autoritate|negoci|strateg|risc (juridic|material)|angajament financiar|semnatura|deficit)/i;

// Limbaj de EXECUTIE (pretinde ca s-a facut/se face automat).
const EXECUTION_LANG = /\b(pun (o )?observatie|am pus|alertez|am alertat|iau lista|am luat|am cerut|am trimis|am creat|am verificat|am contactat|verific zilnic|monitorizez zilnic|urmaresc zilnic|fac reconciliere)\b/i;
// Limbaj corect de capabilitate/propunere.
const CAPABILITY_LANG = /(pot crea|pot trimite|pot urmari|propun|urmeaza sa|voi putea|nu pot (urmari|verifica) automat)/i;

// Stare emotionala (interzis ca fapt).
const EMOTION = /\b(demotiv|paraliz|dezinteres|neimplicat|incompeten|frustrat|lenes|isi pierde (motivatia|elanul)|nu mai are chef|delasa)\b/i;
const EMOTION_HEDGE = /(pare|posibil|ipotez|s-ar putea|de verificat cu|nu pot sti starea)/i;

// Recomandare de proces manual (rutina umana).
const MANUAL_PROCESS = /\b(reconciliere manuala|manual zilnic|zilnic \d+ (min|minute)|\d+ (min|minute) zilnic|rutina (manuala|zilnica)|sa faca (zilnic|manual))\b/i;
// Root-cause verificat (pipeline).
const ROOTCAUSE_CHECKED = /(upload|incarcat|detectat|parsat|import|pipeline|integrar|s-a actualizat sursa|eroare tehnica|verific intai daca)/i;

// Presupunere de permisiune (validare = doar Adrian) — regula reala: CREATORUL valideaza.
const PERMISSION_ASSUMPTION = /\b(doar adrian (poate|valideaza)|numai adrian (poate|valideaza)|adrian (trebuie sa )?valideaza (toate|task))\b/i;

/**
 * Valideaza substanta unui raspuns managerial. @returns {claims[], violations[]}
 * ctx: { receipts:[], founderExpectation:bool, unknowns:[] }
 */
export function validateClaims(reply, ctx = {}) {
  const r = String(reply || "");
  const n = L(r);
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

  // 3. FOUNDER FILTER strict: sarcina operationala pe Adrian fara motiv de fondator.
  if (FOUNDER_TASKING.test(r) && !FOUNDER_REASON.test(n))
    add("FOUNDER_FILTER", "P5", "ii cere lui Adrian o sarcina operationala/follow-up pe care JARVIS o poate crea/rula sau o poate face alt owner — nu-l implica fara motiv de fondator");

  // 4. EXECUTIE fara receipt (plan prezentat ca executie).
  if (EXECUTION_LANG.test(r) && !(ctx.receipts?.length) && !CAPABILITY_LANG.test(n))
    add("EXECUTION_WITHOUT_RECEIPT", "P12", "limbaj de executie ('pun observatie/alertez/verific zilnic') fara receipt sau mecanism real — spune 'pot crea…' sau 'nu pot urmari automat pana cand…'");

  // 5. STARE emotionala fara sursa umana.
  if (EMOTION.test(n) && !EMOTION_HEDGE.test(n))
    add("PSYCH_INFERENCE", "P10", "stare psihologica dedusa din task-uri ca fapt — permis doar cu sursa umana explicita sau ca efect ('lipsa validarii poate produce intarziere')");

  // 6. PROCES manual inainte de root-cause.
  if (MANUAL_PROCESS.test(n) && !ROOTCAUSE_CHECKED.test(n))
    add("PROCESS_BEFORE_ROOTCAUSE", "P13", "recomanda rutina manuala fara a verifica intai pipeline-ul (upload→parse→import→reconciliere) — nu compensa un bug de integrare prin munca manuala permanenta");

  // 7. PRESUPUNERE de permisiune (validare = doar Adrian).
  if (PERMISSION_ASSUMPTION.test(n))
    add("PERMISSION_ASSUMPTION", "P5", "regula reala Operational: CREATORUL task-ului valideaza (nu exclusiv Adrian) — nu transforma o conventie in responsabilitate permanenta a fondatorului");

  return { violations, count: violations.length };
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
  "• VALIDARE: in Operational CREATORUL task-ului valideaza, nu doar Adrian.";
