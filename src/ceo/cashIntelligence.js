// CEO AI — CASH INTELLIGENCE (P0). PUR. Modelul unificat de lichiditate:
//   BANK + CONFIRMED RECV + PROBABLE RECV − PAYABLES − DEBT − PAYROLL/TAX −
//   PROJECT COMMITMENTS = PROJECTED LIQUIDITY.
// Separare STRICTA a conceptelor; componentele fara sursa = UNKNOWN + Data Gap.
// NICIODATA nu se inventeaza o cifra pentru o componenta lipsa.

export const HORIZONS = [0, 7, 14, 21, 30, 60, 90];
export const CONCEPTS = {
  CASH: "bani in banca ACUM (sold)",
  PROFIT: "venituri minus cheltuieli contabile (NU e cash)",
  REVENUE: "venit facturat/recunoscut (NU e cash)",
  CONTRACTED_REVENUE: "valoare contractata viitoare (NU e cash)",
  EXPECTED_CASH: "incasari estimate cu probabilitate (NU e cash disponibil)",
  AVAILABLE_CASH: "sold + incasari CERTE scadente − iesiri certe (singura baza de decizie)",
};

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86_400_000);
const isDebt = (o) => /credit|leasing/i.test(o.category || "");
const isPayrollTax = (o) => /salarii|tva|fiscal/i.test(o.category || "") || /d112|salari/i.test(o.title || "");

/**
 * Modelul de lichiditate. PUR.
 * @param p.asOf              data de referinta (YYYY-MM-DD)
 * @param p.bankBalance       sold bancar REAL sau null (NU AM DATE ≠ 0)
 * @param p.confirmedReceivables  [{dueDate, amountRON}] sau null (neconectat)
 * @param p.probableReceivables   [{dueDate, amountRON, probability}] sau null
 * @param p.obligations       obligatiile din Operational (payables+debt+payroll)
 * @param p.projectCommitments [{dueDate, amountRON}] sau null (neconectat)
 */
export function buildLiquidityModel({
  asOf, bankBalance = null, confirmedReceivables = null,
  probableReceivables = null, obligations = [], projectCommitments = null,
} = {}) {
  const gaps = [];
  if (bankBalance == null) gaps.push("BANK_BALANCE");
  if (confirmedReceivables == null) gaps.push("CONFIRMED_RECEIVABLES");
  if (probableReceivables == null) gaps.push("PROBABLE_RECEIVABLES");
  if (projectCommitments == null) gaps.push("PROJECT_COMMITMENTS");

  const horizons = {};
  for (const h of HORIZONS) {
    const inWin = (arr) => (arr || []).filter((x) => {
      const d = daysBetween(asOf, x.dueDate);
      return d >= 0 && d <= h;
    }).reduce((a, x) => a + (x.amountRON || 0) * (x.probability ?? 1), 0);

    const due = obligations.filter((o) => {
      const d = o.dueDate ? daysBetween(asOf, o.dueDate) : null;
      return d != null && d <= h; // include restantele (d<0) in orice orizont
    });
    // Clasificare EXCLUSIVA (o obligatie intra intr-o singura galeata):
    // salarii/taxe au prioritate (D112 e contributie salariala chiar daca e la Credit).
    const payrollTax = due.filter(isPayrollTax).reduce((a, o) => a + (o.amountRON || 0), 0);
    const debtService = due.filter((o) => isDebt(o) && !isPayrollTax(o)).reduce((a, o) => a + (o.amountRON || 0), 0);
    const payables = due.filter((o) => !isDebt(o) && !isPayrollTax(o)).reduce((a, o) => a + (o.amountRON || 0), 0);
    const commitments = projectCommitments == null ? null : inWin(projectCommitments);

    const outflowsKnown = payables + debtService + payrollTax + (commitments ?? 0);
    const confirmedIn = confirmedReceivables == null ? null : inWin(confirmedReceivables);
    const probableIn = probableReceivables == null ? null : inWin(probableReceivables);

    // PROJECTED LIQUIDITY: DOAR daca soldul e cunoscut. Altfel UNKNOWN explicit.
    const projected = bankBalance != null
      ? bankBalance + (confirmedIn ?? 0) - outflowsKnown
      : null;

    horizons[h] = {
      days: h,
      outflows: { payables, debt_service: debtService, payroll_tax: payrollTax,
        project_commitments: commitments ?? "UNKNOWN", total_known: outflowsKnown },
      inflows: { confirmed: confirmedIn ?? "UNKNOWN", probable: probableIn ?? "UNKNOWN" },
      projected_liquidity: projected ?? "UNKNOWN",
      available_cash: projected ?? "UNKNOWN", // = sold + certe − iesiri (fara probabile)
      note: bankBalance == null ? "sold bancar necunoscut — doar necesarul brut de iesiri e cert" : "",
    };
  }

  return {
    asOf,
    concepts: CONCEPTS,          // definitiile — cash-ul NU se confunda cu profitul
    bank_balance: bankBalance ?? "UNKNOWN",
    horizons,
    data_gaps: gaps,
    complete: gaps.length === 0,
    confidence: gaps.length === 0 ? "ridicata" : gaps.includes("BANK_BALANCE") ? "scazuta (fara sold)" : "medie",
  };
}

