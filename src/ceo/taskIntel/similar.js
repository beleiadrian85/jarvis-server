// SIMILAR TASKS (ETAPA 2, obiectiv 5) — la un task NOU, cauta taskuri/persoane/
// documente/solutii similare din memorie. Fingerprint + overlap de cuvinte (praguri
// existente in codebase). PUR.
import { problemType } from "./ingest.js";

const arr = (v) => (Array.isArray(v) ? v : []);
const tok = (s) => new Set(String(s || "").toLowerCase().replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t").split(/[^a-z0-9]+/).filter((x) => x.length > 3));

function overlap(a, b) { const t = tok(a); let n = 0; for (const x of tok(b)) if (t.has(x)) n++; return n; }

/**
 * Gaseste taskuri similare cu un task nou. @param newTask {title, project, assignee}
 * @returns { problem_type, similar_tasks:[{task_id,title,who,resolution_time_min,score}],
 *           similar_people, similar_documents }
 */
export function findSimilar(newTask = {}, records = [], { minScore = 2, limit = 5 } = {}) {
  const ptype = problemType(newTask.title);
  const scored = arr(records)
    .map((r) => ({ r, score: (r.problem_type === ptype ? 3 : 0) + overlap(newTask.title, r.title) + (newTask.project && newTask.project === r.project ? 1 : 0) }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const similar_tasks = scored.map(({ r, score }) => ({ task_id: r.id, title: r.title, who: r.executant, resolution_time_min: r.resolution_time_min, documents: arr(r.attachment_refs).map((a) => a.filename), score }));
  const people = {}; for (const s of similar_tasks) if (s.who) people[s.who] = (people[s.who] || 0) + 1;
  const docs = new Set(); for (const s of similar_tasks) for (const d of arr(s.documents)) docs.add(d);
  return {
    problem_type: ptype, similar_tasks,
    similar_people: Object.entries(people).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, count: n })),
    similar_documents: [...docs].slice(0, 5),
  };
}
