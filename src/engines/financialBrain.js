// L3 — Financial Brain: orchestrează connectorul + Cash Forecast și produce
// raportul (determinist, fără apel Claude pentru cifre). Adaugă [VOCE].
import { getObligations, getCashReport, EUR_RON } from "../connectors/financial.js";
import { buildForecast } from "./cashForecast.js";

const lei = (n) => Math.round(n).toLocaleString("ro-RO") + " lei";
const HORIZON_LABEL = { 7: "7 zile", 30: "30 zile", 60: "60 zile", 90: "90 zile", 180: "6 luni", 365: "12 luni" };

export function formatForecast(f, extra = {}) {
  const L = [];
  L.push("💰 CASH FORECAST — necesar de plăți");
  L.push("");
  L.push("Pe orizonturi:");
  for (const h of [7, 30, 60, 90, 180, 365]) {
    if (f.horizonTotals[h] != null) L.push(`  ${HORIZON_LABEL[h].padEnd(7)} ${lei(f.horizonTotals[h])}`);
  }

  const months = Object.keys(f.monthly).sort().slice(0, 6);
  if (months.length) {
    L.push("");
    L.push("Pe luni:");
    for (const m of months) L.push(`  ${m}: ${lei(f.monthly[m])}`);
  }

  if (f.top90.length) {
    L.push("");
    L.push("Cele mai mari plăți (90 zile):");
    for (const o of f.top90) L.push(`  ${o.dueDate} · ${o.title} · ${lei(o.amountRON)}`);
  }

  const cats = Object.entries(f.cat90).sort((a, b) => b[1] - a[1]);
  if (cats.length) {
    L.push("");
    L.push("Pe categorii (90 zile):");
    L.push("  " + cats.map(([k, v]) => `${k}: ${lei(v)}`).join(" · "));
  }

  if (f.firstDeficit) {
    L.push("");
    L.push(`🔴 Risc lichiditate: sold negativ din ${f.firstDeficit.date} (${lei(f.firstDeficit.balanceAfter)}) la plata „${f.firstDeficit.trigger}”.`);
  } else if (extra.openingBalanceKnown) {
    L.push("");
    L.push("🟢 Fără deficit proiectat în orizontul analizat.");
  } else {
    L.push("");
    L.push("ℹ️ Sold curent neconectat — proiecția arată necesarul de plăți, nu soldul rămas. Spune-mi soldul din bancă și calculez ziua exactă a deficitului.");
  }

  if (f.fx && f.fx.eurCount) {
    L.push("");
    L.push(`ℹ️ Include ${f.fx.eurCount} plăți în EUR (${f.fx.eurEUR.toLocaleString("ro-RO")} €) convertite la ${EUR_RON} lei/€.`);
  }

  // Rezumat vocal (esențialul + atenționare).
  const need30 = lei(f.horizonTotals[30] || 0);
  const big = f.top90[0] ? `; cea mai mare: ${f.top90[0].title} ${lei(f.top90[0].amountRON)}` : "";
  const voice = f.firstDeficit
    ? `Atenție la cash: necesar ${need30} în 30 de zile și risc de sold negativ din ${f.firstDeficit.date}.`
    : `Necesar de plăți ${need30} în următoarele 30 de zile${big}.`;
  L.push("");
  L.push("[VOCE] " + voice);

  return L.join("\n");
}

/** Raportul complet, apelat din brain.js. openingBalance opțional. */
export async function cashForecastReport({ openingBalance = null } = {}) {
  const obligations = await getObligations();
  if (!obligations.length) return "Nu am găsit obligații de plată în Operational.";
  const f = buildForecast(obligations, { openingBalance });
  return formatForecast(f, { openingBalanceKnown: openingBalance != null });
}
