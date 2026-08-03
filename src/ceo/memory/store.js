// JARVIS MEMORY STORE (§3-§4) — persistenta structurata + episodica peste
// jarvis_state (fara schema DB noua). JARVIS DETINE aceasta memorie. Scrierea trece
// OBLIGATORIU prin Write Gate. Suporta versionare (supersede) fara stergere. Plafoane
// pe tip ca sa nu creasca nemarginit. Store injectabil pentru teste.
import { buildMemoryItem, validateMemoryItem, provenanceOf } from "./schema.js";
import { classifyWrite, persistsToLongTerm, redactSecrets } from "./writeGate.js";

const KEY = "ceo:memory:v1";
const CORR_KEY = "ceo:memory:corrections"; // JarvisMemoryCorrection log (audit uitare/corectii)

/** Amprenta pentru deduplicare (acelasi continut, aceeasi sursa, acelasi tenant). */
function fingerprint(it) {
  const base = `${it.tenant_id || ""}|${it.memory_type}|${String(it.title || "").trim().toLowerCase()}|${String(it.content || "").trim().toLowerCase()}|${it.source_reference || ""}`;
  let h = 0; for (let i = 0; i < base.length; i++) { h = (h * 31 + base.charCodeAt(i)) | 0; }
  return `fp${h}`;
}
// Plafoane per tip (episodicele se roteste; semantice/decizii/politici mai putine dar stabile).
const CAPS = { EPISODIC: 500, SEMANTIC: 300, DOCUMENT: 300, DECISION: 200, RELATIONSHIP: 200, PREFERENCE: 100, POLICY: 60, WORKING: 0 };

function defaultStore() {
  return { get: (k, f) => getState(k, f), set: (k, v) => setState(k, v) };
}
let _state = null;
async function getState(k, f) { if (!_state) _state = await import("../../state.js"); return _state.getState(k, f); }
async function setState(k, v) { if (!_state) _state = await import("../../state.js"); return _state.setState(k, v); }

async function load(store) { const s = store || defaultStore(); const raw = (await s.get(KEY, null)) || {}; return raw.items ? raw : { items: [], updated_at: null }; }
async function save(db, store) { const s = store || defaultStore(); db.updated_at = new Date().toISOString(); await s.set(KEY, db); return db; }

/**
 * Scrie o memorie DUPA clasificarea Write Gate. Returneaza rezultatul deciziei —
 * daca gate-ul refuza (secrete / politica neaprobata), NU se persista nimic.
 * @param {object} cand candidat brut (vezi classifyWrite) + campuri de schema
 * @param {object} opts { store, nowISO, founder_approved, from_model }
 */
export async function remember(cand = {}, opts = {}) {
  const gate = classifyWrite({
    // Scaneaza TOT candidatul (inclusiv structured_data/entities), nu doar titlul —
    // un secret ascuns intr-un camp structurat NU trebuie sa scape de gate.
    // entities se serializeaza cu JSON.stringify (NU .join): un obiect-entitate ar da
    // "[object Object]" cu .join si ar ascunde secretul de scanare.
    text: `${cand.title || ""} ${cand.content || ""} ${cand.structured_data ? JSON.stringify(cand.structured_data) : ""} ${Array.isArray(cand.entities) ? JSON.stringify(cand.entities) : ""}`.trim(),
    kind: cand.kind, source_type: cand.source_type, verification_status: cand.verification_status,
    from_model: opts.from_model === true || cand.is_inference === true,
    founder_approved: opts.founder_approved === true || cand.founder_approved === true,
  });

  if (!persistsToLongTerm(gate.category)) {
    return { stored: false, category: gate.category, reason: gate.reason, item: null };
  }

  let memory_type = gate.category === "STORE_DECISION" ? "DECISION"
    : gate.category === "STORE_DOCUMENT_REFERENCE" ? "DOCUMENT"
    : gate.category === "STORE_POLICY_ONLY_WITH_APPROVAL" ? "POLICY"
    : gate.category === "STORE_SEMANTIC_CANDIDATE" ? "SEMANTIC" : "EPISODIC";
  // RELATIONSHIP/PREFERENCE nu au mapare din gate (nu sunt secrete/politici) → respecta
  // tipul explicit cerut, dar NICIODATA pentru categoria de politica (aceea ramane POLICY).
  const explicit = String(cand.memory_type || "").toUpperCase();
  if (["RELATIONSHIP", "PREFERENCE"].includes(explicit) && gate.category !== "STORE_POLICY_ONLY_WITH_APPROVAL") memory_type = explicit;

  const item = buildMemoryItem({ ...cand, memory_type }, { nowISO: opts.nowISO });
  item.fingerprint = fingerprint(item);
  const v = validateMemoryItem(item);
  if (!v.ok) return { stored: false, category: gate.category, reason: `validare esuata: ${v.errors.join("; ")}`, item: null };

  const db = await load(opts.store);
  // Deduplicare: acelasi continut+sursa+tenant, inca activ → nu duplicam.
  const dup = db.items.find((x) => x.fingerprint === item.fingerprint && x.verification_status !== "SUPERSEDED" && x.verification_status !== "REVOKED");
  if (dup && !opts.allowDuplicate) return { stored: false, deduped: true, category: gate.category, reason: "memorie identica exista deja (deduplicata)", item: dup };
  db.items.unshift(item);
  // Rotatie per tip (pastreaza cele mai recente pana la plafon).
  const cap = CAPS[memory_type] || 200;
  const ofType = db.items.filter((x) => x.memory_type === memory_type);
  if (ofType.length > cap) {
    const keep = new Set(ofType.slice(0, cap).map((x) => x.id));
    db.items = db.items.filter((x) => x.memory_type !== memory_type || keep.has(x.id));
  }
  await save(db, opts.store);
  return { stored: true, category: gate.category, reason: gate.reason, item };
}

