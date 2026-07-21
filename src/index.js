import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, hasCalendar, hasOperational, hasDb } from "./config.js";
import { initDb } from "./db.js";
import { bot, pushToOwner } from "./telegram.js";
import { registerApi } from "./api.js";
import { startBackupSchedule } from "./backup.js";
import { startScheduler } from "./scheduler.js";
import { startNotifier } from "./notifier.js";
import { startMonitor } from "./monitor.js";
import { startObservationEngine } from "./observationEngine/index.js";
import { startDigestSchedule } from "./founderAttention/index.js";
import { expireOldActions } from "./approvalGate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Health check pentru Railway + monitor extern (UptimeRobot).
app.get("/health", (_req, res) => {
  res.json({
    status: "JARVIS online",
    phase: 4,
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

// A2/A3: marcheaza expirate actiunile pending ramase de la un restart anterior.
await expireOldActions().catch((e) => console.error("[approvalGate.expire]", e.message));

app.listen(config.port, () => {
  console.log(`[http] pe :${config.port} (health: /health)`);
});

// Pornim botul (long polling — simplu, fara webhook).
bot.launch().then(() => {
  console.log("[telegram] bot pornit");
});
console.log(`[sources] operational=${hasOperational} calendar=${hasCalendar} memorie=${hasDb}`);

if (hasDb) startBackupSchedule();

// FAZA 3 — automatizare si monitorizare
startScheduler();
startNotifier();
startMonitor();

// CODEX Faza 4 — Observation Engine (GATED: OFF implicit → dormant, zero cron).
startObservationEngine();

// CODEX Faza 4.6 — Daily CEO Digest (GATED separat; senderul e injectat aici,
// modulele founderAttention raman structural fara canale de notificare).
startDigestSchedule({ send: pushToOwner });

// Oprire curata.
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
