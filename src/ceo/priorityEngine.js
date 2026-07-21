// CEO AI — PRIORITY ENGINE (D3). PUR, determinist. Din toate semnalele
// companiei alege TOP 3 COMPANY PRIORITIES TODAY — niciodata mai mult.
// Alimenteaza Command Center, Daily Digest si contextul Board.

const SEV = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

/** Scorul unei prioritati candidate. PUR. Factorii ceruti explicit. */
export function scorePriority(c) {
  let s = 0;
  const fin = Number(c.cash_impactRON) || 0;
  if (fin >= 100_000) s += 30; else if (fin >= 25_000) s += 20; else if (fin > 0) s += 10;
  if (c.urgency_days != null) { if (c.urgency_days <= 1) s += 20; else if (c.urgency_days <= 3) s += 15; else if (c.urgency_days <= 7) s += 8; }
  s += (SEV[c.severity] ?? 0) * 5;                       // risc
  if (c.strategic) s += 10;
  if (c.irreversible) s += 8;
  if (c.blocking) s += 10;                               // blocheaza alte lucruri
  if (c.opportunity_costRON >= 25_000) s += 7;
  return Math.min(100, s);
}

/**
 * Candidatii vin din observatii/episoade/gap-uri; iesirea = TOP 3, cu scor,
 * motiv si dovada. PUR.
 */
export function topPriorities({ observations = [], episodes = [], gaps = [], asOf } = {}) {
  const candidates = [];

  for (const e of episodes) {
    if (e.status === "resolved") continue;
    candidates.push({
      title: e.title, kind: "episod",
      severity: e.combined_severity,
      urgency_days: e._minUrgencyDays < 900 ? e._minUrgencyDays : null,
      cash_impactRON: /lichiditate/i.test(e.title) ? 100_000 : 0,
      blocking: e.requires_board_review,
      strategic: e.requires_board_review,
      evidence: `[episode] ${e.episode_id}`,
    });
  }
  for (const o of observations) {
    if (!["high", "critical"].includes(o.severity)) continue;
    candidates.push({
      title: o.title, kind: "observatie", severity: o.severity,
      urgency_days: o._factors?.urgencyDays, cash_impactRON: o._factors?.financialImpactRON || 0,
      irreversible: !!o._factors?.irreversible, blocking: o.requires_board_review,
      evidence: o.evidence?.[0] || "",
    });
  }
  // Gap-ul de sold e prioritate structurala cat timp exista presiune de cash.
  const cashGap = gaps.find((g) => g.domain === "CASH");
  if (cashGap && candidates.some((c) => /lichiditate|obligatii/i.test(c.title))) {
    candidates.push({
      title: "Conecteaza soldul bancar (deblocheaza lichiditatea neta)", kind: "data-gap",
      severity: "high", urgency_days: 1, cash_impactRON: 0, blocking: true, strategic: true,
      evidence: "[data-map] CASH", opportunity_costRON: 100_000,
    });
  }

  const scored = candidates
    .map((c) => ({ ...c, score: scorePriority(c) }))
    .sort((a, b) => b.score - a.score);
  // Dedup pe titlu-aproape-identic.
  const seen = new Set(); const top = [];
  for (const c of scored) {
    const key = c.title.toLowerCase().slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key); top.push(c);
    if (top.length === 3) break;
  }
  return { asOf, priorities: top.map((c, i) => ({ rank: i + 1, title: c.title, score: c.score, why: `${c.kind} · ${c.severity}${c.urgency_days != null ? ` · ${c.urgency_days}z` : ""}`, evidence: c.evidence })) };
}
