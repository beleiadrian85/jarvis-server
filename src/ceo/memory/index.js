// JARVIS LONG-TERM MEMORY — fatada publica (§3-§9). Gated de config.memory.longTerm.
// JARVIS DETINE memoria. Scrierea trece prin Write Gate; recall e read-only cu
// provenienta; contextul pentru modele e temporar si filtrat prin Data Classification.
import { config } from "../../config.js";
import { remember as _remember, supersede, revoke, list, getById, stats, correct, corrections, exportAll, restore } from "./store.js";
import { recall as _recall, why } from "./retrieval.js";
import { assembleContext as _assembleContext } from "./contextAssembler.js";
import { classifyWrite } from "./writeGate.js";
import { addRelation as _addRelation, neighbors, path as graphPath, edges, graphStats } from "./graph.js";

export function memoryEnabled() { return config.memory?.longTerm === true; }
const OFF = { stored: false, category: "DISABLED", reason: "Long-Term Memory OFF (JARVIS_LONG_TERM_MEMORY_ENABLED)", item: null };

/** Scrie in memorie (gated). Daca memoria e OFF, nu persista nimic (dar raporteaza). */
export async function remember(cand, opts = {}) {
  if (!memoryEnabled()) return OFF;
  return _remember(cand, opts);
}

// ── Ajutoare tipate (§3): fiecare mapeaza pe un tip de memorie, prin acelasi gate ──

/** Eveniment verificabil (Episodic Memory). */
export async function rememberEpisode(p, opts = {}) {
  return remember({ ...p, kind: "episode", memory_type: "EPISODIC" }, opts);
}
/** Fapt stabil cu sursa (Semantic Memory) — candidat semantic, nu confirmat automat. */
export async function rememberFact(p, opts = {}) {
  return remember({ ...p, kind: "fact", memory_type: "SEMANTIC" }, opts);
}
/** Decizie a fondatorului (Decision Memory) — extinde Decision Learning cu context/outcome. */
export async function rememberDecision(p, opts = {}) {
  const sd = { situation: p.situation, options: p.options || [], choice: p.choice, reason: p.reason,
    risk: p.risk || null, reversibility: p.reversibility || null, outcome: p.outcome ?? null,
    corrected: p.corrected === true, derived_rule: p.derived_rule || null,
    confidence: typeof p.confidence === "number" ? p.confidence : 0.5, reuse_conditions: p.reuse_conditions || null };
  return remember({ title: p.title || p.situation || "decizie", content: p.reason || p.choice || "", kind: "decision",
    source_type: p.source_type || "founder", source_reference: p.source_reference || null,
    verification_status: p.verification_status || "DECLARED", entities: p.entities || [], structured_data: sd }, opts);
}
/** Referinta document (Document Memory) — hash/versiune/data document + fragment. */
export async function rememberDocument(p, opts = {}) {
  const content = String(p.content || p.excerpt || "");
  let h = 0; for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) | 0;
  const sd = { document_id: p.document_id || null, version: p.version || 1, hash: p.hash || `h${h}`,
    doc_date: p.doc_date || null, author: p.author || null, excerpt: content.slice(0, 500),
    confidentiality: p.sensitivity || "INTERNAL", ...p.structured_data };
  return remember({ title: p.title || p.document_id || "document", content: content.slice(0, 500), kind: "document",
    source_type: p.source_type || "document", source_reference: p.source_reference || p.document_id || null,
    verification_status: p.verification_status || "OBSERVED", sensitivity: p.sensitivity || "INTERNAL",
    entities: p.entities || [], structured_data: sd }, opts);
}
/** Preferinta declarata/observata (Preference Memory) — cu confidence, corectabila. */
export async function rememberPreference(p, opts = {}) {
  return remember({ title: p.title || p.preference || "preferinta", content: p.content || p.preference || "",
    kind: "episode", memory_type: "PREFERENCE", source_type: p.source_type || (p.observed ? "observed" : "founder"),
    verification_status: p.observed ? "CORRELATED" : "DECLARED", confidence: typeof p.confidence === "number" ? p.confidence : (p.observed ? 0.6 : 0.9),
    entities: p.entities || [], structured_data: p.structured_data || {} }, opts);
}
/** Politica aprobata (Policy Memory) — DOAR cu aprobarea fondatorului. */
export async function rememberPolicy(p, opts = {}) {
  return remember({ title: p.title || "politica", content: p.content || "", kind: "policy",
    source_type: p.source_type || "founder", verification_status: "DECLARED", sensitivity: p.sensitivity || "INTERNAL",
    structured_data: p.structured_data || {} }, { ...opts, founder_approved: opts.founder_approved === true || p.founder_approved === true });
}
/** Relatie in graf (Relationship Memory). */
export async function addRelation(p, opts = {}) {
  if (!memoryEnabled()) return OFF;
  return _addRelation(p, opts);
}

/** Recall relevant (gated). READ-ONLY. */
export async function recall(query, opts = {}) {
  if (!memoryEnabled()) return { found: false, items: [], summary: "Memorie OFF.", checked: 0 };
  return _recall(query, opts);
}

/** Context temporar pentru un model (gated). */
export async function assembleContext(query, opts = {}) {
  if (!memoryEnabled()) return { contextText: "(memorie OFF)", instructions: "", used: [], dropped: [], provenance: [], foundMemory: false, sections: {} };
  return _assembleContext(query, opts);
}

/** Ce s-ar intampla cu o informatie candidata (fara a scrie) — pentru UI/preview. */
export function classifyOnly(cand) { return classifyWrite(cand); }

export { supersede, revoke, list, getById, stats, why, correct, corrections, exportAll, restore, neighbors, graphPath, edges, graphStats };
