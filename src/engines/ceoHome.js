// L3 — CEO Home: agregator pur (fără stocare) al stării firmei într-un singur
// ecran. Reutilizează connectorul financiar, taskparse și sales_summary.
// Scop: starea firmei în <10 secunde.
import { mcpCall } from "../mcp.js";
import { getObligations, getCashReport } from "../connectors/financial.js";
import { buildForecast } from "./cashForecast.js";
import { computeHealth } from "./healthScore.js";
import { parseTaskLines } from "../taskparse.js";

const lei = (n) => Math.round(n).toLocaleString("ro-RO") + " lei";

export function parseSales(text) {
  const s = String(text);
  const num = (re) => Number((s.match(re) || [])[1] || 0);
  return {
    total: num(/total\s+(\d+)/i),
    disponibil: num(/Disponibile:\s*(\d+)/i),
    rezervat: num(/Rezervate:\s*(\d+)/i),
    vandut: num(/V[âa]ndute:\s*(\d+)/i),
    avansIncasat: num(/Avans încasat total:\s*([\d.,]+)/i),
  };
}

async function safe(fn, fallback) {
  try { return await fn(); } catch { return fallback; }
}

/** Semnale + Health + raport CEO. openingBalance opțional (sold bancă). */
export async function ceoHomeReport({ openingBalance = null } = {}) {
  const [obligations, cash, salesTxt, tasksTxt] = await Promise.all([
    safe(getObligations, []),
    safe(() => getCashReport(30), { restante: 0, scadente3: 0, total: 0 }),
    safe(() => mcpCall("sales_summary", {}), ""),
    safe(() => mcpCall("list_tasks", {}), ""),
  ]);

  const forecast = obligations.length ? buildForecast(obligations, { openingBalance }) : null;
  const sales = parseSales(salesTxt);
  const tasks = parseTaskLines(tasksTxt);

  // Contorizare task-uri (aceeași logică ca taskparse.groupReport).
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
  const tc = { blocate: 0, azi: 0, intarziate: 0, ok: 0 };
  for (const t of tasks) {
    if (t.status === "blocat") tc.blocate++;
    else if (t.deadline && t.deadline < today) tc.intarziate++;
    else if (t.deadline === today) tc.azi++;
    else tc.ok++;
  }

  const health = computeHealth({
    restante: cash.restante || 0,
    vanzari: sales,
    tasks: tc,
    soldCunoscut: openingBalance != null,
    deficit: !!forecast?.firstDeficit,
  });

  // Riscuri top (Faza B — inline; Faza C aduce Risk Engine complet).
  const risks = [];
  if (forecast?.firstDeficit) risks.push(`🔴 Deficit de cash din ${forecast.firstDeficit.date}`);
  if (tc.blocate) risks.push(`🔴 ${tc.blocate} task-uri blocate`);
  if (cash.restante) risks.push(`🔴 ${cash.restante} plăți restante`);
  if (tc.intarziate) risks.push(`🟠 ${tc.intarziate} task-uri întârziate`);
  if (forecast) {
    const big = forecast.top90[0];
    if (big) risks.push(`🟠 Plată mare: ${big.title} ${lei(big.amountRON)} pe ${big.dueDate}`);
  }

  // Acțiunea cu impact maxim azi.
  let action = "Nimic critic — menține execuția.";
  if (forecast?.firstDeficit) action = `Acoperă cash-ul: sold negativ din ${forecast.firstDeficit.date}.`;
  else if (tc.blocate) action = `Deblochează cele ${tc.blocate} task-uri oprite.`;
  else if (sales.rezervat && sales.avansIncasat === 0) action = `Urmărește avansurile: ${sales.rezervat} rezervări fără avans încasat.`;
  else if (forecast?.top90[0]) action = `Pregătește plata ${forecast.top90[0].title} (${lei(forecast.top90[0].amountRON)}).`;

  // Raport.
  const L = [];
  L.push(`🏠 CEO HOME — ${new Date().toLocaleDateString("ro-RO")}`);
  L.push(`Health Score: ${health.score}/100 ${health.grade}`);
  L.push("  " + health.components.map((c) => `${c.label} ${c.points}/${c.max}`).join(" · "));
  L.push("");
  if (forecast) {
    L.push(`💰 Cash: necesar 30z ${lei(forecast.horizonTotals[30])} · 90z ${lei(forecast.horizonTotals[90])}`);
    if (openingBalance != null) L.push(`   Sold curent: ${lei(openingBalance)}${forecast.firstDeficit ? ` → minus din ${forecast.firstDeficit.date}` : " → fără deficit proiectat"}`);
  }
  L.push(`🏢 Vânzări: ${sales.vandut} vândute · ${sales.rezervat} rezervate · ${sales.disponibil} disponibile (din ${sales.total})`);
  L.push(`📋 Task-uri: ${tc.ok} ok · ${tc.azi} azi · ${tc.intarziate} întârziate · ${tc.blocate} blocate`);
  if (risks.length) {
    L.push("");
    L.push("⚠️ Riscuri:");
    for (const rk of risks.slice(0, 4)) L.push("  " + rk);
  }
  L.push("");
  L.push(`🎯 Azi: ${action}`);

  const voice = `Health score ${health.score} din 100, ${health.grade.replace(/[^\wăâîșț ]/gi, "").trim()}. ${action}`;
  L.push("");
  L.push("[VOCE] " + voice);

  return L.join("\n");
}
