// VECTOR / SEMANTIC RETRIEVAL — abstractie swappable (§7). Rezultatele vectoriale sunt
// DOAR candidate de context; se valideaza cu metadate + sursa originala (nu sunt sursa
// de adevar). Implementarea implicita e locala (lexical/semantic-lite, fara vendor).
// Providerul se poate schimba (OpenAI vector store / pgvector / intern) fara a lega
// JARVIS de un vendor. Interfata: search(query, items) → [{ item, score }].
import { config } from "../../config.js";

const STOP = new Set(["si","sa","la","de","cu","in","pe","un","o","este","e","are","am","ai","ce","mi","se","el","ea","ne","va","vor","pentru","din","care","dar","daca","cat","cum","cand","unde","the","a","of","to","is","it"]);
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const toks = (s) => norm(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/** Implementare LOCALA: similaritate lexicala cu ponderare pe radacina (stem 5). */
function localSimilarity(qTokens, text) {
  const hay = new Set(toks(text));
  const hayArr = [...hay];
  if (!qTokens.length || !hay.size) return 0;
  let hits = 0;
  for (const t of qTokens) {
    if (hay.has(t) || (t.length >= 6 && hayArr.some((w) => w.startsWith(t.slice(0, 5))))) hits++;
  }
  // Jaccard-lite: potriviri / lungimea interogarii, cu bonus de acoperire.
  return hits / Math.max(1, qTokens.length);
}

/**
 * Cauta semantic printre `items` (fiecare cu {title, content, entities, structured_data}).
 * @returns [{ item, score }] sortat desc, doar score>0.
 */
export async function semanticSearch(query, items, { limit = 20 } = {}) {
  const provider = (config.memory && config.memory.vectorProvider) || "local";
  // Puncte de extensie (OFF pana la configurare): openai_vector / pgvector.
  if (provider === "openai_vector" && config.openaiKey && typeof globalThis.__jarvisVectorSearch === "function") {
    try { return (await globalThis.__jarvisVectorSearch(query, items, { limit })) || []; } catch { /* fallback local */ }
  }
  const q = toks(query);
  const scored = items.map((it) => ({ item: it, score: localSimilarity(q, `${it.title} ${it.content} ${(it.entities || []).join(" ")} ${JSON.stringify(it.structured_data || {})}`) }))
    .filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  return scored;
}

/** Ce provider semantic e activ (pentru health/UI). */
export function vectorProvider() { return (config.memory && config.memory.vectorProvider) || "local"; }
