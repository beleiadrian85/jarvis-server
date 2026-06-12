import crypto from "node:crypto";
import { callClaude } from "./claude.js";
import { createTask, updateTask } from "./mcp.js";
import { audit } from "./audit.js";

/**
 * Fluxuri cu confirmare pentru Operational:
 * - Nivel 2: creare task — parsare cu Claude, confirmare Da/Nu, creare directa prin MCP.
 * - Nivel 3: modificare task — intotdeauna confirmare inainte de executie.
 * Actiunile in asteptare traiesc in memorie (se pierd la restart — re-cere, nu e drama).
 */

const pending = new Map(); // id → {type:'create'|'update', payload, preview, expires}
const TTL = 10 * 60 * 1000;

function stash(type, payload, preview) {
  const id = crypto.randomBytes(4).toString("hex");
  pending.set(id, { type, payload, preview, expires: Date.now() + TTL });
  return id;
}

export function takePending(id) {
  const p = pending.get(id);
  pending.delete(id);
  if (!p || p.expires < Date.now()) return null;
  return p;
}

/** "Jarvis, creeaza task: ..." → structura + confirmare. */
export async function prepareTaskCreate(rawText) {
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
  const id = stash("create", t, preview);
  return { id, preview };
}

/** Modificare task (Nivel 3) — pregateste si cere confirmare. */
export function prepareTaskUpdate(args, humanSummary) {
  const preview = `✏️ MODIFICARE TASK (Nivel 3) — confirmi?\n\n${humanSummary}`;
  const id = stash("update", args, preview);
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
  throw new Error("Tip de actiune necunoscut.");
}
