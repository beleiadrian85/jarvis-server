// ─────────────────────────────────────────────────────────────────────────
//  P2 — PREDICTION STATE (asamblor)
//  Construieste obiectul `state` cerut de predictionEngine.predict() din
//  sursele REALE existente. NU calculeaza predictii, NU foloseste niciun model.
//
//  Reutilizeaza (nu duplica): connectors/financial (obligatii normalizate),
//  supervisor/opsdb+collector (task-uri structurate) cu fallback la mcp+taskparse,
//  sales_summary+parseSales (vanzari). Data curenta injectata in timezone
//  Europe/Bucharest. openingBalance DOAR daca vine dintr-o sursa confirmata
//  (ex. tastat de Adi). inflows/history/dependente NU se inventeaza.
//
//  Cache pe surse 5 min (nu duplica interogarile intr-o fereastra scurta).
//  Timeout DOAR pe incarcarea surselor; engine-ul pur ramane fara timeout.
// ─────────────────────────────────────────────────────────────────────────
import { getObligations } from "./connectors/financial.js";
import { hasOperational } from "./config.js";
import { mcpCall, listTasks } from "./mcp.js";
import { parseTaskLines } from "./taskparse.js";
import { parseSales } from "./engines/ceoHome.js";
import { hasOpsDb } from "./supervisor/opsdb.js";
import { collectState } from "./supervisor/collector.js";
import { predict } from "./predictionEngine.js";

const SRC_TTL = 5 * 60 * 1000; // 5 minute
const LOAD_TIMEOUT = 8000;     // timeout DOAR la incarcarea surselor

let _cache = null; // { ts, obligations, tasks, tasksSource, sales }

const nowBucharest = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });

function toDateStr(d) {
  if (!d) return null;
  if (typeof d === "string") return d.slice(0, 10);
  try { return new Date(d).toISOString().slice(0, 10); } catch { return null; }
}

// timeout non-blocant: daca sursa nu raspunde la timp → fallback (degradare
// eleganta). Timerul e sters + unref-uit ca sa nu tina event-loop-ul viu.
function withTimeout(promise, ms, fb) {
  let to;
  const timer = new Promise((res) => {
    to = setTimeout(() => res({ ok: false }), ms);
    if (to && typeof to.unref === "function") to.unref();
  });
  return Promise.race([
    Promise.resolve(promise).then((v) => ({ ok: true, v }), () => ({ ok: false })),
    timer,
  ]).then((r) => { clearTimeout(to); return r.ok ? r.v : fb; });
}

// Task-uri: opsdb (structurat) daca exista, altfel mcp + taskparse.
async function loadTasks() {
  if (hasOpsDb) {
    const st = await withTimeout(collectState(), LOAD_TIMEOUT, null);
    if (st && Array.isArray(st.tasks)) {
      return {
        source: "opsdb",
        tasks: st.tasks.map((t) => ({
          id: t.id, status: t.status, deadline: toDateStr(t.deadline),
          assignee: t.assigneeName || t.assignee, project: t.project || "General",
          priority: "", title: t.title,
        })),
      };
    }
  }
  if (hasOperational) {
    const raw = await withTimeout(listTasks({ status: "toate" }), LOAD_TIMEOUT, "");
    const parsed = parseTaskLines(raw || "");
    return {
      source: parsed.length ? "mcp" : "none",
      tasks: parsed.map((t) => ({
        id: t.id, status: t.status, deadline: t.deadline || null,
        assignee: t.assignee, project: t.project || "General", priority: t.priority, title: t.title,
      })),
    };
  }
  return { source: "none", tasks: [] };
}

async function loadSources(force) {
  if (!force && _cache && Date.now() - _cache.ts < SRC_TTL) return _cache;
  const [obligations, tasksRes, salesTxt] = await Promise.all([
    withTimeout(hasOperational ? getObligations() : Promise.resolve([]), LOAD_TIMEOUT, []),
    loadTasks(),
    withTimeout(hasOperational ? mcpCall("sales_summary", {}) : Promise.resolve(""), LOAD_TIMEOUT, ""),
  ]);
  _cache = {
    ts: Date.now(),
    obligations: Array.isArray(obligations) ? obligations : [],
    tasks: tasksRes.tasks,
    tasksSource: tasksRes.source,
    sales: salesTxt ? parseSales(salesTxt) : null,
  };
  return _cache;
}

/** Invalideaza cache-ul de surse (ex. dupa o scriere confirmata). */
export function invalidatePredictionCache() { _cache = null; }

/**
 * Asamblare PURA a state-ului (fara IO) — testabila. Nu inventeaza date:
 * openingBalance/inflows/sales.history lipsa → null / [] / fara history.
 */
export function assembleState({ asOf, openingBalance = null, obligations = [], tasks = [], sales = null, tasksSource = "none" } = {}) {
  return {
    asOf: asOf || nowBucharest(),
    openingBalance: typeof openingBalance === "number" ? openingBalance : null,
    obligations: Array.isArray(obligations) ? obligations : [],
    inflows: [], // niciun tool Operational pentru incasari estimate → gol (nu inventam)
    tasks: Array.isArray(tasks) ? tasks : [],
    sales: sales || {}, // fara `history` (nu inventam trend)
    _sources: { obligations: (obligations || []).length > 0, tasks: tasksSource, sales: !!sales, opsdb: hasOpsDb },
  };
}

/**
 * Construieste `state` din sursele reale (cu cache + timeout). openingBalance
 * doar din options (sursa confirmata: tastat de Adi). NU face IO in engine.
 */
export async function buildPredictionState(options = {}) {
  const asOf = options.asOf || nowBucharest();
  const src = await loadSources(options.forceRefresh);
  return assembleState({
    asOf,
    openingBalance: typeof options.openingBalance === "number" ? options.openingBalance : null,
    obligations: src.obligations,
    tasks: src.tasks,
    sales: src.sales,
    tasksSource: src.tasksSource,
  });
}

/**
 * Alerte high/critical deduplicate, pregatite pentru notifier (FAZA urmatoare).
 * NU e cablata in scheduler/notifier in aceasta faza.
 */
export function getPredictionAlerts(state) {
  const { alerts = [] } = predict(state);
  const seen = new Set();
  const out = [];
  for (const a of alerts) {
    if (seen.has(a.title)) continue;
    seen.add(a.title);
    out.push(a);
  }
  return out;
}
