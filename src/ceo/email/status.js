// EMAIL CONNECTION STATUS — sursa de adevar despre conectarea Gmail. ONEST:
// neconectat pana exista refresh_token real. Nu pretinde conectat inainte de OAuth.
import { config } from "../../config.js";
import { buildScopes, GMAIL_COMPOSE, getGoogleCreds } from "../../google.js";

const SCOPE_LABELS = {
  "https://www.googleapis.com/auth/gmail.readonly": "Citire + căutare email (read-only)",
  "https://www.googleapis.com/auth/gmail.compose": "Creare drafturi (⚠ scope permite tehnic și trimiterea — blocată în cod)",
  "https://www.googleapis.com/auth/drive.readonly": "Citire atașamente din Drive",
  "https://www.googleapis.com/auth/calendar.readonly": "Citire calendar",
  "https://www.googleapis.com/auth/calendar.events": "Scriere evenimente calendar",
};

/** Ce variabile de mediu lipsesc pentru a porni conectarea (fara valori). */
export function missingEnv() {
  const missing = [];
  if (!config.google?.clientId) missing.push("GOOGLE_CLIENT_ID");
  if (!config.google?.clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  return missing;
}

/** Este Gmail conectat efectiv? (client + refresh token reale — din env SAU state). */
export async function isConnected() {
  try { const c = await getGoogleCreds(); return !!(c?.clientId && c?.refreshToken); } catch { return false; }
}

/** Statusul complet pentru UI (fara secrete). ASYNC — verifica si starea. */
export async function emailStatus() {
  const connected = await isConnected();
  const missing = missingEnv();
  return {
    provider: "gmail",
    connected,
    account: connected ? (config.google?.account || "cont conectat") : null,
    status: connected ? "Activ" : (missing.length ? "Neconfigurat (admin)" : "Neconectat"),
    mode: config.emailIntel?.drafts ? "Read-only + Drafturi (opt-in)" : "Read-only (fără drafturi)",
    send_enabled: false, // structural
    drafts_scope_optin: !!config.emailIntel?.drafts, // gmail.compose adaugat doar la opt-in
    requested_scopes: buildScopes().map((s) => ({ scope: s, label: SCOPE_LABELS[s] || s })),
    compose_caveat: config.emailIntel?.drafts ? "Drafturile cer scope-ul gmail.compose, care permite tehnic trimiterea — blocată structural în cod." : null,
    missing_env: connected ? [] : missing, // ce trebuie admin sa seteze inainte de wizard
    scopes: connected ? (config.google?.grantedScopes || buildScopes()).map((s) => ({ scope: s, label: SCOPE_LABELS[s] || s })) : [],
    scope_warning: connected ? (config.google?.scopeWarning || null) : null,
    can_start_wizard: config.emailIntel?.oauth && missing.length === 0,
    note: connected ? "Gmail conectat — read-only + drafturi. Trimiterea e dezactivată." :
      missing.length ? "Adminul trebuie să seteze GOOGLE_CLIENT_ID/SECRET înainte de conectare." :
      "Gmail neconectat. Apasa butonul Conecteaza Gmail pentru autorizare.",
  };
}
