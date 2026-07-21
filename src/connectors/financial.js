// L1 — Connector financiar READ-ONLY peste tool-urile MCP Operational.
// Nu deține date; doar citește și normalizează. Parsarea e pură (testabilă
// fara retea): parseObligations / parseCashReport sunt exportate separat.
import { mcpCall } from "../mcp.js";

// Curs EUR→RON pentru normalizare (obligațiile sunt majoritar RON, unele EUR).
// Configurabil; valoare conservatoare implicita. Se poate lega ulterior la BNR.
export const EUR_RON = Number(process.env.EUR_RON || 5.0);

/** "99.000" → 99000 ; "493.693,45" → 493693.45 (format RO: . = mii, , = zecimale). */
export function parseRoNumber(s) {
  return Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;
}

/** Suma "99.000 RON" / "2.100 EUR" → { amount, currency, amountRON }. */
export function parseAmount(field) {
  const m = String(field).match(/([\d.,]+)\s*([A-Za-z]{3})/);
  if (!m) return { amount: 0, currency: "RON", amountRON: 0 };
  const amount = parseRoNumber(m[1]);
  const currency = m[2].toUpperCase();
  const amountRON = currency === "EUR" ? amount * EUR_RON : amount; // RON/LEI = 1:1
  return { amount, currency, amountRON };
}

/**
 * Parsează textul de la list_payment_obligations în obiecte structurate.
 * Linie: "• 2026-07-09 · Titlu · 99.000 RON · Leasing · General · normala · neplatita"
 */
export function parseObligations(text) {
  const out = [];
  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("•")) continue;
    const parts = line.replace(/^•\s*/, "").split("·").map((p) => p.trim());
    if (parts.length < 3) continue;
    const dueDate = parts[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) continue;
    const { amount, currency, amountRON } = parseAmount(parts[2]);
    // Formatul MCP a primit coloana optionala "rămas X" dupa suma — o sarim,
    // altfel categoria devine "rămas ..." si bucketing-ul (Credit/Salarii) pica.
    const off = /^r[aă]mas\b/i.test(parts[3] || "") ? 1 : 0;
    out.push({
      dueDate,
      title: parts[1] || "",
      amount,
      currency,
      amountRON,
      category: parts[3 + off] || "Altele",
      project: parts[4 + off] || "General",
      priority: parts[5 + off] || "normala",
      status: parts[6 + off] || "neplatita",
    });
  }
  return out;
}

/** Parsează headline-ul de la cash_report ("Necesar cash N zile: X lei" + categorii). */
export function parseCashReport(text) {
  const s = String(text);
  const total = parseRoNumber((s.match(/Necesar cash.*?:\s*([\d.,]+)/) || [])[1] || "0");
  const categories = {};
  for (const m of s.matchAll(/^\s{2,}([\wăâîșț ]+):\s*([\d.,]+)\s*lei/gim)) {
    categories[m[1].trim()] = parseRoNumber(m[2]);
  }
  const restante = Number((s.match(/Restante:\s*(\d+)/) || [])[1] || 0);
  const scadente3 = Number((s.match(/Scadente 3 zile:\s*(\d+)/) || [])[1] || 0);
  return { total, categories, restante, scadente3 };
}

// ── Apeluri live (rulează pe server, cu OPERATIONAL_MCP_URL setat) ──────
export async function getObligations() {
  // Retry o data la caderi tranzitorii (vazute live: goluri de ~30 min care
  // faceau cash-ul invizibil). Esec dupa retry → propaga (caller marcheaza lipsa).
  try {
    return parseObligations(await mcpCall("list_payment_obligations", { only_open: true }));
  } catch (e) {
    console.warn("[financial] list_payment_obligations retry dupa:", e.message);
    await new Promise((r) => setTimeout(r, 1500));
    return parseObligations(await mcpCall("list_payment_obligations", { only_open: true }));
  }
}
export async function getCashReport(days = 30) {
  return parseCashReport(await mcpCall("cash_report", { days }));
}
