// SELF-EVOLUTION V1 — SCANAREA DE EVOLUTIE (orchestrator; singurul loc cu IO
// din evolution/). Consuma nevoile REALE ale Nervous System-ului (§40) si le
// trece prin: PRIME DIRECTIVE reuse-before-build (§1) → clasificarea gap-ului
// (§2, §19) → Capability Request canonic (§3) → dedup (§29) → ROI (§17-18) →
// graful de dependente (§16) → backlog persistat + puls + vederea ORGANISM.
// NU construieste nimic real: build-ul e SIMULAT (§21 nivel 4); build real /
// deploy productie = stop-point cu aprobarea fondatorului (§22, §38).
import { config } from "../../config.js";
import { audit } from "../../audit.js";
import { getState, setState } from "../../state.js";
import { COMPANY } from "../companyConfig.js";
import { buildCapabilityManifest } from "../capabilityManifest.js";
import { STATE_KEYS as NERVOUS_KEYS } from "../nervous/contract.js";
import { appendMany } from "../nervous/activityStream.js";
import {
  STATE_KEYS, SELF_EVOLUTION_ACTIVE_LEVEL, PROCESS_FIX_RECOMMENDED,
} from "./contract.js";
import { runReuseAnalysis, classifyGap, detectGapsFromSignals } from "./gapEngine.js";
import { buildCapabilityRequest, validateCapabilityRequest, transitionRequest, dedupCapability } from "./capabilityRequest.js";
import { scoreCapability, recommendBuild, rankBacklog } from "./roiEngine.js";
import { buildGraph, readiness } from "./dependencyGraph.js";
import { listParsers } from "./parserRegistry.js";
import { buildBuildRequest, simulateSandboxBuild } from "./codeAgentOrchestrator.js";
import { guardianReview } from "./guardian.js";
import { needsHumanReview } from "./capabilityMemory.js";

let _running = false;

/** Titlu + tip + spec pentru un gap cunoscut — deterministe, generice. */
function specFor(gap, need) {
  const t = gap.gap_type;
  if (t === "ANALYSIS_GAP" && /xlsx|excel|fisier|situati/i.test(need.title || "")) {
    return {
      capability_type: "DOCUMENT_PARSER", title: "XLSX Parser (biblioteca + adaptor registry)",
      requested_capability: "Parser determinist XLSX inregistrat in Document Parser Registry (canParse/parse/validate/normalize/confidence).",
      inputs: ["fisier XLSX (din task attachment, citit read-only din opsdb)"], outputs: ["rows normalizate cu provenienta (VALUE/SOURCE_ROW/CONFIDENCE)"],
      dependencies: [],
    };
  }
  if (t === "CONNECTOR_GAP") {
    return {
      capability_type: "DATA_CONNECTOR", title: `Conector: ${need.title || gap.signal || "sursa lipsa"}`.slice(0, 70),
      requested_capability: "Adaptor read-only pentru sursa identificata (API oficial / tabela existenta), cu telemetrie de sanatate.",
      inputs: ["sursa oficiala"], outputs: ["date structurate cu AS_OF + confidence"], dependencies: [],
    };
  }
  if (t === "OBSERVABILITY_GAP") {
    return {
      capability_type: "OBSERVABILITY", title: `Observabilitate: ${need.title || gap.signal || ""}`.slice(0, 70),
      requested_capability: "Expunerea starii necesare verificarii rezultatului (health/telemetrie).",
      inputs: [], outputs: ["stare verificabila"], dependencies: [],
    };
  }
  return {
    capability_type: "OTHER", title: (need.title || gap.why || "Capabilitate lipsa").slice(0, 70),
    requested_capability: gap.why || "Capabilitate identificata din nevoie.",
    inputs: [], outputs: [], dependencies: [],
  };
}

/**
 * Scanarea de evolutie. opts: { needs, noAction, persist, nowMs, cfg,
 * simulateBuild (id CR pt. simulare sandbox) } — needs/noAction injectabile;
 * altfel se citesc din starea Nervous (ceo:nervous:last).
 */
