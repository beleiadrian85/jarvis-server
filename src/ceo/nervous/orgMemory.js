// NERVOUS SYSTEM V1 §21 — MEMORIA ORGANIZATIONALA (motor PUR, imutabil).
// Invata din REZULTATE: pentru fiecare pereche persoana+tip de task tine
// statistici operationale (total/done/failed/durata/followups/utilitate) din
// care deriva un scor determinist de incredere la delegare.
//
// NOTA (§21): scorurile sunt OPERATIONALE, per tip de activitate — masoara
// istoricul unei perechi om+tip de sarcina IN SISTEMUL DE TASK-URI, NU sunt
// judecati despre oameni sau despre valoarea lor. Un scor mic inseamna doar
// "istoric slab pe acest tip de task aici", nu o eticheta pe persoana.
//
// Toate functiile sunt PURE si IMUTABILE: primesc memoria ca argument si
// intorc o memorie NOUA — nu modifica nimic in loc. Persistenta (jarvis_state,
// cheia STATE_KEYS.memory) e treaba stratului de IO, nu a acestui modul.

// ── CONSTANTE DETERMINISTE ──────────────────────────────────────────────
const LOG_MAX = 200;                 // memoria de evenimente ramane marginita
const DEFAULT_CONFIDENCE = 50;       // fara istoric = neutru, nu ghicim in plus/minus
const CONFIDENCE_MIN = 5;            // clamp inferior — niciodata "zero sanse"
const CONFIDENCE_MAX = 95;           // clamp superior — niciodata "certitudine"
const BEST_OWNER_MIN = 40;           // sub prag nu recomandam (nu ghici)
const SUMMARY_MAX = 10;              // cate perechi listam per sectiune
// Rezultate recunoscute; orice altceva conteaza doar la total (rezultat ambiguu).
const DONE_OUTCOMES = new Set(["done", "completed", "acceptat", "success", "ok", "resolved", "rezolvat"]);
const FAILED_OUTCOMES = new Set(["failed", "fail", "respins", "rejected", "expired", "oprit", "abandoned"]);

// ── HELPERI INTERNI (puri) ──────────────────────────────────────────────

function normId(s) { return String(s == null ? "" : s).toLowerCase().trim(); }
function normType(s) { return String(s == null ? "" : s).toUpperCase().trim(); }
function pairKey(person_id, task_type) { return `${normId(person_id)}|${normType(task_type)}`; }
function splitKey(key) {
  const i = key.indexOf("|");
  return i < 0 ? [key, ""] : [key.slice(0, i), key.slice(i + 1)];
}
function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
function round2(n) { return Math.round(n * 100) / 100; }

/** Intrarea goala a unei perechi — punct de plecare pentru acumulare. */
function emptyPair() {
  return {
    total: 0, done: 0, failed: 0,
    avg_duration_days: null, duration_count: 0,
    followups_total: 0, owner_correct_count: 0, useful_count: 0,
    last_at: null,
  };
}

// ── EXPORTURI (§21) ─────────────────────────────────────────────────────

/**
 * Inregistreaza un rezultat si intoarce o memorie NOUA (imutabil).
 * Fara person_id sau task_type nu se inregistreaza nimic (nu inventam chei).
 * duration_days intra in medie doar daca e numar valid >= 0 (duration_count
 * e camp intern ca media sa ramana corecta incremental).
 * @returns {{ by_pair: object, log: Array }} memoria noua
 */
export function recordOutcome(memory = {}, { person_id, task_type, outcome, duration_days = null, followups = 0, owner_correct = null, useful = null, at = null } = {}) {
  const pid = normId(person_id);
  const tt = normType(task_type);
  if (!pid || !tt) return memory; // date lipsa => no-op, nu chei fantoma

  const key = `${pid}|${tt}`;
  const prev = (memory.by_pair && memory.by_pair[key]) || emptyPair();
  const oc = normId(outcome);
  const durationOk = typeof duration_days === "number" && Number.isFinite(duration_days) && duration_days >= 0;
  const nDur = (prev.duration_count || 0) + (durationOk ? 1 : 0);
  const fups = Number(followups) > 0 ? Number(followups) : 0;

  const next = {
    total: (prev.total || 0) + 1,
    done: (prev.done || 0) + (DONE_OUTCOMES.has(oc) ? 1 : 0),
    failed: (prev.failed || 0) + (FAILED_OUTCOMES.has(oc) ? 1 : 0),
    avg_duration_days: durationOk
      ? round2((((prev.avg_duration_days || 0) * (prev.duration_count || 0)) + duration_days) / nDur)
      : (prev.avg_duration_days == null ? null : prev.avg_duration_days),
    duration_count: nDur,
    followups_total: (prev.followups_total || 0) + fups,
    owner_correct_count: (prev.owner_correct_count || 0) + (owner_correct === true ? 1 : 0),
    useful_count: (prev.useful_count || 0) + (useful === true ? 1 : 0),
    last_at: at || prev.last_at || null,
  };

  const log = [
    ...(Array.isArray(memory.log) ? memory.log : []),
    { person_id: pid, task_type: tt, outcome: oc || "unknown", at: at || null },
  ].slice(-LOG_MAX);

  return { ...memory, by_pair: { ...(memory.by_pair || {}), [key]: next }, log };
}

