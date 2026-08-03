// RELATIONSHIP MEMORY / GRAPH (§3, §4, §14) — graf controlat de entitati si relatii
// (persoana/companie/proiect/task/client/furnizor/contract/thread/document/decizie/
// eveniment/obligatie/autoritate/subiect). Relatiile se stocheaza ca memorii de tip
// RELATIONSHIP (subject-predicate-object) cu provenienta. Graful se DERIVA din memorii;
// nu tine o a doua sursa de adevar. READ pentru interogare; scrierea trece prin store.
import { remember, list } from "./store.js";

export const ENTITY_KINDS = ["person", "company", "project", "task", "client", "supplier", "contract", "email_thread", "document", "decision", "event", "obligation", "authority", "topic"];
export const PREDICATES = ["OWNS", "REFERENCES", "VERSION_OF", "REQUESTED", "AFFECTS", "APPROVED_BY", "CREATED_FROM", "ASSOCIATED_WITH", "REPORTS_TO", "PART_OF", "RESPONSIBLE_FOR"];

const norm = (s) => String(s || "").trim();

/**
 * Adauga o relatie (subject -PREDICATE-> object) ca memorie RELATIONSHIP, prin gate.
 * @param {object} p { subject, predicate, object, source_type, source_reference,
 *   verification_status, confidence, subject_kind, object_kind }
 */
export async function addRelation(p = {}, opts = {}) {
  const subject = norm(p.subject), object = norm(p.object), predicate = norm(p.predicate).toUpperCase();
  if (!subject || !object || !predicate) return { stored: false, reason: "relatie incompleta (subject/predicate/object)" };
  return remember({
    title: `${subject} ${predicate} ${object}`,
    content: p.note || `${subject} —${predicate}→ ${object}`,
    kind: "episode", // trece prin gate ca eveniment cu sursa; tipul final e setat mai jos
    memory_type: "RELATIONSHIP",
    source_type: p.source_type || "derived", source_reference: p.source_reference || null,
    verification_status: p.verification_status || "OBSERVED",
    confidence: typeof p.confidence === "number" ? p.confidence : 0.6,
    sensitivity: p.sensitivity || "INTERNAL",
    entities: [subject, object],
    structured_data: { subject, predicate, object, subject_kind: p.subject_kind || null, object_kind: p.object_kind || null },
  }, opts);
}

/** Toate relatiile active (edges) din memorie. */
export async function edges({ store, tenant_id = null } = {}) {
  const rels = await list({ type: "RELATIONSHIP", limit: 5000, store, tenant_id });
  return rels.map((r) => ({ id: r.id, ...(r.structured_data || {}), confidence: r.confidence, verification_status: r.verification_status, sensitivity: r.sensitivity, source_type: r.source_type, source_reference: r.source_reference, created_at: r.created_at }))
    .filter((e) => e.subject && e.predicate && e.object);
}

/** Vecinii unei entitati (relatii in ambele sensuri). */
export async function neighbors(entity, { store, tenant_id = null } = {}) {
  const e = norm(entity).toLowerCase();
  const es = await edges({ store, tenant_id });
  const out = es.filter((x) => String(x.subject).toLowerCase() === e).map((x) => ({ direction: "out", predicate: x.predicate, other: x.object, confidence: x.confidence, source: x.source_type }));
  const inc = es.filter((x) => String(x.object).toLowerCase() === e).map((x) => ({ direction: "in", predicate: x.predicate, other: x.subject, confidence: x.confidence, source: x.source_type }));
  return [...out, ...inc];
}

/** Cauta un lant de relatii intre doua entitati (BFS, adancime limitata). */
export async function path(from, to, { store, maxDepth = 4, tenant_id = null } = {}) {
  const es = await edges({ store, tenant_id });
  const adj = new Map();
  for (const x of es) {
    const a = String(x.subject).toLowerCase(), b = String(x.object).toLowerCase();
    (adj.get(a) || adj.set(a, []).get(a)).push({ to: b, predicate: x.predicate });
    (adj.get(b) || adj.set(b, []).get(b)).push({ to: a, predicate: `${x.predicate}⁻¹` });
  }
  const start = norm(from).toLowerCase(), goal = norm(to).toLowerCase();
  const q = [[start, []]]; const seen = new Set([start]);
  while (q.length) {
    const [node, trail] = q.shift();
    if (trail.length > maxDepth) continue;
    for (const nx of adj.get(node) || []) {
      const step = [...trail, { from: node, predicate: nx.predicate, to: nx.to }];
      if (nx.to === goal) return { found: true, hops: step.length, path: step };
      if (!seen.has(nx.to)) { seen.add(nx.to); q.push([nx.to, step]); }
    }
  }
  return { found: false, path: [] };
}

/** Rezumatul grafului (pentru dashboard). */
export async function graphStats({ store, tenant_id = null } = {}) {
  const es = await edges({ store, tenant_id });
  const nodes = new Set();
  const byPredicate = {};
  for (const e of es) { nodes.add(String(e.subject).toLowerCase()); nodes.add(String(e.object).toLowerCase()); byPredicate[e.predicate] = (byPredicate[e.predicate] || 0) + 1; }
  return { entities: nodes.size, relations: es.length, by_predicate: byPredicate };
}
