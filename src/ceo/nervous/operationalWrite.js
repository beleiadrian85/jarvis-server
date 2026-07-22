// NERVOUS SYSTEM V1 §1 — SINGURA SUPRAFATA DE SCRIERE catre Operational.
// REGULA STRUCTURALA: FULL READ / TASKS-ONLY WRITE.
// Orice alt modul din sistemul nervos care vrea sa scrie ceva in Operational
// trece OBLIGATORIU pe aici; acest fisier accepta EXCLUSIV task-uri si le
// livreaza prin clientul MCP existent (create_task/update_task) — reutilizare,
// nu sistem paralel. Testele din ceoNervousV1.test.mjs demonstreaza ca orice
// alt "kind" e respins inainte sa atinga reteaua.
import { config } from "../../config.js";
import { audit } from "../../audit.js";
import { getState, setState } from "../../state.js";
import { STATE_KEYS, DEFAULT_LIMITS } from "./contract.js";

// Whitelist-ul ABSOLUT de tool-uri MCP pe care nervous system le poate atinge.
// add_observation scrie TOT in modulul Task-uri (observatii pe task) — folosit
// exclusiv pentru reminder-ul automat unic (§11 politica de follow-up).
export const ALLOWED_WRITE_TOOLS = ["create_task", "update_task", "add_observation"];
// Tot ce e enumerabil ca modul Operational si NU se poate scrie (C-G din §28).
export const BLOCKED_WRITE_KINDS = [
  "obligation", "payment", "invoice", "supplier", "sale", "reservation",
  "price", "contract", "cash", "bank_statement", "accounting", "maintenance",
  "user", "permission", "setting", "history", "lead", "unit",
];

/** Garda structurala: doar kind="task" trece. PUR — exportata pentru teste. */
export function assertTasksOnly(kind) {
  if (String(kind || "").toLowerCase() !== "task") {
    const err = new Error(`WRITE_BOUNDARY_VIOLATION: CEO AI poate scrie DOAR task-uri (primit: "${kind}")`);
    err.code = "WRITE_BOUNDARY_VIOLATION";
    throw err;
  }
}

/** Kill switch global (§34): orice scriere se opreste instant. */
export function killSwitchOn(cfg = config) {
  return cfg.nervousKill === true;
}

/** Limitele active (env override peste DEFAULT_LIMITS). PUR peste cfg. */
export function activeLimits(cfg = config) {
  return {
    daily_total: Number(cfg.nervousDailyLimit) > 0 ? Number(cfg.nervousDailyLimit) : DEFAULT_LIMITS.daily_total,
    per_person: Number(cfg.nervousPerPersonLimit) > 0 ? Number(cfg.nervousPerPersonLimit) : DEFAULT_LIMITS.per_person,
    dedup_cooldown_hours: DEFAULT_LIMITS.dedup_cooldown_hours,
  };
}

/** Verifica limitele zilnice/per-persoana pe contoarele date. PUR. */
export function checkLimits({ counters = {}, assignee = "", date = "", limits = DEFAULT_LIMITS } = {}) {
  const day = counters.date === date ? counters : { date, total: 0, per_person: {} };
  if ((day.total || 0) >= limits.daily_total)
    return { allowed: false, reason: `limita zilnica atinsa (${limits.daily_total})` };
  const who = String(assignee || "").toLowerCase();
  if ((day.per_person?.[who] || 0) >= limits.per_person)
    return { allowed: false, reason: `limita per persoana atinsa pentru ${assignee} (${limits.per_person})` };
  return { allowed: true, next: { date, total: (day.total || 0) + 1, per_person: { ...(day.per_person || {}), [who]: (day.per_person?.[who] || 0) + 1 } } };
}

/**
 * Scrierea unui TASK in Operational — singura cale.
 * kind trebuie "task"; payload = payload-ul MCP create_task (title, description,
 * assignee, created_by, project, priority, deadline, acceptance_criteria).
 * opts.idempotency_key OBLIGATORIU (Q/R §28: restart/cron simultan = 1 task).
 * opts.mcp injectabil pentru teste ({ createTask, updateTask }).
 * NU decide nimic: cine ajunge aici a trecut deja de orchestrator (shadow/flag/
 * aprobare). Aici raman doar gardurile structurale de ultima linie.
 */
