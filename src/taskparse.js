/**
 * Parsare determinista a liniilor de la list_tasks (MCP Operational).
 * Format per linie:
 *   • [id:XXXX] [prioritate] Titlu — Proiect — status: ... — termen: YYYY-MM-DD
 *     — responsabil: Nume — creat de: Nume — ultim update: ... — desc
 */

export function todayStr() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
}

export function isOverdue(deadline) {
  return !!deadline && deadline < todayStr();
}

export function parseTaskLines(raw) {
  const lines = (raw || "").split("\n").filter((l) => l.trim().startsWith("•"));
  return lines
    .map((l) => ({
      id: l.match(/\[id:([^\]]+)\]/)?.[1] || null,
      priority: l.match(/\]\s*\[(\w+)\]/)?.[1] || "",
      status: l.match(/status:\s*(\w+)/)?.[1] || "",
      deadline: l.match(/termen:\s*([\d-]+)/)?.[1] || "",
      assignee: l.match(/responsabil:\s*([^—]+?)\s*—/)?.[1]?.trim() || "",
      title: l.match(/\]\s*\[\w+\]\s*(.+?)\s*—/)?.[1]?.trim() || l.trim(),
      raw: l.trim(),
    }))
    .filter((t) => t.id);
}

/** Grupare 🔴🟡🟠🟢 din task-uri parsate (text gata de trimis). */
export function groupReport(tasks) {
  const blocate = [], azi = [], intarziate = [];
  let ok = 0;
  const today = todayStr();
  for (const t of tasks) {
    if (t.status === "blocat") blocate.push(t);
    else if (t.deadline && t.deadline < today) intarziate.push(t);
    else if (t.deadline === today) azi.push(t);
    else ok++;
  }
  const line = (t) => `  • ${t.title} (${t.assignee || "?"}, termen ${t.deadline || "-"})`;
  const sec = [];
  if (blocate.length) sec.push("🔴 BLOCATE:\n" + blocate.map(line).join("\n"));
  if (intarziate.length) sec.push("🟠 ÎNTÂRZIATE:\n" + intarziate.map(line).join("\n"));
  if (azi.length) sec.push("🟡 SCADENTE AZI:\n" + azi.map(line).join("\n"));
  sec.push(`🟢 Restul: ${ok} în lucru, fără probleme.`);
  return sec.join("\n");
}
