import { getWeather } from "./sources/weather.js";
import { listTasks } from "./mcp.js";
import { activeReminders } from "./reminders.js";
import { pool, query } from "./db.js";
import { hasOperational, hasCalendar, hasDb, config } from "./config.js";

/**
 * Date pentru cadranele HUD-ului (vreme + numaratori task-uri + memorie).
 * Totul determinist, fara apel Claude — se poate apela des, ieftin.
 */
export async function getHudData() {
  const [weather, tasksRaw, reminders] = await Promise.all([
    getWeather(),
    hasOperational ? listTasks({ status: "deschise" }).catch(() => null) : Promise.resolve(null),
    activeReminders(50).catch(() => []),
  ]);

  let tasks = null;
  if (tasksRaw !== null) {
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
    tasks = { total: 0, blocate: 0, azi: 0, intarziate: 0, ok: 0 };
    for (const line of tasksRaw.split("\n").filter((l) => l.trim().startsWith("•"))) {
      tasks.total++;
      const status = line.match(/status:\s*(\w+)/)?.[1];
      const deadline = line.match(/termen:\s*([\d-]+)/)?.[1];
      if (status === "blocat") tasks.blocate++;
      else if (deadline && deadline < today) tasks.intarziate++;
      else if (deadline === today) tasks.azi++;
      else tasks.ok++;
    }
  }

  let decisions = 0;
  let memories = 0;
  if (pool) {
    try {
      const r = await query(
        `SELECT (SELECT count(*) FROM decisions)::int AS d,
                (SELECT count(*) FROM memories WHERE deleted_at IS NULL)::int AS m`
      );
      decisions = r[0].d;
      memories = r[0].m;
    } catch {}
  }

  return {
    city: config.weather.city,
    weather, // {now, feels, desc, wind, min, max, rainChance, dayDesc} sau null
    tasks,
    reminders: reminders.length,
    decisions,
    memories,
    sources: {
      weather: !!weather,
      operational: hasOperational,
      calendar: hasCalendar,
      memory: hasDb,
    },
  };
}
