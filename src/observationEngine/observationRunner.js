// OBSERVATION ENGINE — runner-ul unei rulari. Orchestrat, izolat, cu lock:
// colecteaza → detecteaza → scoreaza → valideaza → deduplica → marcheaza
// escaladarea → sinteza optionala → audit + jarvis_state. O eroare NU se
// propaga niciodata in JARVIS (rularea intoarce {error}, nu arunca).
// In SHADOW: scrie DOAR in audit/jarvis_state — zero notificari, zero actiuni.
import { config } from "../config.js";
import { audit } from "../audit.js";
import { getState, setState } from "../state.js";
import { collectWorld } from "./observationSources.js";
import { runDetectorRegistry, finalizeObservations } from "./observationRegistry.js";
import { partitionValid } from "./observationValidator.js";
import { reconcile, MAX_PER_RUN } from "./observationDeduplicator.js";
import { applyEscalation } from "./observationEscalation.js";
import { summarizeObservations, deterministicSummary } from "./observationSummary.js";
import { worldFingerprint, getCached, setCached } from "./observationCache.js";
// CODEX Faza 4.2 — Proactive CEO Pipeline (GATED: implicit OFF → apelul e no-op).
import { runProactivePipeline } from "../proactiveCeo/pipelineRunner.js";

const DEDUP_STATE_KEY = "observation:dedup";
const LAST_RUN_KEY = "observation:last";

let _running = false; // lock anti-concurenta (o singura rulare o data)

/**
 * O rulare completa. optiuni (toate injectabile pt teste):
 *   kind ("quick"|"daily"|"weekly"), world, previousState, llm (null = fara LLM),
 *   persist (false = fara audit/jarvis_state), noCache, maxPerRun, flags.
 */
export async function runObservationCycle(opts = {}) {
  if (_running) return { skipped: "in_progress" };
  _running = true;
  const kind = opts.kind || "quick";
  try {
    const flags = opts.flags || {
      shadow: config.observationShadow,
      notifications: config.observationNotifications,
      boardEscalation: config.observationBoardEscalation,
    };

    const world = opts.world || await collectWorld();
    const fp = worldFingerprint(world);
    if (!opts.noCache && getCached(fp) !== undefined) {
      return { skipped: "date_neschimbate", kind, fingerprint: fp.length };
    }

    // 1) Detectie + scoring determinist + schema.
    const drafts = runDetectorRegistry(world);
    const finalized = finalizeObservations(drafts, world);
    const { valid, rejected } = partitionValid(finalized);

    // 2) Deduplicare / anti-spam (stare persistata in jarvis_state).
    const previous = opts.previousState !== undefined
      ? opts.previousState
      : await getState(DEDUP_STATE_KEY, {}).catch(() => ({}));
    const rec = reconcile({
      previous, observations: valid,
      nowMs: Date.parse(world.now),
      maxPerRun: opts.maxPerRun ?? MAX_PER_RUN,
    });

    // 3) Escaladare — DOAR marcare (Boardul NU e convocat automat in aceasta etapa).
    let emitted = rec.emitted.map((o) => (o.status === "resolved" ? o : applyEscalation(o)));

    // 4) Politica de notificare: safe_to_notify DOAR cu notificari pornite,
    //    shadow oprit si severitate suficienta. In shadow: mereu false.
    emitted = emitted.map((o) => ({
      ...o,
      safe_to_notify: !!(flags.notifications && !flags.shadow &&
        (o.severity === "high" || o.severity === "critical")),
    }));

    // 5) Sinteza — LLM DOAR daca exista observatii semnificative (altfel cost zero).
    const significant = emitted.filter((o) => ["medium", "high", "critical"].includes(o.severity));
    let summary = { text: deterministicSummary(emitted), llmUsed: false };
    if (significant.length && opts.llm !== null) {
      summary = await summarizeObservations(significant, { llm: opts.llm })
        .catch(() => ({ text: deterministicSummary(significant), llmUsed: false }));
    }

    // 6) Persistenta (audit + jarvis_state) — fara tabele noi.
    if (opts.persist !== false) {
      await setState(DEDUP_STATE_KEY, rec.state).catch(() => {});
      await setState(LAST_RUN_KEY, {
        at: world.now, kind,
        emitted: emitted.map((o) => ({ key: o.deduplication_key, severity: o.severity, status: o.status, score: o._score ?? 0 })),
      }).catch(() => {});
      const counts = {};
      for (const o of emitted) counts[o.severity] = (counts[o.severity] || 0) + 1;
      await audit(
        "observation_cycle",
        `${kind}: ${emitted.length} observatii emise, ${rec.suppressed.length} suprimate, ${rejected.length} respinse`,
        JSON.stringify({ counts, summary: summary.text.slice(0, 500), missing: world.sourceMeta?.missing || [] }).slice(0, 1900),
      ).catch(() => {});
      // Motivul fiecarei escaladari marcate — cerinta CODEX (doar audit, fara convocare).
      for (const o of emitted.filter((x) => x.requires_board_review)) {
        await audit(
          "observation_escalation",
          `${o.deduplication_key} [${o.severity}] ${o.title}`.slice(0, 190),
          `motiv: ${o.escalation_reason}`.slice(0, 1900),
        ).catch(() => {});
      }
    }
    if (!opts.noCache) setCached(fp, true);

    console.log(`[observation] ${kind}: ${emitted.length} emise (${rec.suppressed.length} suprimate, ${rejected.length} respinse)${summary.llmUsed ? " +sinteza LLM" : ""}`);

    // 7) Proactive CEO Pipeline (Faza 4.2) — GATED, implicit OFF. Erorile lui
    //    raman izolate si nu ating rularea de observatie.
    if (config.proactiveCeoPipeline && emitted.length) {
      await runProactivePipeline(emitted, { persist: opts.persist !== false })
        .catch((e) => console.error("[proactive]", e.message));
    }
    return {
      ran: true, kind,
      observations: emitted, suppressed: rec.suppressed, rejected,
      summary: summary.text, llmUsed: summary.llmUsed,
      state: rec.state,
    };
  } catch (e) {
    console.error("[observation]", e.message);
    return { error: e.message, kind };
  } finally {
    _running = false;
  }
}
