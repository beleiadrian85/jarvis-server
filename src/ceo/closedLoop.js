// CEO AI — CLOSED-LOOP MANAGEMENT (P1). Ciclul: problema → aprobare →
// delegare → monitorizare → verificare → efect masurat → stocare → lectie.
// Invatarea este AUDITABILA (jarvis_state + audit_log) si NU modifica
// niciodata prompturi/cod: ajusteaza doar confidence-ul per tip de strategie.
import { audit } from "../audit.js";
import { getState, setState } from "../state.js";

const LOOP_KEY = "ceo:closedloop";
export const LOOP_STATES = ["recommended", "approved", "delegated", "monitored", "verified", "measured", "closed"];

/** Inregistrare canonica: "Am recomandat X pentru ca Y." PUR. */
export function buildLoopRecord({ id, strategy_key, recommendation, because, expected_effect, decided_by = null } = {}) {
  return {
    loop_id: id || `loop:${(strategy_key || "x")}:${(recommendation || "").slice(0, 24).replace(/[^a-zA-Z0-9]+/g, "-")}`,
    strategy_key,                    // ex: "reesalonare_plati", "presiune_avansuri"
    state: "recommended",
    recommendation, because, expected_effect,
    decided_by, outcome: null, effect_measured: null, lesson: null,
  };
}

/** Ajustarea de confidence per strategie — determinista si auditabila. PUR. */
export function adjustConfidence(current = 50, outcome) {
  if (outcome === "success") return Math.min(95, current + 10);
  if (outcome === "partial") return Math.min(90, current + 3);
  if (outcome === "failure") return Math.max(5, current - 15);
  return current;
}

/** Persista o recomandare in bucla. */
export async function recordLoop(record, { persist = true } = {}) {
  if (persist) {
    const st = await getState(LOOP_KEY, { records: {}, confidence: {} }).catch(() => ({ records: {}, confidence: {} }));
    st.records[record.loop_id] = { ...record, recorded_at: new Date().toISOString() };
    await setState(LOOP_KEY, st).catch(() => {});
    await audit("ceo_loop", `${record.loop_id} [${record.state}] ${record.recommendation}`.slice(0, 190),
      JSON.stringify(record).slice(0, 1900)).catch(() => {});
  }
  return record;
}

/** Inchide bucla cu rezultatul: "X a produs Z" → lectia + confidence nou. */
export async function closeLoop(loop_id, { outcome, effect_measured, lesson }, { persist = true } = {}) {
  const st = await getState(LOOP_KEY, { records: {}, confidence: {} }).catch(() => ({ records: {}, confidence: {} }));
  const rec = st.records[loop_id];
  if (!rec) return { error: "bucla inexistenta" };
  rec.state = "closed";
  rec.outcome = outcome; rec.effect_measured = effect_measured; rec.lesson = lesson;
  const key = rec.strategy_key || "general";
  const before = st.confidence[key] ?? 50;
  st.confidence[key] = adjustConfidence(before, outcome);
  if (persist) {
    await setState(LOOP_KEY, st).catch(() => {});
    await audit("ceo_loop_closed", `${loop_id} → ${outcome}; confidence ${key}: ${before}→${st.confidence[key]}`.slice(0, 190),
      JSON.stringify({ lesson, effect_measured }).slice(0, 1900)).catch(() => {});
  }
  return { record: rec, confidence: { key, before, after: st.confidence[key] } };
}

/** Confidence-ul curent al unei strategii (alimenteaza deciziile viitoare). */
export async function strategyConfidence(strategy_key) {
  const st = await getState(LOOP_KEY, { records: {}, confidence: {} }).catch(() => ({ records: {}, confidence: {} }));
  return st.confidence[strategy_key] ?? 50;
}
