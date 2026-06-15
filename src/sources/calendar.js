import { config, hasCalendar } from "../config.js";
import { gapi } from "../google.js";

/**
 * Calendar Google (readonly), prin OAuth-ul comun din google.js.
 * Daca lipsesc credentialele, intoarce null si raportul continua.
 */

/**
 * Evenimentele de azi (de acum pana la miezul noptii).
 * Intoarce array de {time, title} sau null.
 */
export async function getTodayEvents() {
  if (!hasCalendar) return null;
  try {
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
    const d = await gapi(
      `https://www.googleapis.com/calendar/v3/calendars/` +
        `${encodeURIComponent(config.google.calendarId)}/events?${params}`
    );
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

/** Creeaza un eveniment in calendar (cu notificare). startISO/endISO cu timezone RO. */
export async function createEvent({ title, startISO, endISO, description, reminderMinutes }) {
  if (!hasCalendar) throw new Error("Calendar neconfigurat.");
  const body = {
    summary: title,
    description: description || "Creat de JARVIS",
    start: { dateTime: startISO, timeZone: "Europe/Bucharest" },
    end: { dateTime: endISO, timeZone: "Europe/Bucharest" },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: Math.max(0, reminderMinutes ?? 10) }] },
  };
  const d = await gapi(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.google.calendarId)}/events`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
  );
  return { id: d.id, link: d.htmlLink };
}

/** Evenimente care incep in urmatoarele `withinMin` minute (pt notificari). */
export async function getUpcomingEvents(withinMin = 30) {
  if (!hasCalendar) return null;
  try {
    const now = new Date();
    const end = new Date(now.getTime() + withinMin * 60_000);
    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "10",
    });
    const d = await gapi(
      `https://www.googleapis.com/calendar/v3/calendars/` +
        `${encodeURIComponent(config.google.calendarId)}/events?${params}`
    );
    return (d.items || [])
      .filter((ev) => ev.start?.dateTime)
      .map((ev) => ({
        id: ev.id,
        title: ev.summary || "(fara titlu)",
        startISO: ev.start.dateTime,
        time: new Date(ev.start.dateTime).toLocaleTimeString("ro-RO", {
          hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest",
        }),
      }));
  } catch (e) {
    console.error("[calendar.upcoming]", e.message);
    return null;
  }
}
