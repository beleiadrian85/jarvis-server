import cron from "node-cron";
import { pushToOwner } from "./telegram.js";
import { buildMorningReport } from "./morning.js";
import { listTasks } from "./mcp.js";
import { hasOperational } from "./config.js";
import { parseTaskLines, groupReport, isOverdue } from "./taskparse.js";
import { getState, setState, pruneNotified } from "./state.js";
import { audit } from "./audit.js";

/**
 * FAZA 3 — cron 09:00 si 17:00 Europe/Bucharest.
 *   09:00 → raportul complet de dimineata (decizie Adi).
 *   17:00 → verificare task-uri cu DIFF fata de ultimul snapshot;
 *           trimite doar daca exista schimbari sau probleme.
 */
export function startScheduler() {
  cron.schedule("0 9 * * *", async () => {
    try {
      const report = await buildMorningReport();
      await pushToOwner(report);
      await snapshotTasks(); // sincronizam snapshot-ul ca DIFF-ul de la 17:00 sa fie corect
      await audit("cron_raport_09", "raport complet trimis", "scheduler");
    } catch (e) {
      console.error("[cron09]", e.message);
    }
  }, { timezone: "Europe/Bucharest" });

  cron.schedule("0 17 * * *", async () => {
    try {
      await taskDiffReport();
      await audit("cron_diff_17", "verificare task-uri trimisa", "scheduler");
    } catch (e) {
      console.error("[cron17]", e.message);
    }
  }, { timezone: "Europe/Bucharest" });

  // Igienizare zilnica a tabelului notified.
  cron.schedule("30 3 * * *", () => pruneNotified(14).catch(() => {}), {
    timezone: "Europe/Bucharest",
  });

  console.log("[scheduler] activ: 09:00 raport complet, 17:00 DIFF task-uri (Europe/Bucharest)");
}

/** Salveaza starea curenta a task-urilor in jarvis_state (pt DIFF). */
async function snapshotTasks() {
  if (!hasOperational) return;
  const cur = parseTaskLines(await listTasks({ status: "deschise" }).catch(() => ""));
  const map = {};
  for (const t of cur) map[t.id] = { status: t.status, deadline: t.deadline, title: t.title };
  await setState("task_snapshot", map);
}

async function taskDiffReport() {
  if (!hasOperational) return;
  const cur = parseTaskLines(await listTasks({ status: "deschise" }).catch(() => ""));
  const prev = (await getState("task_snapshot", {})) || {};

  const changes = [];
  const curMap = {};
  for (const t of cur) {
    curMap[t.id] = { status: t.status, deadline: t.deadline, title: t.title };
    const p = prev[t.id];
    if (!p) {
      changes.push(`🆕 ${t.title} (${t.assignee || "?"}, ${t.status})`);
    } else {
      if (p.status !== t.status) changes.push(`🔄 ${t.title}: ${p.status} → ${t.status}`);
      if (!isOverdue(p.deadline) && isOverdue(t.deadline)) {
        changes.push(`⏰ ${t.title} a intrat în întârziere (termen ${t.deadline})`);
      }
    }
  }
  for (const id in prev) {
    if (!curMap[id]) changes.push(`✅ „${prev[id].title}” s-a închis`);
  }

  await setState("task_snapshot", curMap);

  const hasProblems = cur.some((t) => t.status === "blocat" || isOverdue(t.deadline));
  if (!changes.length && !hasProblems) {
    await pushToOwner("🕔 Verificare task-uri (17:00): Nimic nou.");
    return;
  }

  let msg = "🕔 Verificare task-uri (17:00)\n\n";
  if (changes.length) msg += "Schimbări față de dimineață:\n" + changes.join("\n") + "\n\n";
  msg += groupReport(cur);
  await pushToOwner(msg);
}
