import { config, hasGoogle } from "./config.js";

/**
 * Un singur OAuth Google (refresh token din env), trei scope-uri:
 * calendar.readonly, gmail.readonly + gmail.compose, drive.readonly.
 * Access token-ul se reimprospateaza si se tine in cache pana aproape de expirare.
 */

let cached = { token: null, exp: 0 };

/**
 * Credentialele Google: env (sursa primara) SAU jarvis_state "google:oauth"
 * (setate de Connection Wizard din Command Center — pana la propagarea in env).
 * Aditiv si retro-compatibil: cu env setat, comportamentul e identic.
 */
export async function getGoogleCreds() {
  // clientId + clientSecret sunt suficiente pt. faza de CONSIMTAMANT (buildAuthUrl/
  // exchangeCode). refreshToken e necesar DOAR pt. apelurile API (googleToken) si e
  // marcat separat — altfel primul CONNECT ar fi blocat (ou-si-gaina).
  if (config.google.clientId && config.google.clientSecret) {
    return { clientId: config.google.clientId, clientSecret: config.google.clientSecret, refreshToken: config.google.refreshToken || null, source: "env" };
  }
  try {
    const { getState } = await import("./state.js");
    const st = await getState("google:oauth", null);
    if (st?.client_id && st?.client_secret) {
      return { clientId: st.client_id, clientSecret: st.client_secret, refreshToken: st.refresh_token || null, source: "state" };
    }
  } catch { /* fara stare */ }
  return null;
}

/** Gmail/Calendar conectat efectiv? (client + refresh token, din env SAU state). */
export async function googleConnected() {
  try { const c = await getGoogleCreds(); return !!(c?.clientId && c?.refreshToken); } catch { return false; }
}

export async function googleToken() {
  const creds = await getGoogleCreds();
  if (!creds) throw new Error("Google neconfigurat.");
  if (!creds.refreshToken) throw new Error("Google neconectat (client salvat, dar fara consimtamant/refresh token — apasa CONNECT GOOGLE).");
  if (cached.token && Date.now() < cached.exp - 60_000) return cached.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}`);
  const d = await res.json();
  cached = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return cached.token;
}

// SCOPE-uri MINIME + SIGURE. IMPORTANT (verificat pe docs Google): gmail.compose
// permite si TRIMITEREA de mesaje/drafturi — deci NU e in setul implicit. Implicit =
// read-only pur (tokenul NU poate trimite, crea drafturi sau modifica inboxul).
// Drafturile = OPT-IN explicit (JARVIS_EMAIL_DRAFTS_ENABLED=on) → adauga gmail.compose,
// cu avertisment ca acel scope permite tehnic trimiterea (blocata structural in cod).
export const GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_COMPOSE = "https://www.googleapis.com/auth/gmail.compose"; // permite si send!
export const DRIVE_READONLY = "https://www.googleapis.com/auth/drive.readonly";
export const CALENDAR_READONLY = "https://www.googleapis.com/auth/calendar.readonly";
export const CALENDAR_EVENTS = "https://www.googleapis.com/auth/calendar.events"; // permite scriere

/** Construieste setul de scope-uri dupa politica (minim, read-only implicit). */
export function buildScopes() {
  const s = [GMAIL_READONLY, DRIVE_READONLY];
  if (config.emailIntel?.drafts) s.push(GMAIL_COMPOSE); // drafturi = OPT-IN (permite tehnic send)
  s.push(config.calendarWrite ? CALENDAR_EVENTS : CALENDAR_READONLY);
  return s;
}
/** Politica declarata (pentru validare: tokenul nu trebuie sa depaseasca asta). */
export function policyScopes() { return buildScopes(); }

export async function buildAuthUrl(redirectUri) {
  const creds = await getGoogleCreds();
  const clientId = creds?.clientId || config.google.clientId;
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    // NU include_granted_scopes — ca sa nu acumuleze scope-uri mai largi din consimtaminte vechi.
    scope: buildScopes().join(" "),
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + p.toString();
}

/**
 * Valideaza scope-urile REALE acordate de token fata de politica. Daca tokenul are
 * permisiuni mai largi (ex. gmail.send/modify), semnaleaza — integrarea nu se declara
 * read-only. @returns { ok, granted, extra, can_send, note }
 */
export function validateGrantedScopes(grantedScopeString) {
  const granted = String(grantedScopeString || "").split(/\s+/).filter(Boolean);
  const allowed = new Set([GMAIL_READONLY, GMAIL_COMPOSE, DRIVE_READONLY, CALENDAR_READONLY, CALENDAR_EVENTS,
    "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile", "openid"]);
  const dangerous = granted.filter((g) => /gmail\.(send|modify|insert|settings)|mail\.google\.com/.test(g));
  const extra = granted.filter((g) => !allowed.has(g) && !dangerous.includes(g));
  // gmail.compose acordat DAR drafturile nu sunt opt-in → mai larg decat politica.
  const composeUnexpected = granted.includes(GMAIL_COMPOSE) && !config.emailIntel?.drafts;
  const can_send = granted.includes(GMAIL_COMPOSE) || dangerous.some((g) => /gmail\.send|mail\.google\.com/.test(g));
  return {
    ok: dangerous.length === 0 && !composeUnexpected,
    granted, extra, dangerous, can_send,
    note: dangerous.length ? `Token cu scope-uri periculoase (${dangerous.join(", ")}) — integrarea NU se activeaza pana la remediere.` :
      composeUnexpected ? "Token include gmail.compose (permite trimitere) desi drafturile nu sunt activate — remediaza." :
      granted.includes(GMAIL_COMPOSE) ? "Drafturi activate: scope-ul gmail.compose permite tehnic trimiterea, blocata structural in cod." :
      "Token strict read-only — nu poate trimite/crea drafturi/modifica.",
  };
}

export async function exchangeCode(code, redirectUri) {
  const creds = await getGoogleCreds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds?.clientId || config.google.clientId,
      client_secret: creds?.clientSecret || config.google.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(`token ${res.status}: ${JSON.stringify(d)}`);
  return d; // { access_token, refresh_token, ... }
}

export async function gapi(url, options = {}) {
  const token = await googleToken();
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Google API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
