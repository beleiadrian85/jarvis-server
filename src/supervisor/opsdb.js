import pg from "pg";
import { config } from "../config.js";

/**
 * SUPERVISOR AGENT — conexiune READ-ONLY la baza Operational.
 * Doar SELECT-uri. Detectorii au nevoie de date structurate (raport, status,
 * termen, timestamp-uri) pe care list_tasks (text) nu le da.
 *
 * NERVOUS SYSTEM V1 §1 — READ-ONLY impus STRUCTURAL, nu prin conventie:
 *  1) fiecare conexiune din pool se deschide cu default_transaction_read_only=on
 *     (Postgres refuza orice scriere, indiferent de SQL-ul primit);
 *  2) opsQuery respinge inainte de executie orice statement care nu incepe cu
 *     SELECT/WITH (centura suplimentara, testabila fara DB).
 * Scrierea in Operational exista intr-un singur loc si doar pentru TASK-URI:
 * src/ceo/nervous/operationalWrite.js (prin MCP create_task, nu prin DB).
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
  // (1) Sesiune read-only pe fiecare conexiune noua din pool. Esecul NU e
  // silentios: fara read-only garantat, garda de mai jos ramane singura plasa.
  pool.on("connect", (client) => {
    client.query("SET default_transaction_read_only = on")
      .catch((e) => console.error("[opsdb] SET read_only ESUAT:", e.message));
  });
}

/**
 * Garda structurala anti-scriere. PUR — exportata pentru teste.
 * Dupa striparea string-urilor/comentariilor: (a) primul token = SELECT/WITH;
 * (b) ZERO `;` (fara multi-statement pe protocolul simplu pg); (c) niciun verb
 * de scriere/DDL NICAIERI in text (blocheaza CTE-uri cu INSERT/UPDATE/DELETE);
 * (d) fara set_config/functii de administrare care pot dezarma read-only-ul.
 */
export function isReadOnlySql(sql) {
  const stripped = String(sql || "")
    .replace(/'(?:[^']|'')*'/g, "''")     // string-uri SQL → goale
    .replace(/"(?:[^"]|"")*"/g, '""')     // identificatori citati
    .replace(/\/\*[\s\S]*?\*\//g, " ")    // comentarii bloc
    .replace(/--[^\n]*/g, " ");           // comentarii linie
  const first = stripped.trim().split(/[\s(]+/)[0]?.toUpperCase();
  if (first !== "SELECT" && first !== "WITH") return false;
  if (stripped.includes(";")) return false;
  if (/\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|VACUUM|COPY|CALL|DO|EXECUTE|PREPARE|LISTEN|NOTIFY|REFRESH|REINDEX|CLUSTER|COMMENT|SECURITY|SET)\b/i.test(stripped)) return false;
  if (/\b(set_config|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_sleep|lo_import|lo_export|dblink|pg_read_file|pg_write_file)\b/i.test(stripped)) return false;
  return true;
}

export async function opsQuery(sql, params = []) {
  if (!pool) throw new Error("OPERATIONAL_DATABASE_URL nesetat.");
  // (2) Centura defensiva: refuzam scrierile inainte sa atinga DB-ul.
  if (!isReadOnlySql(sql)) throw new Error("opsdb este READ-ONLY: doar SELECT/WITH.");
  const r = await pool.query(sql, params);
  return r.rows;
}
