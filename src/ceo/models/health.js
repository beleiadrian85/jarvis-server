// HEALTH MULTI-MODEL (§23) — starea providerilor + subsistemelor de memorie. Un test
// mic, controlat, per provider activ. Daca principalul cade, fallback DOAR daca politica
// de date permite; altfel se informeaza onest (nu se trimit date la un provider neaprobat).
import { config } from "../../config.js";
import { PROVIDERS, enabledProviders, providerEnabled } from "./registry.js";

/** Test ping read-only per provider (fara date sensibile). */
export async function providerHealth(id, { probe = true } = {}) {
  if (!providerEnabled(id)) return { id, enabled: false, ok: false, reason: "inactiv (flag/credentiale)" };
  if (!probe) return { id, enabled: true, ok: null, reason: "neprobat" };
  try {
    const { callProvider } = await import("./providers.js");
    const t0 = Date.now?.() || 0;
    const r = await callProvider(id, { system: "Raspunde exact cu: OK", messages: [{ role: "user", content: "ping" }], maxTokens: 5 });
    return { id, enabled: true, ok: !!r.text, latency: (Date.now?.() || 0) - t0, sample: String(r.text || "").slice(0, 20) };
  } catch (e) { return { id, enabled: true, ok: false, reason: String(e.message || e).slice(0, 120) }; }
}

/** Health general (fara a proba implicit, ca sa nu coste). */
export async function modelsHealth({ probe = false } = {}) {
  const active = enabledProviders();
  const providers = [];
  for (const id of Object.keys(PROVIDERS)) {
    if (probe && active.includes(id)) providers.push(await providerHealth(id, { probe: true }));
    else providers.push({ id, enabled: providerEnabled(id), ok: providerEnabled(id) ? null : false });
  }
  // Subsisteme de memorie (structural, ieftin).
  const subsystems = {
    memory_db: "ok", vector_retrieval: (config.memory?.vectorProvider || "local"), context_assembler: "ok",
    write_gate: "ok", redaction: "ok", audit: "ok", cost_service: config.multiModel?.costGuard ? "ok" : "off",
    data_routing: config.multiModel?.dataRouting ? "ok" : "off",
  };
  return { enabled: config.multiModel?.enabled === true, providers_active: active, providers, subsystems, degraded: config.multiModel?.enabled && !active.length };
}

/** Mesaj onest cand principalul cade si fallback nu e permis pentru clasa de date. */
export function fallbackBlockedMessage(sensitivity) {
  return `Modelul principal este indisponibil. Nu am folosit fallback deoarece datele sunt clasificate ${sensitivity} si fallback-ul nu este autorizat pentru aceasta clasa.`;
}
