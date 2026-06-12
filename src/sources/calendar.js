import { config, hasCalendar } from "../config.js";

/**
 * Calendar Google prin OAuth refresh token.
 * In Faza 1 e OPTIONAL: daca lipsesc credentialele, intoarce null
 * si raportul continua fara calendar.
 */

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      refresh_token: config.google.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}`);
  const d = await res.json();
  return d.access_token;
}

/**
 * Evenimentele de azi (de acum pana la miezul noptii).
 * Intoarce array de {time, title} sau null.
 */
export async function getTodayEvents() {
  if (!hasCalendar) return null;
  try {
    const token = await getAccessToken();
    const now = new Date();
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "15",
    });
    const url =
      `https://www.googleapis.com/calendar/v3/calendars/` +
      `${encodeURIComponent(config.google.calendarId)}/events?${params}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Calendar API ${res.status}`);
    const d = await res.json();
    return (d.items || []).map((ev) => {
      const start = ev.start?.dateTime || ev.start?.date;
      let time = "toata ziua";
      if (ev.start?.dateTime) {
        time = new Date(start).toLocaleTimeString("ro-RO", {
          hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest",
        });
      }
      return { time, title: ev.summary || "(fara titlu)" };
    });
  } catch (e) {
    console.error("[calendar]", e.message);
    return null;
  }
}
