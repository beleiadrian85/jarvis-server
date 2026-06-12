import { config } from "./config.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const MCP_BETA = "mcp-client-2025-11-20";

/**
 * Apel Claude simplu (fara tools).
 */
export async function callClaude({ system, messages, maxTokens = 1024 }) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
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
  return extractText(data);
}

/**
 * Apel Claude cu MCP connector. Claude poate chema tool-urile
 * serverului MCP (ex: Operational) singur si intoarce textul final.
 *
 * mcpServers: [{ name, url, authorization_token? }]
 */
export async function callClaudeWithMCP({ system, messages, mcpServers, maxTokens = 1500 }) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.anthropicKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": MCP_BETA,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      system,
      messages,
      mcp_servers: mcpServers.map((s) => ({
        type: "url",
        url: s.url,
        name: s.name,
        ...(s.authorization_token ? { authorization_token: s.authorization_token } : {}),
      })),
      tools: mcpServers.map((s) => ({ type: "mcp_toolset", mcp_server_name: s.name })),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Claude MCP API ${res.status}: ${t}`);
  }
  const data = await res.json();
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
