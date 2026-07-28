// TASK MEMORY (ETAPA 2, obiectiv 1) — indexeaza task-urile FINALIZATE din Operational.
// READ-ONLY pe Operational (collectState = opsdb SELECT). Scrie DOAR jarvis_state.
// Idempotent pe id+updatedAt: un task neschimbat nu se re-indexeaza. NU executa,
// NU modifica, NU decide — doar observa. Reutilizeaza situationFingerprint.
import { getState, setState } from "../../state.js";
import { situationFingerprint } from "../actions/decisionLearning.js";

const KEY = "ceo:taskintel:tasks";
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

// Statusuri considerate FINALIZATE (din care se invata).
const FINISHED = ["acceptat", "rezolvat", "inchis", "finalizat", "done", "completed"];

/** Task finalizat? (status normalizat). */
export function isFinished(status) {
  return FINISHED.includes(String(status || "").toLowerCase());
}

/** Minute intre doua timestamp-uri (rezolvare). */
function minutesBetween(a, b) {
  const t0 = Date.parse(a), t1 = Date.parse(b);
  return Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0 ? Math.round((t1 - t0) / 60000) : null;
}

/** Deriveaza tipul de problema din titlu (pentru fingerprint). */
export function problemType(title) {
  const n = String(title || "").toLowerCase();
  if (/extras|cont|banca|sold/.test(n)) return "extras_bancar";
  if (/factur|smartbill/.test(n)) return "factura";
  if (/contract|semnat|notar/.test(n)) return "contract";
  if (/certificat|urbanism|aviz|autoriz/.test(n)) return "autorizatie";
  if (/material|comanda|livrar|furnizor/.test(n)) return "materiale";
  if (/tva|anaf|fiscal|impozit|declarati/.test(n)) return "fiscal";
  if (/plata|obligati|scadent/.test(n)) return "plata";
  if (/vanzar|rezervar|client|lead/.test(n)) return "vanzari";
  return "general";
}

/**
 * Construieste un TaskRecord dintr-un task Operational (minimizat, fara bruta).
 * conversation/attachments = referinte + numar (continutul se ia la nevoie).
 */
export function buildTaskRecord(t = {}, { observations = [], attachments = [], nowISO = null } = {}) {
  const c = isObj(t) ? t : {};
  const finished_at = isFinished(c.status) ? (c.updatedAt || c.updated_at || null) : null;
  const started_at = c.createdAt || c.created_at || null;
  const ptype = problemType(c.title);
  return {
    id: c.id, title: c.title || null, description: c.description || c.criteria || null,
    project: c.project || null,
    creator: c.creatorName || c.creator || c.created_by || null,
    executant: c.assigneeName || c.assignee || null,
    validator: c.validator || c.creatorName || c.creator || null, // in Operational creatorul valideaza
    started_at, finished_at,
    resolution_time_min: finished_at ? minutesBetween(started_at, finished_at) : null,
    final_result: (c.report || "").slice(0, 500) || null,
    attachment_refs: arr(attachments).map((a) => ({ filename: a.filename || a.original_name, mime: a.mime || null })),
    observation_count: arr(observations).length,
    problem_type: ptype,
    fingerprint: situationFingerprint({ action_kind: ptype, risk_level: "low", reversibility: "reversible", owner: c.assigneeName || c.assignee, unknowns: [] }),
    status: c.status || null,
    indexed_at: nowISO || new Date().toISOString(),
    signature: `${c.id}|${c.updatedAt || c.updated_at || ""}`, // idempotenta
  };
}

/**
 * Indexeaza task-urile finalizate. READ-ONLY pe Operational. Idempotent.
 * @param p { collect (async → {tasks}), attachmentsFor (async(id)→[]), observationsFor
 *           (async(id)→[]), store, nowISO, limit }
 * @returns { indexed, skipped, total_records }
 */
export async function ingestTasks(p = {}) {
  const { collect = null, attachmentsFor = null, observationsFor = null, store = null, nowISO = null, limit = 100 } = isObj(p) ? p : {};
  const S = store || { get: getState, set: setState };
  const memo = (await S.get(KEY, { records: {} }).catch(() => null)) || { records: {} };

  let state;
  try {
    const collectFn = collect || (await import("../../supervisor/collector.js")).collectState;
    state = await collectFn();
  } catch (e) { return { indexed: 0, skipped: 0, error: e.message, total_records: Object.keys(memo.records).length }; }

  const finished = arr(state?.tasks).filter((t) => isFinished(t.status)).slice(0, limit);
  let indexed = 0, skipped = 0;
  for (const t of finished) {
    const sig = `${t.id}|${t.updatedAt || t.updated_at || ""}`;
    if (memo.records[t.id]?.signature === sig) { skipped++; continue; } // neschimbat → idempotent
    let observations = [], attachments = [];
    if (typeof observationsFor === "function") observations = await observationsFor(t.id).catch(() => []);
    if (typeof attachmentsFor === "function") attachments = await attachmentsFor(t.id).catch(() => []);
    memo.records[t.id] = buildTaskRecord(t, { observations, attachments, nowISO });
    indexed++;
  }
  // Marginim (ultimele 1000 taskuri indexate).
  const ids = Object.keys(memo.records);
  if (ids.length > 1000) for (const d of ids.slice(0, ids.length - 1000)) delete memo.records[d];
  await S.set(KEY, memo).catch(() => {});
  return { indexed, skipped, total_records: Object.keys(memo.records).length };
}

export async function getTaskRecords({ store = null } = {}) {
  const S = store || { get: getState, set: setState };
  const memo = (await S.get(KEY, { records: {} }).catch(() => null)) || { records: {} };
  return Object.values(memo.records);
}
