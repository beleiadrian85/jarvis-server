// REACTIVE TASK-UPDATE WATCH (§2, §3) — cea mai simpla cale SIGURA: reutilizeaza
// poll-ul existent (notifier, ~7 min) si detecteaza schimbari pe task-urile CEO
// (status / raport / observatie noua). La schimbare → declanseaza un ciclu
// nervous "reactive" care clasifica raspunsul, verifica si inchide bucla — fara
// sa astepte cron-ul 07:10/15:30. Zero microserviciu nou; latenta <= interval poll.
import { getState, setState } from "../../state.js";
import { STATE_KEYS } from "./contract.js";

const SNAP_KEY = "ceo:nervous:opssnap"; // id → {status, report_len}

/** Amprenta relevanta a unui task Operational (ce declanseaza reactie). */
function fingerprint(t) {
  return `${t.status || ""}|${String(t.report || "").length}|${(t.updatedAt || "").slice(0, 19)}`;
}

/**
 * Verifica daca task-urile CEO s-au schimbat de la ultimul poll. Read-only pe
 * opsdb (collectState). La schimbare, declanseaza triggerReactiveCycle. Nu
 * arunca. Returneaza { changed:[{id, from, to}], triggered }.
 */
export async function pollCeoTaskUpdates({ registry: injReg = null, opsTasks: injTasks = null, store = null, trigger = null } = {}) {
  try {
    const S = store || { get: getState, set: setState };
    const registry = injReg || (await S.get(STATE_KEYS.tasks, {})) || {};
    const ceoIds = new Set(Object.values(registry).map((r) => r.operational_id).filter(Boolean));
    if (!ceoIds.size) return { changed: [], triggered: false };

    let tasks = injTasks;
    if (tasks == null) {
      const { collectState } = await import("../../supervisor/collector.js");
      const st = await collectState();
      tasks = st?.tasks || null;
    }
    if (!tasks) return { changed: [], triggered: false };
    const st = { tasks };

    const snap = (await S.get(SNAP_KEY, {})) || {};
    const next = {};
    const changed = [];
    for (const t of st.tasks) {
      if (!ceoIds.has(t.id)) continue;
      const fp = fingerprint(t);
      next[t.id] = fp;
      // Prima observare (seed) NU declanseaza — doar memoreaza.
      if (snap[t.id] !== undefined && snap[t.id] !== fp) {
        changed.push({ id: t.id, from: snap[t.id], to: fp, status: t.status });
      }
    }
    await S.set(SNAP_KEY, next).catch(() => {});

    if (!changed.length) return { changed: [], triggered: false };

    // Schimbare reala pe un task CEO → procesare reactiva imediata.
    let triggered = false;
    try {
      const fire = trigger || (await import("./index.js")).triggerReactiveCycle;
      fire(`task-updated:${changed.map((c) => c.id).join(",")}`.slice(0, 60));
      triggered = true;
    } catch { /* daca nu se poate declansa, urmatorul cron oricum proceseaza */ }
    return { changed, triggered };
  } catch (e) {
    return { changed: [], triggered: false, error: e.message };
  }
}