export async function opsWrite(kind, payload, opts = {}) {
  assertTasksOnly(kind);
  const cfg = opts.cfg || config;
  if (killSwitchOn(cfg)) {
    await audit("nervous_write_blocked", "kill switch activ — zero scrieri").catch(() => {});
    return { ok: false, blocked: "KILL_SWITCH" };
  }
  const key = String(opts.idempotency_key || "");
  if (!key) return { ok: false, blocked: "NO_IDEMPOTENCY_KEY", error: "orice task CEO cere idempotency_key" };

  // FARA persistenta reala nu exista idempotenta si nici limite → NU scriem.
  // (state.js devine no-op silentios fara DATABASE_URL; refuzul e explicit.)
  if (!opts.store) {
    const { hasDb } = await import("../../config.js");
    if (!hasDb) {
      await audit("nervous_write_blocked", "fara persistenta (DATABASE_URL) — limitele/idempotenta nu pot fi garantate").catch(() => {});
      return { ok: false, blocked: "NO_PERSISTENCE", error: "fara DB, idempotenta si limitele nu pot fi garantate — zero scrieri" };
    }
  }
  const store = opts.store || { get: getState, set: setState };

  // Idempotenta persistenta: aceeasi cheie nu creeaza al doilea task, indiferent
  // de restart / cron simultan / dublu-click. Registrul e in jarvis_state.
  const reg = (await store.get(STATE_KEYS.tasks, {})) || {};
  const existing = Object.values(reg).find((t) => t.idempotency_key === key && t.operational_id);
  if (existing) return { ok: true, deduped: true, operational_id: existing.operational_id, note: "idempotent: task deja creat" };

  // Limite zilnice / per persoana (§34).
  const today = String(opts.date || new Date().toISOString().slice(0, 10));
  const counters = (await store.get(STATE_KEYS.limits, {})) || {};
  const lim = checkLimits({ counters, assignee: payload?.assignee, date: today, limits: activeLimits(cfg) });
  if (!lim.allowed) {
    await audit("nervous_write_blocked", `limita: ${lim.reason}`).catch(() => {});
    return { ok: false, blocked: "LIMIT", error: lim.reason };
  }

  const mcp = opts.mcp || (await import("../../mcp.js"));
  let resultText;
  try {
    resultText = await mcp.createTask(payload);
  } catch (e) {
    await audit("nervous_write_failed", `create_task: ${e.message}`.slice(0, 190)).catch(() => {});
    return { ok: false, error: e.message };
  }
  // Formatul real al raspunsului MCP: "... • ID: XXXXXX • Link: ..." —
  // ancorat pe "ID:" ca sa nu se potriveasca in interiorul altor cuvinte.
  const idMatch = /\bID:\s*([A-Z0-9]{6})\b/.exec(resultText || "");
  const operational_id = idMatch ? idMatch[1] : null;

  // Idempotenta REALA la restart: intrarea minimala se persista AICI, imediat
  // dupa creare — nu la finalul ciclului. Un crash intre creare si persistarea
  // ciclului nu mai poate produce al doilea task cu aceeasi cheie.
  const reg2 = (await store.get(STATE_KEYS.tasks, {})) || {};
  const rid = String(opts.registry_id || key);
  reg2[rid] = {
    ...(reg2[rid] || {}),
    idempotency_key: key, operational_id, lifecycle: "CREATED", shadow: false,
    created_at: reg2[rid]?.created_at || new Date().toISOString(),
    title: payload?.title || reg2[rid]?.title || null,
  };
  await store.set(STATE_KEYS.tasks, reg2);
  await store.set(STATE_KEYS.limits, lim.next);
  await audit("nervous_task_created", `${payload?.title} → ${payload?.assignee} (${operational_id || "?"})`, String(resultText || "").slice(0, 500)).catch(() => {});
  return { ok: true, operational_id, raw: resultText };
}

/**
 * Reminder automat UNIC pe un task creat de CEO AI (§11): o observatie pe task
 * prin mecanismul nativ Operational (add_observation → notificare in-app).
 * Ramane in modulul Task-uri; maxim 1 per task (garda o tine apelantul).
 */
export async function opsTaskReminder(operationalId, text, opts = {}) {
  const cfg = opts.cfg || config;
  if (killSwitchOn(cfg)) return { ok: false, blocked: "KILL_SWITCH" };
  const store = opts.store || { get: getState, set: setState };
  const reg = (await store.get(STATE_KEYS.tasks, {})) || {};
  const mine = Object.values(reg).some((t) => t.operational_id === operationalId);
  if (!mine) return { ok: false, blocked: "NOT_CEO_TASK", error: "reminder doar pe task-urile create de CEO AI" };
  const mcp = opts.mcp || (await import("../../mcp.js"));
  try {
    const out = await mcp.mcpCall("add_observation", { id: operationalId, text: String(text || "").slice(0, 500) });
    await audit("nervous_task_reminder", `${operationalId}: reminder unic trimis`).catch(() => {});
    return { ok: true, raw: out };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Observatie de CLARIFICARE pe un task ORIGINAL (creat de om) — regula
 * fondatorului "un task = o responsabilitate": nu cream "task despre task",
 * ci intrebam DIRECT pe firul principal. add_observation ramane in modulul
 * Task-uri (TASKS-ONLY WRITE). Gated de kill switch. Idempotenta o tine
 * apelantul (o singura clarificare per task per fereastra).
 */
export async function opsObservation(operationalId, text, opts = {}) {
  const cfg = opts.cfg || config;
  if (killSwitchOn(cfg)) return { ok: false, blocked: "KILL_SWITCH" };
  if (!operationalId) return { ok: false, error: "lipseste id-ul task-ului original" };
  const mcp = opts.mcp || (await import("../../mcp.js"));
  try {
    const out = await mcp.mcpCall("add_observation", { id: operationalId, text: String(text || "").slice(0, 500) });
    await audit("nervous_clarification_on_original", `${operationalId}: clarificare pusa pe task-ul original`, String(text || "").slice(0, 300)).catch(() => {});
    return { ok: true, raw: out };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Update pe un task creat DE CEO AI (§1: "actualiza statusul task-urilor create
 * de CEO AI"). Refuza update pe task-uri care nu sunt in registrul CEO.
 */
export async function opsUpdateCeoTask(operationalId, args = {}, opts = {}) {
  const cfg = opts.cfg || config;
  if (killSwitchOn(cfg)) return { ok: false, blocked: "KILL_SWITCH" };
  const store = opts.store || { get: getState, set: setState };
  const reg = (await store.get(STATE_KEYS.tasks, {})) || {};
  const mine = Object.values(reg).some((t) => t.operational_id === operationalId);
  if (!mine) return { ok: false, blocked: "NOT_CEO_TASK", error: "CEO AI actualizeaza doar task-urile create de el" };
  const mcp = opts.mcp || (await import("../../mcp.js"));
  try {
    const out = await mcp.updateTask({ id: operationalId, ...args });
    await audit("nervous_task_updated", `${operationalId}: ${JSON.stringify(args).slice(0, 150)}`).catch(() => {});
    return { ok: true, raw: out };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
