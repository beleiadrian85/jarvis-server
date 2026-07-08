// L3 — Risk Engine. Funcție PURĂ: din semnale (forecast, cash, task-uri,
// vânzări) produce riscuri prioritizate, fiecare cu descriere, impact,
// probabilitate și RECOMANDARE. Sursă unică pt CEO Home + comanda „riscuri".

const lei = (n) => Math.round(n).toLocaleString("ro-RO") + " lei";
const SEV = { "🔴": 0, "🟠": 1, "🟡": 2 };

/**
 * @param s.forecast   rezultatul buildForecast (sau null)
 * @param s.cash       { restante, scadente3 }
 * @param s.tasks      { blocate, azi, intarziate, ok }
 * @param s.sales      { rezervat, avansIncasat }
 * @param s.openingBalance  sold curent (opțional)
 */
export function assessRisks(s = {}) {
  const risks = [];
  const f = s.forecast;
  const cash = s.cash || {};
  const t = s.tasks || {};
  const sales = s.sales || {};

  if (f?.firstDeficit) {
    risks.push({
      level: "🔴", key: "deficit_lichiditate",
      descriere: `Sold negativ proiectat din ${f.firstDeficit.date} (${lei(f.firstDeficit.balanceAfter)})`,
      impact: "Blocaj de plăți, penalități, risc reputațional cu furnizorii",
      probabilitate: "Ridicată dacă nu intră încasări până atunci",
      recomandare: `Asigură lichiditate până la ${f.firstDeficit.date} (încasări avansuri, linie de credit) sau reeșalonează plata „${f.firstDeficit.trigger}”.`,
    });
  }

  if (cash.restante > 0) {
    risks.push({
      level: "🔴", key: "restante",
      descriere: `${cash.restante} plăți restante`,
      impact: "Penalități, dobânzi, deteriorarea relației cu furnizorii/ANAF",
      probabilitate: "Certă (deja restante)",
      recomandare: "Achită sau reeșalonează restanțele în această săptămână.",
    });
  }

  if (f) {
    const big = f.top90.find((o) => o.amountRON >= 100000);
    if (big) {
      risks.push({
        level: "🟠", key: "plata_mare",
        descriere: `Plată mare: ${big.title} ${lei(big.amountRON)} pe ${big.dueDate}`,
        impact: "Consum major de cash într-o singură zi",
        probabilitate: "Certă (obligație scadentă)",
        recomandare: `Pregătește din timp cash pentru ${big.dueDate}; corelează cu încasările din perioadă.`,
      });
    }
    // Lună cu vârf de plăți (>110% din media lunară).
    const months = Object.entries(f.monthly);
    if (months.length >= 2) {
      const avg = months.reduce((a, [, v]) => a + v, 0) / months.length;
      const peak = months.sort((a, b) => b[1] - a[1])[0];
      if (peak[1] > avg * 1.1) {
        risks.push({
          level: "🟡", key: "varf_lunar",
          descriere: `Vârf de plăți în ${peak[0]}: ${lei(peak[1])}`,
          impact: "Presiune de lichiditate concentrată într-o lună",
          probabilitate: "Ridicată",
          recomandare: `Planifică încasările astfel încât să acoperi ${peak[0]}.`,
        });
      }
    }
  }

  if (t.blocate > 0) {
    risks.push({
      level: "🟠", key: "task_blocate",
      descriere: `${t.blocate} task-uri blocate`,
      impact: "Întârzieri în execuție, efect în lanț pe termene",
      probabilitate: "Certă",
      recomandare: "Deblochează-le azi: identifică cauza și decide (resurse, decizie, escaladare).",
    });
  }
  if (t.intarziate > 0) {
    risks.push({
      level: "🟠", key: "task_intarziate",
      descriere: `${t.intarziate} task-uri întârziate`,
      impact: "Slippage pe proiecte, costuri suplimentare",
      probabilitate: "Certă",
      recomandare: "Cere termen nou realist sau redistribuie sarcinile.",
    });
  }

  if (sales.rezervat > 0 && sales.avansIncasat === 0) {
    risks.push({
      level: "🟠", key: "rezervari_fara_avans",
      descriere: `${sales.rezervat} rezervări fără avans încasat`,
      impact: "Rezervări fragile — se pot anula ușor, cash-flow nesigur din vânzări",
      probabilitate: "Medie",
      recomandare: "Solicită avansuri pentru confirmarea rezervărilor sau eliberează unitățile.",
    });
  }

  if (cash.scadente3 > 0 && !f?.firstDeficit) {
    risks.push({
      level: "🟡", key: "scadente_3zile",
      descriere: `${cash.scadente3} plăți scadente în 3 zile`,
      impact: "Necesar de cash imediat",
      probabilitate: "Certă",
      recomandare: "Confirmă că ai acoperire pentru plățile din 3 zile.",
    });
  }

  return risks.sort((a, b) => SEV[a.level] - SEV[b.level]);
}

/** Raport text pentru comanda „riscuri". */
export function formatRisks(risks) {
  if (!risks.length) return "🟢 Fără riscuri semnalate din datele curente.";
  const L = ["⚠️ RISCURI (prioritizate)"];
  for (const r of risks) {
    L.push("");
    L.push(`${r.level} ${r.descriere}`);
    L.push(`   Impact: ${r.impact}`);
    L.push(`   Probabilitate: ${r.probabilitate}`);
    L.push(`   → ${r.recomandare}`);
  }
  const top = risks[0];
  L.push("");
  L.push(`[VOCE] ${risks.length} riscuri. Cel mai important: ${top.descriere}. ${top.recomandare}`);
  return L.join("\n");
}
