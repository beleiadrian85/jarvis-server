import { opsQuery, hasOpsDb } from "./opsdb.js";

/**
 * COLLECTOR (Nivel A, read-only): produce un snapshot al starii Operational.
 * Doar citire — niciun efect asupra aplicatiei echipei.
 */
export async function collectState() {
  if (!hasOpsDb) return null;

  const [users, tasks, obligations] = await Promise.all([
    opsQuery(`SELECT id, name FROM users`),
    opsQuery(
      `SELECT id, title, status, resolution, deadline, assignee, created_by, project,
              created_at, updated_at
       FROM tasks
       WHERE deleted_at IS NULL AND kind != 'personal'`
    ),
    opsQuery(
      `SELECT id, title, amount, currency, due_date, status, priority
       FROM payment_obligations
       WHERE status IN ('neplatita','partial')`
    ).catch(() => []),
  ]);

  const names = Object.fromEntries(users.map((u) => [u.id, u.name]));

  const parsed = tasks.map((t) => {
    let report = "";
    if (t.resolution) {
      try { report = (JSON.parse(t.resolution).done || "").trim(); }
      catch { report = String(t.resolution).trim(); }
    }
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      report,
      deadline: t.deadline,
      assignee: t.assignee,
      assigneeName: names[t.assignee] || t.assignee,
      creator: t.created_by,
      project: t.project,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    };
  });

  return { tasks: parsed, obligations, names };
}
