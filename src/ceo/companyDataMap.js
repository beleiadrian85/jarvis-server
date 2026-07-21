// CEO AI — COMPANY DATA MAP. Harta creierului: ce stie si ce NU stie CEO AI,
// domeniu cu domeniu. Nucleu GENERIC — domeniile si sursele vin din config.
// Regula fundamentala: ZERO (masurat) ≠ NU AM DATE (sursa lipsa/picata).
import { COMPANY, liveConnectivity } from "./companyConfig.js";

export const CONNECTIVITY_STATES = ["CONNECTED", "PARTIAL", "NOT_CONNECTED"];
const STATE_SCORE = { CONNECTED: 1, PARTIAL: 0.5, NOT_CONNECTED: 0 };

/**
 * Harta statica (din config) + starea live masurata (world-ul Observation
 * Engine, cand e furnizat). PURA daca primesti world; fara world → doar config.
 * → { domains: [...], healthScore, connectedCount, notConnected: [...] }
 */
export function buildDataMap({ world = null } = {}) {
  const conn = liveConnectivity();
  const domains = Object.entries(COMPANY.domains).map(([key, d]) => {
    // Starea LIVE poate DEGRADA starea proiectata (sursa configurata dar picata).
    let liveState = d.connected;
    let freshness = "necunoscuta";
    let knows = [];
    let doesNotKnow = [];

    if (world) {
      const missing = world.sourceMeta?.missing || [];
      if (key === "PAYABLES") {
        if (missing.some((m) => /obligatii/.test(m))) { liveState = "NOT_CONNECTED"; freshness = "sursa picata acum"; }
        else { knows.push(`${world.obligations?.length ?? 0} obligatii deschise`); freshness = "timp real"; }
      }
      if (key === "TASKS" || key === "PEOPLE") {
        if (world.tasks?.length) { knows.push(`${world.tasks.length} task-uri active`); freshness = "timp real"; }
        else if (missing.some((m) => /predictionState|supervisor/.test(m))) { liveState = "PARTIAL"; freshness = "sursa picata acum"; }
      }
      if (key === "SALES" || key === "BELL_INVENTORY") {
        if (world.sales) { knows.push(`${world.sales.vandut ?? 0} vandute, ${world.sales.rezervat ?? 0} rezervate din ${world.sales.total ?? "?"}`); freshness = "timp real"; }
        else { liveState = d.connected === "CONNECTED" ? "PARTIAL" : d.connected; freshness = "sursa picata acum"; }
      }
      if (key === "CASH" && world.openingBalance != null) {
        liveState = "PARTIAL"; knows.push(`sold declarat ${world.openingBalance} RON (nesigur pe zi)`);
      }
      if (key === "DECISIONS" && world.decisions?.length) { knows.push(`${world.decisions.length} decizii in registru`); freshness = "timp real"; }
    }
    if (key === "EMAIL" && !conn.gmail) liveState = "NOT_CONNECTED";
    if (key === "CALENDAR" && !conn.calendar) liveState = "NOT_CONNECTED";

    if (liveState !== "CONNECTED") {
      doesNotKnow.push(key === "CASH" ? "soldul REAL de azi" : `starea curenta ${key}`);
    }
    return {
      domain: key, source: d.source, connected: liveState, designState: d.connected,
      freshness, quality: liveState === "CONNECTED" ? "buna" : liveState === "PARTIAL" ? "partiala" : "absenta",
      owner: d.owner, knows, does_not_know: doesNotKnow,
      business_impact: d.impact, how_to_fix: d.fix,
    };
  });

  const healthScore = Math.round(
    (100 * domains.reduce((a, d) => a + (STATE_SCORE[d.connected] ?? 0), 0)) / domains.length
  );
  return {
    company: COMPANY.id,
    domains,
    healthScore,
    connectedCount: domains.filter((d) => d.connected === "CONNECTED").length,
    partial: domains.filter((d) => d.connected === "PARTIAL").map((d) => d.domain),
    notConnected: domains.filter((d) => d.connected === "NOT_CONNECTED").map((d) => d.domain),
  };
}

/** Raport text compact al hartii (pentru audit/Command Center). PUR. */
export function formatDataMap(map) {
  const L = [`COMPANY DATA HEALTH: ${map.healthScore}/100 (${map.connectedCount}/${map.domains.length} conectate)`];
  for (const d of map.domains) {
    const icon = d.connected === "CONNECTED" ? "🟢" : d.connected === "PARTIAL" ? "🟡" : "🔴";
    L.push(`${icon} ${d.domain} — ${d.source}${d.connected !== "CONNECTED" ? ` | impact: ${d.business_impact}` : ""}`);
  }
  return L.join("\n");
}
