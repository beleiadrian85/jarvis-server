// CHANGE DETECTION — nu notifica aceeasi informatie repetat. Hash pe continut/titlu,
// detectare schimbare materiala (stadiu, publicare, intrare in vigoare, norme, termen).
// jarvis_state. PUR (detectie) + wrapper persistenta.
import { getState, setState } from "../../state.js";
import crypto from "node:crypto";

const KEY = "ceo:monitor:seen";
const arr = (v) => (Array.isArray(v) ? v : []);
const hash = (s) => crypto.createHash("sha256").update(String(s || "")).digest("hex").slice(0, 16);

/** Amprenta canonica a unui rezultat monitorizat. */
export function fingerprint(item = {}) {
  return {
    canonical_url: item.url || item.canonical_url || null,
    content_hash: hash(item.content || item.summary || item.title || ""),
    title_hash: hash(item.title || ""),
    legal_stage: item.legal_stage || null,
    published_at: item.published_at || null,
  };
}

/** Ce s-a schimbat MATERIAL fata de versiunea anterioara? */
export function materialChanges(prev, next) {
  if (!prev) return { isNew: true, changes: ["articol nou"] };
  const changes = [];
  if (prev.legal_stage !== next.legal_stage && next.legal_stage) changes.push(`schimbare stadiu: ${prev.legal_stage || "?"}→${next.legal_stage}`);
  if (prev.content_hash !== next.content_hash) changes.push("continut actualizat");
  if (prev.published_at !== next.published_at && next.published_at) changes.push("data publicarii schimbata");
  return { isNew: false, changes };
}

/**
 * Verifica daca un item e nou/schimbat material. Persista amprenta.
 * @returns { notify, isNew, changes, key } — notify=false daca fara schimbare materiala.
 */
export async function detectChange(item, { store = null, topicId = null } = {}) {
  const S = store || { get: getState, set: setState };
  const fp = fingerprint(item);
  const key = fp.canonical_url ? hash(fp.canonical_url) : fp.content_hash;
  const seen = (await S.get(KEY, { items: {} }).catch(() => null)) || { items: {} };
  const prev = seen.items[key] || null;
  const mc = materialChanges(prev, fp);
  const notify = mc.isNew || mc.changes.length > 0;
  seen.items[key] = { ...fp, topic_id: topicId, observed_at: new Date().toISOString(), previous_version: prev ? { legal_stage: prev.legal_stage, content_hash: prev.content_hash } : null };
  // Marginim (ultimele 1000).
  const ids = Object.keys(seen.items);
  if (ids.length > 1000) for (const d of ids.slice(0, ids.length - 1000)) delete seen.items[d];
  await S.set(KEY, seen).catch(() => {});
  return { notify, isNew: mc.isNew, changes: mc.changes, key };
}

export const IMPACT_LEVELS = ["INFORMATIONAL", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

/**
 * Impact assessment raportat la profil (nu doar sentiment). Explica MECANISMUL.
 * @returns ImpactAssessment structurat.
 */
export function assessImpact(event = {}, profile = {}) {
  const affected = [];
  const ind = arr(profile.industries).map((x) => String(x).toLowerCase());
  const blob = `${event.title || ""} ${event.summary || ""}`.toLowerCase();
  for (const i of ind) if (blob.includes(i.split(" ")[0])) affected.push(i);
  for (const a of arr(profile.relevant_authorities)) if (blob.includes(String(a).toLowerCase())) affected.push(a);

  const applicable = event.applicable === true;
  const hasDeadline = !!event.deadline || !!event.effective_date;
  // Nivel: aplicabil + termen + zona afectata → HIGH/CRITICAL; altfel mai jos.
  let level = "INFORMATIONAL";
  if (affected.length && applicable && hasDeadline) level = "HIGH";
  else if (affected.length && applicable) level = "MEDIUM";
  else if (affected.length) level = "LOW";
  if (level === "HIGH" && (event.financial_impact === "material" || event.founder_decision_required)) level = "CRITICAL";

  return {
    event: event.title || event.event || null, source_quality: event.source_tier || null,
    confirmation_status: event.confirmation_status || (event.source_tier <= 2 ? "official" : "unconfirmed"),
    legal_status: event.legal_stage || null, affected_entities: [...new Set(affected)],
    affected_processes: arr(event.affected_processes), effective_date: event.effective_date || null,
    financial_impact: event.financial_impact || "unknown", operational_impact: event.operational_impact || "unknown",
    compliance_impact: event.compliance_impact || (affected.length ? "possible" : "none"), deadline: event.deadline || null,
    required_actions: arr(event.required_actions), owner: event.owner || null,
    founder_decision_required: !!event.founder_decision_required, confidence: event.confidence ?? 50,
    unknowns: arr(event.unknowns), impact_level: level,
    mechanism: affected.length ? `afecteaza ${affected.join(", ")}${applicable ? " (aplicabil)" : " (inca neaplicabil)"}${hasDeadline ? ", cu termen" : ""}` : "fara legatura clara cu profilul companiilor",
  };
}
