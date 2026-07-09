import express from "express";
import fs from "node:fs";
import path from "node:path";
import { config, hasCalendar, hasOperational, hasDb } from "./config.js";
import { handleMessage, confirmAction, splitVoice } from "./brain.js";
import { ceoHomeReport, riskReport } from "./engines/ceoHome.js";
import { cashForecastReport } from "./engines/financialBrain.js";
import { projectIntelReport } from "./engines/projectIntel.js";
import { getHudData } from "./hud.js";
import { hasVoice, synthesize } from "./tts.js";
import { buildAuthUrl, exchangeCode } from "./google.js";
import { getRecent, appendMessage } from "./history.js";
import { describeFile } from "./vision.js";
import { saveMemory } from "./memory.js";
import { rateLimit, isLockedOut, noteAuthFail, clearAuthFail } from "./ratelimit.js";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/data/uploads";
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

function catFor(text) {
  const n = (text || "").toLowerCase();
  if (/(factur|chitan|bon|plat|tva|cont|iban|sum[aă]|lei|eur)/.test(n)) return "Financiar";
  if (/(contract|act|notar|antecontract|clauz)/.test(n)) return "Contracte";
  if (/(plan|santier|șantier|proiect|bloc|apartament|releveu)/.test(n)) return "Proiecte";
  return "Documente";
}

/**
 * API-ul HUD-ului. Din Faza 2, chat-ul trece prin brain.js —
 * istoric si memorie COMUNE cu Telegram (constitutie, sectiunea HUD).
 */

