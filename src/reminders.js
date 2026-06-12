import { pool, query } from "./db.js";
import { audit } from "./audit.js";

/**
 * Modulul "Nu ma lasa sa uit": credite, scadente, contracte, fiscal,
 * emailuri importante, promisiuni. Reamintire persistenta pana la
 * rezolvat / amana / ignora.
 */

export async function addReminder({ kind = "altele", title, dueDate = null, source = null }) {
  if (!pool) return null;
  try {
    const r = await query(
      `INSERT INTO reminders (kind, title, due_date, source) VALUES ($1,$2,$3,$4)
       ON CONFLICT (source) WHERE source IS NOT NULL DO NOTHING
       RETURNING id`,
      [kind, title.slice(0, 500), dueDate, source]
    );
    return r[0]?.id ?? null; // null = duplicat (deja urmarit)
  } catch (e) {
    console.error("[reminders.add]", e.message);
    return null;
  }
}

/** Reminderele care trebuie afisate acum (active si ne-amanate). */
export async function activeReminders(limit = 8) {
  if (!pool) return [];
  return await query(
    `SELECT id, kind, title, due_date FROM reminders
     WHERE status = 'activ' OR (status = 'amanat' AND snooze_until <= now())
     ORDER BY due_date ASC NULLS LAST, id ASC LIMIT $1`,
    [limit]
  );
}

/** rezolvat / amana <zile> / ignora — comenzi deterministe din chat. */
export async function settleReminder(id, action, days = 3) {
  if (!pool) return "Memoria persistenta nu e activa.";
  const [r] = await query(`SELECT id, title FROM reminders WHERE id = $1`, [id]);
  if (!r) return `Nu exista reminderul #${id}.`;
  if (action === "rezolvat") {
    await query(`UPDATE reminders SET status='rezolvat', closed_at=now() WHERE id=$1`, [id]);
    await audit("reminder_rezolvat", r.title, `reminder #${id}`, true);
    return `✔ Rezolvat: ${r.title}`;
  }
  if (action === "amana") {
    await query(
      `UPDATE reminders SET status='amanat', snooze_until = now() + ($2 || ' days')::interval WHERE id=$1`,
      [id, String(days)]
    );
    await audit("reminder_amanat", `${r.title} (+${days}z)`, `reminder #${id}`, true);
    return `⏸ Amanat ${days} zile: ${r.title}`;
  }
  if (action === "ignora") {
    await query(`UPDATE reminders SET status='ignorat', closed_at=now() WHERE id=$1`, [id]);
    await audit("reminder_ignorat", r.title, `reminder #${id}`, true);
    return `✖ Ignorat: ${r.title}`;
  }
  return "Actiune necunoscuta (rezolvat / amana / ignora).";
}

export function formatReminders(rows) {
  if (!rows.length) return "";
  return rows
    .map((r) => {
      const due = r.due_date ? ` · scadenta ${new Date(r.due_date).toLocaleDateString("ro-RO")}` : "";
      return `#${r.id} [${r.kind}] ${r.title}${due}`;
    })
    .join("\n");
}
