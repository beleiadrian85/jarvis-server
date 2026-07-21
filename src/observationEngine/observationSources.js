// OBSERVATION ENGINE — colectarea starii lumii ("world"). REUTILIZEAZA
// integral sursele existente (predictionState, cashForecast, predictionEngine,
// healthScore, supervisor, memory, reminders, jarvis_state, audit_log read-only).
// Totul best-effort: o sursa picata = marcata lipsa, NU rulare esuata.
// READ-ONLY total: zero scrieri in Operational/Gmail/Calendar.
import { pool, query } from "../db.js";
import { buildPredictionState } from "../predictionState.js";
import { buildForecast } from "../engines/cashForecast.js";
import { predict } from "../predictionEngine.js";
import { computeHealth } from "../engines/healthScore.js";
import { listDecisions } from "../memory.js";
import { activeReminders } from "../reminders.js";
import { collectState } from "../supervisor/collector.js";
import { runDetectors } from "../supervisor/detectors.js";
import { getState } from "../state.js";

function groupTasks(tasks = [], asOf) {
  const g = { blocate: 0, azi: 0, intarziate: 0, ok: 0 };
  for (const t of tasks) {
    if (t.status === "blocat") g.blocate++;
    else if (t.deadline && t.deadline < asOf) g.intarziate++;
    else if (t.deadline === asOf) g.azi++;
    else g.ok++;
  }
  return g;
}

/** Colecteaza "world" pentru o rulare. optiuni: { now } (injectabil in teste). */
export async function collectWorld({ now } = {}) {
  const nowIso = now || new Date().toISOString();
  const missing = [];

  const state = await buildPredictionState().catch(() => null);
  if (!state) missing.push("predictionState (Operational)");
  const asOf = state?.asOf || nowIso.slice(0, 10);
  const obligations = state?.obligations || [];
  const tasks = state?.tasks || [];
  const sales = state?.sales || null;
  const openingBalance = state?.openingBalance ?? null;
  if (state && !obligations.length) missing.push("obligatii de plata");
  if (state && !sales) missing.push("vanzari (sales_summary)");

  let forecast = null;
  try { forecast = obligations.length ? buildForecast(obligations, { openingBalance }) : null; } catch { /* fara forecast */ }
  const taskGroups = groupTasks(tasks, asOf);
  const predictions = (() => { try { return predict(state || {}).predictions || []; } catch { return []; } })();
  const health = computeHealth({
    restante: obligations.filter((o) => o.dueDate && o.dueDate < asOf).length,
    vanzari: sales || {}, tasks: taskGroups,
    soldCunoscut: openingBalance != null, deficit: !!forecast?.firstDeficit,
  });

  const [reminders, decisions, snapshot] = await Promise.all([
    activeReminders(10).catch(() => []),
    listDecisions(20).catch(() => []),
    collectState().catch(() => null),
  ]);
  const disciplineFlags = snapshot ? (() => { try { return runDetectors(snapshot); } catch { return []; } })() : [];
  if (!snapshot) missing.push("supervisor (opsdb)");

  // audit_log recent (READ-ONLY) — pentru analiza repetata + erori repetitive.
  let auditRecent = [];
  if (pool) {
    auditRecent = await query(
      `SELECT action, detail, created_at FROM audit_log ORDER BY id DESC LIMIT 200`
    ).catch(() => []);
  }
  const errCounts = new Map();
  for (const r of auditRecent) {
    if (/error|eroare|esuat/i.test(r.action)) {
      const k = r.action;
      const e = errCounts.get(k) || { kind: k, count: 0, lastAt: null };
      e.count++; e.lastAt = e.lastAt || String(r.created_at);
      errCounts.set(k, e);
    }
  }

  // Aprobari in asteptare (READ-ONLY pe pending_actions — approvalGate NEATINS).
  let pendingApprovals = null;
  if (pool) {
    const r = await query(`SELECT count(*)::int AS n FROM pending_actions WHERE status = 'pending'`).catch(() => null);
    pendingApprovals = r?.[0]?.n ?? null;
  }

  // Sanatatea job-urilor proprii (din jarvis_state, cand exista amprente).
  const jobs = [];
  const obsLast = await getState("observation:last", null).catch(() => null);
  if (obsLast?.at) jobs.push({ name: "observation_cycle", lastRunAt: obsLast.at, expectedHours: 2 });

  // Trafic site (Spion) — CONECTAT (Master Phase 2): site_visits din opsdb.
  // Sursa picata → null + marcaj (NU trafic zero); detectorii existenti decid.
  let traffic = null;
  try {
    const { getSiteTraffic } = await import("../connectors/opsdata.js");
    traffic = await getSiteTraffic(28);
    if (!traffic) missing.push("trafic site (spion/opsdb)");
  } catch { missing.push("trafic site (spion/opsdb)"); }

  return {
    now: nowIso, asOf,
    period: { from: asOf, to: asOf },
    obligations, tasks, taskGroups, sales, openingBalance,
    forecast, predictions, health,
    reminders, decisions, disciplineFlags,
    auditRecent, errors: [...errCounts.values()],
    pendingApprovals, jobs, traffic,
    sourceMeta: { collectedAt: nowIso, missing, freshnessHours: 0 },
  };
}
