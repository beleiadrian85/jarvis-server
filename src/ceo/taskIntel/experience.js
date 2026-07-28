// EXPERIENCE DATABASE (ETAPA 2, obiectiv 4) — agrega KnowledgeCards pe tip de
// problema/fingerprint: cine rezolva cel mai bine, cat dureaza, ce documente,
// ce rezultat. Pattern din N+ ocurente (nu dintr-un caz). PUR (agregare).
const arr = (v) => (Array.isArray(v) ? v : []);
const median = (xs) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const topCount = (xs) => { const c = {}; for (const x of xs) if (x) c[x] = (c[x] || 0) + 1; const e = Object.entries(c).sort((a, b) => b[1] - a[1]); return e[0]?.[0] || null; };

/**
 * Construieste ExperienceEntry-uri din KnowledgeCards. @returns [ExperienceEntry]
 * Un pattern devine "confident" doar cu N+ ocurente (min_occurrences).
 */
export function buildExperience(cards = [], { minOccurrences = 3 } = {}) {
  const byType = {};
  for (const c of arr(cards)) { const k = c.problem_type || "general"; (byType[k] = byType[k] || []).push(c); }
  const out = [];
  for (const [ptype, list] of Object.entries(byType)) {
    const owners = list.map((c) => c.who).filter(Boolean);
    const times = list.map((c) => c.resolution_time_min).filter((x) => Number.isFinite(x));
    const docs = list.flatMap((c) => arr(c.documents_used).map((d) => d.doc_type || d.filename)).filter(Boolean);
    const results = list.map((c) => c.resolution).filter(Boolean);
    const occ = list.length;
    out.push({
      fingerprint: list[0]?.fingerprint || `k=${ptype}`, problem_type: ptype,
      typical_owner: topCount(owners), avg_resolution_min: median(times),
      documents_pattern: [...new Set(docs)].slice(0, 5), typical_result: topCount(results),
      sample_task_ids: list.map((c) => c.task_id).slice(0, 10), occurrences: occ,
      confidence: occ >= minOccurrences ? Math.min(90, 40 + occ * 10) : Math.min(35, occ * 15),
      is_pattern: occ >= minOccurrences,
    });
  }
  return out.sort((a, b) => b.occurrences - a.occurrences);
}

/** Experienta pentru un tip de problema (read). */
export function experienceFor(problemType, experiences = []) {
  return arr(experiences).find((e) => e.problem_type === problemType) || null;
}
