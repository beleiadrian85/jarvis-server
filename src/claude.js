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
      // NOTA: allowlist de tool-uri (read-only) NU se trimite prin tool_configuration —
      // beta mcp-client-2025-11-20 il respinge (400). Read-only ramane impus prin prompt
      // (A1). Reimplementare corecta a allowlist-ului via mcp_toolset = TODO separat.
    }));
  }

  const res = await fetch(API_URL, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Claude tools API ${res.status}: ${t}`);
  }
  const data = await res.json();
  console.log(`[timing] claude+tools mcp=${mcpServers.length > 0} web=${webSearch} ms=${Date.now() - t0}`);
  const text = extractText(data);
  // Cand s-a cautat pe web, propune linkurile gasite (nu le pierde).
  return webSearch ? withProposedLinks(data, text) : text;
}

function extractText(data) {
  if (!data.content) return "";
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// Extrage LINKURILE/sursele gasite de web_search (altfel se pierd — extractText tine
// doar text). Preferam citarile (cele folosite efectiv), apoi rezultatele brute.
export function extractWebSources(data) {
  const seen = new Set(); const out = [];
  const add = (url, title) => { if (!url || seen.has(url)) return; seen.add(url); out.push({ url, title: (title || url).slice(0, 120) }); };
  for (const b of data.content || []) {
    if (b.type === "text" && Array.isArray(b.citations)) for (const c of b.citations) if (c?.url) add(c.url, c.title);
  }
  for (const b of data.content || []) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r?.type === "web_search_result" && r.url) add(r.url, r.title);
  }
  return out.slice(0, 6);
}

/** Text + sectiune de linkuri propuse (cand s-a cautat pe web). */
export function withProposedLinks(data, text) {
  const sources = extractWebSources(data).filter((s) => !text.includes(s.url));
  if (!sources.length) return text;
  return `${text}\n\n🔗 Linkuri:\n${sources.map((s) => `• ${s.title} — ${s.url}`).join("\n")}`;
}
