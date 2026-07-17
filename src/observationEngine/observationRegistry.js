// OBSERVATION ENGINE — registrul detectorilor + finalizarea observatiilor.
// PUR (fara IO): ruleaza detectorii pe "world" si transforma schitele in
// observatii complete conform schemei (scoring determinist, id stabil).
import {
  detectCash, detectSales, detectTraffic, detectFromPredictions,
  detectTaskHygiene, detectPeople, detectDecisions, detectOpsRisk, detectFounder,
} from "./observationDetectors.js";
import { scoreObservation, dataQualityForAge } from "./observationScoring.js";

/** Registrul — extensibil fara modificarea runner-ului. */
export const DETECTOR_REGISTRY = [
  { key: "cash", fn: detectCash },
  { key: "sales", fn: detectSales },
  { key: "traffic", fn: detectTraffic },
  { key: "predictions", fn: detectFromPredictions },
  { key: "taskHygiene", fn: detectTaskHygiene },
  { key: "people", fn: detectPeople },
  { key: "decisions", fn: detectDecisions },
  { key: "opsRisk", fn: detectOpsRisk },
  { key: "founder", fn: detectFounder },
];

/** Ruleaza toti detectorii; un detector picat nu opreste restul. */
export function runDetectorRegistry(world) {
  const drafts = [];
  for (const d of DETECTOR_REGISTRY) {
    try { drafts.push(...(d.fn(world) || [])); }
    catch (e) { console.error(`[observation:detector:${d.key}]`, e.message); }
  }
  return drafts;
}

/** Schita → observatie completa (schema canonica). Determinist: acelasi
 *  world + aceleasi schite → aceleasi observatii (id-ul vine din cheia dedup). */
export function finalizeObservations(drafts, world) {
  const ageHours = world.sourceMeta?.freshnessHours ?? 0;
  return drafts.map((d) => {
    const dataQuality = dataQualityForAge(d.factors?.dataQuality || "partial", ageHours);
    const { score, severity } = scoreObservation({ ...d.factors, dataQuality });
    const dedupKey = `${d.category}:${d.type}:${d.entity || "-"}`;
    const confidence = Math.max(0, Math.min(100, Math.round(
      d.confidence != null ? d.confidence : (d.factors?.probability ?? 0.5) * 100
    )));
    return {
      observation_id: `obs:${dedupKey}`,
      type: d.type, category: d.category,
      title: d.title, summary: d.summary,
      detected_at: world.now,
      period_analyzed: world.period || { from: world.asOf, to: world.asOf },
      severity, confidence, data_quality: dataQuality,
      evidence: d.evidence, sources: d.sources,
      metrics: { ...d.metrics, score },
      baseline: d.baseline || {}, deviation: d.deviation || {},
      business_impact: d.business_impact || [],
      urgency_reason: d.urgency_reason || "",
      possible_causes: d.possible_causes || [],
      unknowns: d.unknowns || [],
      recommended_next_analysis: d.recommended_next_analysis || [],
      requires_board_review: false,      // decise de observationEscalation
      requires_founder_attention: false,
      requires_immediate_action: false,
      deduplication_key: dedupKey,
      status: "new",                      // reconciliat de observationDeduplicator
      safe_to_notify: false,              // decis de runner (politica de notificare)
      _score: score,                      // intern (dedup/prioritizare); ramane in obiect
      _threatensCore: d.threatensCore || null,
      _contradiction: d.contradiction || null,
      _factors: { ...d.factors, dataQuality },
    };
  });
}
