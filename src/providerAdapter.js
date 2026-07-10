/**
 * Provider Adapters (INERT, PUR).
 *
 * buildProviderRequest(provider, payload) — TRADUCE payload-ul abstract (system,
 * messages/user, model, maxTokens) in forma de request specifica providerului.
 * NU trimite nimic: fara fetch, fara URL, fara chei. `executes: false` mereu.
 * Fiecare adaptor doar traduce apelul — nu preia alta responsabilitate.
 *
 * GARANTII: zero importuri, IO, fetch, node:*, config, DB. Pur si determinist.
 */

const PROVIDERS = new Set(["claude", "chatgpt", "deterministic", "none"]);

const str = (v) => (v == null ? "" : String(v));
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

export function buildProviderRequest(provider, payload) {
  const p = PROVIDERS.has(provider) ? provider : "none";
  const pl = isObj(payload) ? payload : {};
  const system = str(pl.system);
  const messages = Array.isArray(pl.messages)
    ? pl.messages
    : pl.user != null ? [{ role: "user", content: str(pl.user) }] : [];
  const model = str(pl.model) || null;
  const maxTokens = num(pl.maxTokens) || 900;

  if (p === "claude") {
    // Format Anthropic Messages (system separat).
    return { provider: p, format: "anthropic", executes: false, body: { model, max_tokens: maxTokens, system, messages } };
  }
  if (p === "chatgpt") {
    // Format OpenAI Chat Completions (system in messages).
    return { provider: p, format: "openai", executes: false, body: { model, max_tokens: maxTokens, messages: [{ role: "system", content: system }, ...messages] } };
  }
  // deterministic / none → niciun request catre model.
  return { provider: p, format: "none", executes: false, body: null };
}

/** Lista providerilor suportati (pentru validare/metrics). */
export function supportedProviders() {
  return [...PROVIDERS];
}
