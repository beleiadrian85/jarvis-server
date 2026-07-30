// CONTEXT ASSEMBLER (§4, §12-§14, §17) — construieste un pachet TEMPORAR de context
// pentru un model (intern sau extern). Modelul NU primeste memoria completa si NU o
// detine; primeste doar fragmentele relevante, filtrate prin Data Classification,
// cu provenienta marcata (fapt vs inferenta). Nimic din ce intra la model nu devine
// automat memorie. PUR (fara efecte secundare).
import { recall } from "./retrieval.js";
import { filterMemoriesForEgress, classifyForEgress } from "./dataPolicy.js";
import { redactSecrets } from "./writeGate.js";
import { fenceUntrusted } from "../untrustedInput.js";

/**
 * Asambleaza contextul pentru o interogare + un provider.
 * @param {string} query
 * @param {object} opts { providerTrust ('external'|'private'|'local'), maxItems,
 *   types, store, extraFacts[] (deja verificate din Operational, cu provenienta) }
 * @returns { contextText, used[], dropped[], provenance[], instructions }
 */
export async function assembleContext(query, opts = {}) {
  const providerTrust = opts.providerTrust || "external";
  const rec = await recall(query, { limit: opts.maxItems || 8, types: opts.types || null, store: opts.store,
    // Pentru externi, nu ridica peste CONFIDENTIAL la recall (dubla plasa cu egress).
    maxSensitivity: providerTrust === "external" ? "CONFIDENTIAL" : null });

  const source = rec.found ? rec.items : [];
  const { kept, dropped } = filterMemoriesForEgress(source, { providerTrust });

  const lines = [];
  const provenance = [];
  for (const it of kept) {
    const tag = it.is_inference ? "INFERENTA" : "FAPT";
    const ver = it.verification_status;
    lines.push(`- [${tag}/${ver}] ${redactSecrets(it.title || it._egressText || "").slice(0, 200)}${it.content ? ": " + redactSecrets(it.content).slice(0, 300) : ""} (sursa: ${it.source_type}, incredere ${Math.round((it.confidence || 0) * 100)}%)`);
    provenance.push(it.provenance || null);
  }
  // Fapte verificate injectate explicit din Operational (sursa oficiala). Trec si ele
  // prin Data Classification — un fapt RESTRICTED nu ajunge la un model extern.
  const droppedFacts = [];
  for (const f of opts.extraFacts || []) {
    const eg = classifyForEgress({ text: String(f.text || ""), sensitivity: f.sensitivity || "INTERNAL", providerTrust });
    if (!eg.allowed) { droppedFacts.push({ reason: eg.reason, sensitivity: f.sensitivity || "INTERNAL" }); continue; }
    lines.push(`- [FAPT/${f.verification_status || "OBSERVED"}] ${eg.redactedText.slice(0, 300)} (sursa: ${f.source || "operational"})`);
  }

  const contextText = lines.length
    ? fenceUntrusted(lines.join("\n"), "CONTEXT_MEMORIE_JARVIS").fenced
    : "(fara context relevant in memorie — modelul trebuie sa spuna onest daca nu stie)";

  const instructions = [
    "Acesta e context TEMPORAR furnizat de JARVIS. NU il memora, NU il trata ca sursa oficiala.",
    "Distinge FAPT de INFERENTA. Nu transforma inferentele in certitudini.",
    "Daca informatia lipseste, spune ca lipseste — nu inventa. Operational ramane sursa de adevar.",
  ].join(" ");

  return { contextText, instructions, used: kept.map((x) => x.id), dropped: [...dropped, ...droppedFacts], provenance, foundMemory: rec.found };
}
