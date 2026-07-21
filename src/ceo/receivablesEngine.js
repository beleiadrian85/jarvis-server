// CEO AI — RECEIVABLES ENGINE (A3). PUR peste sursele conectate:
// income_invoices (facturi emise) + estimated_cash_inflows (estimari Dana) +
// rezervarile Bell (avans datorat/incasat). O factura emisa NU e cash incasat.
// Starile: CONFIRMED / PROBABLE / CONTRACTED_NOT_DUE / OVERDUE / COLLECTED / UNKNOWN.

export const RECEIVABLE_STATES = ["CONFIRMED", "PROBABLE", "CONTRACTED_NOT_DUE", "OVERDUE", "COLLECTED", "UNKNOWN"];

/**
 * Registrul de incasari. PUR.
 * @param p.asOf            data de referinta
 * @param p.incomeInvoices  facturile emise (opsdata.getIncomeInvoices) | null = sursa picata
 * @param p.estimatedInflows estimarile din Operational | null = sursa picata
 * @param p.sales           sales_summary (rezervari Bell) | null
 */
export function buildReceivablesRegister({ asOf, incomeInvoices = null, estimatedInflows = null, sales = null } = {}) {
  const items = [];
  const gaps = [];
  if (incomeInvoices == null) gaps.push("income_invoices (sursa picata)");
  if (estimatedInflows == null) gaps.push("estimated_cash_inflows (sursa picata)");

  for (const inv of incomeInvoices || []) {
    const remaining = inv.remainingRON ?? inv.amountRON;
    let state;
    if (remaining <= 0 || inv.status === "platita") state = "COLLECTED";
    else if (inv.dueDate && inv.dueDate < asOf) state = "OVERDUE";
    else if (inv.dueDate) state = "CONFIRMED";
    else state = "UNKNOWN";
    items.push({ kind: "factura_emisa", ref: inv.ref, who: inv.client, amountRON: inv.amountRON, remainingRON: remaining, dueDate: inv.dueDate, state, probability: state === "CONFIRMED" ? 0.9 : state === "OVERDUE" ? 0.6 : 1 });
  }
  for (const e of estimatedInflows || []) {
    items.push({ kind: "estimare", ref: e.label, who: e.by || "Operational", amountRON: e.amountRON, remainingRON: e.amountRON, dueDate: e.dueDate, state: "PROBABLE", probability: 0.6 });
  }
  // Bell: rezervari = venit CONTRACTAT dar nescadent; valoarea avansului datorat
  // nu e in sursa → UNKNOWN pe suma (nu se inventeaza), doar numarul e cert.
  if (sales && (sales.rezervat ?? 0) > 0) {
    items.push({
      kind: "avans_rezervari", ref: `${sales.rezervat} rezervari Bell`, who: "clienti Bell",
      amountRON: null, remainingRON: null, dueDate: null,
      state: "CONTRACTED_NOT_DUE", probability: null,
      note: `avans incasat pana acum: ${sales.avansIncasat ?? 0}; valoarea datorata nu e inregistrata → UNKNOWN`,
    });
  }

  const sum = (st) => items.filter((i) => i.state === st && typeof i.remainingRON === "number").reduce((a, i) => a + i.remainingRON, 0);
  const confirmed = Math.round(sum("CONFIRMED"));
  const overdue = Math.round(sum("OVERDUE"));
  const probable = Math.round(sum("PROBABLE"));
  const contractedUnknown = items.some((i) => i.state === "CONTRACTED_NOT_DUE" && i.amountRON == null);

  return {
    asOf, items, data_gaps: gaps,
    totals: { confirmedRON: confirmed, overdueRON: overdue, probableRON: probable, collected_count: items.filter((i) => i.state === "COLLECTED").length },
    // Fraza canonica: venit contractat vs cash confirmat — separare stricta.
    statement: contractedUnknown
      ? `Venit contractat: exista (rezervari Bell) dar valoarea NU e inregistrata (UNKNOWN). Cash confirmat de incasat: ${confirmed.toLocaleString("ro-RO")} lei (+${overdue.toLocaleString("ro-RO")} lei restant de incasat).`
      : `Cash confirmat de incasat: ${confirmed.toLocaleString("ro-RO")} lei; probabil: ${probable.toLocaleString("ro-RO")} lei; restant: ${overdue.toLocaleString("ro-RO")} lei.`,
  };
}

/** Incasarile CONFIRMATE ca intrari pt Cash Intelligence. PUR. */
export function confirmedForCash(register) {
  return (register?.items || [])
    .filter((i) => ["CONFIRMED", "OVERDUE"].includes(i.state) && typeof i.remainingRON === "number" && i.dueDate)
    .map((i) => ({ dueDate: i.dueDate, amountRON: i.remainingRON }));
}