export async function runEvolutionScan(opts = {}) {
  const cfg = opts.cfg || config;
  if (!cfg.selfEvolution) return { skipped: "CEO_SELF_EVOLUTION_ENABLED=off" };
  if (cfg.evolutionKill) return { skipped: "CEO_EVOLUTION_KILL_SWITCH=on" };
  if (_running) return { skipped: "scan deja in curs" };
  _running = true;
  try {
    const nowMs = opts.nowMs ?? Date.now();
    const nowISO = new Date(nowMs).toISOString();
    const persist = opts.persist !== false;
    const events = [];

    // 1) Inputurile REALE: nevoile organismului (§40) + semnalele structurale.
    const nervousLast = opts.needs !== undefined ? null : await getState(NERVOUS_KEYS.last, null);
    const needs = opts.needs ?? (nervousLast?.what_i_need || []).map((n) => ({ ...n, need_id: n.need_id || `need:${(n.title || "").slice(0, 30)}` }));
    const noAction = opts.noAction ?? [];
    const manifest = buildCapabilityManifest({});
    const parsers = listParsers();
    const systemFeatures = COMPANY.systemFeatures || {};
    const { getSourcesHealth } = await import("../../connectors/opsdata.js");
    const sourcesHealth = getSourcesHealth();

    const requests = (await getState(STATE_KEYS.requests, {})) || {};
    const memory = (await getState(STATE_KEYS.memory, {})) || {};
    const rejected = Object.values(requests).filter((r) => r.status === "REJECTED");

    const out = { analyzed: 0, reuse_solved: [], human_solved: [], process_fixes: [], gaps_confirmed: [], duplicates: [], no_code_gaps: [] };

    // 2) Fiecare nevoie trece prin PRIME DIRECTIVE (§1).
    for (const need of needs) {
      out.analyzed++;
      const reuse = runReuseAnalysis(need, { manifest, sourcesHealth, systemFeatures, parsers, connectors: [{ name: "smartbill", connected: true }, { name: "opsdb", connected: true }] });
      events.push({ at: nowISO, event: "reuse_analysis", detail: `${need.title}: ${reuse.resolution}`, need_id: need.need_id });
      if (reuse.resolution === "USE_EXISTING" || reuse.resolution === "CONNECT_SOURCE" || reuse.resolution === "CONFIGURATION") {
        out.reuse_solved.push({ need: need.title, how: reuse.resolution, evidence: reuse.evidence[0] || "" });
        continue;
      }
      if (reuse.resolution === "HUMAN_TASK") {
        out.human_solved.push({ need: need.title, note: "omul are canalul necesar (ex. attachments EXISTA in Operational)" });
        continue;
      }
      // CAPABILITY_GAP → clasificare (§2/§19).
      const gap = classifyGap(need, reuse);
      if (gap.gap_type === PROCESS_FIX_RECOMMENDED) {
        out.process_fixes.push({ need: need.title, why: gap.why });
        events.push({ at: nowISO, event: "process_fix_recommended", detail: `${need.title}: proces, nu software`, need_id: need.need_id });
        continue;
      }
      if (!gap.requires_code) {
        out.no_code_gaps.push({ need: need.title, gap: gap.gap_type, why: gap.why });
        continue;
      }
      const spec = specFor(gap, need);
      const cr = buildCapabilityRequest({ need, gap, reuse, ...spec, users: [need.suggested_owner_hint].filter(Boolean), asOf: nowISO });
      const dup = dedupCapability(cr, { existing: requests, rejected });
      if (dup.duplicate) {
        out.duplicates.push({ title: cr.title, reason: dup.reason });
        events.push({ at: nowISO, event: "capability_duplicate_prevented", detail: `${cr.title}: ${dup.reason}` });
        continue;
      }
      const v = validateCapabilityRequest(cr);
      if (!v.valid) { events.push({ at: nowISO, event: "capability_invalid", detail: `${cr.title}: ${v.errors[0]}` }); continue; }
      let cur = transitionRequest(cr, "REUSE_ANALYSIS").cr;
      cur = transitionRequest(cur, "GAP_CONFIRMED").cr;
      cur = transitionRequest(cur, "SPECIFICATION_READY").cr;
      cur.roi = scoreCapability(cur);
      cur.recommendation = recommendBuild(cur);
      if (needsHumanReview(memory, cur.capability_request_id)) cur.human_review_required = true;
      requests[cur.capability_request_id] = cur;
      out.gaps_confirmed.push({ id: cur.capability_request_id, title: cur.title, type: cur.type, tier: cur.recommendation.tier, total: cur.roi.total });
      events.push({ at: nowISO, event: "capability_request_created", detail: `${cur.capability_request_id}: ${cur.title} [${cur.recommendation.tier}]`, need_id: need.need_id });
    }

    // 3) Semnale structurale suplimentare (parsere lipsa, surse moarte).
    for (const g of detectGapsFromSignals({ needs, noAction, parserRegistry: parsers, staleSources: [] })) {
      events.push({ at: nowISO, event: "gap_signal", detail: `${g.gap_type}: ${g.why}`.slice(0, 160) });
    }

    // 4) Backlog + graf (§16-17).
    const backlog = rankBacklog(Object.values(requests).filter((r) => !["REJECTED", "DUPLICATE", "COMPLETED"].includes(r.status)));
    const graph = buildGraph(Object.values(requests));
    for (const b of backlog) b.readiness = readiness(b.cr_id, graph, Object.values(requests));

    // 5) Simulare de build sandbox (§10-14) — DOAR contractual, zero executie.
    let buildSim = null;
    if (opts.simulateBuild && requests[opts.simulateBuild]) {
      const br = buildBuildRequest(requests[opts.simulateBuild], { repository: process.env.SELF_REPO || "jarvis-server", allowedPaths: ["src/ceo/evolution/", "src/connectors/", "test/"] });
      const report = simulateSandboxBuild(br);
      const g = guardianReview({ buildRequest: br, buildReport: report, diffFiles: [] });
      buildSim = { build_request: br, report, guardian: g };
      events.push({ at: nowISO, event: "sandbox_build_simulated", detail: `${opts.simulateBuild}: guardian=${g.verdict} (zero executie reala)` });
    }

    // 6) Vederea SELF-EVOLUTION pentru ORGANISM (§24) + persistenta.
    const view = {
      at: nowISO, active_level: SELF_EVOLUTION_ACTIVE_LEVEL,
      what_i_can_already_do: (manifest.can_observe || []).slice(0, 8),
      what_i_cannot_do_yet: Object.entries(systemFeatures).filter(([, v]) => !v.exists).map(([k, v]) => ({ capability: k, evidence: v.evidence })),
      capabilities_proposed: backlog.filter((b) => ["SPECIFICATION_READY", "GAP_CONFIRMED"].includes(requests[b.cr_id]?.status)).map((b) => ({ id: b.cr_id, title: b.title, tier: b.tier, roi: b.total })),
      capabilities_building: Object.values(requests).filter((r) => ["QUEUED_FOR_BUILD", "BUILDING", "BUILT", "TESTING"].includes(r.status)).map((r) => r.title),
      capabilities_waiting_approval: Object.values(requests).filter((r) => ["VALIDATED", "WAITING_APPROVAL"].includes(r.status)).map((r) => r.title),
      capabilities_deployed: Object.values(requests).filter((r) => ["DEPLOYED", "OUTCOME_VALIDATION", "COMPLETED"].includes(r.status)).map((r) => r.title),
      did_they_help: Object.values(memory.capabilities || {}).map((c) => ({ cr_id: c.cr_id, expected: c.expected_value, actual: c.actual_value })),
      summary: out, backlog: backlog.slice(0, 10), graph_nodes: graph.nodes.length,
    };
    if (persist) {
      await setState(STATE_KEYS.requests, requests).catch(() => {});
      await setState(STATE_KEYS.last, view).catch(() => {});
      const prevStream = (await getState(NERVOUS_KEYS.stream, [])) || [];
      await setState(NERVOUS_KEYS.stream, appendMany(prevStream, events)).catch(() => {});
      await audit("evolution_scan", `${out.analyzed} nevoi: ${out.reuse_solved.length} reuse, ${out.human_solved.length} oameni, ${out.process_fixes.length} proces, ${out.gaps_confirmed.length} gaps, ${out.duplicates.length} dubluri`, "", true).catch(() => {});
    }
    console.log(`[evolution] scan: ${out.analyzed} nevoi → ${out.gaps_confirmed.length} capability requests (${out.duplicates.length} dubluri prevenite)`);
    return { ran: true, view, out, backlog, graph, buildSim };
  } catch (e) {
    console.error("[evolution]", e.message);
    return { error: e.message };
  } finally {
    _running = false;
  }
}

