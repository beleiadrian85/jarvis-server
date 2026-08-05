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
  app.get("/auth/google", authLimiter, async (req, res) => {
    if (isLockedOut(req.ip)) return res.status(429).send("Prea multe incercari. Reincearca peste 15 minute.");
    if (req.query.k !== config.appSecret) {
      noteAuthFail(req.ip);
      return res.status(401).send("PIN gresit. Adauga ?k=PIN la link.");
    }
    clearAuthFail(req.ip);
    // Wizard (Master Phase 3): credentialele pot veni si din jarvis_state.
    const { getGoogleCreds } = await import("./google.js");
    const creds = await getGoogleCreds().catch(() => null);
    const hasClient = config.google.clientId || creds?.clientId;
    if (!hasClient) {
      return res.status(503).send("Lipsesc credentialele Google. Foloseste CONNECT GOOGLE din Command Center (/ceo.html).");
    }
    const redirectUri = `https://${req.get("host")}/auth/google/callback`;
    res.redirect(await buildAuthUrl(redirectUri));
  });

  app.get("/auth/google/callback", authLimiter, async (req, res) => {
    if (req.query.error) return res.status(400).send("Refuzat: " + req.query.error);
    if (!req.query.code) return res.status(400).send("Lipseste codul.");
    try {
      const redirectUri = `https://${req.get("host")}/auth/google/callback`;
      const tok = await exchangeCode(req.query.code, redirectUri);
      // VALIDARE SCOPE-uri REALE: daca tokenul poate trimite/modifica (mai larg decat
      // politica read-only), NU declaram conexiunea sigura — semnalam.
      const { validateGrantedScopes } = await import("./google.js");
      const scopeCheck = validateGrantedScopes(tok.scope);
      if (tok.refresh_token) {
        // S1: nu logam NICIODATA refresh token-ul (secret in logurile cloud).
        console.log("[google] OAuth reusit — refresh token obtinut (nelogat). Scope check:", scopeCheck.ok ? "OK" : "WARN");
        try {
          const { getState: gs, setState: ss } = await import("./state.js");
          const prevg = await gs("google:oauth", {}) || {};
          await ss("google:oauth", { ...prevg, granted_scopes: scopeCheck.granted, scope_ok: scopeCheck.ok, scope_note: scopeCheck.note, can_send: scopeCheck.can_send });
        } catch { /* best-effort */ }
        if (scopeCheck.dangerous.length) {
          return res.send(`<h2 style='font-family:sans-serif'>⚠️ Scope-uri prea largi</h2><p>Tokenul include permisiuni de trimitere/modificare (${scopeCheck.dangerous.join(", ")}). Integrarea NU se activeaza. Regenereaza OAuth clientul cu scope-urile read-only si reconecteaza.</p>`);
        }
        // Wizard: salveaza in jarvis_state + propaga AUTOMAT in env Railway + redeploy.
        try {
          const { getState, setState } = await import("./state.js");
          const prev = await getState("google:oauth", {}) || {};
          await setState("google:oauth", { ...prev, refresh_token: tok.refresh_token, connected_at: new Date().toISOString() });
          const { upsertVariables, redeployService, railwayApiAvailable } = await import("./connectors/railwayApi.js");
          if (railwayApiAvailable() && prev.client_id && prev.client_secret) {
            await upsertVariables({
              GOOGLE_CLIENT_ID: prev.client_id,
              GOOGLE_CLIENT_SECRET: prev.client_secret,
              GOOGLE_REFRESH_TOKEN: tok.refresh_token,
            });
            await redeployService();
            return res.send("<h2 style='font-family:sans-serif'>✅ Google conectat COMPLET.</h2><p>Variabilele au fost setate automat în Railway; serverul se redeployează (~2 min). Gmail + Calendar devin READ-ONLY active. Poți închide fila.</p>");
          }
          res.send("<h2 style='font-family:sans-serif'>✅ Google conectat (token salvat).</h2><p>Funcționează imediat din stare; propagarea în env se face la următorul deploy.</p>");
        } catch (e) {
          console.error("[google.persist]", e.message);
          res.send("<h2 style='font-family:sans-serif'>✅ Token obținut, ⚠️ persistarea a eșuat: " + e.message + "</h2>");
        }
      } else {
        res.send("<h2 style='font-family:sans-serif'>⚠️ Fără refresh token.</h2><p>Revocă accesul aplicației în contul Google (myaccount.google.com/permissions) și reia CONNECT GOOGLE.</p>");
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

  // OPERATIONAL — harta functiilor (schema): ce tabele/domenii exista in Operational
  // si care sunt deja citite de JARVIS. Read-only (opsdb e read-only), doar metadate
  // (nume tabele + coloane + nr. randuri), NU date. Pentru sincronizarea completa.
  app.get("/api/ops-schema", async (_req, res) => {
    try {
      const { opsQuery, hasOpsDb } = await import("./supervisor/opsdb.js");
      if (!hasOpsDb) return res.status(503).json({ error: "OPERATIONAL_DATABASE_URL nesetat." });
      const tables = await opsQuery(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
      const out = [];
      for (const t of tables) {
        const cols = await opsQuery(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [t.table_name]);
        let n = null; try { n = (await opsQuery(`SELECT count(*)::int c FROM "${t.table_name}"`))[0].c; } catch { /* view/perm */ }
        out.push({ table: t.table_name, rows: n, columns: cols.map((c) => `${c.column_name}:${c.data_type}`) });
      }
      res.json({ count: out.length, tables: out });
    } catch (e) { res.status(500).json({ error: e.message }); }
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

  // Producator determinist de envelope pentru cazul pipeline (extrase vechi). Din
  // VERDICTUL structurat (nu din proza): AUTO search + INFORMATION_REQUIRED locatie.
  async function buildPipelineEnvelope(text, convId) {
    const { diagnoseSourcePipeline } = await import("./ceo/sourcePipeline.js");
    const { buildEnvelope } = await import("./ceo/actions/envelope.js");
    const diag = await diagnoseSourcePipeline({ text }).catch(() => null);
    if (!diag) return null;
    const actions = [
      { intent: "search_sources", action_kind: "search_source", title: "Verifica sursele accesibile",
        summary: `Verificate: ${diag.searched_sources.join(", ")}.`, tasks_only: true, permission_basis: "role_allowed", reversibility: "reversible", risk_level: "low" },
    ];
    const info = [];
    if (diag.human_input_needed || ["HUMAN_INPUT_REQUIRED", "PIPELINE_NOT_OBSERVED"].includes(diag.verdict)) {
      info.push({ intent: "ask_upload_location", title: "In ce interfata ai incarcat extrasele?",
        alternatives: [{ label: "Operational" }, { label: "Google Drive" }, { label: "Email" }, { label: "Alta locatie" }] });
    }
    const titleMap = { PIPELINE_NOT_OBSERVED: "Extrasele nu sunt inca observabile in sursele verificate", HUMAN_INPUT_REQUIRED: "Extrasele nu sunt inca observabile — am nevoie de locatia uploadului" };
    return buildEnvelope({
      narrative: `${titleMap[diag.verdict] || "Diagnostic pipeline"}. ${diag.confirmed_failures.length ? "" : "Nu exista dovada ca uploadul a esuat — doar ca nu sunt observabile."}`,
      situation: text, facts: diag.observed_events, unknowns: diag.missing_observations,
      actions, information_requests: info,
    }, { user_id: "adrian", conversation_id: convId });
  }

  app.post("/api/chat", async (req, res) => {
    const text = String(req.body?.text ?? extractLastUser(req.body?.messages) ?? "").trim();
    if (!text) return res.status(400).json({ error: "text lipsa." });
    const convId = String(req.body?.conversation_id || "hud");
    try {
      // ACTION CARDS: raspuns "1"/"2"/"3" = apasare pe butonul unui card activ
      // (fallback numerotat), interpretat DOAR daca exista exact un card compatibil.
      if (config.actionCards && /^\s*[1-9]\s*$/.test(text)) {
        const { resolveNumberedChoice } = await import("./ceo/actions/envelope.js");
        const r = await resolveNumberedChoice(text, { user_id: "adrian", conversation_id: convId });
        if (r.matched) {
          const { executeAction, renderExecuted } = await import("./ceo/actions/executor.js");
          const ex = await executeAction({ token: r.token, card_id: r.card_id, action_id: r.action_id, user_id: "adrian", conversation_id: convId, choice_label: r.choice_label });
          const msg = ex.ok && ex.card ? renderExecuted(ex.card) : (ex.reason || "Nu am putut executa.");
          return res.json({ reply: msg, executed: ex.ok, receipt: ex.receipt || null, action_cards: [] });
        }
      }

      const { reply, confirmId } = await handleMessage("hud", text);
      let responseText = reply, action_cards = [], rendering_hints = null, execution_receipts = [];

      // Producator determinist (keyed pe INTENTIA intrebarii, nu pe proza raspunsului):
      // intrebare de tip pipeline → envelope cu INFORMATION_REQUIRED + AUTO search.
      if (config.actionCards) {
        try {
          const { asksPipeline } = await import("./ceo/sourcePipeline.js");
          if (asksPipeline(text)) {
            const env = await buildPipelineEnvelope(text, convId);
            if (env) {
              const { finalizeEnvelope } = await import("./ceo/actions/envelope.js");
              const fin = await finalizeEnvelope({ envelope: env, ctx: { user_id: "adrian", conversation_id: convId }, channel: "chat" });
              responseText = fin.message || reply;
              action_cards = fin.action_cards; rendering_hints = fin.rendering_hints; execution_receipts = fin.execution_receipts;
            }
          }
        } catch (e) { console.error("[chat.cards]", e.message); }
      }

      const { text: shown, voice } = splitVoice(responseText);
      res.json({ reply: shown, voice, confirmId: confirmId || null, action_cards, rendering_hints, execution_receipts });
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
