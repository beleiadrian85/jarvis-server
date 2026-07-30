// JARVIS LONG-TERM MEMORY — fatada publica (§3-§9). Gated de config.memory.longTerm.
// JARVIS DETINE memoria. Scrierea trece prin Write Gate; recall e read-only cu
// provenienta; contextul pentru modele e temporar si filtrat prin Data Classification.
import { config } from "../../config.js";
import { remember as _remember, supersede, revoke, list, getById, stats } from "./store.js";
import { recall as _recall, why } from "./retrieval.js";
import { assembleContext as _assembleContext } from "./contextAssembler.js";
import { classifyWrite } from "./writeGate.js";

export function memoryEnabled() { return config.memory?.longTerm === true; }

/** Scrie in memorie (gated). Daca memoria e OFF, nu persista nimic (dar raporteaza). */
export async function remember(cand, opts = {}) {
  if (!memoryEnabled()) return { stored: false, category: "DISABLED", reason: "Long-Term Memory OFF (JARVIS_LONG_TERM_MEMORY_ENABLED)", item: null };
  return _remember(cand, opts);
}

/** Recall relevant (gated). READ-ONLY. */
export async function recall(query, opts = {}) {
  if (!memoryEnabled()) return { found: false, items: [], summary: "Memorie OFF.", checked: 0 };
  return _recall(query, opts);
}

/** Context temporar pentru un model (gated). */
export async function assembleContext(query, opts = {}) {
  if (!memoryEnabled()) return { contextText: "(memorie OFF)", instructions: "", used: [], dropped: [], provenance: [], foundMemory: false };
  return _assembleContext(query, opts);
}

/** Ce s-ar intampla cu o informatie candidata (fara a scrie) — pentru UI/preview. */
export function classifyOnly(cand) { return classifyWrite(cand); }

export { supersede, revoke, list, getById, stats, why };
