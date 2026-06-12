import express from "express";
import { config, hasCalendar, hasOperational } from "./config.js";
import { callClaude } from "./claude.js";
import { buildMorningReport } from "./morning.js";

const SYSTEM_CHAT =
  "Esti JARVIS, asistentul personal al lui Adi. Romana, direct, scurt, pragmatic. " +
  "Daca nu stii, spui clar. Fara politeturi inutile.";

// Doar mesaje user/assistant cu continut text, maxim ultimele 20.
function sanitizeMessages(input) {
  if (!Array.isArray(input)) return null;
  const clean = input
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!clean.length || clean[clean.length - 1].role !== "user") return null;
  return clean;
}

export function registerApi(app) {
  app.use(express.json({ limit: "100kb" }));

  // Toate rutele /api cer PIN-ul (header x-jarvis-key).
  app.use("/api", (req, res, next) => {
    if (!config.appSecret) {
      return res.status(503).json({ error: "APP_SECRET nesetat pe server." });
    }
    if (req.get("x-jarvis-key") !== config.appSecret) {
      return res.status(401).json({ error: "PIN gresit." });
    }
    next();
  });

  app.get("/api/status", (_req, res) => {
    res.json({
      ok: true,
      sources: { weather: true, operational: hasOperational, calendar: hasCalendar },
      city: config.weather.city,
    });
  });

  app.post("/api/chat", async (req, res) => {
    const messages = sanitizeMessages(req.body?.messages);
    if (!messages) {
      return res.status(400).json({ error: "messages invalid." });
    }
    try {
      const reply = await callClaude({ system: SYSTEM_CHAT, messages, maxTokens: 800 });
      res.json({ reply: reply || "…" });
    } catch (e) {
      console.error("[api/chat]", e.message);
      res.status(502).json({ error: "Eroare la nucleu." });
    }
  });

  app.post("/api/raport", async (_req, res) => {
    try {
      const report = await buildMorningReport();
      res.json({ report });
    } catch (e) {
      console.error("[api/raport]", e.message);
      res.status(502).json({ error: "Nu am putut genera raportul." });
    }
  });
}
