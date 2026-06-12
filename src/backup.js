import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import cron from "node-cron";
import { pool, query } from "./db.js";
import { config } from "./config.js";

/**
 * Backup zilnic al DB (03:00 Europe/Bucharest) pe volumul Railway (/data).
 * Dump JSON gzip per tabel, retentie 14 zile (constitutie).
 */

const TABLES = ["conversations", "conv_state", "memories", "decisions", "reminders", "audit_log"];
const RETENTION_DAYS = 14;

export async function runBackup() {
  if (!pool) return;
  try {
    fs.mkdirSync(config.backupDir, { recursive: true });
    const dump = {};
    for (const t of TABLES) {
      dump[t] = await query(`SELECT * FROM ${t}`);
    }
    const stamp = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
    const file = path.join(config.backupDir, `jarvis-${stamp}.json.gz`);
    fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(dump)));

    // Retentie: sterge backupurile mai vechi de 14 zile.
    const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
    for (const f of fs.readdirSync(config.backupDir)) {
      const full = path.join(config.backupDir, f);
      if (f.startsWith("jarvis-") && fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    }
    console.log(`[backup] scris ${file}`);
  } catch (e) {
    console.error("[backup]", e.message);
  }
}

export function startBackupSchedule() {
  cron.schedule("0 3 * * *", runBackup, { timezone: "Europe/Bucharest" });
  console.log("[backup] programat zilnic la 03:00 Europe/Bucharest, retentie 14 zile");
}
