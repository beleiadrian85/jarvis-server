// PROVIDER CONNECT (§13, §26) — wizard de conectare prin API OFICIAL. Verifica cheia
// printr-un test REAL (fara a afisa cheia): identitate/model + structured output. NU
// confunda abonamentul ChatGPT cu accesul API. NU cere parola contului. Cheia se
// stocheaza criptat (keyStore). "Nu declara conectat inainte de testul API real."
import { config } from "../../config.js";
import { getProviderKey, setProviderKey, hasProviderKey } from "./keyStore.js";

/** Salveaza cheia (criptat) apoi o verifica printr-un test API real. */
export async function connectProvider(provider, apiKey, { store } = {}) {
  if (!apiKey || String(apiKey).length < 12) return { ok: false, reason: "cheie invalida / prea scurta" };
  await setProviderKey(provider, apiKey, { store });
  const test = await testProvider(provider, { store });
  return { ok: test.ok, stored_encrypted: true, provider, test, note: test.ok ? "Cheie stocata criptat si verificata prin test API real." : "Cheie stocata dar testul API a esuat — verifica cheia." };
}

/** Test API real (read-only). Nu afiseaza cheia. */
export async function testProvider(provider, { store } = {}) {
  const key = (await getProviderKey(provider, { store }).catch(() => null)) || (provider === "openai" ? config.openaiKey : provider === "google" ? config.googleAiKey : provider === "anthropic" ? config.anthropicKey : null);
  if (!key) return { ok: false, reason: "nicio cheie stocata pentru acest provider" };

  try {
    if (provider === "openai") {
      // 1) identitate: listeaza modelele (200 = cheie valida).
      const r = await fetch("https://api.openai.com/v1/models", { headers: { authorization: "Bearer " + key } });
      if (!r.ok) return { ok: false, reason: `OpenAI ${r.status}: cheie respinsa`, structured_output: false };
      const models = (await r.json().catch(() => ({}))).data || [];
      // 2) structured output: un mic apel JSON.
      const c = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + key },
        body: JSON.stringify({ model: config.strategyModel, max_tokens: 20, response_format: { type: "json_object" }, messages: [{ role: "system", content: "Raspunde DOAR JSON." }, { role: "user", content: 'Returneaza {"ok":true}' }] }) });
      const structured = c.ok;
      let jsonValid = false; try { jsonValid = !!JSON.parse((await c.json()).choices?.[0]?.message?.content || "{}"); } catch { jsonValid = false; }
      return { ok: true, provider, models_count: models.length, default_model: config.strategyModel, structured_output: structured && jsonValid, note: "Verificat prin API oficial. Cheia nu a fost afisata." };
    }
    if (provider === "google") {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      return { ok: r.ok, provider, reason: r.ok ? null : `Google ${r.status}` };
    }
    if (provider === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
      return { ok: r.ok, provider, reason: r.ok ? null : `Anthropic ${r.status}` };
    }
    return { ok: false, reason: "provider fara test definit" };
  } catch (e) { return { ok: false, reason: String(e.message || e).slice(0, 160) }; }
}
