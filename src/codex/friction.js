// ASK CODEX — FRICTION SENSOR (§9). Ask CODEX devine un senzor de frictiune
// organizationala: intrebari repetate, blocaje repetate, documente lipsa repetate,
// procese confuze, munca manuala repetitiva. Alimenteaza Capability Gap /
// Improvement Engine — dar NU construieste dupa un singur caz: FRECVENTA + IMPACT
// + INCREDERE. Reutilizeaza jarvis_state. PUR (agregare) + wrapper de persistenta.
import { getState, setState } from "../state.js";

const KEY = "codex:friction";
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// Praguri: nu escaladam la un singur caz.
const MIN_FREQUENCY = 3;      // de cate ori se repete pana devine candidat
const MIN_CONFIDENCE = 50;

/** Semnatura stabila a unei frictiuni (grupare pe tip + subiect normalizat). */
function signature(kind, subject) {
  return `${kind}:${norm(subject).split(" ").slice(0, 6).join(" ")}`;
}

/**
 * Inregistreaza un semnal de frictiune peste starea existenta. PUR.
 * @param {object} state  { items: { sig: {kind, subject, count, users:[], last, impact} } }
 * @param {object} signal { kind: repeated_question|repeated_blocker|missing_document|confusing_process|manual_work, subject, user_id, impact(1-5), at }
 * @returns { state, item }
 */
export function recordFriction(state = {}, signal = {}) {
  const items = isObj(state?.items) ? { ...state.items } : {};
  const sig = signature(signal.kind || "unknown", signal.subject || "");
  const prev = items[sig] || { kind: signal.kind, subject: String(signal.subject || "").slice(0, 160), count: 0, users: [], impact: 0, first: signal.at || null };
  const users = prev.users.includes(signal.user_id) ? prev.users : [...prev.users, signal.user_id].filter(Boolean);
  const item = {
    ...prev, count: prev.count + 1, users,
    impact: Math.max(prev.impact, Math.min(5, Number(signal.impact) || 2)),
    last: signal.at || null,
  };
  items[sig] = item;
  return { state: { items }, item };
}

/**
 * Candidati de imbunatatire care trec pragul (frecventa + impact + incredere).
 * NU construieste — doar propune catre gapEngine. @returns [{signature, ...}]
 */
export function frictionCandidates(state = {}) {
  const items = isObj(state?.items) ? state.items : {};
  const out = [];
  for (const [sig, it] of Object.entries(items)) {
    // Incredere creste cu frecventa + numarul de utilizatori afectati.
    const confidence = Math.min(95, Math.round((it.count / MIN_FREQUENCY) * 40 + (it.users.length - 1) * 15 + it.impact * 5));
    if (it.count >= MIN_FREQUENCY && confidence >= MIN_CONFIDENCE) {
      out.push({ signature: sig, kind: it.kind, subject: it.subject, frequency: it.count, users: it.users, impact: it.impact, confidence });
    }
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/** Persista un semnal + returneaza candidatii curenti (best-effort, nu arunca). */
export async function captureFriction(signal, { store = null } = {}) {
  try {
    const S = store || { get: getState, set: setState };
    const prev = (await S.get(KEY, { items: {} })) || { items: {} };
    const { state } = recordFriction(prev, signal);
    await S.set(KEY, state).catch(() => {});
    return { ok: true, candidates: frictionCandidates(state) };
  } catch (e) { return { ok: false, error: e.message, candidates: [] }; }
}

/** Mapare candidat frictiune → semnal pentru gapEngine.detectGapsFromSignals. */
export function toGapSignals(candidates = []) {
  return arr(candidates).map((c) => ({
    kind: c.kind === "missing_document" ? "MISSING_DATA" : c.kind === "manual_work" ? "MANUAL_REPETITIVE" : "PROCESS_FRICTION",
    subject: c.subject, frequency: c.frequency, confidence: c.confidence, impact: c.impact, source: "ask_codex_friction",
  }));
}
