import { pool, query } from "./db.js";

/**
 * Audit log append-only (constitutie: cine a cerut, ce a facut sistemul,
 * cand, ce date a folosit, daca a existat confirmare).
 * Nu arunca niciodata — un audit picat nu blocheaza actiunea.
 */
export async function audit(action, detail = "", dataUsed = "", confirmed = null) {
  if (!pool) return;
  try {
    await query(
      `INSERT INTO audit_log (actor, action, detail, data_used, confirmed)
       VALUES ('adrian', $1, $2, $3, $4)`,
      [action, String(detail).slice(0, 2000), String(dataUsed).slice(0, 2000), confirmed]
    );
  } catch (e) {
    console.error("[audit]", e.message);
  }
}
