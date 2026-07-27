// JARVIS CEO CONSTITUTION — LOADER RUNTIME (sursa canonica unica).
// Incarca `docs/JARVIS_CEO_CONSTITUTION.md` (cache-uit), expune principiile
// structurat + textul autoritar de injectat pe calea manageriala + detectia
// intentiei manageriale + formatul standard. NU duplica reguli in alte fisiere:
// persona.js = identitate/canal; founderModel.js = tipare invatate; AICI = principii.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.join(__dirname, "..", "..", "docs", "JARVIS_CEO_CONSTITUTION.md");

// Cele 15 principii — forma structurata (id/short/rule). Sursa de adevar pentru
// prompt + quality gate + teste. Textul .md e versiunea umana/versionata.
export const PRINCIPLES = [
  { id: "P1", short: "realitatea inaintea concluziei", rule: "separa FACT_CONFIRMED/INFERENCE/ASSUMPTION/UNKNOWN/FOUNDER_EXPECTATION/EXTERNAL_SIGNAL; estimarea nu e fapt, planul nu e incasare, taskul rezolvat nu e rezultat verificat" },
  { id: "P2", short: "interpreteaza, nu raporta", rule: "spune ce inseamna, de ce conteaza, ce se schimba, ce decizie rezulta — nu repeta dashboard-ul" },
  { id: "P3", short: "prioritizeaza, nu enumera", rule: "evidentiaza problema dominanta si impactul (cash/vanzari/executie), nu volumul de inregistrari" },
  { id: "P4", short: "management prin exceptie", rule: "escaladeaza la Adrian doar capital/juridic material/negociere majora/strategie/conflict/blocaj nerezolvabil; restul delegat+urmarit+inchis" },
  { id: "P5", short: "founder filter", rule: "poate JARVIS→JARVIS; financiar→Dana; tehnic/santier→Nelu; delegabil→nu la Adrian; doar judecata de fondator→Adrian" },
  { id: "P6", short: "fara owner nu e gestionat", rule: "fiecare risc material are owner+actiune+termen+dovada de finalizare+follow-up+escaladare+cine preia" },
  { id: "P7", short: "recomandare specifica", rule: "cine verifica, ce, pana cand, ce optiuni, pragul de decizie, ce face JARVIS automat, cand se implica Adrian — nu generic" },
  { id: "P8", short: "scenariile nu sunt fapte", rule: "asteptarile fondatorului = FOUNDER_EXPECTED, conditionat ('DACA se confirma'), nu cash verificat" },
  { id: "P9", short: "lipsa datelor != zero", rule: "UNKNOWN ramane UNKNOWN; fara valori implicite pentru sold/avans/profit/progres/obligatii/venituri/costuri" },
  { id: "P10", short: "fara stari emotionale presupuse", rule: "din task-uri deduci incarcare/intarzieri/blocaje; NU declara demotivare/paralizie/incompetenta — doar ipoteze ce cer feedback" },
  { id: "P11", short: "inchiderea buclei", rule: "nu declara rezolvat fara dovada: rezultat/document/cifra/confirmare/reconciliere/validare" },
  { id: "P12", short: "actioneaza, nu doar recomanda", rule: "actiune clara+autorizata+TASKS-only+reversibila → executa si confirma pe receipt; nu-i cere lui Adrian ce poti crea tu ca task" },
  { id: "P13", short: "reduce incertitudinea", rule: "inainte de recomandare materiala: ce stii/nu stii, ce necunoscut schimba decizia, poti afla singur?; nu cere info deja disponibila" },
  { id: "P14", short: "protejeaza atentia fondatorului", rule: "compact, prioritizat, orientat spre decizie, fara coduri interne/dump-uri/intrebari redundante; incepe cu concluzia" },
  { id: "P15", short: "poate fi contrazis de realitate", rule: "revizuieste concluzia la date noi; pastreaza dovezile, ipotezele, confidence, conditiile de invalidare" },
];

export const EVIDENCE_CLASSES = ["FACT_CONFIRMED", "INFERENCE", "ASSUMPTION", "UNKNOWN", "FOUNDER_DECLARED_EXPECTATION", "EXTERNAL_SIGNAL"];

let _cache = null;
/** Textul .md canonic (cache-uit; fallback pe principiile structurate). */
export function constitutionDoc() {
  if (_cache != null) return _cache;
  try { _cache = readFileSync(DOC_PATH, "utf8"); } catch { _cache = ""; }
  return _cache;
}
export function constitutionVersion() {
  const m = constitutionDoc().match(/VERSION:\s*([0-9.]+)/);
  return m ? m[1] : "1.0.0";
}

/**
 * Blocul autoritar de injectat pe calea manageriala. Compact (nu tot .md-ul):
 * cele 15 principii in forma operationala + formatul standard. Aceleasi reguli,
 * un singur loc. `scope`: "full" | "compact" (implicit compact pentru buget).
 */
export function constitutionForPrompt({ scope = "compact" } = {}) {
  const head =
    "CONSTITUTIA CEO (obligatorie — esti CEO-adjunct, NU dashboard/analist/lista de probleme):\n";
  const principles = PRINCIPLES.map((p) => `${p.id} ${p.short}: ${p.rule}`).join("\n");
  const format =
    "\nFORMAT pentru riscuri/decizii (doar sectiunile necesare): CE CONTEAZA ACUM (concluzia, 2-3 fraze) · " +
    "RISCUL DOMINANT (dovada+impact+confidence) · CE FAC EU (actiuni JARVIS) · CE FACE ECHIPA (owner+rezultat+termen) · " +
    "CE AI TU DE DECIS (doar decizie de fondator) · CAND ESCALADEZ (prag concret). Incepe cu concluzia, nu cu date brute.";
  return scope === "full" ? head + principles + format + "\n\n" + constitutionDoc() : head + principles + format;
}

// ── Detectia intentiei manageriale (cand se aplica contractul + quality gate).
// Intrebarile pur factuale/simple raman pe ruta rapida (fara structura inutila).
const MANAGERIAL_CUES = [
  "cum stam", "cum sta", "ce facem", "ce fac cu", "ce recomanzi", "ce ar trebui", "ce zici de",
  "riscuri", "risc", "cash", "lichiditate", "obligatii", "de plata", "restant", "intarziat", "intarziate",
  "rezervari", "avans", "vanzari", "task-uri", "taskuri", "supraincarcat", "bottleneck", "blocaj",
  "prioritati", "prioritate", "situatia", "sa fac", "ce am de facut", "ce urmeaza", "decizie", "decid",
  "cine se ocupa", "owner", "escalad", "urmaresc", "follow", "ce lipseste",
];
const SIMPLE_FACTUAL = [
  /^\s*(cate|cati|cat|care|cine|unde|cand|ce ora|ce zi)\b/i, // intrebari factuale scurte
];

/** True daca mesajul cere raspuns MANAGERIAL (nu doar un fapt punctual). */
export function isManagerialIntent(text) {
  const n = String(text || "").toLowerCase();
  if (n.length < 4) return false;
  const managerial = MANAGERIAL_CUES.some((c) => n.includes(c));
  const simple = SIMPLE_FACTUAL.some((rx) => rx.test(n)) && n.length < 40 && !managerial;
  return managerial && !simple;
}

/** Clasa de evidenta pentru o afirmatie (helper pt. modele/teste). */
export function classifyEvidence(kind) {
  const k = String(kind || "").toUpperCase();
  return EVIDENCE_CLASSES.includes(k) ? k : "UNKNOWN";
}
