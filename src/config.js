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
  },

  port: process.env.PORT || 3000,
};

export const hasCalendar = !!(
  config.google.clientId &&
  config.google.clientSecret &&
  config.google.refreshToken
);

export const hasOperational = !!config.operationalMcpUrl;
