// CEO AI — SELF-AUDIT (P2). CEO SYSTEM HEALTH: verifica zilnic sursele,
// conectorii, motoarele si job-urile PROPRII. Notifica pe Adrian DOAR daca
// exista ceva relevant (altfel ramane in audit). READ-ONLY total.
import { config, hasOperational, hasDb, hasCalendar } from "../config.js";
import { pool, query } from "../db.js";
import { getState } from "../state.js";

const ageH = (iso, nowMs) => iso ? Math.round((nowMs - Date.parse(iso)) / 3_600_000) : null;

/** Starea sistemului CEO. Best-effort; o proba picata = raportata, nu fatala. */
export async function ceoSystemHealth({ nowMs = Date.now() } = {}) {
  const checks = [];
  const add = (name, ok, note) => checks.push({ name, ok, note });

  add("db", hasDb && !!pool, hasDb ? "conectata" : "DATABASE_URL lipsa");
  add("operational_mcp", hasOperational, hasOperational ? "configurat" : "OPERATIONAL_MCP_URL lipsa");
  add("opsdb", !!config.operationalDbUrl, config.operationalDbUrl ? "configurat" : "lipsa (fallback MCP)");
  add("gmail", !!(config.google.clientId && config.google.refreshToken), "");
  add("calendar", hasCalendar, hasCalendar ? "" : "OAuth expirat/lipsa");

  add("observation_engine", config.observationEngine, config.observationEngine ? `shadow=${config.observationShadow}` : "OFF");
  add("proactive_pipeline", config.proactiveCeoPipeline, "");
  add("founder_gate", config.founderAttentionGate, "");
  add("daily_digest", config.founderDailyDigest, config.founderDailyDigest ? "1 mesaj/zi 07:40" : "OFF");
  add("executive_board", config.executiveBoard || config.executiveBoardShadow, config.executiveBoard ? "ACTIV" : config.executiveBoardShadow ? "shadow" : "OFF");
  add("interruptive_alerts", true, config.founderInterruptiveAlerts ? "ATENTIE: ON" : "OFF (corect in faza curenta)");

  // Freshness pe job-urile proprii (jarvis_state).
  const obsLast = await getState("observation:last", null).catch(() => null);
  const obsAge = ageH(obsLast?.at, nowMs);
  add("observation_last_run", obsAge != null && obsAge <= 2, obsAge != null ? `acum ${obsAge}h` : "nicio rulare inregistrata");
  const digest = await getState("founder:digest", null).catch(() => null);
  add("digest_last_sent", true, digest?.lastSentDate ? `ultimul: ${digest.lastSentDate}` : "inca netrimis");

  // Erori recente in audit (best-effort).
  let recentErrors = 0;
  if (pool) {
    const r = await query(`SELECT count(*)::int AS n FROM audit_log WHERE action ILIKE '%error%' AND created_at > now() - interval '24 hours'`).catch(() => null);
    recentErrors = r?.[0]?.n ?? 0;
  }
  add("errors_24h", recentErrors < 5, `${recentErrors} erori in audit in 24h`);

  const failing = checks.filter((c) => !c.ok);
  const score = Math.round((100 * (checks.length - failing.length)) / checks.length);
  return {
    at: new Date(nowMs).toISOString(),
    score, checks, failing: failing.map((c) => `${c.name}: ${c.note || "picat"}`),
    relevant_for_founder: failing.some((c) =>
      ["db", "operational_mcp", "observation_last_run"].includes(c.name)) || recentErrors >= 5,
  };
}

/** Raport text compact. PUR. */
export function formatSystemHealth(h) {
  const L = [`CEO SYSTEM HEALTH: ${h.score}/100`];
  for (const c of h.checks) L.push(`${c.ok ? "🟢" : "🔴"} ${c.name}${c.note ? ` — ${c.note}` : ""}`);
  return L.join("\n");
}
