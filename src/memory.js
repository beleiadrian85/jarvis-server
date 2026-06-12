import { pool, query, hasVector } from "./db.js";
import { config } from "./config.js";
import { callClaude } from "./claude.js";

/**
 * Memoria persistenta a lui JARVIS.
 * - saveMemory/recall: fapte categorisate, cu embedding cand exista
 *   VOYAGE_API_KEY + pgvector; altfel cautare text + recenta.
 * - saveDecision: registrul de decizii.
 * - extractFacts: extragere automata dupa conversatii semnificative.
 */

const CATEGORIES = ["Proiecte", "Financiar", "Contracte", "Operational", "Personal", "Decizii"];

async function embed(text) {
  if (!config.voyageKey || !hasVector) return null;
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.voyageKey}`,
      },
      body: JSON.stringify({ model: "voyage-3.5", input: [text.slice(0, 4000)] }),
    });
    if (!res.ok) throw new Error(`Voyage ${res.status}`);
    const d = await res.json();
    return d.data[0].embedding;
  } catch (e) {
    console.error("[embed]", e.message);
    return null;
  }
}

const toVec = (arr) => "[" + arr.join(",") + "]";

export async function saveMemory(category, fact, source = "conversatie") {
  if (!pool) return null;
  const cat = CATEGORIES.includes(category) ? category : "Operational";
  const vec = await embed(fact);
  if (vec) {
    const r = await query(
      `INSERT INTO memories (category, fact, source, embedding) VALUES ($1,$2,$3,$4) RETURNING id`,
      [cat, fact, source, toVec(vec)]
    );
    return r[0].id;
  }
  const r = await query(
    `INSERT INTO memories (category, fact, source) VALUES ($1,$2,$3) RETURNING id`,
    [cat, fact, source]
  );
  return r[0].id;
}

/**
 * Top-K memorii relevante pentru un text. Semantic daca se poate,
 * altfel potrivire pe cuvinte + recenta.
 */
export async function recall(text, k = 6) {
  if (!pool) return [];
  try {
    const vec = await embed(text);
    if (vec) {
      return await query(
        `SELECT category, fact, created_at FROM memories
         WHERE deleted_at IS NULL AND embedding IS NOT NULL
         ORDER BY embedding <=> $1 LIMIT $2`,
        [toVec(vec), k]
      );
    }
    const words = (text.toLowerCase().match(/[a-zăâîșț0-9]{4,}/gi) || []).slice(0, 8);
    if (!words.length) {
      return await query(
        `SELECT category, fact, created_at FROM memories
         WHERE deleted_at IS NULL ORDER BY id DESC LIMIT $1`, [k]
      );
    }
    const conds = words.map((_, i) => `fact ILIKE $${i + 1}`).join(" OR ");
    return await query(
      `SELECT category, fact, created_at FROM memories
       WHERE deleted_at IS NULL AND (${conds})
       ORDER BY id DESC LIMIT ${k}`,
      words.map((w) => `%${w}%`)
    );
  } catch (e) {
    console.error("[recall]", e.message);
    return [];
  }
}

/**
 * "Jarvis, noteaza decizia: ..." → structurare cu UN apel Claude + salvare
 * in decisions si in memories (categoria Decizii, ca sa intre in retrieval).
 */
export async function saveDecision(rawText) {
  if (!pool) throw new Error("Memoria persistenta nu e activa.");
  let s = {};
  try {
    const json = await callClaude({
      system:
        "Structureaza decizia de business anuntata de utilizator. Raspunzi DOAR cu JSON valid, " +
        'fara alt text: {"decision":"...","context":"...","arguments":"...","figures":"...",' +
        '"risks":"...","review_by":"YYYY-MM-DD sau null"}. Campurile lipsa raman "".',
      messages: [{ role: "user", content: rawText }],
      maxTokens: 500,
    });
    s = JSON.parse(json.replace(/^```json?\s*|\s*```$/g, ""));
  } catch {
    s = { decision: rawText };
  }
  const r = await query(
    `INSERT INTO decisions (context, arguments, figures, risks, decision, review_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, decided_on`,
    [s.context || "", s.arguments || "", s.figures || "", s.risks || "",
     s.decision || rawText, s.review_by || null]
  );
  await saveMemory(
    "Decizii",
    `Decizie (${r[0].decided_on.toISOString?.().slice(0, 10) || r[0].decided_on}): ${s.decision || rawText}` +
      (s.figures ? ` Cifre: ${s.figures}.` : "") + (s.risks ? ` Riscuri: ${s.risks}.` : ""),
    "registru decizii"
  );
  return { id: r[0].id, ...s };
}

export async function listDecisions(limit = 10) {
  if (!pool) return [];
  return await query(
    `SELECT id, decided_on, decision, figures, review_by FROM decisions
     ORDER BY id DESC LIMIT $1`, [limit]
  );
}

/**
 * Extragere automata de fapte noi din ultimele schimburi (1 apel mic).
 * Apelata periodic din brain (nu la fiecare mesaj — disciplina de tokeni).
 */
export async function extractFacts(exchangesText) {
  if (!pool) return 0;
  try {
    const json = await callClaude({
      system:
        "Extrage fapte de business NOI si DURABILE din conversatie (proiecte, sume, termene, " +
        "contracte, persoane, decizii, preferinte). Ignora small-talk si intrebari fara raspuns. " +
        'Raspunzi DOAR cu JSON: {"facts":[{"category":"Proiecte|Financiar|Contracte|Operational|Personal|Decizii","fact":"propozitie completa, de sine statatoare"}]}. ' +
        "Maxim 5 fapte. Daca nu e nimic de retinut: {\"facts\":[]}.",
      messages: [{ role: "user", content: exchangesText.slice(0, 6000) }],
      maxTokens: 600,
    });
    const { facts = [] } = JSON.parse(json.replace(/^```json?\s*|\s*```$/g, ""));
    for (const f of facts) await saveMemory(f.category, f.fact, "extragere automata");
    return facts.length;
  } catch (e) {
    console.error("[extractFacts]", e.message);
    return 0;
  }
}
