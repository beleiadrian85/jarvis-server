// L3 — Project Intelligence: per proiect, agregă cost la zi (project_costs),
// producție (cost/mp), task-uri (active/blocate/întârziate) și — pentru C3 —
// valoarea contractată din vânzări. Strat read-only peste Operational.
import { mcpCall } from "../mcp.js";
import { parseTaskLines, isOverdue } from "../taskparse.js";
import { parseSales } from "./ceoHome.js";

const lei = (n) => Math.round(n).toLocaleString("ro-RO") + " lei";
const roNum = (s) => Number(String(s || "").replace(/\./g, "").replace(",", ".")) || 0;

/** Parsează project_costs: "• Proiect: TOTAL n lei (materiale: n · producție: n · taskuri: n)". */
export function parseProjectCosts(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    const m = line.match(/•\s*(.+?):\s*TOTAL\s*([\d.,]+)\s*lei\s*\(materiale:\s*([\d.,]+)\s*·\s*produc[țt]ie:\s*([\d.,]+)\s*·\s*taskuri:\s*([\d.,]+)\)/i);
    if (m) out.push({ project: m[1].trim(), total: roNum(m[2]), materiale: roNum(m[3]), productie: roNum(m[4]), taskuri: roNum(m[5]) });
  }
  return out;
}

/** Parsează production_summary: "... cost/mp: 265,43 lei". */
export function parseProductionCostPerMp(text) {
  const m = String(text).match(/cost\/mp:\s*([\d.,]+)/i);
  return m ? roNum(m[1]) : null;
}

const isC3 = (name) => /c3|[șs]urii mici|bell/i.test(name || "");

async function safe(fn, fb) { try { return await fn(); } catch { return fb; } }

export async function projectIntelReport() {
  const [costsTxt, tasksTxt, salesTxt, prodTxt] = await Promise.all([
    safe(() => mcpCall("project_costs", {}), ""),
    safe(() => mcpCall("list_tasks", {}), ""),
    safe(() => mcpCall("sales_summary", {}), ""),
    safe(() => mcpCall("production_summary", {}), ""),
  ]);

  const costs = parseProjectCosts(costsTxt);
  const tasks = parseTaskLines(tasksTxt);
  const sales = parseSales(salesTxt);
  const costMp = parseProductionCostPerMp(prodTxt);

  // Grupare task-uri pe proiect.
  const byProject = {};
  for (const t of tasks) {
    const key = t.project || "Altele";
    const g = (byProject[key] = byProject[key] || { active: 0, blocate: 0, intarziate: 0 });
    if (t.status === "blocat") g.blocate++;
    if (isOverdue(t.deadline) && !["acceptat", "respins"].includes(t.status)) g.intarziate++;
    if (["nou", "in_lucru", "blocat"].includes(t.status)) g.active++;
  }

  // Lista proiectelor: din costuri ∪ din task-uri.
  const names = new Set([...costs.map((c) => c.project), ...Object.keys(byProject)]);
  names.delete("Altele");
  const ordered = [...names, "Altele"].filter((n, i, a) => a.indexOf(n) === i);

  const L = ["🏗️ PROJECT INTELLIGENCE"];
  for (const name of ordered) {
    const c = costs.find((x) => x.project === name);
    const g = byProject[name] || { active: 0, blocate: 0, intarziate: 0 };
    if (!c && g.active === 0 && name === "Altele") continue;
    L.push("");
    L.push(`▸ ${name}`);
    if (c) L.push(`   Cost la zi: ${lei(c.total)} (producție ${lei(c.productie)} + materiale ${lei(c.materiale)})`);
    if (isC3(name)) {
      if (costMp) L.push(`   Cost producție: ${costMp.toLocaleString("ro-RO")} lei/mp`);
      if (sales.total) L.push(`   Vânzări: ${sales.vandut} vândute + ${sales.rezervat} rezervate din ${sales.total}`);
    }
    L.push(`   Task-uri: ${g.active} active · ${g.blocate} blocate · ${g.intarziate} întârziate`);
    const rec = g.blocate ? `deblochează ${g.blocate} task-uri` : g.intarziate ? `recuperează ${g.intarziate} întârzieri` : "pe grafic";
    L.push(`   → ${rec}`);
  }

  // Notă anti-halucinație: marja completă necesită bugetul total.
  L.push("");
  L.push("ℹ️ Costurile sunt la zi din Operational; marja finală necesită bugetul total per proiect (neintrodus).");

  const c3 = ordered.find(isC3);
  L.push("");
  L.push(`[VOCE] ${ordered.length - 1} proiecte urmărite. ${c3 ? c3 + " e cel activ" : ""}.`);
  return L.join("\n");
}