export function registerApi(app) {
  // S5: pe Railway suntem in spatele unui proxy → req.ip corect.
  app.set("trust proxy", 1);

  // S5: limitatoare de rata (mono-instanta, in-memory).
  const apiLimiter = rateLimit({ windowMs: 60_000, max: 60, prefix: "api" });         // 60/min
  const authLimiter = rateLimit({ windowMs: 60 * 60_000, max: 10, prefix: "auth" });  // 10/ora

  // Parser cu limita mare pentru upload (poze/PDF) si audio (transcriere).
  app.use(["/api/upload", "/api/transcribe"], express.json({ limit: "16mb" }));
  app.use(express.json({ limit: "100kb" }));

  // Setup unic OAuth Google (Gmail/Calendar/Drive). Gateat cu PIN-ul (?k=).
  app.get("/auth/google", authLimiter, (req, res) => {
    if (isLockedOut(req.ip)) return res.status(429).send("Prea multe incercari. Reincearca peste 15 minute.");
    if (req.query.k !== config.appSecret) {
      noteAuthFail(req.ip);
      return res.status(401).send("PIN gresit. Adauga ?k=PIN la link.");
    }
    clearAuthFail(req.ip);
    if (!config.google.clientId || !config.google.clientSecret) {
      return res.status(503).send("Lipsesc GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in Railway.");
    }
    const redirectUri = `https://${req.get("host")}/auth/google/callback`;
    res.redirect(buildAuthUrl(redirectUri));
  });

  app.get("/auth/google/callback", authLimiter, async (req, res) => {
    if (req.query.error) return res.status(400).send("Refuzat: " + req.query.error);
    if (!req.query.code) return res.status(400).send("Lipseste codul.");
    try {
      const redirectUri = `https://${req.get("host")}/auth/google/callback`;
      const tok = await exchangeCode(req.query.code, redirectUri);
      if (tok.refresh_token) {
        // S1: nu logam NICIODATA refresh token-ul (secret in logurile cloud).
        console.log("[google] OAuth reusit — refresh token obtinut (nelogat, din motive de securitate).");
        res.send("<h2 style='font-family:sans-serif'>✅ Google conectat.</h2><p>Poți închide fila. Pentru a seta <code>GOOGLE_REFRESH_TOKEN</code> în Railway, rulează local <code>node scripts/google-auth.js</code> (nu apare în loguri).</p>");
      } else {
        res.send("<h2 style='font-family:sans-serif'>⚠️ Fără refresh token.</h2><p>Revocă accesul aplicației în contul Google și reia /auth/google.</p>");
      }
    } catch (e) {
      console.error("[google.callback]", e.message);
      res.status(500).send("Eroare la schimbul de token: " + e.message);
    }
  });

  // Toate rutele /api cer PIN-ul (header x-jarvis-key) + rate-limit + lockout.
  app.use("/api", apiLimiter, (req, res, next) => {
    if (isLockedOut(req.ip)) {
      return res.status(429).json({ error: "Prea multe incercari. Reincearca mai tarziu." });
    }
    if (!config.appSecret) {
      return res.status(503).json({ error: "APP_SECRET nesetat pe server." });
    }
    if (req.get("x-jarvis-key") !== config.appSecret) {
      noteAuthFail(req.ip);
      return res.status(401).json({ error: "PIN gresit." });
    }
    clearAuthFail(req.ip);
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
        stt: !!(config.openaiKey || config.deepgramKey),
      },
      city: config.weather.city,
    });
  });

  // Transcriere audio — OpenAI Whisper preferat, Deepgram fallback.
  app.post("/api/transcribe", async (req, res) => {
    const { data, mediaType } = req.body || {};
    if (!data) return res.status(400).json({ error: "audio lipsa." });
    if (!config.openaiKey && !config.deepgramKey) return res.status(503).json({ error: "STT neconfigurat." });

    // 1) OpenAI Whisper (multipart).
    if (config.openaiKey) {
      try {
        const buf = Buffer.from(data, "base64");
        const ext = { "audio/webm": "webm", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg" }[mediaType] || "webm";
        const form = new FormData();
        form.append("file", new Blob([buf], { type: mediaType || "audio/webm" }), "audio." + ext);
        form.append("model", config.openaiSttModel);
        form.append("language", "ro");
        const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST", headers: { authorization: "Bearer " + config.openaiKey }, body: form,
        });
        const d = await r.json();
        if (!r.ok) throw new Error(`whisper ${r.status}: ${JSON.stringify(d).slice(0, 160)}`);
        return res.json({ text: d.text || "" });
      } catch (e) {
        console.error("[api/transcribe] OpenAI esuat, incerc Deepgram:", e.message);
      }
    }

    // 2) Deepgram (fallback).
    if (!config.deepgramKey) return res.status(502).json({ error: "Transcrierea a esuat." });
    try {
      // Termeni proprii impulsionati ca Deepgram sa-i recunoasca (nume, proiecte).
      const kw = (config.sttKeywords || "Nelu:3,Dana:3,Mihaela:2,Adrian:2,firida:3,Hipodromului:3,Marșa:3,EMCO:3,Colliers:2,Infosys:2,Bell Residence:3,Sibiu:2,Jarvis:3,task:2,santier:2")
        .split(",").map((k) => "keywords=" + encodeURIComponent(k.trim())).join("&");
      const r = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-2&language=ro&smart_format=true&punctuate=true&" + kw,
        {
          method: "POST",
          headers: { Authorization: "Token " + config.deepgramKey, "content-type": mediaType || "audio/webm" },
          body: Buffer.from(data, "base64"),
        }
      );
      const d = await r.json();
      if (!r.ok) throw new Error(`deepgram ${r.status}: ${JSON.stringify(d).slice(0, 160)}`);
      const text = d?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
      res.json({ text });
    } catch (e) {
      console.error("[api/transcribe]", e.message);
      res.status(502).json({ error: "Transcrierea a esuat." });
    }
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

  // Istoricul conversatiei — HUD-ul il incarca la deschidere (continuitate).
  app.get("/api/history", async (req, res) => {
    try {
      const since = Number(req.query.since) || 0;
      res.json({ messages: await getRecent(24, since) });
    } catch (e) {
      console.error("[api/history]", e.message);
      res.json({ messages: [] });
    }
  });

  // Atasament (poza din camera / fisier) → Claude vision → memorie + istoric.
  app.post("/api/upload", async (req, res) => {
    const { filename, mediaType, data } = req.body || {};
    if (!data || !mediaType || !ALLOWED.includes(mediaType)) {
      return res.status(400).json({ error: "Fisier lipsa sau tip nepermis (poze sau PDF)." });
    }
    const name = String(filename || "atasament").replace(/[^\w.\- ]+/g, "_").slice(0, 80);
    try {
      // 1) Salvez fisierul pe volum.
      let savedPath = null;
      try {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        const id = Date.now().toString(36) + Math.round(performance.now()).toString(36);
        const ext = (mediaType.split("/")[1] || "bin").replace("jpeg", "jpg");
        savedPath = path.join(UPLOAD_DIR, `${id}_${name}`.replace(/\s+/g, "_") + (name.includes(".") ? "" : "." + ext));
        fs.writeFileSync(savedPath, Buffer.from(data, "base64"));
      } catch (e) {
        console.error("[upload.save]", e.message); // fara volum, continuam doar cu descrierea
      }
      // 2) Claude vede fisierul.
      const description = await describeFile({ mediaType, data, filename: name });
      // 3) Memorie + istoric (apare in fir si se sincronizeaza pe celelalte device-uri).
      const fact = `Document atasat „${name}”: ${description}`;
      await saveMemory(catFor(name + " " + description), fact, savedPath ? `upload:${savedPath}` : "upload");
      await appendMessage("hud", "user", `📎 ${name}`);
      await appendMessage("hud", "assistant", description);
      res.json({ description });
    } catch (e) {
      console.error("[api/upload]", e.message);
      res.status(502).json({ error: "Nu am putut procesa fisierul." });
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
      const { text: shown, voice } = splitVoice(reply);
      res.json({ reply: shown, voice, confirmId: confirmId || null });
    } catch (e) {
      console.error("[api/chat]", e.message);
      res.status(502).json({ error: "Eroare la nucleu." });
    }
  });

  app.post("/api/confirm", async (req, res) => {
    const { confirmId, yes } = req.body || {};
    if (!confirmId) return res.status(400).json({ error: "confirmId lipsa." });
    try {
      const { text: shown, voice } = splitVoice(await confirmAction(confirmId, !!yes));
      res.json({ reply: shown, voice });
    } catch (e) {
      console.error("[api/confirm]", e.message);
      res.status(502).json({ error: "Eroare la confirmare." });
    }
  });

  app.post("/api/raport", async (req, res) => {
    try {
      const { reply } = await handleMessage("hud", "/raport");
      const { text: shown, voice } = splitVoice(reply);
      res.json({ report: shown, voice });
    } catch (e) {
      console.error("[api/raport]", e.message);
      res.status(502).json({ error: "Nu am putut genera raportul." });
    }
  });

  // Ferestre de rapoarte — motoarele apelate direct (fara istoric/memorie).
  const REPORTS = {
    ceo: ceoHomeReport,
    cash: cashForecastReport,
    risk: riskReport,
    projects: projectIntelReport,
  };
  app.post("/api/report", async (req, res) => {
    const kind = String(req.body?.kind || "").trim();
    const fn = REPORTS[kind];
    if (!fn) return res.status(400).json({ error: "raport necunoscut." });
    if (!hasOperational) return res.status(503).json({ error: "Operational neconectat." });
    try {
      const { text: shown, voice } = splitVoice(await fn());
      res.json({ report: shown, voice });
    } catch (e) {
      console.error("[api/report]", e.message);
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
