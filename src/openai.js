import { config } from "./config.js";

/**
 * C7 — Client OpenAI (ChatGPT), oglinda lui claude.js. DOAR chat.
 *
 * FARA tool-uri, FARA function-calling, FARA MCP → ChatGPT nu poate executa
 * nimic, doar produce text (strategie/analiza). Modulul e INERT: nimeni nu-l
 * cheama pana nu se activeaza STRATEGY_ROUTING. Fara cheie → arunca (nu apeleaza).
 */

const API_URL = "https://api.openai.com/v1/chat/completions";

export async function callOpenAI({ system, messages, maxTokens = 900, model, apiKey }) {
  const key = apiKey || config.openaiKey;
  if (!key) throw new Error("OPENAI_API_KEY nesetat.");
  const t0 = Date.now();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + key,
    },
    body: JSON.stringify({
      model: model || config.strategyModel,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, ...messages],
      // INTENTIONAT fara `tools` / `functions` — ChatGPT nu executa nimic.
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  console.log(`[timing] openai model=${model || config.strategyModel} ms=${Date.now() - t0}`);
  return (data.choices?.[0]?.message?.content || "").trim();
}
