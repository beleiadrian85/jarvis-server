/**
 * B1 — utilitare pure de text, extrase din brain.js (comportament identic).
 */

/** Normalizare pentru potriviri: lowercase + fara diacritice combinante + trim. */
export const norm = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * Separa rezumatul vocal '[VOCE] ...' de textul complet.
 * → { text: ce se afiseaza, voice: ce se rosteste (null daca lipseste) }.
 */
export function splitVoice(reply) {
  const s = String(reply || "");
  const m = s.match(/\n*\[VOCE\]\s*:?\s*([\s\S]+)$/i);
  if (!m) return { text: s.trim(), voice: null };
  return { text: s.slice(0, m.index).trim(), voice: m[1].trim() };
}
