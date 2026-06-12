import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, hasCalendar, hasOperational, hasDb } from "./config.js";
import { initDb } from "./db.js";
import { bot } from "./telegram.js";
import { registerApi } from "./api.js";
import { startBackupSchedule } from "./backup.js";
// import { startScheduler } from "./scheduler.js"; // ← FAZA 3

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Health check pentru Railway + monitor extern (UptimeRobot).
app.get("/health", (_req, res) => {
  res.json({
    status: "JARVIS online",
    phase: 2,
    sources: {
      weather: true,
      operational: hasOperational,
      calendar: hasCalendar,
      memory: hasDb,
    },
  });
});

// API pentru HUD (chat + raport, protejat cu PIN).
registerApi(app);

// HUD-ul (PWA) — servit static de pe radacina.
app.use(express.static(path.join(__dirname, "..", "public")));

// DB intai (memoria), apoi HTTP si bot.
await initDb();

app.listen(config.port, () => {
  console.log(`[http] pe :${config.port} (health: /health)`);
});

// Pornim botul (long polling — simplu, fara webhook).
bot.launch().then(() => {
  console.log("[telegram] bot pornit");
});
console.log(`[sources] operational=${hasOperational} calendar=${hasCalendar} memorie=${hasDb}`);

if (hasDb) startBackupSchedule();
// startScheduler(); // ← decomenteaza in Faza 3

// Oprire curata.
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
