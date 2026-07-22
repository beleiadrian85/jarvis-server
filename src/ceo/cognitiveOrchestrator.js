// JARVIS COGNITIVE ORCHESTRATOR (PARTEA II) — NU un creier paralel, ci un
// coordonator PESTE sistemele existente. Secventiaza fluxul canonic zilnic
// (SENSE→INTERPRET→...→IMPROVE) reutilizand modulele deja construite si
// asambleaza o singura imagine unitara a organismului (PARTEA XV) — starea
// (SENSING/THINKING/ACTING/WAITING/VERIFYING/LEARNING/IMPROVING), ce a facut
// azi, ce datoreaza echipa, ce datoreaza JARVIS echipei, buclele deschise,
// gap-urile de date/capabilitate si scorul de pregatire Level 3.
// Zero logica noua de decizie: totul vine din nervous/ + evolution/.
import { config } from "../config.js";
import { getState } from "../state.js";
import { activeAutonomyLevel, level3ReadinessScore, AUTONOMY_LADDER } from "./autonomyLadder.js";
import { STATE_KEYS as NERVOUS_KEYS } from "./nervous/contract.js";

const EVO_LAST = "ceo:evolution:last";
const EVO_REQ = "ceo:evolution:requests";

/**
 * Ruleaza un ciclu cognitiv complet, secventiat. Reutilizeaza runNervousCycle
 * (care deja inlantuieste needEngine→delegare→task→verify→learn→evolution).
 * kind: "morning"|"midday"|"reactive"|"manual". Nu arunca niciodata.
 */
export async function runCognitiveCycle(opts = {}) {
  const kind = opts.kind || "manual";
  const phases = [];
  const t0 = Date.now();
  try {
    // SENSE + INGEST (PARTEA XIII 07:00): documentele atasate task-urilor devin
    // cunoastere INAINTE de ciclul de management — best-effort, gated.
    if (config.selfEvolution) {
      try {
        const { ingestPendingDocuments } = await import("./documentIngestRunner.js");
        const ing = await ingestPendingDocuments({ persist: opts.persist !== false });
        phases.push({ phase: "INGEST", ok: true, detail: ing?.summary || "0 documente noi" });
      } catch (e) { phases.push({ phase: "INGEST", ok: false, detail: e.message }); }
    }
    // INTERPRET→...→LEARN→IMPROVE: ciclul nervous (inlantuie si evolution scan).
    const { runNervousCycle } = await import("./nervous/cycle.js");
    const r = await runNervousCycle({ kind, persist: opts.persist !== false, ...opts.nervous });
    phases.push({ phase: "MANAGE", ok: !!r?.ran, detail: r?.skipped || `${r?.needs?.needs?.length ?? 0} nevoi` });
    return { ran: true, kind, phases, ms: Date.now() - t0, organism: r?.organism || null };
  } catch (e) {
    return { error: e.message, phases };
  }
}

/** Faza curenta a organismului, derivata din ultimul ciclu + ora. PUR-ish. */
function organismPhase(nervousLast, nowMs) {
  if (!nervousLast) return "DORMANT";
  const ageMin = nervousLast.at ? (nowMs - Date.parse(nervousLast.at)) / 60000 : Infinity;
  if (ageMin < 2) return "THINKING";
  const waiting = (nervousLast.what_i_asked || []).some((a) => ["SENT", "AWAITING_RESPONSE", "CREATED", "ASSIGNED", "IN_PROGRESS"].includes(a.state));
  const verifying = (nervousLast.what_i_asked || []).some((a) => ["RESULT_SUBMITTED"].includes(a.state));
  if (verifying) return "VERIFYING";
  if (waiting) return "WAITING";
  return "SENSING";
}

/**
 * Imaginea UNITARA a organismului (PARTEA XV) — read-only, asambleaza starile
 * persistate ale tuturor subsistemelor intr-un singur snapshot pentru UI/API.
 */
export async function organismStatus({ nowMs = Date.now() } = {}) {
  const nervousLast = await getState(NERVOUS_KEYS.last, null);
  const evoLast = config.selfEvolution ? await getState(EVO_LAST, null) : null;
  const evoReq = config.selfEvolution ? (await getState(EVO_REQ, {})) || {} : {};
  const registry = (await getState(NERVOUS_KEYS.tasks, {})) || {};
  const memory = (await getState(NERVOUS_KEYS.memory, {})) || {};

  const activeLevel = activeAutonomyLevel(config);
  const readiness = level3ReadinessScore({
    selfEval: nervousLast?.selfeval || {}, registry,
    days_observed: Object.keys(memory.by_person || memory || {}).length ? 1 : 0,
  });
  readiness.active_level = activeLevel;

  const created = Object.values(registry).filter((r) => r.operational_id);
  const openLoops = Object.values(registry).filter((r) => r.operational_id && !["COMPLETED", "FAILED", "EXPIRED", "NO_LONGER_NEEDED"].includes(r.lifecycle));

  return {
    at: new Date(nowMs).toISOString(),
    phase: organismPhase(nervousLast, nowMs),
    autonomy: { active_level: activeLevel, name: AUTONOMY_LADDER[activeLevel]?.name, ladder: AUTONOMY_LADDER, kill_switch: config.nervousKill },
    what_jarvis_did_today: nervousLast?.ceo_tasks_today || [],
    what_team_owes_jarvis: openLoops.map((r) => ({ task: r.human?.title || r.task_title, owner: r.owner, since: r.created_at, status: r.lifecycle })),
    what_jarvis_owes_team: (nervousLast?.what_i_need || []).filter((n) => n.owner_hint).map((n) => ({ need: n.title, owner: n.owner_hint })),
    open_management_loops: openLoops.length,
    people_load: nervousLast?.people_load || [],
    supervision: nervousLast?.supervision || null,
    data_gaps: (nervousLast?.what_i_need || []).filter((n) => n.type === "INFORMATION_NEED").length,
    capability_gaps: evoLast?.summary?.gaps_confirmed || [],
    improvement_backlog: evoLast?.backlog || [],
    development_jobs: Object.values(evoReq).filter((r) => ["QUEUED_FOR_BUILD", "BUILDING", "BUILT", "TESTING"].includes(r.status)).map((r) => ({ id: r.capability_request_id, title: r.title, status: r.status })),
    system_health: nervousLast?.system_health || null,
    level3_readiness: readiness,
    self_evolution: evoLast ? { active_level: evoLast.active_level, cannot_do_yet: evoLast.what_i_cannot_do_yet, proposed: evoLast.capabilities_proposed } : null,
    created_today: created.length,
  };
}
