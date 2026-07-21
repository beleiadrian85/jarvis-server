// CONNECTOR SMARTBILL (A2) — adaptor READ-ONLY peste API-ul oficial SmartBill
// Cloud (Basic auth email:token). Credentialele vin EXCLUSIV din env
// (SMARTBILL_EMAIL / SMARTBILL_TOKEN / SMARTBILL_CIF) — niciodata din cod.
// Fara env → NOT_CONNECTED + health check care spune exact ce lipseste.
// O factura emisa NU inseamna cash incasat — reconcilierea e separata (PURA).

const BASE = process.env.SMARTBILL_BASE_URL || "https://ws.smartbill.ro/SBORO/api";

export function smartbillConfigured() {
  return !!(process.env.SMARTBILL_EMAIL && process.env.SMARTBILL_TOKEN && process.env.SMARTBILL_CIF);
}

export function smartbillHealth() {
  if (smartbillConfigured()) return { status: "CONFIGURED", base: BASE };
  const missing = ["SMARTBILL_EMAIL", "SMARTBILL_TOKEN", "SMARTBILL_CIF"].filter((k) => !process.env[k]);
  return {
    status: "NOT_CONNECTED",
    missing_env: missing,
    how_to_fix: "Seteaza variabilele pe Railway (exista deja in integrarea locala de pe BIROU: .claude/smartbill-api.json).",
  };
}

async function sbGet(path, params = {}) {
  if (!smartbillConfigured()) return { error: "NOT_CONNECTED" };
  const url = new URL(BASE + path);
  url.searchParams.set("cif", process.env.SMARTBILL_CIF);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const auth = Buffer.from(`${process.env.SMARTBILL_EMAIL}:${process.env.SMARTBILL_TOKEN}`).toString("base64");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return { error: `SmartBill ${res.status}` };
    return await res.json();
  } catch (e) {
    return { error: e.name === "AbortError" ? "timeout" : e.message };
  } finally { clearTimeout(t); }
}

// Maparea OFICIALA (docs api.smartbill.ro + clienti open-source verificati):
// DISPONIBIL read-only: GET /series, GET /invoice/paymentstatus, GET /stocks.
// NOT_AVAILABLE_FROM_SOURCE: listare bulk facturi, solduri clienti agregate.
export const NOT_AVAILABLE_FROM_SOURCE = ["listare bulk facturi emise", "solduri clienti agregate", "facturi primite (furnizori)"];

/** Seriile de documente — proba de conectivitate reala. */
export async function getSeries() {
  const r = await sbGet("/series", { type: "f" });
  if (r?.error) return { error: r.error };
  return { series: (r.list || []).map((s) => s.name), raw_count: (r.list || []).length };
}

/** Statusul de plata al UNEI facturi cunoscute (seriesname+number). */
export async function getPaymentStatus(seriesname, number) {
  const r = await sbGet("/invoice/paymentstatus", { seriesname, number });
  if (r?.error) return { error: r.error };
  return {
    totalRON: Number(r.invoiceTotalAmount ?? 0),
    paidRON: Number(r.paidAmount ?? 0),
    unpaidRON: Number(r.unpaidAmount ?? 0),
  };
}

/**
 * Reconciliere cu facturile din Operational (income_invoices au doc_ref):
 * pentru fiecare ref "SERIE NUMAR" intreaba SmartBill de statusul REAL de
 * incasare. Emisa ≠ incasata — SmartBill e sursa adevarului pe colectare.
 */
export async function reconcileWithOperational(incomeInvoices = [], { maxCalls = 10 } = {}) {
  if (!smartbillConfigured()) return { error: "NOT_CONNECTED" };
  const out = [];
  for (const inv of incomeInvoices.slice(0, maxCalls)) {
    const m = String(inv.ref || "").trim().match(/^([A-Za-z]+)\s*-?\s*(\d+)$/);
    if (!m) { out.push({ ref: inv.ref, status: "REF_NEPARSABIL" }); continue; }
    const ps = await getPaymentStatus(m[1], m[2]);
    out.push(ps.error
      ? { ref: inv.ref, status: "EROARE", error: ps.error }
      : { ref: inv.ref, client: inv.client, ...ps, operational_remainingRON: inv.remainingRON,
          divergent: Math.abs((ps.unpaidRON ?? 0) - (inv.remainingRON ?? 0)) > 1 });
  }
  return { checked: out.length, results: out, divergences: out.filter((r) => r.divergent).length };
}

/** Reconciliere PURA: factura ↔ creanta ↔ incasare. Emisa ≠ incasata. */
export function reconcileInvoice({ amountRON = 0, collectedRON = 0, dueDate = null, asOf = null } = {}) {
  const remaining = Math.max(0, amountRON - collectedRON);
  if (remaining === 0 && amountRON > 0) return { state: "COLLECTED", remainingRON: 0 };
  if (collectedRON > 0) return { state: dueDate && asOf && dueDate < asOf ? "PARTIALLY_COLLECTED_OVERDUE" : "PARTIALLY_COLLECTED", remainingRON: remaining };
  if (dueDate && asOf && dueDate < asOf) return { state: "OVERDUE", remainingRON: remaining };
  return { state: "ISSUED_NOT_DUE", remainingRON: remaining, note: "emisa ≠ incasata" };
}
