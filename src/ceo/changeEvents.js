// CANONICAL CHANGE EVENTS (Fazele 5-6) — OPERATIONAL → JARVIS.
// Transforma diff-uri brute (snapshot vechi vs. nou) in EVENIMENTE CANONICE, ca
// Nervous System-ul sa reevalueze DOAR zona afectata, nu tot. PUR + determinist:
// zero IO, zero importuri. Detectia de schimbare (poll/hook) apeleaza acest strat.
// REGULA: absenta unei surse (snapshot null) = SOURCE_STALE, NU "zero schimbari".

/** Vocabularul canonic de evenimente. Orice consumator se leaga de acestea. */
export const EVENT_TYPES = [
  "TASK_UPDATED", "OBLIGATION_CHANGED", "SALE_CHANGED", "RECEIVABLE_CHANGED",
  "DOCUMENT_RECEIVED", "LEAD_CHANGED", "SOURCE_STALE", "SOURCE_RECOVERED",
];

// domeniu → { event, id, campuri urmarite (fingerprint) }
const DOMAINS = {
  tasks: { event: "TASK_UPDATED", key: "id", fields: ["status", "assignee", "report", "updatedAt"] },
  obligations: { event: "OBLIGATION_CHANGED", key: "id", fields: ["status", "amount", "due_date", "paid"] },
  sales: { event: "SALE_CHANGED", key: "id", fields: ["stage", "unit", "amount", "status"] },
  receivables: { event: "RECEIVABLE_CHANGED", key: "id", fields: ["status", "amount", "due_date", "collected"] },
  documents: { event: "DOCUMENT_RECEIVED", key: "id", fields: ["hash", "type", "received_at"] },
  leads: { event: "LEAD_CHANGED", key: "id", fields: ["stage", "status", "owner"] },
};

const s = (v) => (v == null ? "" : String(v));
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);

/** Amprenta unei entitati pe campurile urmarite (ordine stabila). */
function fp(row, fields) {
  return fields.map((f) => `${f}=${s(row?.[f])}`).join("|");
}

function indexBy(rows, key) {
  const m = new Map();
  for (const r of arr(rows)) if (r && r[key] != null) m.set(s(r[key]), r);
  return m;
}

/**
 * Diff pe un singur domeniu. `prev`/`next` = liste de entitati SAU null.
 * null pe next = sursa indisponibila → SOURCE_STALE (nu stergere!).
 * null pe prev (dupa ce a existat) devine SOURCE_RECOVERED cand revine.
 * @returns {Array<{type, domain, id, change, from, to}>}
 */
export function diffDomain(domain, prev, next, { wasStale = false } = {}) {
  const cfg = DOMAINS[domain];
  if (!cfg) return [];
  const events = [];

  // Sursa indisponibila acum → un singur eveniment SOURCE_STALE (nu N stergeri).
  if (next == null) return [{ type: "SOURCE_STALE", domain, id: null, change: "source_unavailable", from: "present", to: "stale" }];
  // Sursa revenita dupa ce a fost stale.
  if (wasStale) events.push({ type: "SOURCE_RECOVERED", domain, id: null, change: "source_back", from: "stale", to: "present" });
  // Prima observare (seed): fara prev → memoram, nu emitem N evenimente "create".
  if (prev == null) return events;

  const pi = indexBy(prev, cfg.key);
  const ni = indexBy(next, cfg.key);
  for (const [id, row] of ni) {
    const before = pi.get(id);
    if (!before) { events.push({ type: cfg.event, domain, id, change: "created", from: null, to: fp(row, cfg.fields) }); continue; }
    const a = fp(before, cfg.fields), b = fp(row, cfg.fields);
    if (a !== b) events.push({ type: cfg.event, domain, id, change: "updated", from: a, to: b });
  }
  for (const [id, row] of pi) {
    if (!ni.has(id)) events.push({ type: cfg.event, domain, id, change: "removed", from: fp(row, cfg.fields), to: null });
  }
  return events;
}

/**
 * Diff pe multiple domenii deodata. `prevState`/`nextState` = { domain: rows|null }.
 * `staleDomains` = Set/array cu domeniile care erau stale la snapshot-ul anterior.
 * @returns {Array<events>} canonice, deduplicabile.
 */
export function detectChanges(prevState = {}, nextState = {}, { staleDomains = [] } = {}) {
  const stale = new Set(arr([...staleDomains]));
  const out = [];
  for (const domain of Object.keys(DOMAINS)) {
    if (!(domain in nextState) && !(domain in prevState)) continue;
    const evs = diffDomain(domain, prevState[domain] ?? null, nextState[domain] ?? null, { wasStale: stale.has(domain) });
    for (const e of evs) out.push(e);
  }
  return out;
}

/** Rezumat compact pentru declansarea reactiva (ce zona sa reevalueze organismul). */
export function affectedAreas(events) {
  const areas = new Set();
  for (const e of arr(events)) if (isObj(e) && e.domain) areas.add(e.domain);
  return [...areas];
}

/** Text scurt pentru activity stream / audit. PUR. */
export function eventsForLog(events) {
  const ev = arr(events);
  if (!ev.length) return "Niciun eveniment canonic (fara schimbari detectate).";
  const byType = {};
  for (const e of ev) byType[e.type] = (byType[e.type] || 0) + 1;
  return Object.entries(byType).map(([t, n]) => `${t}×${n}`).join(", ");
}
