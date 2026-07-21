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

/** Soldul de incasat per clienti (raport oficial "solduri clienti"). */
export async function getClientBalances() {
  const r = await sbGet("/report/client/balance");
  if (r?.error) return { error: r.error };
  const list = r?.list || r?.clients || [];
  return {
    clients: list.map((c) => ({ client: c.name || c.clientName, balanceRON: Number(c.balance ?? c.sold ?? 0) })),
    total_receivableRON: list.reduce((a, c) => a + Number(c.balance ?? c.sold ?? 0), 0),
  };
}

/** Reconciliere PURA: factura ↔ creanta ↔ incasare. Emisa ≠ incasata. */
export function reconcileInvoice({ amountRON = 0, collectedRON = 0, dueDate = null, asOf = null } = {}) {
  const remaining = Math.max(0, amountRON - collectedRON);
  if (remaining === 0 && amountRON > 0) return { state: "COLLECTED", remainingRON: 0 };
  if (collectedRON > 0) return { state: dueDate && asOf && dueDate < asOf ? "PARTIALLY_COLLECTED_OVERDUE" : "PARTIALLY_COLLECTED", remainingRON: remaining };
  if (dueDate && asOf && dueDate < asOf) return { state: "OVERDUE", remainingRON: remaining };
  return { state: "ISSUED_NOT_DUE", remainingRON: remaining, note: "emisa ≠ incasata" };
}
