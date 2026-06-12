import { config, hasOperational } from "./config.js";

/**
 * Client JSON-RPC minimal pentru serverul MCP Operational (stateless).
 * Apel direct de tool — determinist, fara apel Claude (disciplina de tokeni).
 */

let rpcId = 0;

export async function mcpCall(toolName, args = {}) {
  if (!hasOperational) throw new Error("OPERATIONAL_MCP_URL nesetat.");
  const res = await fetch(config.operationalMcpUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++rpcId,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`MCP ${res.status}`);

  // Raspunsul poate veni ca JSON simplu sau ca SSE (event-stream).
  const text = await res.text();
  let payload = text;
  if (text.startsWith("event:") || text.includes("\ndata:") || text.startsWith("data:")) {
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    payload = dataLine ? dataLine.slice(5).trim() : "{}";
  }
  const json = JSON.parse(payload);
  if (json.error) throw new Error(json.error.message || "Eroare MCP");
  const content = json.result?.content || [];
  const out = content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  if (json.result?.isError) throw new Error(out || "Eroare tool MCP");
  return out;
}

/** Lista bruta de task-uri (text, o linie per task). */
export function listTasks(filters = {}) {
  return mcpCall("list_tasks", filters);
}

export function createTask(task) {
  return mcpCall("create_task", task);
}

export function updateTask(args) {
  return mcpCall("update_task", args);
}
