import pg from "pg";
import { config } from "../config.js";

/**
 * SUPERVISOR AGENT — conexiune READ-ONLY la baza Operational.
 * Doar SELECT-uri. Detectorii au nevoie de date structurate (raport, status,
 * termen, timestamp-uri) pe care list_tasks (text) nu le da.
 */
export const hasOpsDb = !!config.operationalDbUrl;

let pool = null;
if (hasOpsDb) {
  pool = new pg.Pool({
    connectionString: config.operationalDbUrl,
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 30_000,
  });
}

export async function opsQuery(sql, params = []) {
  if (!pool) throw new Error("OPERATIONAL_DATABASE_URL nesetat.");
  const r = await pool.query(sql, params);
  return r.rows;
}
