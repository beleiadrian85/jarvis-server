import { getWeather } from "./sources/weather.js";
import { getTodayEvents } from "./sources/calendar.js";
import { getImportantEmails, getUnansweredSent } from "./sources/gmail.js";
import { listTasks } from "./mcp.js";
import { activeReminders, formatReminders } from "./reminders.js";
import { hasOperational } from "./config.js";
import { callClaude } from "./claude.js";

/**
 * Raportul de dimineata extins (constitutie 2.5).
 * Toate sursele se aduna determinist (fara tokeni); UN singur apel Claude
 * face sinteza finala — consum predictibil (regula 7).
 */

function groupTasks(rawLines) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
  const groups = { blocate: [], azi: [], intarziate: [], rest: 0 };
  for (const line of rawLines) {
    const status = line.match(/status:\s*(\w+)/)?.[1];
    const deadline = line.match(/termen:\s*([\d-]+)/)?.[1];
    if (status === "blocat") groups.blocate.push(line);
    else if (deadline && deadline < today) groups.intarziate.push(line);
    else if (deadline === today) groups.azi.push(line);
    else groups.rest++;
  }
  return groups;
}

export async function buildMorningReport() {
  const [weather, events, emails, unanswered, tasksRaw, reminders] = await Promise.all([
    getWeather(),
    getTodayEvents(),
    getImportantEmails(),
    getUnansweredSent(),
    hasOperational ? listTasks({ status: "deschise" }).catch((e) => {
      console.error("[morning.tasks]", e.message);
      return null;
    }) : Promise.resolve(null),
    activeReminders(8),
  ]);

  const parts = [];

  // Vreme
  if (weather) {
    parts.push(
      `VREME ${weather.city}: acum ${weather.now}°C (resimtit ${weather.feels}°C), ${weather.desc}, ` +
      `vant ${weather.wind} km/h. Azi: min ${weather.min}°C / max ${weather.max}°C, ` +
      `${weather.dayDesc}, sansa ploaie ${weather.rainChance}%.`
    );
  } else parts.push("VREME: indisponibila.");

  // Calendar
  if (events === null) parts.push("CALENDAR: neconfigurat.");
  else if (!events.length) parts.push("CALENDAR: nimic programat azi.");
  else parts.push("CALENDAR azi:\n" + events.map((e) => `  ${e.time} — ${e.title}`).join("\n"));

  // Emailuri
  if (emails === null) parts.push("EMAIL: neconfigurat.");
  else if (!emails.length) parts.push("EMAIL: niciun email important nou.");
  else {
    parts.push(
      "EMAILURI IMPORTANTE (ultimele 2 zile):\n" +
        emails.map((e) => `  • „${e.subject}” — ${e.from.replace(/<.*>/, "").trim()} — ${e.snippet}`).join("\n")
    );
  }
  if (unanswered && unanswered.length) {
    parts.push(
      "TRIMISE FARA RASPUNS >3 zile lucratoare:\n" +
        unanswered.map((u) => `  • „${u.subject}” catre ${u.to} (${u.days} zile)`).join("\n")
    );
  }

  // Task-uri Operational, grupate determinist
  if (tasksRaw === null) parts.push("OPERATIONAL: neconfigurat sau indisponibil.");
  else {
    const lines = tasksRaw.split("\n").filter((l) => l.trim().startsWith("•"));
    const g = groupTasks(lines);
    const sec = [];
    if (g.blocate.length) sec.push("🔴 BLOCATE:\n" + g.blocate.join("\n"));
    if (g.azi.length) sec.push("🟡 SCADENTE AZI:\n" + g.azi.join("\n"));
    if (g.intarziate.length) sec.push("🟠 INTARZIATE:\n" + g.intarziate.join("\n"));
    sec.push(`🟢 Restul: ${g.rest} task-uri in lucru, fara probleme.`);
    parts.push("STATUS OPERATIONAL:\n" + sec.join("\n"));
  }

  // Termene critice din reminders
  if (reminders.length) {
    parts.push("TERMENE CRITICE / NEREZOLVATE (registrul reminders):\n" + formatReminders(reminders));
  } else parts.push("TERMENE CRITICE: nimic in registru.");

  // Cash-flow: placeholder pana la Faza 5 (constitutie)
  parts.push("CASH-FLOW / CREDITE: —");

  const raw = parts.join("\n\n");
  const now = new Date();
  const dateStr = now.toLocaleDateString("ro-RO", {
    weekday: "long", day: "numeric", month: "long",
    timeZone: "Europe/Bucharest",
  });

  const report = await callClaude({
    system:
      "Esti JARVIS, asistentul operational al lui Adi — dezvoltator imobiliar in Sibiu (PROFI CONCEPT). " +
      "Scrii raportul de dimineata in romana, ton direct si pragmatic, fara politeturi.\n\n" +
      "STRUCTURA OBLIGATORIE (in aceasta ordine):\n" +
      "1) Salut + data (o linie).\n" +
      "2) Vremea (1 linie + recomandare practica doar daca e relevant).\n" +
      "3) Calendarul zilei.\n" +
      "4) Emailuri importante nerezolvate + trimise fara raspuns (daca exista).\n" +
      "5) Status Operational GRUPAT — pastreaza EXACT gruparea primita: " +
      "🔴 Blocate (detaliat: responsabil, termen, ultim update), 🟡 Scadente azi (detaliat), " +
      "🟠 Intarziate (detaliat), 🟢 Restul (doar numarul). Nu inventa grupuri goale.\n" +
      "6) Termene critice din registru (daca exista).\n" +
      "7) Sectiunea 'TOP 5 PRIORITATI AZI' — NUCLEUL raportului.\n" +
      "8) Linia 'Cash-flow: —' (placeholder pana la Faza 5).\n\n" +
      "REGULI TOP 5 PRIORITATI:\n" +
      "- Ordonezi dupa ierarhia stricta de impact: (1) cash-flow, (2) vanzari, (3) finantari, " +
      "(4) executie, (5) juridic. Impact pe criteriu superior bate criteriile inferioare. " +
      "Termenele apropiate urca prioritatea in cadrul aceluiasi criteriu.\n" +
      "- MAXIM 5. Nu inventezi ca sa umpli. Selectezi din task-uri, emailuri, calendar, termene critice.\n" +
      "- Format: 'N. [CRITERIU] Actiune concreta — de ce azi'. CRITERIU ∈ CASH-FLOW/VANZARI/FINANTARE/EXECUTIE/JURIDIC.\n" +
      "- Element cu impact neevaluabil → la final cu '(impact neclar)'. Nu ghici.\n\n" +
      "Sectiunile 'neconfigurat' le mentionezi intr-un cuvant. Fara introduceri. Compact, citibil in 30 secunde.",
    messages: [{
      role: "user",
      content: `Data de azi: ${dateStr}.\n\nDate brute:\n\n${raw}\n\nScrie raportul de dimineata.`,
    }],
    maxTokens: 1400,
  });

  return report;
}
