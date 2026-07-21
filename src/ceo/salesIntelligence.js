// CEO AI — SALES INTELLIGENCE (P1). PUR. Adaptor peste datele EXISTENTE —
// nu schimba procesul de vanzare. Funnelul canonic are 9 stagii; stagiile
// fara sursa sunt marcate NOT_CONNECTED, niciodata simulate.

export const FUNNEL_STAGES = [
  "LEAD", "CONTACT", "VIEWING", "NEGOTIATION", "RESERVATION",
  "ADVANCE", "PRECONTRACT", "CONTRACT", "CASH_RECEIVED",
];

/**
 * Starea funnelului din sursele disponibile. PUR.
 * @param p.sales    sales_summary {total, disponibil, rezervat, vandut, avansIncasat} | null
 * @param p.history  snapshot-uri anterioare [{date, rezervat, vandut, avansIncasat}] (jarvis_state)
 */
export function buildFunnel({ sales = null, history = [] } = {}) {
  const stages = {};
  for (const s of FUNNEL_STAGES) stages[s] = { value: null, status: "NOT_CONNECTED" };
  if (sales) {
    stages.RESERVATION = { value: sales.rezervat ?? 0, status: "CONNECTED" };
    stages.ADVANCE = { value: sales.avansIncasat ?? 0, status: "CONNECTED" };
    stages.CONTRACT = { value: sales.vandut ?? 0, status: "CONNECTED" };
    // LEAD/CONTACT/VIEWING/NEGOTIATION/PRECONTRACT/CASH_RECEIVED — fara sursa inca.
  }

  const detections = [];
  if (sales) {
    if ((sales.rezervat ?? 0) > 0 && (sales.avansIncasat ?? 0) === 0) {
      detections.push({
        key: "rezervari_fara_avans", severity: "medium",
        finding: `${sales.rezervat} rezervari fara niciun avans incasat — pipeline fragil.`,
        evidence: [`[operational] sales_summary: rezervat=${sales.rezervat}, avansIncasat=${sales.avansIncasat ?? 0}`],
      });
    }
    // Stagnare: comparativ cu istoricul (fara istoric → nu se inventeaza trend).
    if (history.length >= 2) {
      const oldest = history[0], latest = history[history.length - 1];
      const soldDelta = (latest.vandut ?? 0) - (oldest.vandut ?? 0);
      const days = Math.max(1, Math.round((new Date(latest.date) - new Date(oldest.date)) / 86_400_000));
      if (days >= 14 && soldDelta === 0 && (sales.disponibil ?? 0) > 0) {
        detections.push({
          key: "inventar_stagnant", severity: "medium",
          finding: `Zero vanzari noi in ${days} zile cu ${sales.disponibil} unitati disponibile.`,
          evidence: [`[jarvis_state] istoric vanzari: ${oldest.date} → ${latest.date}, vandut ${oldest.vandut}→${latest.vandut}`],
        });
      }
    } else {
      detections.push({
        key: "fara_baseline", severity: "info",
        finding: "Fara istoric suficient pentru trend de vanzari — se acumuleaza snapshot-uri zilnice.",
        evidence: ["[jarvis_state] sales:history sub 2 puncte"],
      });
    }
  }

  const gaps = FUNNEL_STAGES.filter((s) => stages[s].status === "NOT_CONNECTED");
  return {
    stages, detections,
    connected: FUNNEL_STAGES.filter((s) => stages[s].status === "CONNECTED"),
    not_connected: gaps,
    forecast_incasari: "NOT_CONNECTED — cere incasari contractate (SmartBill/antecontracte)",
  };
}

/** Snapshot zilnic pentru istoric (apelat de runner; datele NU se inventeaza). PUR. */
export function salesSnapshot(sales, date) {
  if (!sales) return null;
  return { date, rezervat: sales.rezervat ?? 0, vandut: sales.vandut ?? 0, avansIncasat: sales.avansIncasat ?? 0, disponibil: sales.disponibil ?? 0 };
}
