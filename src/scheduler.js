import cron from "node-cron";
import { pushToOwner } from "./telegram.js";
import { buildMorningReport } from "./morning.js";
import { ceoHomeReport } from "./engines/ceoHome.js";
import { listTasks } from "./mcp.js";
import { hasOperational, config } from "./config.js";
import { parseTaskLines, groupReport, isOverdue } from "./taskparse.js";
import { getState, setState, pruneNotified } from "./state.js";
import { buildBriefing } from "./supervisor/briefing.js";
import { buildSalesReport } from "./supervisor/sales.js";
import { hasOpsDb } from "./supervisor/opsdb.js";
import { audit } from "./audit.js";
import { withCronLock, dayKey, bucketKey } from "./cronLock.js";

/**
 * FAZA 3 — cron 09:00 si 17:00 Europe/Bucharest.
 *   09:00 → raportul complet de dimineata (decizie Adi).
 *   17:00 → verificare task-uri cu DIFF fata de ultimul snapshot;
 *           trimite doar daca exista schimbari sau probleme.
 */
// CANONICAL FINALIZER pentru rapoartele manageriale programate: trec prin acelasi
// lant (Constitutie + Claim Validator + Quality Gate + traceability) inainte de
// pushToOwner. Fara LLM = validare + adapter; loghează violarile (raport determinist).
async function sendManagerial(draft, trigger) {
  let text = String(draft || "");
  try {
    const { finalizeManagerialOutput } = await import("./ceo/managerialFinalizer.js");
    const fin = await finalizeManagerialOutput({ assessment: { decision_context: trigger, unknowns: [] }, draft: text, channel: "telegram", trigger, forFounder: true });
    if (fin.text) text = fin.text;
  } catch { /* best-effort */ }
  if (text.trim()) await pushToOwner(text);
}

