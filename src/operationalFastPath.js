import { norm } from "./lib/text.js";
import { listTasks } from "./mcp.js";
import { parseTaskLines, isOverdue, todayStr } from "./taskparse.js";
import { collectState } from "./supervisor/collector.js";
import { hasOpsDb } from "./supervisor/opsdb.js";
import { hasOperational } from "./config.js";

/**
 * O1 — Operational Fast Path: raspunsuri DETERMINISTE la intrebari SIMPLE despre
 * task-uri, fara Claude si fara MCP server-side. UN singur load de date (opsdb
 * direct daca exista, altfel mcp.listTasks) + filtrare + formatare scurta.
 *
 * Whitelist STRICT: doar intrebari clare de task-uri. Orice analiza/corelatie
 * ("cum se leaga ... de cash-flow", "de ce") → null → cade pe Claude+MCP.
 */

const PEOPLE = ["adrian", "nelu", "dana", "mihaela"];
const CLOSED = new Set(["acceptat", "oprit"]); // statusuri inchise (sincron cu detectors.js)
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Detectie PURA a intentiei (testabila fara DB). Intoarce {kind,...} sau null. */
export function detectTaskIntent(text) {
  const n = norm(text);
  // Exclude explicit intrebarile complexe/analitice → raman la Claude.
  if (/(cum se leag|de ce|corelat|cash.?flow|impact|influent|legatura|relatie|analiz|explica|compar)/.test(n)) return null;

  const person = PEOPLE.find((p) => n.includes(p));
  const count = /\bcate\b|numar/.test(n);

  if (person && /(ce face|ce lucreaz|task|sarcin|are (deschise|de facut))/.test(n)) return { kind: "person", person, count };
  if (/(ce (e|este) intarzi|ce (e|este) depasit|ce (e|este) restant|task.*intarzi|\bintarzieri\b)/.test(n)) return { kind: "overdue" };
  if (/(terminat azi|de facut azi|scadent.* azi|trebuie.*azi)/.test(n)) return { kind: "today" };
  if (/blocat/.test(n) && /(task|sarcin|ce (e|este))/.test(n)) return { kind: "blocked" };
  return null;
}

export async function operationalFast(text) {
  const intent = detectTaskIntent(text);
  if (!intent) return null;

  const tasks = await loadTasks();
  if (!tasks) return null; // fara sursa de date → cade pe calea normala
  const today = todayStr();

  if (intent.kind === "person") {
    const mine = tasks.filter((t) => norm(t.assignee).includes(intent.person));
    if (intent.count) return `${cap(intent.person)} are ${mine.length} task-uri deschise.`;
    return formatPerson(intent.person, mine, today);
  }
  if (intent.kind === "overdue") return formatList("🟠 Întârziate", tasks.filter((t) => isOverdue(t.deadline)));
  if (intent.kind === "today") return formatList("🟡 Scadente azi", tasks.filter((t) => t.deadline === today));
  if (intent.kind === "blocked") return formatList("🔴 Blocate", tasks.filter((t) => t.status === "blocat"));
  return null;
}

// ── Sursa de date: opsdb direct (rapid, structurat) sau mcp.listTasks (fallback) ──
async function loadTasks() {
  if (hasOpsDb) {
    const snap = await collectState().catch(() => null);
    if (snap) return snap.tasks
      .filter((t) => !CLOSED.has(String(t.status || "").toLowerCase()))
      .map((t) => ({
        assignee: t.assigneeName || t.assignee || "",
        status: String(t.status || "").toLowerCase(),
        deadline: dstr(t.deadline),
        title: t.title,
      }));
  }
  if (hasOperational) {
    const raw = await listTasks({ status: "deschise" }).catch(() => null);
    if (raw != null) return parseTaskLines(raw); // {assignee,status,deadline,title,...}
  }
  return null;
}

function dstr(d) {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  try { return new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" }); } catch { return ""; }
}

const line = (t) => `  • ${t.title} (${t.status}${t.deadline ? ", termen " + t.deadline : ""})`;

function formatPerson(person, tasks, today) {
  if (!tasks.length) return `${cap(person)} nu are task-uri deschise acum.`;
  const blocate = tasks.filter((t) => t.status === "blocat");
  const intarziate = tasks.filter((t) => t.status !== "blocat" && isOverdue(t.deadline));
  const azi = tasks.filter((t) => t.status !== "blocat" && t.deadline === today);
  const rest = tasks.filter((t) => t.status !== "blocat" && !isOverdue(t.deadline) && t.deadline !== today);
  const L = [`${cap(person)} — ${tasks.length} task-uri deschise:`];
  if (blocate.length) L.push("🔴 Blocate:\n" + blocate.map(line).join("\n"));
  if (intarziate.length) L.push("🟠 Întârziate:\n" + intarziate.map(line).join("\n"));
  if (azi.length) L.push("🟡 Azi:\n" + azi.map(line).join("\n"));
  if (rest.length) L.push(`🟢 În lucru: ${rest.length}` + (rest.length <= 5 ? ":\n" + rest.map(line).join("\n") : ""));
  return L.join("\n");
}

function formatList(titlu, tasks) {
  if (!tasks.length) return `${titlu}: niciunul. ✅`;
  return `${titlu} (${tasks.length}):\n` + tasks
    .map((t) => `  • ${t.title} (${t.assignee || "?"}${t.deadline ? ", termen " + t.deadline : ""})`)
    .join("\n");
}
