import { config } from "./config.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const MCP_BETA = "mcp-client-2025-11-20";

/**
 * Apel Claude simplu (fara tools).
 */
export async function callClaude({ system, messages, maxTokens = 1024, model }) {
  const t0 = Date.now();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || config.model,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Claude API ${res.status}: ${t}`);
  }
  const data = await res.json();
  console.log(`[timing] claude model=${(model || config.model).replace(/^claude-/, "")} ms=${Date.now() - t0}`);
  return extractText(data);
}

/**
 * Apel Claude cu tool-uri server-side (executate de Anthropic, text final
 * intors direct): connector(e) MCP si/sau cautare web nativa.
 *
 * mcpServers: [{ name, url, authorization_token? }]
 * webSearch: true → Claude poate cauta pe net singur (max 4 cautari).
 */
export async function callClaudeWithMCP({ system, messages, mcpServers = [], webSearch = false, maxTokens = 1500, model }) {
  const t0 = Date.now();
  const tools = [
    ...mcpServers.map((s) => ({ type: "mcp_toolset", mcp_server_name: s.name })),
    ...(webSearch ? [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }] : []),
  ];
  const headers = {
    "content-type": "application/json",
    "x-api-key": config.anthropicKey,
    "anthropic-version": "2023-06-01",
  };
  if (mcpServers.length) headers["anthropic-beta"] = MCP_BETA;

  const body = {
    model: model || config.model,
    max_tokens: maxTokens,
    system,
    messages,
    tools,
  };
  if (mcpServers.length) {
    body.mcp_servers = mcpServers.map((s) => ({
      type: "url",
      url: s.url,
      name: s.name,
      ...(s.authorization_token ? { authorization_token: s.authorization_token } : {}),
      // A1: allowlist de tool-uri (ex. read-only pe calea de chat). Fara ea,
      // serverul expune toate tool-urile (comportamentul anterior).
      ...(s.allowedTools ? { tool_configuration: { allowed_tools: s.allowedTools } } : {}),
    }));
  }

  const res = await fetch(API_URL, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Claude tools API ${res.status}: ${t}`);
  }
  const data = await res.json();
  console.log(`[timing] claude+tools mcp=${mcpServers.length > 0} web=${webSearch} ms=${Date.now() - t0}`);
  return extractText(data);
}

function extractText(data) {
  if (!data.content) return "";
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