/** Inlocuieste o memorie cu o versiune noua (versionare, fara stergere). */
export async function supersede(oldId, cand = {}, opts = {}) {
  const db = await load(opts.store);
  const old = db.items.find((x) => x.id === oldId);
  if (!old) return { stored: false, reason: "memoria veche nu exista", item: null };
  const res = await remember({ ...cand, supersedes: oldId, version: (old.version || 1) + 1 }, opts);
  if (res.stored) {
    const db2 = await load(opts.store);
    const o = db2.items.find((x) => x.id === oldId);
    if (o) { o.superseded_by = res.item.id; o.verification_status = "SUPERSEDED"; o.updated_at = new Date().toISOString(); await save(db2, opts.store); }
  }
  return res;
}

/** Marcheaza REVOKED (dreptul de a fi uitat — §16). Nu sterge fizic, dar exclude din recall. */
export async function revoke(id, reason = "revocat de fondator", opts = {}) {
  const db = await load(opts.store);
  const it = db.items.find((x) => x.id === id);
  if (!it) return { ok: false };
  it.verification_status = "REVOKED"; it.content = "[REVOCAT]"; it.structured_data = {}; it.updated_at = new Date().toISOString();
  it.revoke_reason = reason;
  await save(db, opts.store);
  return { ok: true };
}

/** Listeaza memorii active (exclude SUPERSEDED/REVOKED implicit). Izolare pe tenant. */
export async function list({ type = null, includeInactive = false, limit = 100, store, tenant_id = null } = {}) {
  const db = await load(store);
  let items = db.items;
  if (tenant_id) items = items.filter((x) => (x.tenant_id || "profi-concept") === tenant_id);
  if (type) items = items.filter((x) => x.memory_type === String(type).toUpperCase());
  if (!includeInactive) items = items.filter((x) => x.verification_status !== "SUPERSEDED" && x.verification_status !== "REVOKED");
  return items.slice(0, limit);
}

/** Corectare: inregistreaza corectia (audit) + inlocuieste cu versiune noua. */
export async function correct(oldId, cand = {}, opts = {}) {
  const s = opts.store || defaultStore();
  const before = await getById(oldId, opts);
  const res = await supersede(oldId, cand, opts);
  if (res.stored) {
    const log = (await s.get(CORR_KEY, null)) || { corrections: [] };
    log.corrections = [{ old_id: oldId, new_id: res.item.id, at: new Date().toISOString(), reason: opts.reason || cand.reason || "corectat de fondator", before_title: before?.title || null }, ...(log.corrections || [])].slice(0, 500);
    await s.set(CORR_KEY, log);
  }
  return res;
}

/** Jurnalul de corectii (audit). */
export async function corrections({ store, limit = 100 } = {}) {
  const s = store || defaultStore();
  const log = (await s.get(CORR_KEY, null)) || { corrections: [] };
  return (log.corrections || []).slice(0, limit);
}

/** Export complet (portabilitate). Include istoricul (superseded/revoked). */
export async function exportAll({ store, tenant_id = null } = {}) {
  const db = await load(store);
  let items = db.items;
  if (tenant_id) items = items.filter((x) => (x.tenant_id || "profi-concept") === tenant_id);
  return { exported_at: new Date().toISOString(), count: items.length, items };
}

/** Restore o memorie revocata/superseded (daca politica permite). */
export async function restore(id, opts = {}) {
  const db = await load(opts.store);
  const it = db.items.find((x) => x.id === id);
  if (!it) return { ok: false, reason: "inexistenta" };
  if (it.superseded_by) return { ok: false, reason: "are o versiune mai noua — restaureaza acolo" };
  it.verification_status = it._prev_status || "DECLARED"; it.updated_at = new Date().toISOString();
  await save(db, opts.store);
  return { ok: true, item: it };
}

export async function getById(id, { store } = {}) { const db = await load(store); return db.items.find((x) => x.id === id) || null; }
export async function stats({ store } = {}) {
  const db = await load(store);
  const by = {};
  for (const x of db.items) by[x.memory_type] = (by[x.memory_type] || 0) + 1;
  const active = db.items.filter((x) => x.verification_status !== "SUPERSEDED" && x.verification_status !== "REVOKED").length;
  return { total: db.items.length, active, by_type: by, updated_at: db.updated_at };
}

export { provenanceOf, redactSecrets };
