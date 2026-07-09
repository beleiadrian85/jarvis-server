import { callClaude } from "./claude.js";
import { createTask, updateTask } from "./mcp.js";
import { createEvent } from "./sources/calendar.js";
import { audit } from "./audit.js";
import { proposeAction } from "./approvalGate.js";

/**
 * Fluxuri cu confirmare pentru Operational:
 * - Nivel 2: creare task — parsare cu Claude, confirmare Da/Nu, creare directa prin MCP.
 * - Nivel 3: modificare task — intotdeauna confirmare inainte de executie.
 * Actiunile in asteptare se persista prin approvalGate (DB, cu fallback RAM) —
 * supravietuiesc restart-ului (A2/A3).
 */

/** "Jarvis, creeaza task: ..." → structura + confirmare. */
export async function prepareTaskCreate(rawText, channel) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
  let t;
  try {
    const json = await callClaude({
      system:
        `Azi e ${today}. Parseaza cererea de task pentru aplicatia Operational. ` +
        'Raspunzi DOAR cu JSON valid: {"title":"scurt si actionabil","description":"ce trebuie facut, pasi, rezultat asteptat",' +
        '"assignee":"adrian|nelu|dana|mihaela","priority":"critic|ridicat|normal|scazut",' +
        '"deadline":"YYYY-MM-DD","impact":"impact financiar/operational pe scurt sau \\"-\\""}. ' +
        "Reguli: responsabil implicit nelu; prioritate implicita ridicat; termen implicit peste 3 zile; " +
        "termene relative (luni, maine) le transformi in data exacta.",
      messages: [{ role: "user", content: rawText }],
      maxTokens: 500,
    });
    t = JSON.parse(json.replace(/^```json?\s*|\s*```$/g, ""));
  } catch {
    throw new Error("Nu am inteles structura taskului. Reformuleaza.");
  }
  const preview =
    `📋 TASK NOU — confirmi?\n\n` +
    `• Titlu: ${t.title}\n` +
    `• Responsabil: ${t.assignee || "nelu"}\n` +
    `• Prioritate: ${t.priority || "ridicat"}\n` +
    `• Termen: ${t.deadline}\n` +
    `• Impact: ${t.impact || "-"}\n` +
    `• Descriere: ${t.description || "-"}`;
  const id = await proposeAction(channel, "create", t, preview);
  return { id, preview };
}

/** "Pune-mi o intalnire / alarma / eveniment ..." → structura + confirmare. */
export async function prepareCalendarEvent(rawText, channel) {
  const now = new Date();
  const nowStr = now.toLocaleString("sv-SE", { timeZone: "Europe/Bucharest" }); // YYYY-MM-DD HH:mm:ss
  let ev;
  try {
    const json = await callClaude({
      system:
        `Acum e ${nowStr} (ora Romaniei). Extrage un eveniment de calendar din cerere. ` +
        'Raspunzi DOAR cu JSON valid: {"title":"scurt","startISO":"YYYY-MM-DDTHH:MM:SS","durationMin":number,' +
        '"isAlarm":true|false,"valid":true|false,"error":"daca valid=false, de ce"}. ' +
        "Reguli: startISO e ora locala (fara offset). Termene relative (maine, peste o ora, luni la 9) le " +
        "calculezi fata de acum. Daca e o alarma/trezire, isAlarm=true si durationMin=0 (eveniment punctual). " +
        "Eveniment normal: durationMin implicit 60. Daca nu poti deduce data/ora, valid=false.",
      messages: [{ role: "user", content: rawText }],
      maxTokens: 400,
    });
    ev = JSON.parse(json.replace(/^```json?\s*|\s*```$/g, ""));
  } catch {
    throw new Error("Nu am inteles ora/data. Spune-mi mai clar (ex: 'maine la 15 intalnire cu avocatul').");
  }
  if (!ev.valid) throw new Error(ev.error || "Nu am putut deduce data si ora.");

  const start = new Date(ev.startISO);
  const dur = ev.isAlarm ? 0 : (ev.durationMin || 60);
  const endISO = new Date(start.getTime() + Math.max(0, dur) * 60000).toISOString().slice(0, 19);
  const payload = {
    title: ev.title || (ev.isAlarm ? "Alarmă" : "Eveniment"),
    startISO: ev.startISO,
    endISO,
    reminderMinutes: ev.isAlarm ? 0 : 10,
    isAlarm: !!ev.isAlarm,
  };
  const when = start.toLocaleString("ro-RO", {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Bucharest",
  });
  const preview =
    `${ev.isAlarm ? "⏰ ALARMĂ" : "🗓️ EVENIMENT"} — confirmi?\n\n` +
    `• ${payload.title}\n• Când: ${when}` +
    (ev.isAlarm ? "\n• Notificare la ora exactă" : `\n• Durată: ${dur} min · notificare cu 10 min înainte`) +
    `\n\n(Se creează în Google Calendar și apare pe telefon.)`;
  const id = await proposeAction(channel, "calendar", payload, preview);
  return { id, preview };
}

/** Modificare task (Nivel 3) — pregateste si cere confirmare. */
export async function prepareTaskUpdate(args, humanSummary, channel) {
  const preview = `✏️ MODIFICARE TASK (Nivel 3) — confirmi?\n\n${humanSummary}`;
  const id = await proposeAction(channel, "update", args, preview);
  return { id, preview };
}

/** Executa o actiune confirmata. */
export async function executeConfirmed(p) {
  if (p.type === "create") {
    const t = p.payload;
    const result = await createTask({
      title: t.title,
      description: [t.description, t.impact && t.impact !== "-" ? `Impact: ${t.impact}` : ""]
        .filter(Boolean).join("\n"),
      assignee: t.assignee || "nelu",
      created_by: "adrian",
      priority: t.priority || "ridicat",
      deadline: t.deadline,
    });
    await audit("task_creat", t.title, "MCP Operational create_task", true);
    return result;
  }
  if (p.type === "update") {
    const result = await updateTask(p.payload);
    await audit("task_modificat", JSON.stringify(p.payload).slice(0, 300), "MCP Operational update_task", true);
    return result;
  }
  if (p.type === "calendar") {
    const e = p.payload;
    const r = await createEvent(e);
    await audit("calendar_eveniment", `${e.title} @ ${e.startISO}`, "Google Calendar createEvent", true);
    return `${e.isAlarm ? "⏰ Alarmă setată" : "🗓️ Eveniment creat"}: „${e.title}”.\nApare în Google Calendar pe telefon.`;
  }
  throw new Error("Tip de actiune necunoscut.");
}