/**
 * Punctul minim de cash + ziua primului deficit pe 90 de zile. PUR.
 * Ruleaza un registru zilnic: sold + incasari CERTE − iesiri certe, zi cu zi.
 * Fara sold → totul UNKNOWN (nu se inventeaza).
 */
export function computeMinimumCash({ asOf, bankBalance = null, confirmedReceivables = null, obligations = [], days = 90 } = {}) {
  if (bankBalance == null) {
    return {
      available_now: "UNKNOWN", minimum_cash: "UNKNOWN", minimum_cash_date: "UNKNOWN",
      first_deficit_date: "UNKNOWN", surplus_deficit_90: "UNKNOWN",
      why: "sold bancar necunoscut", how_to_fix: "introdu soldul (Command Center) sau conecteaza o sursa cu sold",
    };
  }
  const byDay = new Map();
  const addFlow = (dateStr, amt) => {
    const d = daysBetween(asOf, dateStr);
    const k = Math.max(0, Math.min(days, d)); // restantele lovesc azi
    byDay.set(k, (byDay.get(k) || 0) + amt);
  };
  for (const o of obligations) if (o.dueDate && daysBetween(asOf, o.dueDate) <= days) addFlow(o.dueDate, -(o.amountRON || 0));
  for (const r of confirmedReceivables || []) if (r.dueDate && daysBetween(asOf, r.dueDate) >= 0 && daysBetween(asOf, r.dueDate) <= days) addFlow(r.dueDate, r.amountRON || 0);

  let bal = bankBalance, min = bankBalance, minDay = 0, firstDeficitDay = null;
  for (let d = 0; d <= days; d++) {
    bal += byDay.get(d) || 0;
    if (bal < min) { min = bal; minDay = d; }
    if (bal < 0 && firstDeficitDay === null) firstDeficitDay = d;
  }
  const dateOf = (d) => new Date(new Date(asOf).getTime() + d * 86_400_000).toISOString().slice(0, 10);
  return {
    available_now: bankBalance,
    minimum_cash: Math.round(min), minimum_cash_date: dateOf(minDay),
    first_deficit_date: firstDeficitDay === null ? "fara deficit in orizont" : dateOf(firstDeficitDay),
    surplus_deficit_90: Math.round(bal),
    confidence_note: (confirmedReceivables || []).length ? "cu incasari confirmate" : "DOAR iesiri (fara incasari confirmate inregistrate)",
  };
}

/** Raport text al modelului. PUR. */
export function formatLiquidity(model) {
  const lei = (n) => typeof n === "number" ? Math.round(n).toLocaleString("ro-RO") + " lei" : n;
  const L = [`CASH INTELLIGENCE — ${model.asOf} · sold: ${lei(model.bank_balance)} · incredere: ${model.confidence}`];
  for (const h of HORIZONS) {
    const x = model.horizons[h];
    L.push(`  ${String(h).padStart(2)}z: iesiri certe ${lei(x.outflows.total_known)} (plati ${lei(x.outflows.payables)}, datorie ${lei(x.outflows.debt_service)}, salarii/taxe ${lei(x.outflows.payroll_tax)}) → lichiditate proiectata: ${lei(x.projected_liquidity)}`);
  }
  if (model.data_gaps.length) L.push(`DATE LIPSA: ${model.data_gaps.join(", ")} — componentele lipsa NU sunt estimate, sunt cerute.`);
  return L.join("\n");
}
