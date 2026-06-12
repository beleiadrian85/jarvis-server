import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config, hasDb } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Conexiunea Postgres (Railway). Daca DATABASE_URL lipseste, totul
 * degradeaza elegant: hasVector=false si query() arunca o eroare clara.
 */
export let pool = null;
export let hasVector = false; // pgvector disponibil (pentru memoria semantica)

export async function query(sql, params = []) {
  if (!pool) throw new Error("DATABASE_URL nesetat — memoria persistenta e oprita.");
  const r = await pool.query(sql, params);
  return r.rows;
}

export async function initDb() {
  if (!hasDb) {
    console.warn("[db] DATABASE_URL lipseste — rulez FARA memorie persistenta.");
    return;
  }
  const internal = config.databaseUrl.includes("railway.internal");
  pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: internal ? false : { rejectUnauthorized: false },
  });

  const schema = fs.readFileSync(path.join(__dirname, "db", "schema.sql"), "utf8");
  await pool.query(schema);

  // pgvector: optional — daca extensia exista, memoria devine semantica.
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    await pool.query("ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding vector(1024)");
    hasVector = true;
    console.log("[db] pgvector activ — memorie semantica.");
  } catch (e) {
    console.warn("[db] pgvector indisponibil (" + e.message + ") — fallback pe cautare text.");
  }
  console.log("[db] schema initializata.");
}
