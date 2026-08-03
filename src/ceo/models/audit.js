// AUDIT MULTI-MODEL (§20) — inregistreaza fiecare apel catre un model: provider, model,
// scop, clasa de date, ce memorii/documente au fost folosite, redactari, cost, latenta,
// rezultat, envelope. NU logheaza prompturi sensibile integral. Persistat in jarvis_state.
let _state = null;
async function getState(k, f) { if (!_state) _state = await import("../../state.js"); return _state.getState(k, f); }
async function setState(k, v) { if (!_state) _state = await import("../../state.js"); return _state.setState(k, v); }
const KEY = "ceo:models:audit";
let _seq = 0;

/** Scrie o intrare de audit (best-effort). Nu contine prompt integral. */
export async function auditModelCall(rec = {}, { store } = {}) {
  const s = store || { get: getState, set: setState };
  const db = (await s.get(KEY, null)) || { entries: [] };
  const entry = {
    request_id: rec.request_id || `mc:${Date.now?.() || ""}:${_seq++}`,
    provider: rec.provider || null, model: rec.model || null, purpose: rec.purpose || null,
    data_classification: rec.data_classification || "INTERNAL",
    memory_items_used: (rec.memory_items_used || []).slice(0, 40),
    documents_used: (rec.documents_used || []).slice(0, 40),
    redactions: rec.redactions || [], tokens_or_usage: rec.usage || {},
    cost: typeof rec.cost === "number" ? rec.cost : null, latency: rec.latency ?? null,
    result_status: rec.result_status || "unknown", envelope_id: rec.envelope_id || null,
    fallback_used: rec.fallback_used === true, blocked_reason: rec.blocked_reason || null,
    timestamp: rec.timestamp || new Date().toISOString(),
  };
  db.entries = [entry, ...(db.entries || [])].slice(0, 2000);
  await s.set(KEY, db);
  return entry;
}

export async function recentModelAudit({ store, limit = 100 } = {}) {
  const s = store || { get: getState };
  const db = (await s.get(KEY, null)) || { entries: [] };
  return (db.entries || []).slice(0, limit);
}
