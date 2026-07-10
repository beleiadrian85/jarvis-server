/**
 * Provider Metrics (in-memory). Inregistreaza apeluri catre provideri
 * (count / latenta / erori / tokeni). Zero IO/DB/fetch/egress — doar stare locala.
 * Factory pur; instanta cu stare.
 */
const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

export function createMetrics() {
  const m = new Map(); // provider → { calls, errors, totalMs, totalTokens }

  function record({ provider, ms = 0, ok = true, tokens = 0 } = {}) {
    const p = String(provider || "unknown");
    const e = m.get(p) || { calls: 0, errors: 0, totalMs: 0, totalTokens: 0 };
    e.calls++;
    if (!ok) e.errors++;
    e.totalMs += num(ms);
    e.totalTokens += num(tokens);
    m.set(p, e);
  }

  function snapshot() {
    const out = {};
    for (const [p, e] of m) {
      out[p] = {
        calls: e.calls,
        errors: e.errors,
        avgMs: e.calls ? Math.round(e.totalMs / e.calls) : 0,
        totalTokens: e.totalTokens,
        errorRate: e.calls ? Math.round((e.errors / e.calls) * 100) / 100 : 0,
      };
    }
    return out;
  }

  function reset() { m.clear(); }
  return { record, snapshot, reset };
}
