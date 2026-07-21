// CEO AI — FINANCING REGISTER (A6). PUR. Registrul finantarilor derivat din
// obligatiile Credit/Leasing (serii lunare) + campuri necunoscute declarate
// (sold total, dobanda, garantii — Data Gap, nu inventate).

export function buildFinancingRegister({ asOf, obligations = [] } = {}) {
  const fin = obligations.filter((o) => /credit|leasing/i.test(o.category || "") && !/d112|salari/i.test(o.title || ""));
  const byCreditor = new Map();
  for (const o of fin) {
    const key = (o.title || "necunoscut").trim();
    if (!byCreditor.has(key)) byCreditor.set(key, []);
    byCreditor.get(key).push(o);
  }
  const entries = [...byCreditor.entries()].map(([title, rows]) => {
    const sorted = [...rows].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
    const next = sorted.find((r) => r.dueDate >= asOf) || sorted[sorted.length - 1];
    return {
      creditor: title,
      type: /leasing|leaseback/i.test(title + (next?.category || "")) ? "leasing" : "credit",
      installmentRON: next?.amountRON ?? null,
      next_due: next?.dueDate ?? null,
      known_installments: rows.length,
      committed_90d: Math.round(rows.filter((r) => r.dueDate >= asOf && (new Date(r.dueDate) - new Date(asOf)) / 86_400_000 <= 90).reduce((a, r) => a + (r.amountRON || 0), 0)),
      // Campuri fara sursa → UNKNOWN explicit (Data Gap, nu estimare).
      outstanding_balance: "UNKNOWN", interest_rate: "UNKNOWN", collateral: "UNKNOWN", covenants: "UNKNOWN",
      status: "activ (dedus din scadentar)",
    };
  }).sort((a, b) => (b.installmentRON || 0) - (a.installmentRON || 0));

  return {
    asOf, entries,
    total_monthly_service: Math.round(entries.reduce((a, e) => a + (e.installmentRON || 0), 0)),
    data_gaps: entries.length
      ? ["sold ramas per finantare", "dobanda/DAE", "garantii si covenants", "maturitate finala"]
      : ["niciun credit/leasing identificat in obligatii"],
    information_request_hint: "Dana: completeaza pentru fiecare finantare soldul ramas, dobanda si maturitatea (o data, apoi la refinantari).",
  };
}
