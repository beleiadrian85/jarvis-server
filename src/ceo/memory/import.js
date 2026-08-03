// SELECTIVE IMPORT (§18) — DOAR import explicit, niciodata sincronizare invizibila.
// Nu importa automat toate conversatiile / memoria personala ChatGPT / toate fisierele.
// Pipeline: import solicitat → preview → clasificare → detectare date sensibile →
// deduplicare → candidate → confirmare → persistare → audit. Provenienta marcata
// IMPORTED_FROM_*. Nu presupune ca afirmatiile istorice sunt inca valabile.
import { config } from "../../config.js";
import { classifyWrite, containsSecret } from "./writeGate.js";
import { remember, list } from "./store.js";
let _state = null;
async function getState(k, f) { if (!_state) _state = await import("../../state.js"); return _state.getState(k, f); }
async function setState(k, v) { if (!_state) _state = await import("../../state.js"); return _state.setState(k, v); }
const IMPORT_AUDIT_KEY = "ceo:memory:import-audit";

export function importEnabled() { return config.memory?.import === true; }

const PROVENANCE = { chatgpt: "IMPORTED_FROM_CHATGPT", other_ai: "IMPORTED_FROM_OTHER_AI", file: "IMPORTED_FROM_FILE", notes: "IMPORTED_FROM_NOTES" };
const norm = (s) => String(s || "").toLowerCase().trim();

/**
 * PREVIEW (nu persista): clasifica fiecare item, detecteaza sensibile, deduplica fata
 * de memoria existenta, produce candidate cu provenienta. @param items [{title,content,kind,source}]
 */
export async function previewImport(items = [], { source = "chatgpt", store } = {}) {
  const existing = await list({ includeInactive: true, limit: 5000, store });
  const existingKeys = new Set(existing.map((x) => `${norm(x.title)}|${norm(x.content).slice(0, 80)}`));
  const batchSeen = new Set(); // deduplicare si IN CADRUL lotului
  const provenance = PROVENANCE[source] || "IMPORTED_FROM_OTHER_AI";
  const candidates = [];
  for (const it of items) {
    const text = `${it.title || ""} ${it.content || ""}`.trim();
    const secret = containsSecret(text);
    const key = `${norm(it.title)}|${norm(it.content).slice(0, 80)}`;
    const duplicate = existingKeys.has(key) || batchSeen.has(key);
    batchSeen.add(key);
    const gate = classifyWrite({ text, kind: it.kind || "fact", source_type: provenance, verification_status: "DECLARED" });
    candidates.push({
      title: (it.title || "").slice(0, 120), content: (it.content || "").slice(0, 1000), kind: it.kind || "fact",
      provenance, has_sensitive: secret, duplicate,
      gate_category: gate.category, importable: !secret && !duplicate && gate.category !== "DO_NOT_STORE",
      note: secret ? "contine date sensibile — exclus" : duplicate ? "exista deja (duplicat)" : gate.category === "DO_NOT_STORE" ? "clasificat DO_NOT_STORE" : "importabil (marcat ca declarat, nu confirmat)",
    });
  }
  return { source, provenance, total: items.length, importable: candidates.filter((c) => c.importable).length, candidates };
}

/**
 * CONFIRM: persista DOAR candidatii confirmati de fondator (indici), prin Write Gate.
 * Marcheaza proveninenta si DECLARED (nu confirmat). Audit.
 */
export async function confirmImport(items = [], { source = "chatgpt", store, selectedIndexes = null } = {}) {
  if (!importEnabled()) return { ok: false, reason: "Memory Import OFF (JARVIS_MEMORY_IMPORT_ENABLED)" };
  const preview = await previewImport(items, { source, store });
  const chosen = preview.candidates.filter((c, i) => c.importable && (!selectedIndexes || selectedIndexes.includes(i)));
  const stored = [];
  for (const c of chosen) {
    // Continut de origine AI (ChatGPT/alt model) = INFERENTA, nu fapt confirmat (§5).
    // Marcam prin `extracted_by` (schema deriva is_inference=true) — NU prin is_inference
    // pe candidat, care ar declansa regula "opinie de model → working only" a gate-ului
    // si ar impiedica persistarea ceruta explicit la import.
    const aiOrigin = c.provenance === "IMPORTED_FROM_CHATGPT" || c.provenance === "IMPORTED_FROM_OTHER_AI";
    const r = await remember({ title: c.title, content: c.content, kind: c.kind, source_type: c.provenance,
      verification_status: "DECLARED", confidence: 0.3,
      extracted_by: aiOrigin ? c.provenance : null,
      structured_data: { imported: true, provenance: c.provenance, ai_inference: aiOrigin } }, { store });
    if (r.stored) stored.push(r.item.id);
  }
  const s = store || { get: getState, set: setState };
  const adb = (await s.get(IMPORT_AUDIT_KEY, null)) || { imports: [] };
  adb.imports = [{ at: new Date().toISOString(), source, provenance: preview.provenance, requested: items.length, imported: stored.length, excluded: preview.total - stored.length }, ...(adb.imports || [])].slice(0, 200);
  await s.set(IMPORT_AUDIT_KEY, adb);
  return { ok: true, imported: stored.length, memory_items: stored, excluded: preview.total - stored.length, provenance: preview.provenance };
}

/** Rollback: revoca memoriile importate intr-un lot (dupa provenienta). */
export async function importAudit({ store, limit = 50 } = {}) {
  const s = store || { get: getState };
  const adb = (await s.get(IMPORT_AUDIT_KEY, null)) || { imports: [] };
  return (adb.imports || []).slice(0, limit);
}
