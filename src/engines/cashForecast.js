// L3 — Motor Cash Forecast. Funcție PURĂ (fără rețea): din obligații datate
// construiește proiecția pe orizonturi, defalcarea lunară/pe categorii, top
// plăți și — dacă se dă soldul curent — prima zi de deficit.
// Valoarea adăugată față de cash_report (care agregă): timeline + deficit day.

const DAY = 86400000;
const round = (n) => Math.round(n);
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

/**
 * @param obligations  [{ dueDate:'YYYY-MM-DD', amountRON:Number, title, category }]
 * @param opts.asOf            data de referință (implicit azi)
 * @param opts.horizons        [7,30,60,90,180,365]
 * @param opts.openingBalance  sold curent (opțional) → activează detectarea deficitului
 */
export function buildForecast(obligations, opts = {}) {
  const horizons = opts.horizons || [7, 30, 60, 90, 180, 365];
  const base = opts.asOf ? new Date(opts.asOf) : new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());

  const future = obligations
    .map((o) => ({ ...o, days: Math.round((new Date(o.dueDate) - start) / DAY) }))
    .filter((o) => o.days >= 0)
    .sort((a, b) => a.days - b.days);

  const horizonTotals = {};
  for (const h of horizons) horizonTotals[h] = round(sum(future.filter((o) => o.days <= h).map((o) => o.amountRON)));

  const monthly = {};
  for (const o of future) {
    const key = o.dueDate.slice(0, 7);
    monthly[key] = round((monthly[key] || 0) + o.amountRON);
  }

  const within90 = future.filter((o) => o.days <= 90);
  const cat90 = {};
  for (const o of within90) cat90[o.category] = round((cat90[o.category] || 0) + o.amountRON);

  const top90 = [...within90].sort((a, b) => b.amountRON - a.amountRON).slice(0, 6);

  const eur = future.filter((o) => o.currency === "EUR");
  const fx = { eurCount: eur.length, eurEUR: round(sum(eur.map((o) => o.amount))), eurRON: round(sum(eur.map((o) => o.amountRON))) };

  let firstDeficit = null;
  if (opts.openingBalance != null) {
    let bal = opts.openingBalance;
    for (const o of future) {
      bal -= o.amountRON;
      if (bal < 0) {
        firstDeficit = { date: o.dueDate, balanceAfter: round(bal), trigger: o.title, days: o.days };
        break;
      }
    }
  }

  return {
    asOf: start.toISOString().slice(0, 10),
    count: future.length,
    totalFuture: round(sum(future.map((o) => o.amountRON))),
    horizonTotals,
    monthly,
    cat90,
    top90,
    fx,
    firstDeficit,
  };
}
