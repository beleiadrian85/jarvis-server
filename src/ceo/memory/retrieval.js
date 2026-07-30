// JARVIS MEMORY RETRIEVAL (§5) — recall determinist, relevant, cu provenienta.
// Nu inventeaza; daca nu gaseste, spune onest ca nu gaseste. Prioritizeaza memorii
// verificate si recente; scade increderea pentru inferente si memorii vechi.
import { list } from "./store.js";
import { provenanceOf } from "./schema.js";

const STOP = new Set(["si","sa","la","de","cu","in","pe","un","o","este","e","are","am","ai","ce","mi","se","el","ea","ne","va","vor","pentru","din","care","dar","daca","cat","cum","cand","unde","asta","acest","aceasta","the","a","of","to","is","it"]);
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const terms = (q) => norm(q).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

function scoreItem(item, qterms) {
  const hay = norm(`${item.title} ${item.content} ${(item.entities || []).join(" ")} ${JSON.stringify(item.structured_data || {})}`);
  let hits = 0;
  // Potrivire exacta sau pe radacina (stem 5 caractere pentru cuvinte lungi),
  // ca "facturii" sa gaseasca "factura" — fara stemming agresiv pe cuvinte scurte.
  for (const t of qterms) { if (hay.includes(t) || (t.length >= 6 && hay.includes(t.slice(0, 5)))) hits++; }
  if (!hits) return 0;
  let score = hits / Math.max(1, qterms.length);
  // Increderea si verificarea moduleaza.
  const vBoost = { CONFIRMED: 1.0, VERIFIED: 0.95, CORRELATED: 0.85, OBSERVED: 0.75, EXTRACTED: 0.7, DECLARED: 0.6, UNVERIFIED: 0.4 }[item.verification_status] ?? 0.5;
  score *= vBoost * (0.5 + 0.5 * (item.confidence ?? 0.3));
  if (item.is_inference) score *= 0.8; // inferentele conteaza mai putin ca faptele
  // Recenta (decadere lenta ~180 zile).
  const ageDays = (Date.now() - Date.parse(item.created_at || 0)) / 86400000;
  if (Number.isFinite(ageDays)) score *= Math.max(0.5, 1 - ageDays / 360);
  return score;
}

/**
 * Recall memorii relevante pentru o intrebare. READ-ONLY.
 * @returns { found (bool), items[], summary, checked }
 */
export async function recall(query, { types = null, limit = 8, minScore = 0.15, store, maxSensitivity = null } = {}) {
  const qterms = terms(query);
  if (!qterms.length) return { found: false, items: [], summary: "Intrebare prea generala pentru recall.", checked: 0 };
  const pool = await list({ includeInactive: false, limit: 2000, store });
  const order = { PUBLIC: 0, INTERNAL: 1, CONFIDENTIAL: 2, HIGHLY_CONFIDENTIAL: 3, RESTRICTED: 4 };
  const maxLvl = maxSensitivity ? (order[maxSensitivity] ?? 4) : 4;
  const filtered = pool.filter((x) => (order[x.sensitivity] ?? 1) <= maxLvl && (!types || types.includes(x.memory_type)));
  const scored = filtered.map((x) => ({ item: x, score: scoreItem(x, qterms) })).filter((r) => r.score >= minScore).sort((a, b) => b.score - a.score).slice(0, limit);
  if (!scored.length) return { found: false, items: [], summary: "Nu am nimic relevant in memorie despre asta. (Nu inventez — verific la sursa.)", checked: filtered.length };
  return {
    found: true,
    items: scored.map((r) => ({ ...r.item, _score: Math.round(r.score * 100) / 100, provenance: provenanceOf(r.item) })),
    summary: `${scored.length} memorii relevante (din ${filtered.length} verificate).`,
    checked: filtered.length,
  };
}

/** Raspunde "de unde stii?" pentru un id. */
export async function why(id, { store } = {}) {
  const items = await list({ includeInactive: true, limit: 5000, store });
  const it = items.find((x) => x.id === id);
  return it ? provenanceOf(it) : null;
}