export function startScheduler() {
  // SINCRONIZARE OPERATIONAL — din 10 in 10 minute. Reimprospateaza overview-ul TUTUROR
  // functiilor Operational (cache) + re-invata din taskurile finalizate. Read-only pe
  // Operational (scrie doar in jarvis_state). Gated: JARVIS_OPS_SYNC_ENABLED (implicit ON).
  const opsSyncOn = !["off", "false", "0"].includes(String(process.env.JARVIS_OPS_SYNC_ENABLED || "on").toLowerCase());
  if (opsSyncOn && hasOpsDb) {
    const everyMin = Math.max(1, Number(process.env.JARVIS_OPS_SYNC_INTERVAL_MIN || 10));
    cron.schedule(`*/${everyMin} * * * *`, async () => {
      try {
        const { refreshOverview } = await import("./connectors/opsDomains.js");
        const ov = await refreshOverview();
        let learned = null;
        try {
          if (config.taskIntelligence) { const { runLearningCycle } = await import("./ceo/taskIntel/index.js"); learned = await runLearningCycle({}); }
        } catch (e) { console.error("[ops-sync.learn]", e.message); }
        const withData = (ov.domains || []).filter((d) => d.has_data).length;
        console.log(`[ops-sync] domenii=${withData}/${ov.domain_count} indexat=${learned?.indexed ?? "-"} @${new Date().toISOString()}`);
        await audit("ops_sync", "sincronizare Operational (overview + learning)", `domenii=${withData} indexat=${learned?.indexed ?? "-"}`).catch(() => {});
      } catch (e) { console.error("[ops-sync]", e.message); }
    }, { timezone: "Europe/Bucharest" });
    console.log(`[scheduler] ops-sync activ: din ${everyMin} in ${everyMin} min`);
  }

  cron.schedule("0 9 * * *", () => withCronLock("morning_09", dayKey(), async () => {
    // PROACTIVE MODE — CEO Home (Health Score + riscuri) intai: pagina de dimineata.
    if (hasOperational) {
      try {
        await sendManagerial(await ceoHomeReport(), "ceo_home_09");
      } catch (e) { console.error("[cron09-ceo]", e.message); }
    }
    try {
      const report = await buildMorningReport();
      await sendManagerial(report, "morning_report_09");
      await snapshotTasks(); // sincronizam snapshot-ul ca DIFF-ul de la 17:00 sa fie corect
      await audit("cron_raport_09", "CEO Home + raport complet trimise", "scheduler");
    } catch (e) {
      console.error("[cron09]", e.message);
    }
  }).catch((e) => console.error("[cron09.lock]", e.message)), { timezone: "Europe/Bucharest" });

  cron.schedule("0 17 * * *", () => withCronLock("evening_diff_17", dayKey(), async () => {
    try {
      await taskDiffReport();
      await audit("cron_diff_17", "verificare task-uri trimisa", "scheduler");
    } catch (e) {
      console.error("[cron17]", e.message);
    }
  }).catch((e) => console.error("[cron17.lock]", e.message)), { timezone: "Europe/Bucharest" });

  // Igienizare zilnica a tabelului notified.
  cron.schedule("30 3 * * *", () => pruneNotified(14).catch(() => {}), {
    timezone: "Europe/Bucharest",
  });

  // TASK INTELLIGENCE — ciclu zilnic de invatare din task-urile finalizate (read-only,
  // idempotent). Doar observa/invata; nu executa/modifica. Gated.
  if (config.taskIntelligence) {
    cron.schedule("40 4 * * *", async () => {
      try {
        const { runLearningCycle } = await import("./ceo/taskIntel/index.js");
        const r = await runLearningCycle({});
        await audit("taskintel_daily", `indexed=${r.indexed} knowledge=${r.knowledge_built} patterns=${r.patterns}`, "", true);
      } catch (e) { console.error("[taskintel]", e.message); }
    }, { timezone: "Europe/Bucharest" });
    console.log("[taskintel] ciclu de invatare zilnic 04:40 activ (read-only)");
  }

  // PERSISTENT WATCHER legislativ/web (worker pe scheduler, NU bucla model). La
  // fiecare 3h in zile lucratoare; inregistreaza health; produce notificari. Gated.
  if (config.legislationMonitoring || config.webMonitoring) {
    cron.schedule("15 */3 * * 1-5", () => withCronLock("monitor_watch", bucketKey(180), async () => {
      try {
        const { runWatch } = await import("./ceo/monitor/worker.js");
        const r = await runWatch({});
        await audit("monitor_watch", `checked=${r.checked} material=${r.material} notified=${r.notified}`, (r.errors || []).join("; ").slice(0, 300), true);
      } catch (e) { console.error("[monitor.watch]", e.message); }
    }).catch(() => {}), { timezone: "Europe/Bucharest" });
    console.log("[monitor] legislation/web watcher activ (la 3h, L-V)");
    // Escaladare notificari critice nevazute (la fiecare ora).
    cron.schedule("45 * * * *", () => withCronLock("escalate_stale", bucketKey(60), async () => {
      try { const { escalateStale } = await import("./ceo/notifications/center.js"); await escalateStale({}); } catch { /* best-effort */ }
    }).catch(() => {}), { timezone: "Europe/Bucharest" });
  }

  // SUPERVISOR AGENT F1 — briefing zilnic 07:30 (doar citire + recomandari).
  if (hasOpsDb) {
    cron.schedule("30 7 * * *", () => withCronLock("briefing_0730", dayKey(), async () => {
      try {
        await sendManagerial(await buildBriefing(), "briefing_0730");
      } catch (e) { console.error("[supervisor]", e.message); }
      try {
        await sendManagerial(await buildSalesReport(), "sales_report_0730");
      } catch (e) { console.error("[sales]", e.message); }
    }).catch((e) => console.error("[briefing.lock]", e.message)), { timezone: "Europe/Bucharest" });
    console.log("[supervisor] briefing + raport vânzări zilnic 07:30 activ (F1, read-only)");
  }

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
