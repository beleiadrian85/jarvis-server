// NERVOUS SYSTEM V1 — CICLUL DE MANAGEMENT (§2, §18).
// OBSERVE → UNDERSTAND → IDENTIFY NEED → DECIDE WHO → CREATE ACTION/TASK →
// MONITOR → VERIFY → ESCALATE IF NEEDED → LEARN → REASSESS.
// Realitatea companiei genereaza singura activitatea; fondatorul nu porneste nimic.
// Orchestratorul e singurul loc cu IO din nervous/ (in afara de operationalWrite):
// citeste prin colectoarele EXISTENTE (collectCeoContext, collectState, opsQuery
// read-only) si scrie DOAR: jarvis_state (chei ceo:nervous:*), propuneri in
// Approval Inbox (proposalEngine) si — exclusiv prin operationalWrite si doar
// cu autonomia activata explicit de fondator — task-uri Operational.
// SHADOW (§11): mode "shadow" = simuleaza tot ("as fi creat task X pentru Y"),
// ZERO task real, ZERO mesaj.
import { config } from "../../config.js";
import { audit } from "../../audit.js";
import { getState, setState } from "../../state.js";
import { COMPANY } from "../companyConfig.js";
import { buildDataMap } from "../companyDataMap.js";
import { buildDataGaps } from "../dataGapEngine.js";
import { buildFunnel } from "../salesIntelligence.js";
import { buildReceivablesRegister } from "../receivablesEngine.js";
import { detectReceivableIssues } from "../nervousSystem.js";
import { buildActionProposal, recordProposals, listProposals } from "../proposalEngine.js";
import { getBalances } from "../balanceStore.js";
import {
  STATE_KEYS, mapOperationalStatus, OPERATIONAL_CLOSED_STATUSES,
  OPERATIONAL_PROJECTS, DEFAULT_LIMITS,
} from "./contract.js";
import { buildNeeds } from "./needEngine.js";
import { buildResponsibilityMap } from "./responsibilityMap.js";
import { delegateNeed } from "./delegationEngine.js";
import { checkDuplicate, noteCooldown } from "./dedupEngine.js";
import { buildCeoTask, classifyForAutonomy } from "./taskOrchestrator.js";
import { verifyTaskResult } from "./resultVerification.js";
import { evaluateFollowUp } from "./followUpEngine.js";
import { planEscalation } from "./escalationEngine.js";
import { buildPeopleLoad } from "./peopleLoad.js";
import { recordOutcome } from "./orgMemory.js";
import { buildSelfEval } from "./selfEval.js";
import { appendMany } from "./activityStream.js";
import { assessNervousHealth } from "./organismHealth.js";
import { opsWrite, opsTaskReminder, opsObservation } from "./operationalWrite.js";

let _running = false; // lock: un singur ciclu o data (R din §28)

/** Utilizatorii Operational cu rol (read-only; best-effort). */
async function readOpsUsers() {
  try {
    const { opsQuery, hasOpsDb } = await import("../../supervisor/opsdb.js");
    if (!hasOpsDb) return null;
    return await opsQuery(`SELECT id, name, role, blocked FROM users`);
  } catch { return null; }
}

/** Snapshot-ul task-urilor Operational (reutilizeaza collectState). */
async function readOpsTasks() {
  try {
    const { collectState } = await import("../../supervisor/collector.js");
    const st = await collectState();
    return st?.tasks || null;
  } catch { return null; }
}

const todayISO = (nowMs) => new Date(nowMs ?? Date.now()).toISOString().slice(0, 10);

/**
 * UN ciclu complet al organismului. opts:
 *   kind: "morning" | "midday" | "reactive" | "manual"
 *   persist: true (false = pur diagnostic, nimic scris)
 *   nowMs, ctx/opsTasks/opsUsers injectabile pentru teste.
 * Nu arunca niciodata; intoarce snapshot-ul complet (si pt. /api/ceo/organism).
 */
