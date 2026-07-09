import dotenv from "dotenv";
dotenv.config();

function need(key) {
  const v = process.env[key];
  if (!v) {
    console.error(`[config] Lipseste variabila obligatorie: ${key}`);
    process.exit(1);
  }
  return v;
}

export const config = {
  anthropicKey: need("ANTHROPIC_API_KEY"),
  model: process.env.CLAUDE_MODEL || "claude-opus-4-8",

  telegramToken: need("TELEGRAM_BOT_TOKEN"),
  ownerChatId: String(need("TELEGRAM_OWNER_CHAT_ID")),

  operationalMcpUrl: process.env.OPERATIONAL_MCP_URL || "",

  // PIN-ul aplicatiei HUD. Daca lipseste, API-ul /api e oprit.
  appSecret: process.env.APP_SECRET || "",

  weather: {
    lat: process.env.WEATHER_LAT || "45.7983",
    lon: process.env.WEATHER_LON || "24.1256",
    city: process.env.WEATHER_CITY || "Sibiu",
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || "",
    calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
    driveFolder: process.env.GOOGLE_DRIVE_FOLDER || "JARVIS",
  },

  // FAZA 2
  databaseUrl: process.env.DATABASE_URL || "",
  voyageKey: process.env.VOYAGE_API_KEY || "",
  backupDir: process.env.BACKUP_DIR || "/data/backups",

  // FAZA 3
  notifyPollMinutes: Number(process.env.NOTIFY_POLL_MINUTES || 7),
  siteMonitorUrl: process.env.SITE_MONITOR_URL || "",

  // SUPERVISOR AGENT (F1): conexiune read-only la baza Operational
  operationalDbUrl: process.env.OPERATIONAL_DATABASE_URL || "",

  // FAZA V — voce streaming
  deepgramKey: process.env.DEEPGRAM_API_KEY || "",
  elevenKey: process.env.ELEVENLABS_API_KEY || "",
  elevenVoiceId: process.env.ELEVENLABS_VOICE_ID || "",
  sttKeywords: process.env.STT_KEYWORDS || "",

  // OpenAI — voce (TTS + Whisper STT). Preferat, cu fallback pe ElevenLabs/Deepgram.
  openaiKey: process.env.OPENAI_API_KEY || "",
  openaiTtsVoice: process.env.OPENAI_TTS_VOICE || "alloy",
  openaiTtsModel: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
  openaiSttModel: process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe",

  // D3 — rutare strategie (ChatGPT). Implicit OFF → ChatGPT ramane inactiv.
  strategyRouting: process.env.STRATEGY_ROUTING === "on",

  // OBSIDIAN VAULT (firma-vault) — sursa morning briefing.
  // Local daca JARVIS e pe acelasi PC; altfel repo GitHub privat (Railway).
  vault: {
    path: process.env.VAULT_PATH || "",
    repo: process.env.VAULT_REPO || "",          // ex: "beleiadrian85/firma-vault"
    branch: process.env.VAULT_BRANCH || "main",
    token: process.env.VAULT_GH_TOKEN || "",     // PAT cu scope repo (read)
  },

  // Expeditori-cheie pentru clasificarea emailurilor (completabil din env).
  keySenders: (process.env.GMAIL_KEY_SENDERS ||
    "anaf.ro,bancatransilvania.ro,btrl.ro,brd.ro,bcr.ro,infosys,emco,colliers,notar,avocat")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),

  port: process.env.PORT || 3000,
};

export const hasCalendar = !!(
  config.google.clientId &&
  config.google.clientSecret &&
  config.google.refreshToken
);

export const hasGoogle = hasCalendar; // acelasi OAuth, trei scope-uri
export const hasOperational = !!config.operationalMcpUrl;
export const hasVault = !!(config.vault.path || (config.vault.repo && config.vault.token));
export const hasDb = !!config.databaseUrl;

// D3 — strategie activa DOAR daca exista cheie OpenAI SI rutarea e pornita explicit.
export const hasStrategy = !!(config.openaiKey && config.strategyRouting);
