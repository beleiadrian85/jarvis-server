// CEO AI — DATA GAP ENGINE. PUR. Din harta de date → lacune actionabile:
// WHY / BEST SOURCE / TEMPORARY / PERMANENT / PROPOSED IMPLEMENTATION +
// Information Request PREGATIT (niciodata trimis fara ApprovalGate).
import { COMPANY, personFor } from "./companyConfig.js";

// Prioritati ROI per domeniu (instanta poate suprascrie in config in viitor).
const GAP_PRIORITY = {
  CASH: 1, BANK: 2, RECEIVABLES: 3, ACCOUNTING: 4, LEADS: 5,
  WEBSITE_TRAFFIC: 6, FINANCING: 7, CONSTRUCTION: 8, MARKETING: 9,
  CONTRACTS: 10, SUPPLIERS: 11, LEGAL: 12, ASSETS: 13, CALENDAR: 14,
};

// Detaliile lacunelor sunt SPECIFICE COMPANIEI → traiesc in companyConfig.gapDetails.
const GAP_DETAIL = COMPANY.gapDetails || {};

/** Construieste lacunele din harta de date. PUR. */
export function buildDataGaps(map) {
  const gaps = [];
  for (const d of map.domains) {
    if (d.connected === "CONNECTED") continue;
    const det = GAP_DETAIL[d.domain] || {};
    const person = det.request ? personFor(det.request.to) : null;
    gaps.push({
      gap_id: `gap:${d.domain.toLowerCase()}`,
      domain: d.domain,
      severity: d.connected === "NOT_CONNECTED" ? "major" : "partial",
      data_gap: det.what || `${d.domain}: sursa neconectata (${d.source})`,
      why: det.why || d.business_impact,
      best_source: det.best_source || d.how_to_fix,
      temporary_solution: det.temporary || "input uman periodic",
      permanent_solution: det.permanent || d.how_to_fix,
      proposed_implementation: det.implementation || d.how_to_fix,
      priority: GAP_PRIORITY[d.domain] ?? 99,
      // Information Request — PREGATIT, nu trimis (ApprovalGate decide).
      information_request: det.request && person ? {
        to: person.name, to_role: person.role,
        ask: det.request.ask, cadence: det.request.cadence,
        status: "draft_awaiting_approval", sent: false,
      } : null,
    });
  }
  return gaps.sort((a, b) => a.priority - b.priority);
}

/** Top N lacune formulate pentru raport. PUR. */
export function formatDataGaps(gaps, n = 5) {
  return gaps.slice(0, n).map((g) =>
    `DATA GAP: ${g.data_gap}\nWHY: ${g.why}\nBEST SOURCE: ${g.best_source}\nTEMPORAR: ${g.temporary_solution}\nPERMANENT: ${g.permanent_solution}` +
    (g.information_request ? `\nREQUEST (draft, netrimis): ${g.information_request.to}: ${g.information_request.ask}` : "")
  ).join("\n\n");
}

export { COMPANY };
