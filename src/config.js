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

  // C3 — gate pentru conectarea decisionEngine. Implicit OFF → comportament identic.
  useDecisionEngine: process.env.DECISION_ENGINE === "on",

  // C7 — model OpenAI pentru strategie (folosit DOAR cand STRATEGY_ROUTING=on).
  strategyModel: process.env.OPENAI_STRATEGY_MODEL || "gpt-4o",

  // FAZA FINALA — pipeline integrat live. Implicit ON; kill-switch: PIPELINE=off.
  pipeline: process.env.PIPELINE !== "off",

  // P2 — PREDICTION ENGINE (determinist, probabilitati viitoare). Implicit OFF
  // → comportament identic. Cand e "on": rutele de predictie + alerte in morning.
  predictionEngine: process.env.PREDICTION_ENGINE === "on",

  // CODEX Faza 3 — EXECUTIVE BOARD. Ambele implicit OFF → comportament identic
  // (council.js neatins). ENABLED: raportul Board pe ruta "consiliu"/"board".
  // SHADOW: council raspunde ca acum, Boardul analizeaza in fundal DOAR in audit.
  executiveBoard: ["on", "true"].includes(String(process.env.EXECUTIVE_BOARD_ENABLED || "").toLowerCase()),
  executiveBoardShadow: ["on", "true"].includes(String(process.env.EXECUTIVE_BOARD_SHADOW_MODE || "").toLowerCase()),

  // CODEX Faza 4 — OBSERVATION ENGINE (proactiv: observa, NU decide, NU executa).
  // ENABLED implicit OFF → motorul nu ruleaza deloc. SHADOW implicit ON → cand
  // ruleaza, scrie DOAR in audit/jarvis_state. Notificari + convocarea Boardului
  // implicit OFF (etapa ulterioara).
  observationEngine: ["on", "true"].includes(String(process.env.OBSERVATION_ENGINE_ENABLED || "").toLowerCase()),
  observationShadow: !["off", "false"].includes(String(process.env.OBSERVATION_ENGINE_SHADOW_MODE || "").toLowerCase()),
  observationNotifications: ["on", "true"].includes(String(process.env.OBSERVATION_NOTIFICATIONS_ENABLED || "").toLowerCase()),
  observationBoardEscalation: ["on", "true"].includes(String(process.env.OBSERVATION_BOARD_ESCALATION_ENABLED || "").toLowerCase()),
  observationIntervalMinutes: Math.max(30, Number(process.env.OBSERVATION_INTERVAL_MINUTES || 45) || 45),

  // CODEX Faza 4.2 — PROACTIVE CEO PIPELINE (Observation → Triage → Episoade →
  // Board preview → CEO Brief). ENABLED implicit OFF → pipeline-ul nu ruleaza.
  // SHADOW implicit ON → doar audit/jarvis_state. Notificarile si convocarea
  // LIVE a Boardului raman OFF (etape ulterioare, cu aprobare).
  proactiveCeoPipeline: ["on", "true"].includes(String(process.env.PROACTIVE_CEO_PIPELINE_ENABLED || "").toLowerCase()),
  proactiveCeoShadow: !["off", "false"].includes(String(process.env.PROACTIVE_CEO_SHADOW_MODE || "").toLowerCase()),
  proactiveCeoNotifications: ["on", "true"].includes(String(process.env.PROACTIVE_CEO_NOTIFICATIONS_ENABLED || "").toLowerCase()),
  proactiveCeoBoardExecution: ["on", "true"].includes(String(process.env.PROACTIVE_CEO_BOARD_EXECUTION_ENABLED || "").toLowerCase()),

  // CODEX Faza 4.4 — FOUNDER ATTENTION GATE (ce merita atentia lui Adrian si
  // cand). ENABLED implicit OFF; SHADOW implicit ON (doar audit/jarvis_state);
  // notificarile reale raman OFF pana la aprobarea explicita a fondatorului.
  founderAttentionGate: ["on", "true"].includes(String(process.env.FOUNDER_ATTENTION_GATE_ENABLED || "").toLowerCase()),
  founderAttentionShadow: !["off", "false"].includes(String(process.env.FOUNDER_ATTENTION_SHADOW_MODE || "").toLowerCase()),
  founderNotifications: ["on", "true"].includes(String(process.env.FOUNDER_NOTIFICATIONS_ENABLED || "").toLowerCase()),

  // CODEX Faza 4.6 — canale REALE, SEPARATE deliberat (activarea digestului NU
  // poate activa alertele): digestul zilnic si alertele interruptive au flag-uri
  // proprii, ambele implicit OFF. Alertele nu au inca nicio cale de trimitere.
  founderDailyDigest: ["on", "true"].includes(String(process.env.FOUNDER_DAILY_DIGEST_ENABLED || "").toLowerCase()),

  // Master Phase 4 — LEVEL 2 DOAR pentru INFORMATION_REQUEST aprobate explicit
  // (buton APPROVE & SEND). Implicit OFF; restul tipurilor raman LEVEL 1.
  inforeqDelivery: ["on", "true"].includes(String(process.env.CEO_INFOREQUEST_DELIVERY_ENABLED || "").toLowerCase()),
  founderInterruptiveAlerts: ["on", "true"].includes(String(process.env.FOUNDER_INTERRUPTIVE_ALERTS_ENABLED || "").toLowerCase()),

  // NERVOUS SYSTEM V1 (§11, §34) — organismul managerial. ENABLED implicit OFF.
  // TASK_AUTONOMY: "shadow" (implicit — simuleaza, NU creeaza task real) sau
  // "information" (doar cu AUTONOMOUS_INFORMATION_TASKS=true, decis de Adrian).
  // AUTONOMOUS_INFORMATION_TASKS implicit FALSE — nu se activeaza fara Adrian.
  // KILL_SWITCH: CEO_NERVOUS_KILL_SWITCH=on opreste instant orice scriere.
  nervousSystem: ["on", "true"].includes(String(process.env.CEO_NERVOUS_SYSTEM_ENABLED || "").toLowerCase()),
  taskAutonomy: String(process.env.CEO_TASK_AUTONOMY || "shadow").toLowerCase() === "information" ? "information" : "shadow",
  autonomousInfoTasks: ["on", "true"].includes(String(process.env.CEO_AUTONOMOUS_INFORMATION_TASKS_ENABLED || "").toLowerCase()),
  nervousKill: ["on", "true"].includes(String(process.env.CEO_NERVOUS_KILL_SWITCH || "").toLowerCase()),
  nervousDailyLimit: Number(process.env.CEO_NERVOUS_DAILY_LIMIT || 0),
  nervousPerPersonLimit: Number(process.env.CEO_NERVOUS_PER_PERSON_LIMIT || 0),

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
