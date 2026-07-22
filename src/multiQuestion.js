// MULTI-QUESTION SUPPORT — descompune un mesaj cu mai multe intrebari/cereri,
// instruieste modelul sa raspunda punctual la FIECARE (numerotat, in ordine),
// si verifica completitudinea raspunsului (QUESTIONS_DETECTED == ANSWERED).
// PUR: fara IO. Patch minim peste chat-ul existent, nu arhitectura noua.
import { countQuestions } from "./intents.js";

/**
 * Descompune mesajul in intrebari/cereri distincte, in ORDINEA din mesaj. PUR.
 * Acopera: liste numerotate (1. 2) 3-), linii separate, segmente cu "?" si
 * cereri unite cu "si"/"," care incep cu cuvant interogativ/imperativ.
 * @returns {string[]} intrebarile, in ordine (min 1 daca mesajul e o cerere).
 */
export function splitQuestions(text) {
  const t = String(text || "").trim();
  if (!t) return [];

  // 1) Lista numerotata explicita (1. ... 2. ... / 1) ... 2) ...): cel mai clar.
  const numbered = t.split(/(?:^|\s)(?=\d{1,2}[.)]\s)/).map((s) => s.trim()).filter(Boolean);
  if (numbered.length >= 2 && numbered.filter((s) => /^\d{1,2}[.)]/.test(s)).length >= 2) {
    return numbered.map((s) => s.replace(/^\d{1,2}[.)]\s*/, "").trim()).filter((s) => s.length > 0);
  }

  // 2) Linii separate (fiecare linie = o cerere), daca sunt mai multe.
  const lines = t.split(/\n+/).map((s) => s.trim()).filter((s) => s.length > 1);
  if (lines.length >= 2) return lines;

  // 3) Un singur bloc: sparge pe "?" pastrand delimitatorul, apoi pe segmente
  //    unite cu "si"/"," care incep cu cuvant interogativ/imperativ.
  const qWord = /^(ce|cine|cum|c[aâ]nd|cand|unde|de ce|c[aâ]t|cat|c[aâ]ti|cati|c[aâ]te|cate|care|oare|verifica|arata|listeaza|explica|spune|zi|calculeaza|compara|rezuma|imi )/i;
  const byMark = [];
  let buf = "";
  for (const ch of t) {
    buf += ch;
    if (ch === "?") { byMark.push(buf.trim()); buf = ""; }
  }
  if (buf.trim()) byMark.push(buf.trim());
  const parts = [];
  for (const seg of byMark.filter(Boolean)) {
    // sparge segmentul pe " si " / ", " cand a doua parte incepe interogativ
    const sub = seg.split(/\s*(?:,|\bsi\b|\bși\b)\s+/i);
    let cur = sub[0];
    for (let i = 1; i < sub.length; i++) {
      if (qWord.test(sub[i].trim())) { parts.push(cur.trim()); cur = sub[i]; }
      else cur += " si " + sub[i];
    }
    parts.push(cur.trim());
  }
  let cleaned = parts.map((s) => s.trim()).filter((s) => s.length > 1);
  // Elimina umplutura (salut/multumesc etc.) — pastreaza doar segmentele care
  // chiar sunt intrebari/cereri (au "?" sau incep interogativ/imperativ). Asa
  // "salut, cum merge?" ramane O intrebare, nu doua.
  if (cleaned.length > 1) {
    const real = cleaned.filter((s) => s.includes("?") || qWord.test(s));
    if (real.length) cleaned = real;
  }
  return cleaned.length ? cleaned : [t];
}

/** Instructiunea injectata cand sunt mai multe intrebari. PUR. */
export function multiQuestionInstruction(questions) {
  const n = questions.length;
  return (
    `\n\nMESAJ CU MAI MULTE CERERI: Adi a pus ${n} intrebari/cereri distincte in acest mesaj. ` +
    `Raspunde la TOATE cele ${n}, numerotat 1..${n}, in ORDINEA in care le-a pus. ` +
    `Fiecare raspuns scurt si la obiect. Daca la una nu ai date sigure, scrie exact ` +
    `"<nr>. UNKNOWN — lipseste <ce anume>". NU sari peste niciuna, NU le combina, NU raspunde ` +
    `doar la ultima. Intrebarile detectate, in ordine:\n` +
    questions.map((q, i) => `${i + 1}. ${q}`).join("\n")
  );
}

/** Cate sectiuni numerotate de raspuns contine textul. PUR. */
export function countAnsweredSections(reply) {
  const t = String(reply || "");
  // Numeroteaza sectiunile de forma "1." / "1)" / "**1." la inceput de linie.
  const nums = new Set();
  for (const m of t.matchAll(/(?:^|\n)\s*\**\s*(\d{1,2})[.)]/g)) nums.add(Number(m[1]));
  return nums.size;
}

/**
 * Gardadecompletitudine: cate au fost detectate vs cate au primit raspuns. PUR.
 * @returns {{complete, detected, answered, missing:number[]}}
 */
export function completenessGap(detectedCount, reply) {
  const t = String(reply || "");
  const answeredNums = new Set();
  for (const m of t.matchAll(/(?:^|\n)\s*\**\s*(\d{1,2})[.)]/g)) {
    const k = Number(m[1]);
    if (k >= 1 && k <= detectedCount) answeredNums.add(k);
  }
  const answered = answeredNums.size;
  const missing = [];
  for (let i = 1; i <= detectedCount; i++) if (!answeredNums.has(i)) missing.push(i);
  return { complete: answered >= detectedCount, detected: detectedCount, answered, missing };
}

/** Bugetul de tokeni scalat cu numarul de intrebari (nu taia raspunsul). PUR. */
export function tokenBudgetFor(nQuestions, base = 800) {
  if (nQuestions <= 1) return base;
  return Math.min(8000, base + nQuestions * 200);
}

export { countQuestions };
