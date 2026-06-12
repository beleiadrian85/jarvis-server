import express from "express";
import { config, hasCalendar, hasOperational } from "./config.js";
import { bot } from "./telegram.js";
// import { startScheduler } from "./scheduler.js"; // ← FAZA 3

const app = express();

// Health check pentru Railway.
app.get("/", (_req, res) => {
  res.json({
    status: "JARVIS online",
    phase: 1,
    sources: {
      weather: true,
      operational: hasOperational,
      calendar: hasCalendar,
    },
  });
});

app.listen(config.port, () => {
  console.log(`[http] health check pe :${config.port}`);
});

// Pornim botul (long polling — simplu, fara webhook in Faza 1).
bot.launch().then(() => {
  console.log("[telegram] bot pornit");
  console.log(`[sources] operational=${hasOperational} calendar=${hasCalendar}`);
});

// startScheduler(); // ← decomenteaza in Faza 3

// Oprire curata.
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
