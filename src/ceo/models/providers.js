// PROVIDER ADAPTERS (§10) — apel de chat catre fiecare model. FARA tool-uri, FARA
// function-calling: modelele produc DOAR text (rationament), nu executa nimic si nu
// ating memoria/Operational. Reutilizeaza adaptoarele existente (openai.js, claude.js).
import { config } from "../../config.js";
import { PROVIDERS, providerEnabled } from "./registry.js";

/** Apeleaza un provider. @returns { ok, text, usage } sau arunca daca neactivat. */
export async function callProvider(id, { system, messages, maxTokens = 800 } = {}) {
  if (!providerEnabled(id)) throw new Error(`provider ${id} inactiv (flag OFF sau lipsa credentiale)`);
  const inTokens = Math.ceil((String(system || "").length + JSON.stringify(messages || []).length) / 4);

  if (id === "openai") {
    const { getProviderKey } = await import("./keyStore.js");
    const apiKey = (await getProviderKey("openai").catch(() => null)) || config.openaiKey;
    const { callOpenAI } = await import("../../openai.js");
    const text = await callOpenAI({ system, messages, maxTokens, model: config.strategyModel, apiKey });
    return { ok: true, text, usage: { inTokens, outTokens: Math.ceil(text.length / 4) } };
  }
  if (id === "anthropic") {
    const claude = await import("../../claude.js").catch(() => null);
    const fn = claude?.callClaude || claude?.default;
    if (typeof fn !== "function") throw new Error("adaptor Anthropic indisponibil");
    const text = await fn({ system, messages, maxTokens });
    return { ok: true, text: String(text || "").trim(), usage: { inTokens, outTokens: Math.ceil(String(text || "").length / 4) } };
  }
  if (id === "google") {
    const { getProviderKey } = await import("./keyStore.js");
    const gKey = (await getProviderKey("google").catch(() => null)) || config.googleAiKey;
    if (!gKey) throw new Error("GOOGLE_AI_API_KEY lipsa");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.googleModel)}:generateContent?key=${gKey}`;
    const contents = [{ role: "user", parts: [{ text: `${system}\n\n${messages.map((m) => m.content).join("\n")}` }] }];
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: maxTokens } }) });
    if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "").trim();
    return { ok: true, text, usage: { inTokens, outTokens: Math.ceil(text.length / 4) } };
  }
  if (id === "private") {
    if (!config.privateModelUrl) throw new Error("PRIVATE_MODEL_URL lipsa");
    // Endpoint OpenAI-compatibil self-hosted (fail-closed daca nu raspunde).
    const res = await fetch(config.privateModelUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: config.privateModel, max_tokens: maxTokens, messages: [{ role: "system", content: system }, ...messages] }) });
    if (!res.ok) throw new Error(`Private ${res.status}`);
    const data = await res.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();
    return { ok: true, text, usage: { inTokens, outTokens: Math.ceil(text.length / 4) } };
  }
  throw new Error(`provider necunoscut: ${id}`);
}

export { PROVIDERS };