/** Decizia fondatorului pe un capability request (§23). Zero deploy aici. */
export async function decideCapability({ capability_request_id, decision, note = "" } = {}) {
  const requests = (await getState(STATE_KEYS.requests, {})) || {};
  const cr = requests[capability_request_id];
  if (!cr) return { ok: false, error: "capability request inexistent" };
  const d = String(decision || "").toUpperCase();
  let to = null;
  if (d === "APPROVE") to = cr.status === "WAITING_APPROVAL" ? "APPROVED" : null;
  else if (d === "REJECT") to = "REJECTED";
  else if (d === "MODIFY") { cr.founder_note = note; }
  if (to) {
    const t = transitionRequest(cr, to);
    if (!t.ok) return { ok: false, error: t.error || `tranzitie invalida ${cr.status}→${to}` };
    requests[capability_request_id] = { ...t.cr, founder_decision: { decision: d, note, at: new Date().toISOString() } };
  } else if (d === "APPROVE") {
    return { ok: false, error: `APPROVE permis doar din WAITING_APPROVAL (stare: ${cr.status}) — build-ul si testele vin intai` };
  } else {
    requests[capability_request_id] = cr;
  }
  await setState(STATE_KEYS.requests, requests);
  await audit("capability_decision", `${capability_request_id}: ${d}`, note.slice(0, 300), true).catch(() => {});
  return { ok: true, cr: requests[capability_request_id] };
}