export async function runNervousCycle(opts = {}) {
  const cfg = opts.cfg || config;
  if (!cfg.nervousSystem) return { skipped: "CEO_NERVOUS_SYSTEM_ENABLED=off" };
  if (_running) return { skipped: "ciclu deja in curs" };
  _running = true;
  const t0 = Date.now();
  try {
    const nowMs = opts.nowMs ?? Date.now();
    const nowISO = new Date(nowMs).toISOString();
    const kind = opts.kind || "manual";
    const persist = opts.persist !== false;
    const events = [{ at: nowISO, event: "cycle_start", detail: kind }];

    // ── 1. OBSERVE (read-only, tot ce exista deja) ──────────────────────
    const { collectCeoContext } = await import("../index.js");
    const ctx = opts.ctx || await collectCeoContext();
    const [opsTasks, opsUsers, balances] = await Promise.all([
      opts.opsTasks !== undefined ? opts.opsTasks : readOpsTasks(),
      opts.opsUsers !== undefined ? opts.opsUsers : readOpsUsers(),
      opts.balances !== undefined ? opts.balances : getBalances().catch(() => null),
    ]);
    const asOf = ctx.world?.asOf || todayISO(nowMs);

    // ── 2. UNDERSTAND ───────────────────────────────────────────────────
    const map = buildDataMap({ world: ctx.world });
    const gaps = buildDataGaps(map);
    const funnel = buildFunnel({ sales: ctx.world?.sales, history: ctx.salesHistory || [] });
    let receivableIssues = [];
    try {
      const reg = buildReceivablesRegister({ asOf, incomeInvoices: ctx.incomeInvoices ?? null, estimatedInflows: ctx.inflows ?? null, sales: ctx.world?.sales ?? null });
      receivableIssues = detectReceivableIssues({ register: reg, bankLines: [], sales: ctx.world?.sales, asOf });
    } catch { receivableIssues = []; }
    const { getSourcesHealth } = await import("../../connectors/opsdata.js");
    const sourcesHealth = getSourcesHealth();
    const staleSources = Object.entries(sourcesHealth)
      .filter(([, v]) => v.status === "ERROR" || (v.as_of && (nowMs - Date.parse(v.as_of)) > 48 * 3600_000))
      .map(([k, v]) => ({ source: k, status: v.status, as_of: v.as_of || null }));

    const domainOwners = Object.fromEntries(Object.entries(COMPANY.domains).map(([d, v]) => [d, v.owner]));

    // ── 3. IDENTIFY NEED (Need Engine, §3-4) ────────────────────────────
    const needsOut = buildNeeds({
      asOf, dataGaps: gaps, observations: ctx.observations || [],
      funnelDetections: funnel?.detections || [], receivableIssues,
      reconciliation: opts.reconciliation ?? null, opsTasks: opsTasks || [],
      balances, episodes: ctx.episodes || [], staleSources, domainOwners,
    });
    for (const n of needsOut.needs) events.push({ at: nowISO, event: "need_detected", detail: `${n.type}: ${n.title}`, need_id: n.need_id });
    for (const a of needsOut.audit_only) events.push({ at: nowISO, event: "need_audit_only", detail: a.title || a.summary || "sub prag" });
    for (const z of needsOut.no_action) events.push({ at: nowISO, event: "need_no_action", detail: z.reason || "" });

    // ── 4. DECIDE WHO (Responsibility Map + Delegation, §7-9) ───────────
    const memory = (await getState(STATE_KEYS.memory, {})) || {};
    const respMap = buildResponsibilityMap({
      people: COMPANY.people, users: opsUsers || [], tasks: opsTasks || [],
      domains: COMPANY.domains, memory, asOf,
    });
    const founderId = COMPANY.people.find((p) => /fondator/i.test(p.role || ""))?.id || null;
    const loads = buildPeopleLoad({ people: COMPANY.people, tasks: opsTasks || [], asOf, founderId });

    const registry = (await getState(STATE_KEYS.tasks, {})) || {};
    const proposals = await listProposals().catch(() => ({}));
    let cooldowns = (await getState(STATE_KEYS.cooldown, {})) || {};

    // ── 5. CREATE ACTION/TASK (Orchestrator + Dedup + Autonomie §5-6,10-12)
    const mode = cfg.taskAutonomy === "information" ? "information" : "shadow";
    // LOOP PRESSURE CONTROL (§10): daca deschidem mai repede decat inchidem,
    // task-urile noi de valoare mica devin PROPUNERI (nu creare autonoma) —
    // prioritizam inchiderea. Urgentele trec oricum.
    const { computeLoopPressure, passesPressure } = await import("./loopPressure.js");
    const pressure = computeLoopPressure({ registry, nowMs, cfg });
    if (pressure.throttle) events.push({ at: nowISO, event: "loop_pressure", detail: pressure.recommendation });
    const results = { would_create: [], proposed: [], created: [], duplicates: [], unknown_owner: [], throttled: [], no_action: needsOut.no_action.length, audit_only: needsOut.audit_only.length };
    const host = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "";
    for (const need of needsOut.needs) {
      // J din §28: problema rezolvata intre detectare si creare → NO_LONGER_NEEDED.
      if (need.domain === "CASH" && balances && !balances.expired && balances.freshness === "FRESH") {
        events.push({ at: nowISO, event: "need_no_action", detail: `${need.title} — datele exista deja (NO_LONGER_NEEDED)`, need_id: need.need_id });
        continue;
      }
      const dup = checkDuplicate(need, { opsTasks: opsTasks || [], registry, proposals, cooldowns, nowISO });
      if (dup.duplicate) {
        results.duplicates.push({ need: need.title, reason: dup.reason });
        events.push({ at: nowISO, event: "duplicate_prevented", detail: `${need.title}: ${dup.reason}`, need_id: need.need_id });
        continue;
      }

      // REGULA "un task = o responsabilitate": clarificarea unui restant se pune
      // ca OBSERVATIE pe task-ul ORIGINAL, NU ca task nou (zero "task despre task").
      if (need.deliver_as === "observation_on_original" && need.original_task_id) {
        const origId = need.original_task_id;
        const rid = need.need_id;
        const prior = registry[rid] || {};
        // Daca task-ul original s-a inchis intre timp → nevoia nu mai exista.
        const orig = (opsTasks || []).find((t) => t.id === origId);
        if (orig && OPERATIONAL_CLOSED_STATUSES.includes(String(orig.status || "").toLowerCase())) {
          registry[rid] = { ...prior, id: rid, need_id: rid, original_task_id: origId, owner: del.person_id, lifecycle: "NO_LONGER_NEEDED", updated_at: nowISO, clarifies_original: origId };
          events.push({ at: nowISO, event: "need_no_action", detail: `Original #${origId} inchis (${orig.status}) — clarificarea nu mai e necesara`, need_id: rid });
          continue;
        }
        // Idempotent: o singura clarificare pe fereastra (24h) per task original.
        const lastObs = prior.last_observation_at ? (nowMs - Date.parse(prior.last_observation_at)) / 3_600_000 : Infinity;
        const canSend = mode === "information" && cfg.autonomousFollowup === true && lastObs >= 24 && persist;
        if (canSend) {
          const rr = await opsObservation(origId, need.observation_text || `JARVIS: clarificare pe "${need.title}".`, { cfg });
          if (rr.ok) {
            registry[rid] = { ...prior, id: rid, need_id: rid, original_task_id: origId, owner: del.person_id, lifecycle: "AWAITING_RESPONSE", clarifies_original: origId, human: { title: need.title }, created_at: prior.created_at || nowISO, updated_at: nowISO, last_observation_at: nowISO, followups: [...(prior.followups || []), { at: nowISO, action: "CLARIFY_ON_ORIGINAL", auto_sent: true }] };
            results.created.push({ title: `clarificare pe #${origId}`, owner: del.person_id, operational_id: origId, via: "observation_on_original" });
            events.push({ at: nowISO, event: "clarification_on_original", detail: `Clarificare pusa pe task-ul original #${origId} (${need.title}) — ZERO task nou`, need_id: rid, task_id: origId });
            cooldowns = noteCooldown(cooldowns, need, nowISO, DEFAULT_LIMITS.dedup_cooldown_hours);
            continue;
          }
          events.push({ at: nowISO, event: "clarification_failed", detail: `${origId}: ${rr.error || rr.blocked}`, need_id: rid });
        }
        // Shadow / flag off → doar propunere (ce AR pune pe original), zero task nou.
        registry[rid] = { ...prior, id: rid, need_id: rid, original_task_id: origId, owner: del.person_id, lifecycle: prior.lifecycle || "PROPOSED", clarifies_original: origId, human: { title: need.title }, created_at: prior.created_at || nowISO, updated_at: nowISO };
        results.would_create.push({ title: `clarificare pe #${origId} (${need.title})`, owner: del.person_id, deadline: "-", why: "observatie pe task-ul original, nu task nou" });
        events.push({ at: nowISO, event: "clarification_shadow", detail: `AS PUNE clarificare pe task-ul original #${origId} — ${need.title}`, need_id: rid });
        continue;
      }
      const del = delegateNeed(need, {
        map: respMap, loads: loads.per_person, thresholds: COMPANY.thresholds,
        founderId, boardThresholdRON: COMPANY.thresholds.boardEscalationRON,
      });
      if (del.target === "RESPONSIBILITY_UNKNOWN" || (!del.person_id && !["SYSTEM", "BOARD", "NO_ACTION"].includes(del.target))) {
        results.unknown_owner.push({ need: need.title, why: del.why });
        events.push({ at: nowISO, event: "owner_unknown", detail: `${need.title} — cer clarificare, nu ghicesc (K §28)`, need_id: need.need_id });
        continue;
      }
      if (del.target === "NO_ACTION" || del.target === "SYSTEM") {
        events.push({ at: nowISO, event: del.target === "SYSTEM" ? "owner_identified" : "need_no_action", detail: `${need.title} → ${del.target}`, need_id: need.need_id });
        continue;
      }
      events.push({ at: nowISO, event: "owner_identified", detail: `${need.title} → ${del.person_id || del.target}`, need_id: need.need_id });

      const task = buildCeoTask(need, del, {
        asOf, formUrl: need.task_type === "CASH_DATA" && host ? `${host}/ceo.html` : "",
        projects: OPERATIONAL_PROJECTS, defaultProject: "Altele", createdByUserId: founderId,
      });
      let lane = classifyForAutonomy(task, { mode, autonomousInfoEnabled: cfg.autonomousInfoTasks === true, autonomousVerifEnabled: cfg.autonomousVerifTasks === true, autonomousOperationalEnabled: cfg.autonomousOperationalTasks === true });
      // §10 — sub presiune, o nevoie de valoare mica NU se creeaza autonom:
      // devine propunere (Inbox), ca sa prioritizam inchiderea buclelor deschise.
      if (lane.lane === "AUTONOMOUS_OK") {
        const pp = passesPressure(need, pressure);
        if (!pp.pass) {
          lane = { lane: "NEEDS_APPROVAL", why: pp.reason };
          results.throttled.push({ title: task.human.title, owner: del.person_id, why: pp.reason });
          events.push({ at: nowISO, event: "task_throttled", detail: `${task.human.title}: ${pp.reason}`, need_id: need.need_id });
        }
      }
      const rec = {
        id: task.idempotency_key, idempotency_key: task.idempotency_key, need_id: need.need_id,
        task_type: need.task_type, autonomy_class: task.autonomy_class, owner: del.person_id,
        human: task.human, internal: task.internal, operational_payload: task.operational_payload,
        lifecycle: "VALIDATED", shadow: lane.lane !== "AUTONOMOUS_OK", operational_id: null,
        created_at: nowISO, updated_at: nowISO, followups: [], outcome: null, gap_closed: null,
      };
      if (lane.lane === "SHADOW") {
        rec.lifecycle = "PROPOSED";
        rec.shadow_note = `SHADOW: as fi creat task "${task.human.title}" pentru ${del.person_id} (deadline ${task.human.deadline})`;
        results.would_create.push({ title: task.human.title, owner: del.person_id, deadline: task.human.deadline, why: task.human.why });
        events.push({ at: nowISO, event: "task_would_create", detail: rec.shadow_note, need_id: need.need_id, task_id: rec.id });
      } else if (lane.lane === "NEEDS_APPROVAL") {
        // ACTION/DECISION → Approval Inbox (reutilizam proposalEngine — P0).
        rec.lifecycle = "PROPOSED";
        const p = buildActionProposal({
          id: `prop:nervous:${task.idempotency_key.replace(/^idem:/, "")}`,
          problem: need.summary || need.title, evidence: need.evidence || [],
          recommendation: `Task pentru ${del.person_id}: ${task.human.title}`,
          assignee: del.person_id, deadline: task.human.deadline,
          expected_result: task.human.expected_result,
          verification_rule: task.internal.verification_method,
          source: "ceo-nervous-system", severity: need.value?.total >= 55 ? "high" : "medium",
        });
        if (p) { rec.proposal_id = p.proposal_id; if (persist) await recordProposals([p], { persist: true }); }
        results.proposed.push({ title: task.human.title, owner: del.person_id });
        events.push({ at: nowISO, event: "task_proposed", detail: `${task.human.title} → Inbox (aprobare)`, need_id: need.need_id, task_id: rec.id });
      } else if (lane.lane === "AUTONOMOUS_OK") {
        // DOAR information tasks, DOAR cu flagul activat de fondator (§34).
        const w = persist
          ? await opsWrite("task", task.operational_payload, { idempotency_key: task.idempotency_key, registry_id: rec.id, cfg, date: todayISO(nowMs) })
          : { ok: false, blocked: "PERSIST_OFF" };
        if (w.ok) {
          rec.lifecycle = "CREATED"; rec.operational_id = w.operational_id || null;
          results.created.push({ title: task.human.title, owner: del.person_id, operational_id: rec.operational_id });
          events.push({ at: nowISO, event: "task_created", detail: `${task.human.title} → ${del.person_id} (${rec.operational_id || "?"})`, task_id: rec.id });
        } else {
          rec.lifecycle = "BLOCKED"; rec.blocked = w.blocked || w.error;
          events.push({ at: nowISO, event: "task_blocked_limit", detail: `${task.human.title}: ${rec.blocked}`, task_id: rec.id });
        }
      }
      // Merge care nu pierde operational_id-ul persistat deja de opsWrite
      // (idempotenta la crash intre creare si persistarea ciclului).
      registry[rec.id] = { ...(registry[rec.id] || {}), ...rec, operational_id: rec.operational_id ?? registry[rec.id]?.operational_id ?? null };
      cooldowns = noteCooldown(cooldowns, need, nowISO, DEFAULT_LIMITS.dedup_cooldown_hours);
    }

    // ── 6-8. MONITOR + VERIFY + FOLLOW-UP/ESCALATE pe task-urile CEO ────
    // OPEN LOOP WATCHDOG (§2, §24): pentru fiecare bucla deschisa, urmatoarea
    // actiune + next_check_at — nicio bucla nu ramane uitata.
    const { runWatchdog } = await import("./openLoopWatchdog.js");
    const { insistenceScore } = await import("./insistenceEngine.js").catch(() => ({ insistenceScore: null }));
    const watchdog = runWatchdog({
      registry, nowMs,
      resolveCtx: (rec) => {
        const ops = (opsTasks || []).find((t) => t.id === rec.operational_id) || null;
        const ins = insistenceScore ? insistenceScore({
          businessImpact: rec.internal?.severity, urgencyDays: rec.internal?.urgency_days ?? null,
          ageDays: rec.created_at ? (nowMs - Date.parse(rec.created_at)) / 86_400_000 : 0,
          repeatedDelay: (rec.followups || []).length, cashImpactRON: rec.internal?.cash_impactRON ?? null,
        }) : { level: "MEDIUM" };
        return { opsTask: ops, insistence: ins, asOf };
      },
    });
    const followupProposals = [];
    for (const rec of Object.values(registry)) {
      if (!rec.operational_id) continue; // shadow/propuse: nu au task real de urmarit
      const ops = (opsTasks || []).find((t) => t.id === rec.operational_id) || null;
      if (ops) {
        rec.ops_status = ops.status; rec.sync_ok = true;
        const phase = mapOperationalStatus(ops.status);
        if (phase !== rec.lifecycle && !["COMPLETED", "FAILED"].includes(rec.lifecycle)) rec.lifecycle = phase;
        // §4-5 — clasifica raspunsul uman (raport/status) si intelege blocajul.
        if (String(ops.report || "").trim() || String(ops.status || "").toLowerCase() === "blocat") {
          try {
            const { classifyResponse, classifyBlocker } = await import("./responseClassifier.js");
            const cls = classifyResponse({ text: ops.report || "", opsStatus: ops.status, hasAttachment: (ops.attachments || 0) > 0 || !!ops.hasAttachment });
            rec.response_class = cls.category;
            if (cls.category === "BLOCKED") {
              rec.blocker = classifyBlocker({ text: ops.report || "", taskContext: rec.human?.title || "" });
              events.push({ at: nowISO, event: "blocker_identified", detail: `${rec.human?.title}: ${rec.blocker.blocker_type} → poate debloca: ${rec.blocker.who_can_remove}`, task_id: rec.id });
            }
          } catch { /* clasificator optional */ }
        }
      } else rec.sync_ok = false;
      // VERIFY (§14): bifat ≠ rezolvat — cere dovada.
      if (["RESULT_SUBMITTED", "COMPLETED"].includes(rec.lifecycle) && rec.outcome == null) {
        const dataChecks = { balances_fresh: !!(balances && !balances.expired && balances.freshness === "FRESH"), CASH_DATA: !!(balances && !balances.expired && balances.freshness === "FRESH") };
        const v = verifyTaskResult({ task: rec, opsTask: ops, dataChecks });
        rec.verification = v;
        if (v.verified === true) {
          rec.outcome = "success"; rec.gap_closed = v.gap_closed === true; rec.lifecycle = "COMPLETED";
          events.push({ at: nowISO, event: "task_verified", detail: `${rec.human?.title} — VERIFIED, loop inchis`, task_id: rec.id });
          if (persist) {
            const mem2 = recordOutcome(memory, { person_id: rec.owner, task_type: rec.task_type, outcome: "success", at: nowISO, owner_correct: true, useful: true });
            Object.assign(memory, mem2);
          }
          events.push({ at: nowISO, event: "loop_closed", detail: `${rec.need_id} → rezultat verificat`, need_id: rec.need_id });
        } else if (v.verified === false) {
          events.push({ at: nowISO, event: "task_not_verified", detail: `${rec.human?.title}: ${v.next}`, task_id: rec.id });
          // Rezultat nedemonstrat → PROPUNERE de clarificare (nu ramane mut).
          const lastClarify = (rec.followups || []).filter((f) => f.action === "CLARIFY").pop();
          if (!lastClarify || (nowMs - new Date(lastClarify.at).getTime()) > 24 * 3_600_000) {
            rec.followups = [...(rec.followups || []), { at: nowISO, action: "CLARIFY", why: v.next }];
            followupProposals.push({ task: rec.human?.title, action: "CLARIFY", why: v.next, escalation: null });
          }
        }
      }
      // FOLLOW-UP (§16) — doar PROPUNERI, zero spam: max 4 per task, minim 24h
      // intre doua follow-up-uri (indiferent de tip) — anti-spam la nivel de flux.
      const lastFu = (rec.followups || [])[rec.followups?.length - 1] || null;
      const fuThrottled = (rec.followups || []).length >= 4 ||
        (lastFu && (nowMs - new Date(lastFu.at).getTime()) < 24 * 3_600_000);
      if (ops && !OPERATIONAL_CLOSED_STATUSES.includes(ops.status) && !fuThrottled) {
        const fu = evaluateFollowUp({ task: rec, opsTask: ops, asOf, personLoad: loads.per_person[rec.owner] || null, priorHistory: rec.followups || [] });
        if (fu.action !== "NO_ACTION") {
          // §11 — REMINDER automat UNIC pe task-urile create autonom (prin
          // observatie pe task, mecanismul nativ Operational). Restul raman
          // propuneri pentru fondator.
          // §3 — result-check-first: daca task-ul are deja un rezultat raportat,
          // NU deranjam omul (mergem pe calea VERIFY, tratata mai sus).
          const hasResult = !!(ops && (String(ops.report || "").trim() || ["rezolvat", "acceptat"].includes(String(ops.status || "").toLowerCase())));
          if (fu.action === "REMINDER" && rec.shadow === false && persist && !hasResult &&
              !(rec.followups || []).some((f) => f.auto_sent) &&
              cfg.autonomousFollowup === true) {
            // Mesaj STRUCTURAT (§4): cere un raspuns clasificabil.
            const rr = await opsTaskReminder(rec.operational_id,
              `JARVIS: pentru "${rec.human?.title}" inca nu am un rezultat verificabil (termen ${rec.human?.deadline}). Te rog actualizeaza cu una dintre variante: FINALIZAT / BLOCAT + motiv / TERMEN NOU. Daca ai un document, ataseaza-l direct — il procesez eu.`, { cfg });
            if (rr.ok) {
              rec.followups = [...(rec.followups || []), { at: nowISO, action: "FOLLOW_UP", why: fu.why, auto_sent: true }];
              events.push({ at: nowISO, event: "follow_up_sent", detail: `${rec.human?.title}: follow-up REAL trimis (observatie pe task, cere FINALIZAT/BLOCAT/TERMEN NOU)`, task_id: rec.id });
              rec.updated_at = nowISO;
              continue;
            }
          }
          rec.followups = [...(rec.followups || []), { at: nowISO, action: fu.action, why: fu.why }];
          // Lantul §17 avanseaza REAL: treptele deja propuse (memorate canonic
          // in escalation_steps) nu se mai repropun — urmatorul pas neincercat.
          const esc = fu.action === "ESCALATE" ? planEscalation({ task: rec, attempts: rec.escalation_steps || [], map: respMap, loads: loads.per_person, founderId }) : null;
          if (esc?.next?.why) rec.escalation_steps = [...(rec.escalation_steps || []), esc.next.why.split(" — ")[0]];
          followupProposals.push({ task: rec.human?.title, action: fu.action, why: fu.why, escalation: esc?.next || null });
          events.push({ at: nowISO, event: fu.action === "ESCALATE" ? "escalation_proposed" : "follow_up_proposed", detail: `${rec.human?.title}: ${fu.action} — ${fu.why}`, task_id: rec.id });
        }
      }
      rec.updated_at = nowISO;
    }
    // Igienizarea registrului: intrarile inchise mai vechi de 30 de zile si
    // simularile shadow mai vechi de 7 zile se curata (registrul nu creste la nesfarsit).
    for (const [rid, rec] of Object.entries(registry)) {
      const age = rec.updated_at ? nowMs - new Date(rec.updated_at).getTime() : 0;
      const closed = ["COMPLETED", "FAILED", "EXPIRED", "NO_LONGER_NEEDED"].includes(rec.lifecycle);
      const shadowSim = !rec.operational_id && rec.shadow !== false;
      if ((closed && age > 30 * 86_400_000) || (shadowSim && age > 7 * 86_400_000)) delete registry[rid];
    }

    // ── 9. LEARN + REASSESS (§21-22, §24-26) ────────────────────────────
    const prevStream = (await getState(STATE_KEYS.stream, [])) || [];
    const stream = appendMany(prevStream, events.concat([{ at: new Date().toISOString(), event: "cycle_end", detail: `${kind}: ${needsOut.needs.length} nevoi, ${results.would_create.length} shadow, ${results.proposed.length} propuse, ${results.created.length} create, ${results.duplicates.length} dubluri prevenite` }]));
    const selfeval = buildSelfEval({ registry, stream, auditOnly: needsOut.audit_only, date: todayISO(nowMs) });
    const { ceoSystemHealth } = await import("../selfAudit.js");
    const sysHealth = await ceoSystemHealth({ nowMs }).catch(() => null);
    const health = assessNervousHealth({
      sourcesHealth, systemHealth: sysHealth, registry,
      opsTasksAvailable: opsTasks !== null, usersAvailable: opsUsers !== null,
      lastCycleAt: nowISO, nowMs, writePathOk: null,
      mappingIssues: respMap.unknown_domains || [],
    });
    for (const d of health.detections || []) events.push({ at: nowISO, event: "health_issue", detail: `${d.key}: ${d.note}` });

    // ── ORGANISM VIEW (§25) — ce face CEO AI acum, in 10 secunde ────────
    const founderLabel = COMPANY.founder?.name?.split(" ")[0] || "fondator";
    const organism = {
      at: nowISO, kind, mode, autonomy_flag: cfg.autonomousInfoTasks === true,
      ceo_status: `${mode.toUpperCase()} — ciclu ${kind} rulat; ${needsOut.needs.length} nevoi reale, ${results.duplicates.length} dubluri prevenite, 0 actiuni neautorizate`,
      what_i_see: {
        data_health: map.healthScore, observations: (ctx.observations || []).length,
        open_tasks: (opsTasks || []).filter((t) => !OPERATIONAL_CLOSED_STATUSES.includes(t.status)).length,
        stale_sources: staleSources.map((s) => s.source),
      },
      what_i_need: needsOut.needs.map((n) => ({ type: n.type, title: n.title, owner_hint: n.suggested_owner_hint })),
      what_i_asked: Object.values(registry).filter((r) => ["PROPOSED", "CREATED", "ASSIGNED", "IN_PROGRESS"].includes(r.lifecycle)).map((r) => ({ title: r.human?.title, owner: r.owner, state: r.lifecycle, shadow: r.shadow !== false })),
      waiting: results.proposed.map((p) => p.title),
      blocked: Object.values(registry).filter((r) => r.lifecycle === "BLOCKED").map((r) => r.human?.title),
      resolved: Object.values(registry).filter((r) => r.lifecycle === "COMPLETED").map((r) => r.human?.title),
      needs_founder: [...results.unknown_owner.map((u) => `Clarifica ownerul: ${u.need}`), ...followupProposals.filter((f) => f.escalation).map((f) => `Escaladare propusa: ${f.task}`)],
      // EXTENSIE — memoria persistenta a cererilor + supervizarea oamenilor.
      open_loops: (await import("./requestMemory.js")).openLoops(registry),
      supervision: await (async () => {
        const { buildOperationalProfile, founderSupervision } = await import("./peopleSupervision.js");
        const per = {};
        for (const p of COMPANY.people) per[p.id] = buildOperationalProfile({ person: p, registry, opsTasks: opsTasks || [], loads: loads.per_person[p.id] || null, memory, asOf });
        return { people: per, founder: founderSupervision({ registry, proposals, founderId, asOf }) };
      })(),
      // §19 — TASKS CREATED BY JARVIS TODAY: audit complet, vizibil in 10 sec.
      ceo_tasks_today: Object.values(registry)
        .filter((r) => r.operational_id && String(r.created_at || "").slice(0, 10) === todayISO(nowMs))
        .map((r) => ({ id: r.operational_id, who: r.owner, what: r.human?.title, why: r.human?.why, status: r.lifecycle, expected: r.human?.expected_result, verification: r.internal?.verification_method, value: r.internal?.confidence })),
      founder_label: founderLabel,
      system_health: { status: health.status, score: health.score, detections: health.detections },
      people_load: loads.detections,
      // §2 + §24 — watchdog-ul buclelor: fiecare bucla are NEXT_ACTION + next_check_at.
      watchdog,
      // §20 — heatmap-ul de executie: unde compania "circula" si unde nu.
      execution_heatmap: await (async () => {
        try { const { buildExecutionHeatmap } = await import("./executionHeatmap.js");
          return buildExecutionHeatmap({ registry, opsTasks: opsTasks || [], balances, needs: needsOut.needs, asOf, nowMs });
        } catch { return null; }
      })(),
      // §10 — presiunea buclelor (deschide vs inchide).
      loop_pressure: pressure,
      // §2 — review de incarcare pentru persoanele bottleneck (max 3 prioritati).
      workload_reviews: await (async () => {
        const { reviewWorkload } = await import("./workloadReview.js");
        const bottlenecked = new Set(loads.detections.filter((d) => ["overloaded", "overdue_cluster"].includes(d.key)).map((d) => d.person_id));
        const out = {};
        for (const pid of bottlenecked) out[pid] = reviewWorkload({ person_id: pid, opsTasks: opsTasks || [], asOf });
        return out;
      })(),
      selfeval: selfeval.metrics, verdict: selfeval.verdict,
      results, followup_proposals: followupProposals,
    };

    if (persist) {
      await setState(STATE_KEYS.tasks, registry).catch(() => {});
      await setState(STATE_KEYS.stream, stream).catch(() => {});
      await setState(STATE_KEYS.memory, memory).catch(() => {});
      await setState(STATE_KEYS.selfeval, selfeval).catch(() => {});
      await setState(STATE_KEYS.cooldown, cooldowns).catch(() => {});
      await setState(STATE_KEYS.respmap, { at: nowISO, people: respMap.people, unknown_domains: respMap.unknown_domains }).catch(() => {});
      await setState(STATE_KEYS.last, organism).catch(() => {});
      await audit("nervous_cycle", `${kind}: ${needsOut.needs.length} nevoi, ${results.would_create.length} shadow, ${results.proposed.length} propuneri, ${results.created.length} create, ${results.duplicates.length} dubluri`, "", true).catch(() => {});
    }
    console.log(`[nervous] ciclu ${kind} in ${Date.now() - t0}ms: ${needsOut.needs.length} nevoi / ${results.would_create.length} shadow / ${results.duplicates.length} dubluri`);

    // SELF-EVOLUTION V1 (§40): nevoile reale ale organismului alimenteaza
    // Capability Gap Engine — best-effort, gated, zero build real.
    if (cfg.selfEvolution && persist) {
      // §16 extensie: cererile REPETITIVE catre oameni = candidati de
      // automatizare (root cause → system improvement, nu mai mult control).
      const { answerSupervisionQuestions } = await import("./requestMemory.js");
      const autoCand = (answerSupervisionQuestions(registry, {}).automation_candidates || [])
        .map((c) => ({ reason: `cerere repetitiva (${c.task_type} x${c.count}) — rezolvarea e un conector de sistem, nu o intrebare catre o persoana`, signal: `repetitive:${c.task_type}` }));
      import("../evolution/cycle.js")
        .then((ev) => ev.runEvolutionScan({ needs: needsOut.needs, noAction: [...needsOut.no_action, ...autoCand], persist: true, nowMs, cfg }))
        .catch((e) => console.error("[evolution.hook]", e.message));
    }
    return { ran: true, kind, organism, needs: needsOut, results, health, selfeval, respMap, loads };
  } catch (e) {
    console.error("[nervous]", e.message);
    return { error: e.message };
  } finally {
    _running = false;
  }
}
