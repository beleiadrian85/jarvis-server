// L3 — Knowledge Graph "lite" / Entity 360. NU o bază de grafuri, NU stocare
// nouă: căutare federată read-only peste tool-urile Operational care adună tot
// ce ține de o entitate (persoană, proiect, furnizor, client) într-o vedere.
// Spiritul Regulii #3 (totul conectat) fără infrastructură nouă.
import { mcpCall } from "../mcp.js";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function matchLines(text, key) {
  const k = norm(key);
  return String(text)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 3 && norm(l).includes(k));
}

async function safe(fn) { try { return await fn(); } catch { return ""; } }

/** Toate legăturile unei entități, federate din Operational. */
export async function entity360Report(name) {
  const key = (name || "").trim();
  if (key.length < 2) return "Spune-mi despre cine/ce anume (ex: „tot ce ține de Horotan”).";

  const [tasks, oblig, units, costs] = await Promise.all([
    safe(() => mcpCall("list_tasks", { status: "toate" })),
    safe(() => mcpCall("list_payment_obligations", {})),
    safe(() => mcpCall("list_sales_units", {})),
    safe(() => mcpCall("project_costs", {})),
  ]);

  const groups = [
    { icon: "📋", label: "Task-uri", hits: matchLines(tasks, key) },
    { icon: "💸", label: "Plăți/obligații", hits: matchLines(oblig, key) },
    { icon: "🏢", label: "Unități/vânzări", hits: matchLines(units, key) },
    { icon: "🏗️", label: "Costuri proiect", hits: matchLines(costs, key) },
  ];

  const total = groups.reduce((a, g) => a + g.hits.length, 0);
  if (!total) return `Nu am găsit nimic despre „${key}” în task-uri, plăți, vânzări sau costuri.`;

  const L = [`🔗 Tot ce ține de „${key}” (${total} legături)`];
  for (const g of groups) {
    if (!g.hits.length) continue;
    L.push("");
    L.push(`${g.icon} ${g.label} (${g.hits.length}):`);
    for (const l of g.hits.slice(0, 8)) L.push("  " + l.replace(/^•\s*/, ""));
    if (g.hits.length > 8) L.push(`  … și încă ${g.hits.length - 8}`);
  }
  L.push("");
  L.push(`[VOCE] ${total} legături despre ${key} în ${groups.filter((g) => g.hits.length).length} zone.`);
  return L.join("\n");
}
