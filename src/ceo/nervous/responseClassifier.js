// NERVOUS SYSTEM V1 §5/§12 — RESPONSE CLASSIFIER (managementul activ).
// Dupa ce un task a fost delegat si ownerul a "raspuns" (comentariu liber,
// rezolutie sau doar un status Operational), motorul CITESTE acel raspuns
// si il clasifica DETERMINIST intr-o categorie de reactie umana. Nu ghiceste
// intentia: se sprijina pe cuvinte-cheie RO/EN si pe statusul Operational.
// Cand nu exista semnal, raspunsul e NO_RESPONSE (missing != done).
// Modul PUR: functii deterministe peste argumente, ZERO IO. Data lipsa =
// gap explicit, niciodata presupusa. Nicio referinta la oameni/companie.
import { mapOperationalStatus } from "./contract.js";

// ── CATEGORIILE CANONICE DE RASPUNS ─────────────────────────────────────
export const RESPONSE_CATEGORIES = [
  "DONE", "BLOCKED", "NEED_MORE_TIME", "INFORMATION_ATTACHED",
  "NOT_MY_RESPONSIBILITY", "NO_RESPONSE",
];

// ── TIPURILE CANONICE DE BLOCAJ (doar cand raspunsul e BLOCKED) ──────────
export const BLOCKER_TYPES = [
  "WAITING_OTHER_PERSON", "WAITING_SUPPLIER", "MISSING_MATERIAL",
  "MISSING_DECISION", "MISSING_INFORMATION", "TECHNICAL_PROBLEM",
  "CAPACITY", "UNCLEAR_TASK", "OTHER",
];

// Cine poate ridica blocajul — roluri generice, niciodata nume de oameni.
export const BLOCKER_REMOVERS = ["SYSTEM", "MANAGER", "OWNER", "FOUNDER", "OTHER_PERSON", "UNKNOWN"];

// ── NORMALIZARE TEXT (diacritice ro) — determinist, fara embeddings. ─────
function norm(s) {
  return String(s || "").toLowerCase()
    .replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t");
}

// ── DICTIONARE DE SEMNALE (cuvinte/expresii → categorie). Ordinea conteaza
// doar prin scor, nu prin pozitie: fiecare potrivire adauga la un bucket. ─
const PATTERNS = {
  DONE: [
    /finaliz/, /\bgata\b/, /\bdone\b/, /rezolvat/, /terminat/, /\bam facut\b/,
    /am terminat/, /predat/, /livrat/, /\bfacut\b/, /complet/, /\bok\b.{0,10}(gata|facut)/, /\bclosed\b/,
  ],
  BLOCKED: [
    /blocat/, /\bblocked\b/, /nu pot/, /nu se poate/, /nu merge/, /\bastept\b/,
    /asteapta/, /impiedic/, /stuck/, /blocaj/, /nu am cum/, /depind de/,
  ],
  NEED_MORE_TIME: [
    /mai am nevoie/, /inca lucrez/, /lucrez la/, /termen nou/, /amanare/, /\bamana\b/,
    /mai dureaza/, /mai tarziu/, /nu apuc/, /pana maine/, /mai multe zile/, /prelungir/,
    /need more time/, /\bdelay\b/, /o zi in plus/,
  ],
  INFORMATION_ATTACHED: [
    /atasat/, /atasez/, /vezi fisier/, /vezi document/, /am atasat/, /in atasament/,
    /documentul/, /\bpdf\b/, /\bpoza\b/, /pozele/, /\bfoto\b/, /\battached\b/, /see file/, /am pus.{0,10}fisier/,
  ],
  NOT_MY_RESPONSIBILITY: [
    /nu e treaba mea/, /nu raspund eu/, /nu ma ocup eu/, /gresit atribuit/, /gresit repartizat/,
    /nu e la mine/, /nu tine de mine/, /nu e responsabilitatea mea/, /not my job/, /wrong person/, /nu eu/,
  ],
};

/** Numara cate tipare din lista se potrivesc pe text, colecteaza semnalele. */
function scanPatterns(text, list) {
  const hits = [];
  for (const re of list) {
    const m = text.match(re);
    if (m) hits.push(m[0].trim());
  }
  return hits;
}

