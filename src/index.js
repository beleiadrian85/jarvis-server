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
import { registerCeoApi } from "./ceo/api.js";
import { registerBoardApi } from "./boardApi.js";
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
// CEO Command Center (Master Phase) — READ-ONLY, sub acelasi PIN /api.
registerCeoApi(app);
// CEO OS — Executive Board 6+1 (read-only). Wire-uit la nivelul de compozitie,
// NU in CEO core (respecta granita testata in ceo.wiring): expune
// runBoardMeeting existent catre interfata, sub acelasi middleware PIN.
registerBoardApi(app);
// ASK CODEX (aprobat de Adrian) — buton "Intreaba CODEX" din Operational pentru
// Dana/Nelu. Acelasi Cognitive Kernel; sub acelasi middleware PIN; TASKS-only.
const { registerCodexApi } = await import("./codex/api.js");
registerCodexApi(app);

// CEO OS e noul UI implicit: radacina (start_url "/" al PWA instalat) duce la
// /os.html. UI-ul vechi ramane accesibil direct la /index.html si /ceo.html
// (nimic sters — revenirea = stergerea acestui redirect). 302 = necache-uit dur.
app.get("/", (_req, res) => res.redirect(302, "/os.html"));

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

// NERVOUS SYSTEM V1 — organismul managerial (GATED: OFF implicit → dormant).
// FULL READ / TASKS-ONLY WRITE; shadow implicit; autonomia o decide Adrian.
const { startNervousSystem } = await import("./ceo/nervous/index.js");
startNervousSystem();

// Oprire curata.
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
