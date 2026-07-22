import { config, hasOperational, hasGoogle, hasCalendar, hasDb } from "./config.js";
import { pushToOwner } from "./telegram.js";
import { listTasks } from "./mcp.js";
import { parseTaskLines, isOverdue } from "./taskparse.js";
import { getImportantEmails } from "./sources/gmail.js";
import { getUpcomingEvents } from "./sources/calendar.js";
import { activeReminders } from "./reminders.js";
import { getState, setState, wasNotified, markNotified } from "./state.js";

/**
 * FAZA 3 — notificari imediate (polling la NOTIFY_POLL_MINUTES).
 * Pe canalul Telegram, doar proprietarul. Dedup prin tabelul `notified`.
 * La prima rulare "seed": memoreaza starea curenta fara sa trimita nimic.
 */
export function startNotifier() {
  if (!hasDb) {
    console.log("[notifier] oprit (fara DB nu pot face dedup).");
    return;
  }
  const ms = Math.max(3, config.notifyPollMinutes) * 60_000;
  setTimeout(runPoll, 30_000); // prima verificare la 30s dupa pornire
  setInterval(runPoll, ms);
  console.log(`[notifier] activ: poll la ${config.notifyPollMinutes} min`);
}

async function runPoll() {
  try {
    await checkTasks();
    await checkEmails();
    await checkDeadlines();
    await checkMeetings();
    await checkCeoTaskUpdates();
  } catch (e) {
    console.error("[notifier]", e.message);
  }
}

// §2/§3 — detectare reactiva a schimbarilor pe task-urile CEO (reutilizeaza
// acest poll; gated pe nervous). La schimbare → procesare reactiva imediata.
async function checkCeoTaskUpdates() {
  if (!config.nervousSystem) return;
  try {
    const { pollCeoTaskUpdates } = await import("./ceo/nervous/reactiveWatch.js");
    const r = await pollCeoTaskUpdates();
    if (r.changed?.length) console.log(`[reactive] ${r.changed.length} task-uri CEO schimbate → ciclu reactiv (${r.triggered ? "declansat" : "esuat"})`);
  } catch (e) { console.error("[reactive]", e.message); }
}

// Task nou atribuit lui Adrian + task devenit intarziat.
async function checkTasks() {
  if (!hasOperational) return;
  const cur = parseTaskLines(await listTasks({ status: "deschise" }).catch(() => ""));
  const known = await getState("known_tasks", null);

  if (known === null) {
    // seed: nu trimitem nimic pentru ce exista deja
    for (const t of cur) if (isOverdue(t.deadline)) await markNotified(`overdue:${t.id}`);
    await setState("known_tasks", cur.map((t) => t.id));
    return;
  }

  const knownSet = new Set(known);
  for (const t of cur) {
    if (!knownSet.has(t.id) && t.assignee.toLowerCase() === "adrian") {
      await pushToOwner(`📥 Task nou atribuit ție: „${t.title}” (${t.priority}, termen ${t.deadline || "-"}).`);
    }
    if (isOverdue(t.deadline) && t.status !== "rezolvat" && !(await wasNotified(`overdue:${t.id}`))) {
      await pushToOwner(`⏰ Task întârziat: „${t.title}” (termen ${t.deadline}, responsabil ${t.assignee}).`);
      await markNotified(`overdue:${t.id}`);
    }
  }
  await setState("known_tasks", cur.map((t) => t.id));
}

// Email important nou (rule-based, vezi gmail.js).
async function checkEmails() {
  if (!hasGoogle) return;
  const emails = await getImportantEmails();
  if (!emails) return;
  const seen = await getState("seen_emails", null);

  if (seen === null) {
    await setState("seen_emails", emails.map((e) => e.id));
    return;
  }
  const seenSet = new Set(seen);
  for (const e of emails) {
    if (!seenSet.has(e.id) && !(await wasNotified(`email:${e.id}`))) {
      await pushToOwner(`📧 Email important: „${e.subject}” — ${e.from.replace(/<.*>/, "").trim()}.`);
      await markNotified(`email:${e.id}`);
    }
  }
  await setState("seen_emails", emails.map((e) => e.id));
}

// Termen critic din reminders in urmatoarele 48h.
async function checkDeadlines() {
  const rows = await activeReminders(50).catch(() => []);
  const now = Date.now();
  const in48h = now + 48 * 3600_000;
  for (const r of rows) {
    if (!r.due_date) continue;
    const due = new Date(r.due_date).getTime();
    if (due >= now && due <= in48h && !(await wasNotified(`deadline48:${r.id}`))) {
      await pushToOwner(`📌 Termen critic în <48h: ${r.title} (scadență ${new Date(r.due_date).toLocaleDateString("ro-RO")}).`);
      await markNotified(`deadline48:${r.id}`);
    }
  }
}

// Intalnire in urmatoarele 30 min (doar cu calendar).
async function checkMeetings() {
  if (!hasCalendar) return;
  const events = await getUpcomingEvents(30);
  if (!events) return;
  for (const ev of events) {
    const key = `meeting:${ev.id}:${ev.startISO.slice(0, 16)}`;
    if (!(await wasNotified(key))) {
      await pushToOwner(`🗓️ În 30 min: ${ev.title} (la ${ev.time}).`);
      await markNotified(key);
    }
  }
}
