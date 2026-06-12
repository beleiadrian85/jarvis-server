import express from "express";
import { config, hasCalendar, hasOperational, hasDb } from "./config.js";
import { handleMessage, confirmAction } from "./brain.js";
import { getHudData } from "./hud.js";
import { hasVoice, synthesize } from "./tts.js";

/**
 * API-ul HUD-ului. Din Faza 2, chat-ul trece prin brain.js —
 * istoric si memorie COMUNE cu Telegram (constitutie, sectiunea HUD).
 */

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
      sources: {
        weather: true,
        operational: hasOperational,
        calendar: hasCalendar,
        memory: hasDb,
        voice: hasVoice,
      },
      city: config.weather.city,
    });
  });

  // FAZA V — sinteza vocala (mp3) pentru HUD.
  app.post("/api/speak", async (req, res) => {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "text lipsa." });
    if (!hasVoice) return res.status(503).json({ error: "voce neconfigurata." });
    try {
      const audio = await synthesize(text.slice(0, 2000));
      res.set("content-type", "audio/mpeg");
      res.set("cache-control", "no-store");
      res.send(audio);
    } catch (e) {
      console.error("[api/speak]", e.message);
      res.status(502).json({ error: "Sinteza vocala a esuat." });
    }
  });

  app.get("/api/hud", async (_req, res) => {
    try {
      res.json(await getHudData());
    } catch (e) {
      console.error("[api/hud]", e.message);
      res.status(502).json({ error: "Nu am putut citi datele HUD." });
    }
  });

  app.post("/api/chat", async (req, res) => {
    const text = String(req.body?.text ?? extractLastUser(req.body?.messages) ?? "").trim();
    if (!text) return res.status(400).json({ error: "text lipsa." });
    try {
      const { reply, confirmId } = await handleMessage("hud", text);
      res.json({ reply, confirmId: confirmId || null });
    } catch (e) {
      console.error("[api/chat]", e.message);
      res.status(502).json({ error: "Eroare la nucleu." });
    }
  });

  app.post("/api/confirm", async (req, res) => {
    const { confirmId, yes } = req.body || {};
    if (!confirmId) return res.status(400).json({ error: "confirmId lipsa." });
    try {
      res.json({ reply: await confirmAction(confirmId, !!yes) });
    } catch (e) {
      console.error("[api/confirm]", e.message);
      res.status(502).json({ error: "Eroare la confirmare." });
    }
  });

  app.post("/api/raport", async (req, res) => {
    try {
      const { reply } = await handleMessage("hud", "/raport");
      res.json({ report: reply });
    } catch (e) {
      console.error("[api/raport]", e.message);
      res.status(502).json({ error: "Nu am putut genera raportul." });
    }
  });
}

// Compatibilitate cu HUD-ul vechi care trimitea {messages:[...]}.
function extractLastUser(messages) {
  if (!Array.isArray(messages)) return null;
  const last = [...messages].reverse().find((m) => m?.role === "user");
  return last?.content || null;
}