/**
 * Clasifica raspunsul uman la un task delegat intr-o categorie de reactie.
 * @param {object} p
 * @param {string} p.text            comentariul/rezolutia libera a ownerului
 * @param {string|null} p.opsStatus  statusul Operational al task-ului (nou/in_lucru/blocat/rezolvat/...)
 * @param {boolean} p.hasAttachment  a atasat un fisier/document?
 * @returns {{category: string, confidence: number, signals: string[]}}
 */
export function classifyResponse({ text = "", opsStatus = null, hasAttachment = false } = {}) {
  const t = norm(text);
  const signals = [];

  // 1) Semnalul TARE al statusului Operational (fapt, nu interpretare).
  //    rezolvat/acceptat → DONE puternic; blocat → BLOCKED.
  const st = String(opsStatus || "").toLowerCase().trim();
  const lifecycle = st ? mapOperationalStatus(st) : null;
  let statusVote = null;
  if (st === "rezolvat" || st === "acceptat" || lifecycle === "RESULT_SUBMITTED" || lifecycle === "COMPLETED") {
    statusVote = "DONE";
    signals.push(`status:${st}`);
  } else if (st === "blocat" || lifecycle === "BLOCKED") {
    statusVote = "BLOCKED";
    signals.push(`status:${st}`);
  }

  // 2) Voturile din text pe fiecare categorie.
  const scores = {};
  for (const cat of Object.keys(PATTERNS)) {
    const hits = scanPatterns(t, PATTERNS[cat]);
    if (hits.length) {
      scores[cat] = hits.length;
      for (const h of hits) signals.push(h);
    }
  }
  // INFORMATION_ATTACHED e valid doar daca EXISTA efectiv un atasament;
  // altfel "vezi fisierul" e o promisiune, nu o livrare.
  if (scores.INFORMATION_ATTACHED && !hasAttachment) delete scores.INFORMATION_ATTACHED;
  // Atasament prezent ridica INFORMATION_ATTACHED chiar si fara cuvant-cheie.
  if (hasAttachment) {
    scores.INFORMATION_ATTACHED = (scores.INFORMATION_ATTACHED || 0) + 1;
    signals.push("attachment:present");
  }

  // 3) Statusul Operational bate textul cand e prezent (fapt > vorba), dar
  //    intareste in loc sa contrazica daca textul spune acelasi lucru.
  if (statusVote) {
    scores[statusVote] = (scores[statusVote] || 0) + 3; // pondere mare = "puternic"
  }

  // 4) Alegerea categoriei dominante (determinist: scor, apoi ordine canonica).
  const ranked = RESPONSE_CATEGORIES
    .filter((c) => scores[c] > 0)
    .sort((a, b) => (scores[b] - scores[a]) || (RESPONSE_CATEGORIES.indexOf(a) - RESPONSE_CATEGORIES.indexOf(b)));

  if (!ranked.length) {
    // Fara text util si fara status relevant → chiar nu a raspuns nimic.
    return { category: "NO_RESPONSE", confidence: t.trim() ? 20 : 0, signals };
  }

  const category = ranked[0];
  const top = scores[category];
  const second = ranked[1] ? scores[ranked[1]] : 0;

  // confidence: cat de clar iese semnalul dominant fata de rest.
  // status puternic (+3) ancoreaza increderea sus; text singur, mai prudent.
  let confidence = Math.min(100, 45 + top * 12 + (top - second) * 10);
  if (statusVote === category) confidence = Math.min(100, Math.max(confidence, 85));
  confidence = Math.round(confidence);

  return { category, confidence, signals: [...new Set(signals)] };
}

// ── CLASIFICAREA BLOCAJULUI (doar pentru raspunsuri BLOCKED) ─────────────

