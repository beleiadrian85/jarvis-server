// CONVERSATION MODE CLASSIFIER (Faza 10). Un CEO AI trebuie sa stie CAND se
// discuta si CAND se comanda. Greseala clasica: a crea un task cand Adrian doar
// gandeste cu voce tare ("nu cere nimic, discut cu tine"). PUR + determinist.
// REGULA: DISCUSSION / QUESTION → ZERO side effect. Doar COMMAND explicit →
// executie, si NUMAI cu confirmare DUPA succes (execution receipt).

const norm = (s) => String(s || "").toLowerCase()
  .replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t");

export const MODES = ["DISCUSSION", "QUESTION", "COMMAND", "DECISION_HELP"];

// Semnale explicite ca NU se cere nicio actiune (discutie / brainstorming).
const DISCUSSION_CUES = [
  "nu cere nimic", "doar discut", "discut cu tine", "gandesc cu voce tare",
  "hai sa discutam", "ma gandesc", "hipotetic", "sa zicem ca", "brainstorm",
  "vreau doar sa vorbim", "fara sa faci nimic", "nu face nimic", "doar o parere",
];
// Cerere de sfat / decizie (raspuns cu rationament, dar FARA side effect).
const DECISION_CUES = [
  "tu ce ai face", "ce ai face tu", "ce m-ai sfatui", "ce recomanzi", "ce ai alege",
  "parerea ta", "ce zici", "ce e mai bine", "merita sa", "sa fac sau nu", "vindem sau pastram",
];
// Verbe imperative de comanda (creeaza actiune reala).
const COMMAND_CUES = [
  "fa task", "creeaza task", "pune task", "deleg", "trimite", "seteaza", "programeaza",
  "adauga", "noteaza", "aminteste-i", "da-i lui", "task la", "task maine", "sa se ocupe",
  "spune-i lui", "cere-i lui", "pune-l pe",
];
// Semnal de intrebare factuala.
const QUESTION_CUES = ["?", "cat", "cate", "cati", "care", "cine", "unde", "cand", "cum", "de ce", "ce status", "arata-mi", "spune-mi cat"];

function has(text, cues) { const n = norm(text); return cues.some((c) => n.includes(norm(c))); }

/**
 * Clasifica modul conversatiei.
 * @returns { mode, hasSideEffect, requiresReceipt, reason }
 *   hasSideEffect=true DOAR pentru COMMAND. Discutie/intrebare/decizie = read-only.
 */
export function classifyMode(text) {
  const n = norm(text);
  // 1) Discutie explicita → prioritate absoluta (nu executa nimic).
  if (has(text, DISCUSSION_CUES)) return mk("DISCUSSION", false, "semnal explicit de discutie ('nu cere nimic / doar discut')");
  // 2) Cerere de sfat/decizie → raspuns cu rationament, dar ZERO actiune.
  if (has(text, DECISION_CUES)) return mk("DECISION_HELP", false, "cerere de sfat/decizie → rationament CEO, fara side effect");
  // 3) Comanda explicita → singura cu side effect (create task etc.).
  if (has(text, COMMAND_CUES)) return mk("COMMAND", true, "verb imperativ de comanda → actiune (cu execution receipt, confirmare DUPA succes)");
  // 4) Intrebare factuala → read-only.
  if (n.includes("?") || has(text, QUESTION_CUES)) return mk("QUESTION", false, "intrebare factuala → read-only");
  // 5) Implicit: discutie (nu presupune comanda — safe by default).
  return mk("DISCUSSION", false, "ambiguu → tratat ca discutie (nu creez actiune fara comanda clara)");
}

function mk(mode, hasSideEffect, reason) {
  return { mode, hasSideEffect, requiresReceipt: mode === "COMMAND", reason };
}

/** True daca inputul poate declansa o scriere (TASKS-ONLY). */
export function mayWrite(text) { return classifyMode(text).mode === "COMMAND"; }
