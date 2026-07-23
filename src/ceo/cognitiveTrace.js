// COGNITIVE TRACE — PERSISTENCE (Faza 31). Nu mai intrebam niciodata JARVIS "ce
// model ai folosit?" — vedem factual. Persista un TRACE per interactiune
// manageriala importanta intr-un ring buffer marginit (jarvis_state), citibil
// read-only. Constructia formei = executionTrace.buildTrace (PUR); aici doar
// stampilam + persistam. Zero egress, zero write Operational.
import { getState, setState } from "../state.js";

const KEY = "ceo:cognitive-trace";
const MAX = 100; // ring buffer marginit (nu creste nelimitat)

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

/**
 * Inregistreaza un trace. Campuri (cele care exista): trace_id, input, actor,
 * conversation_mode, intent, route, evidence, sources, facts, freshness,
 * memory, models, tier, tools, commands, receipts, validation, latency_ms,
 * cost, result. Best-effort (nu arunca, nu blocheaza raspunsul).
 * @returns {object} trace-ul stampilat (si persistat daca persist!=false)
 */
export async function recordTrace(fields = {}, { persist = true, nowISO = null, store = null } = {}) {
  const f = isObj(fields) ? fields : {};
  const now = nowISO || new Date().toISOString();
  const trace = {
    trace_id: f.trace_id || `trace:${now.replace(/[^0-9]/g, "").slice(0, 17)}:${Math.abs(hash(String(f.input || "")))%1000}`,
    at: now,
    input: str(f.input, 500), actor: f.actor || "unknown",
    conversation_mode: f.conversation_mode || null, intent: f.intent || null, route: f.route || null,
    tier: f.tier ?? null, models: arr(f.models), provider: f.provider || null,
    evidence: arr(f.evidence).slice(0, 20), sources: arr(f.sources), facts: arr(f.facts).slice(0, 20),
    freshness: f.freshness || null, memory: arr(f.memory),
    tools: arr(f.tools), commands: arr(f.commands), receipts: arr(f.receipts),
    validation: f.validation || null, latency_ms: num(f.latency_ms), cost: f.cost ?? null,
    result: str(f.result, 500), egress: f.egress === true,
  };
  if (persist) {
    try {
      const S = store || { get: getState, set: setState };
      const prev = (await S.get(KEY, { traces: [] })) || { traces: [] };
      const traces = [...arr(prev.traces), trace].slice(-MAX);
      await S.set(KEY, { at: now, traces }).catch(() => {});
    } catch { /* trace-ul e telemetrie: nu blocheaza raspunsul */ }
  }
  return trace;
}

/** Citeste ultimele N trace-uri (read-only). */
export async function recentTraces(limit = 20, { store = null } = {}) {
  const S = store || { get: getState, set: setState };
  const st = (await S.get(KEY, { traces: [] }).catch(() => ({ traces: [] }))) || { traces: [] };
  return arr(st.traces).slice(-Math.max(1, Math.min(MAX, limit))).reverse();
}

/** Un trace anume dupa id. */
export async function getTrace(traceId, { store = null } = {}) {
  const S = store || { get: getState, set: setState };
  const st = (await S.get(KEY, { traces: [] }).catch(() => ({ traces: [] }))) || { traces: [] };
  return arr(st.traces).find((t) => t.trace_id === traceId) || null;
}

/** Rezumat text al unui trace (pentru admin/log). PUR. */
export function traceForLog(t) {
  if (!isObj(t)) return "";
  return `[${t.trace_id}] ${t.actor} · mode=${t.conversation_mode || "?"} · intent=${t.intent || "?"} · route=${t.route || "?"} · tier=${t.tier ?? "?"} · models=${arr(t.models).join("+") || "?"} · sources=${arr(t.sources).length} · latency=${t.latency_ms ?? "?"}ms · egress=${t.egress}`;
}

function str(v, max = 200) { return String(v == null ? "" : v).slice(0, max); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function arr(v) { return Array.isArray(v) ? v : []; }
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return h; }