const BLOCKER_PATTERNS = [
  // ordinea = specificitate: cele mai concrete inainte de cele generice.
  { type: "WAITING_SUPPLIER", res: [/furnizor/, /supplier/, /distribuitor/] },
  { type: "MISSING_MATERIAL", res: [/material/, /\bmarfa\b/, /\bstoc\b/, /piese/, /\bmarf\b/] },
  { type: "MISSING_DECISION", res: [/decizie/, /\baproba/, /aprobare/, /sa decid/, /de aprobat/, /decision/] },
  { type: "UNCLEAR_TASK", res: [/nu inteleg/, /neclar/, /nu e clar/, /nu stiu ce/, /ce anume/, /unclear/, /nu am inteles/] },
  { type: "MISSING_INFORMATION", res: [/lipsa info/, /lipsesc date/, /nu am date/, /nu stiu/, /nu am informat/, /missing info/, /fara date/] },
  { type: "TECHNICAL_PROBLEM", res: [/eroare/, /nu functioneaza/, /nu merge sistemul/, /defect/, /stricat/, /bug/, /technical/] },
  { type: "CAPACITY", res: [/prea multe/, /nu am timp/, /supraincarcat/, /prea mult de lucru/, /nu apuc/, /prea ocupat/, /capacit/] },
  { type: "WAITING_OTHER_PERSON", res: [/astept pe/, /asteapta pe/, /depind de/, /pana imi da/, /pana raspunde/, /waiting for/] },
];

// Maparea generica blocker_type → cine il poate ridica (rol, nu nume).
const REMOVER_MAP = {
  WAITING_OTHER_PERSON: "OTHER_PERSON",
  WAITING_SUPPLIER: "OTHER_PERSON",
  MISSING_MATERIAL: "MANAGER",
  MISSING_DECISION: "FOUNDER",
  MISSING_INFORMATION: "SYSTEM",   // daca sistemul o poate obtine; altfel ajustat mai jos
  TECHNICAL_PROBLEM: "SYSTEM",
  CAPACITY: "MANAGER",
  UNCLEAR_TASK: "OWNER",           // cel care a CERUT task-ul clarifica
  OTHER: "UNKNOWN",
};

const REMOVER_WHY = {
  WAITING_OTHER_PERSON: "blocajul e la o alta persoana in amonte",
  WAITING_SUPPLIER: "raspunsul depinde de un furnizor extern",
  MISSING_MATERIAL: "lipseste materialul/marfa necesara",
  MISSING_DECISION: "e nevoie de o decizie/aprobare de sus",
  MISSING_INFORMATION: "lipseste o informatie care poate fi cautata",
  TECHNICAL_PROBLEM: "e o problema tehnica de sistem",
  CAPACITY: "ownerul e supraincarcat, nu are capacitate acum",
  UNCLEAR_TASK: "task-ul nu e inteles — cel care l-a cerut trebuie sa clarifice",
  OTHER: "blocaj neclasificabil pe semnalele existente",
};

/**
 * Clasifica NATURA blocajului cand raspunsul a fost BLOCKED (§5/§17).
 * @param {object} p
 * @param {string} p.text          motivul liber al blocajului
 * @param {string} p.taskContext   context optional (titlu/descriere) — indiciu suplimentar
 * @returns {{blocker_type: string, who_can_remove: string, why: string}}
 */
export function classifyBlocker({ text = "", taskContext = "" } = {}) {
  const t = norm(`${text} ${taskContext}`);
  let blocker_type = "OTHER";
  const signals = [];

  for (const { type, res } of BLOCKER_PATTERNS) {
    for (const re of res) {
      const m = t.match(re);
      if (m) { signals.push(m[0].trim()); if (blocker_type === "OTHER") blocker_type = type; break; }
    }
    if (blocker_type !== "OTHER") break; // prima potrivire (cea mai specifica) castiga
  }

  let who_can_remove = REMOVER_MAP[blocker_type] || "UNKNOWN";
  // MISSING_INFORMATION: SYSTEM doar daca informatia pare cautabila de sistem
  // (cash/factura/status/date); altfel o detine o alta persoana.
  if (blocker_type === "MISSING_INFORMATION") {
    const systemFetchable = /(sold|cash|factur|status|data|date|raport|smartbill|extras)/.test(t);
    who_can_remove = systemFetchable ? "SYSTEM" : "OTHER_PERSON";
  }
  // Fara niciun semnal → nu ghicim cine il ridica.
  if (blocker_type === "OTHER") who_can_remove = "UNKNOWN";

  return {
    blocker_type,
    who_can_remove: BLOCKER_REMOVERS.includes(who_can_remove) ? who_can_remove : "UNKNOWN",
    why: REMOVER_WHY[blocker_type] || REMOVER_WHY.OTHER,
  };
}
