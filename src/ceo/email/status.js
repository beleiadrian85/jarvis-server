// EMAIL CONNECTION STATUS — sursa de adevar despre conectarea Gmail. ONEST:
// neconectat pana exista refresh_token real. Nu pretinde conectat inainte de OAuth.
import { config } from "../../config.js";

const SCOPES = {
  "https://www.googleapis.com/auth/gmail.readonly": "Citire + căutare email",
  "https://www.googleapis.com/auth/gmail.compose": "Creare drafturi (fără trimitere)",
  "https://www.googleapis.com/auth/drive.readonly": "Citire atașamente din Drive",
};

/** Ce variabile de mediu lipsesc pentru a porni conectarea (fara valori). */
export function missingEnv() {
  const missing = [];
  if (!config.google?.clientId) missing.push("GOOGLE_CLIENT_ID");
  if (!config.google?.clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  return missing;
}

/** Este Gmail conectat efectiv? (client + refresh token reale). */
export function isConnected() {
  return !!(config.google?.clientId && config.google?.refreshToken);
}

/** Statusul complet pentru UI (fara secrete). */
export function emailStatus() {
  const connected = isConnected();
  const missing = missingEnv();
  return {
    provider: "gmail",
    connected,
    account: connected ? (config.google?.account || "cont conectat") : null,
    status: connected ? "Activ" : (missing.length ? "Neconfigurat (admin)" : "Neconectat"),
    mode: "Read-only + Drafturi",
    send_enabled: false, // structural
    missing_env: connected ? [] : missing, // ce trebuie admin sa seteze inainte de wizard
    scopes: connected ? Object.entries(SCOPES).map(([s, label]) => ({ scope: s, label })) : [],
    can_start_wizard: config.emailIntel?.oauth && missing.length === 0,
    note: connected ? "Gmail conectat — read-only + drafturi. Trimiterea e dezactivată." :
      missing.length ? "Adminul trebuie să seteze GOOGLE_CLIENT_ID/SECRET înainte de conectare." :
      "Gmail neconectat. Apasa butonul Conecteaza Gmail pentru autorizare.",
  };
}
