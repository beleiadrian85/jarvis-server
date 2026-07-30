// JARVIS MEMORY — SCHEMA + PROVENIENTA (§3-§5). JARVIS DETINE memoria; modelele
// primesc doar context temporar; Operational ramane sursa oficiala. Fiecare memorie
// pastreaza provenienta (sursa, timestamp, verificare, dovezi, incredere). Faptele
// se disting de inferente. PUR (structura + validare).

export const MEMORY_TYPES = ["WORKING", "EPISODIC", "SEMANTIC", "DOCUMENT", "DECISION", "RELATIONSHIP", "PREFERENCE", "POLICY"];
export const VERIFICATION_STATUSES = ["UNVERIFIED", "DECLARED", "OBSERVED", "EXTRACTED", "CORRELATED", "VERIFIED", "CONFIRMED", "CONTRADICTED", "SUPERSEDED", "REVOKED"];
export const SENSITIVITY = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "HIGHLY_CONFIDENTIAL", "RESTRICTED"];

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
let _seq = 0;

/**
 * Construieste un MemoryItem canonic cu provenienta obligatorie. NICIODATA o
 * concluzie fara sursa + timestamp + nivel de verificare + evidence.
 */
export function buildMemoryItem(p = {}, { nowISO = null } = {}) {
  const c = isObj(p) ? p : {};
  const now = nowISO || new Date().toISOString();
  const memory_type = MEMORY_TYPES.includes(String(c.memory_type).toUpperCase()) ? String(c.memory_type).toUpperCase() : "EPISODIC";
  return {
    id: c.id || `mem:${now.replace(/[^0-9]/g, "").slice(0, 17)}:${(_seq++) % 1000}`,
    memory_type, tenant_id: c.tenant_id || "profi-concept", owner_user_id: c.owner_user_id || "adrian",
    title: String(c.title || "").slice(0, 200), content: String(c.content || "").slice(0, 4000),
    structured_data: isObj(c.structured_data) ? c.structured_data : {},
    entities: arr(c.entities), relations: arr(c.relations),
    // PROVENIENTA (obligatorie):
    source_type: c.source_type || "unknown", source_reference: c.source_reference || null,
    evidence_references: arr(c.evidence_references),
    extracted_by: c.extracted_by || null, // ex. model folosit → marcaj AI_INFERENCE
    verification_status: VERIFICATION_STATUSES.includes(String(c.verification_status).toUpperCase()) ? String(c.verification_status).toUpperCase() : "UNVERIFIED",
    confidence: typeof c.confidence === "number" ? Math.max(0, Math.min(1, c.confidence)) : 0.3,
    sensitivity: SENSITIVITY.includes(String(c.sensitivity).toUpperCase()) ? String(c.sensitivity).toUpperCase() : "INTERNAL",
    // Marcaj AI_INFERENCE: orice provenienta de model conteaza ca inferenta, nu fapt.
    // Sursele umane/de sistem cunoscute NU sunt inferente.
    is_inference: c.is_inference === true || (!!c.extracted_by && !/^(human|founder|adrian|operational|rule|system|manual)$/i.test(String(c.extracted_by).trim())),
    valid_from: c.valid_from || now, valid_until: c.valid_until || null,
    supersedes: c.supersedes || null, superseded_by: null,
    retention_policy: c.retention_policy || "default", version: c.version || 1,
    created_at: now, updated_at: now,
  };
}

/** Validare structurala + provenienta. @returns {ok, errors[]} */
export function validateMemoryItem(item) {
  const e = [];
  if (!isObj(item)) return { ok: false, errors: ["nu e obiect"] };
  if (!MEMORY_TYPES.includes(item.memory_type)) e.push("memory_type invalid");
  if (!VERIFICATION_STATUSES.includes(item.verification_status)) e.push("verification_status invalid");
  if (!SENSITIVITY.includes(item.sensitivity)) e.push("sensitivity invalida");
  // PROVENIENTA: un fapt VERIFIED/CONFIRMED cere sursa + evidence.
  if (["VERIFIED", "CONFIRMED", "CORRELATED"].includes(item.verification_status) && !item.source_reference && !item.evidence_references?.length)
    e.push("fapt verificat fara sursa/evidence (provenienta obligatorie)");
  if (!item.source_type) e.push("source_type lipsa");
  if (!item.created_at) e.push("timestamp lipsa");
  return { ok: e.length === 0, errors: e };
}

/** Raspuns la "de unde stii asta?" — provenienta lizibila. PUR. */
export function provenanceOf(item) {
  if (!isObj(item)) return null;
  return {
    source: item.source_type, reference: item.source_reference,
    when: item.created_at, verification: item.verification_status,
    confidence: item.confidence, is_inference: item.is_inference,
    extracted_by: item.extracted_by, still_valid: !item.superseded_by && !item.valid_until || (item.valid_until ? Date.parse(item.valid_until) > Date.now() : true),
    version: item.version,
    answer: `${item.is_inference ? "Inferenta" : "Observat"} din ${item.source_type}${item.source_reference ? ` (${String(item.source_reference).slice(0, 40)})` : ""}, ${String(item.created_at).slice(0, 10)}, verificare=${item.verification_status}, incredere=${Math.round((item.confidence || 0) * 100)}%${item.superseded_by ? " — SUPERSEDED (versiune veche)" : ""}.`,
  };
}