/**
 * Scor determinist 0-100 de incredere la delegare pentru persoana+tip de task.
 * Fara istoric = 50 (neutru). Creste cu rata de succes (done/total) ponderata
 * cu volumul (min(total,10)/10 — putine date trag scorul spre neutru), scade
 * cu followups multe per task (penalizare plafonata la 20). Clamp 5-95.
 * NOTA (§21): scor operational per TIP de activitate, NU judecata despre om.
 * @returns {number} 5..95 (50 fara istoric)
 */
export function delegationConfidence(memory = {}, person_id, task_type) {
  const pair = memory.by_pair && memory.by_pair[pairKey(person_id, task_type)];
  if (!pair || !pair.total) return DEFAULT_CONFIDENCE;
  const successRate = (pair.done || 0) / pair.total;                 // 0..1
  const volume = Math.min(pair.total, 10) / 10;                     // 0..1 — pondere pe volum
  const followupsPerTask = (pair.followups_total || 0) / pair.total;
  const raw = DEFAULT_CONFIDENCE
    + (successRate - 0.5) * 80 * volume                             // +/-40 max, atenuat de volum
    - Math.min(followupsPerTask * 10, 20);                          // followups multe = incredere mai mica
  return clamp(Math.round(raw), CONFIDENCE_MIN, CONFIDENCE_MAX);
}

/**
 * Candidatul cu confidence maxima (>= 40) pentru un tip de task, altfel null.
 * NU ghicim: doar candidatii cu ISTORIC real pe acest tip de task intra in
 * cursa — fara nicio memorie relevanta raspunsul onest e null, nu un nume.
 * Tie-break determinist: mai mult istoric castiga, apoi ordinea candidatilor.
 * @param {Array} candidates id-uri (string) sau obiecte {id}/{person_id}
 * @returns {{ person_id: string, confidence: number } | null}
 */
export function bestOwnerFor(memory = {}, task_type, candidates = []) {
  let best = null;
  for (const c of Array.isArray(candidates) ? candidates : []) {
    const pid = normId(typeof c === "string" ? c : (c && (c.id || c.person_id)));
    if (!pid) continue;
    const pair = memory.by_pair && memory.by_pair[pairKey(pid, task_type)];
    if (!pair || !pair.total) continue; // fara istoric pe acest tip = nu ghicim
    const confidence = delegationConfidence(memory, pid, task_type);
    if (!best || confidence > best.confidence || (confidence === best.confidence && pair.total > best.total)) {
      best = { person_id: pid, confidence, total: pair.total };
    }
  }
  if (!best || best.confidence < BEST_OWNER_MIN) return null;
  return { person_id: best.person_id, confidence: best.confidence };
}

/**
 * Rezumatul memoriei: toate perechile cu scoruri + top/bottom (max 10 fiecare).
 * Sortare deterministe: confidence, apoi volum, apoi cheia alfabetic.
 * @returns {{ pairs: Array, strongest: Array, weakest: Array }}
 */
export function summarizeMemory(memory = {}) {
  const pairs = Object.entries(memory.by_pair || {}).map(([key, p]) => {
    const [person_id, task_type] = splitKey(key);
    return {
      person_id,
      task_type,
      confidence: delegationConfidence(memory, person_id, task_type),
      total: (p && p.total) || 0,
    };
  });
  const keyOf = (x) => `${x.person_id}|${x.task_type}`;
  const strongFirst = [...pairs].sort((a, b) =>
    b.confidence - a.confidence || b.total - a.total || keyOf(a).localeCompare(keyOf(b)));
  const weakFirst = [...pairs].sort((a, b) =>
    a.confidence - b.confidence || b.total - a.total || keyOf(a).localeCompare(keyOf(b)));
  const withHistory = (x) => x.total > 0;
  return {
    pairs: strongFirst.slice(0, SUMMARY_MAX),
    strongest: strongFirst.filter(withHistory).slice(0, SUMMARY_MAX),
    weakest: weakFirst.filter(withHistory).slice(0, SUMMARY_MAX),
  };
}
