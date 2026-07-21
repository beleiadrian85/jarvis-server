// PROACTIVE CEO — runner-ul pipeline-ului. Orchestrat, izolat, GATED.
// Observatii → triaj → episoade → reconciliere anti-spam → preview Board +
// CEO Brief pentru episoadele eligibile → audit + jarvis_state. Zero LLM,
// zero notificari, zero actiuni, zero convocare Board (doar preview).
import { config } from "../config.js";
import { audit } from "../audit.js";
import { getState, setState } from "../state.js";
import { triageAll } from "./signalTriage.js";
import { groupIntoEpisodes, reconcileEpisodes } from "./executiveEpisodes.js";
import { buildBoardPreview } from "./boardPreview.js";
import { buildCeoBrief } from "./ceoBrief.js";
// CODEX Faza 4.4 — Founder Attention Gate (GATED: implicit OFF → no-op).
import { runFounderGate } from "../founderAttention/founderGateRunner.js";

const EPISODE_STATE_KEY = "proactive:episodes";

/**
 * O trecere completa prin pipeline. optiuni (injectabile pt teste):
 *   previousEpisodes, persist (false = fara audit/jarvis_state), nowMs, flags.
 * → { triage, episodes, briefable, quiet, previews, briefs, state } sau { error }.
 * NU arunca niciodata — erorile raman izolate de JARVIS si de Observation Engine.
 */
export async function runProactivePipeline(observations = [], opts = {}) {
  try {
    const flags = opts.flags || {
      shadow: config.proactiveCeoShadow,
      notifications: config.proactiveCeoNotifications,
      boardExecution: config.proactiveCeoBoardExecution,
    };
    const nowMs = opts.nowMs ?? Date.now();

    // 1) Triaj determinist.
    const triage = triageAll(observations);
    const relevant = [
      ...(triage.byDecision.group || []),
      ...(triage.byDecision.board_candidate || []),
      ...(triage.byDecision.founder_attention || []),
      // rezolvarile trec spre episoade ca sa inchida episodul (o singura data)
      ...observations.filter((o) => o.status === "resolved"),
    ];

    // 2) Episoade + anti-spam la nivel de episod.
    const episodes = groupIntoEpisodes(relevant);
    const previous = opts.previousEpisodes !== undefined
      ? opts.previousEpisodes
      : await getState(EPISODE_STATE_KEY, {}).catch(() => ({}));
    const rec = reconcileEpisodes({ previous, episodes, nowMs });

    // 3) Preview Board (NU convocare) + CEO Brief pentru episoadele eligibile.
    const previews = rec.briefable
      .filter((ep) => ep.requires_board_review && ep.status !== "resolved")
      .map((ep) => buildBoardPreview(ep));
    const briefs = rec.briefable.map((ep) => ({
      episode_id: ep.episode_id,
      reason: ep._briefReason,
      requires_founder_attention: ep.requires_founder_attention,
      ...buildCeoBrief(ep),
    }));

    // 4) Persistenta: DOAR audit + jarvis_state (shadow = niciun alt canal).
    if (opts.persist !== false) {
      await setState(EPISODE_STATE_KEY, rec.state).catch(() => {});
      await audit(
        "ceo_pipeline",
        `${observations.length} observatii → ${episodes.length} episoade, ${briefs.length} briefuri, ${previews.length} preview-uri Board`,
        JSON.stringify({
          triaj: Object.fromEntries(Object.entries(triage.byDecision).map(([k, v]) => [k, v.length])),
          episoade: episodes.map((e) => ({ id: e.episode_id, sev: e.combined_severity, status: e.status })),
          linistite: rec.quiet,
        }).slice(0, 1900),
      ).catch(() => {});
      for (const p of previews) {
        await audit("ceo_board_preview", `${p.episode_id} → ${p.decision_type} (${p.directors.length} directori)`,
          JSON.stringify(p).slice(0, 1900)).catch(() => {});
      }
      for (const b of briefs) {
        await audit("ceo_brief", `${b.episode_id} [${b.reason}]`, b.text.slice(0, 1900)).catch(() => {});
      }
    }
    if (briefs.length || previews.length) {
      console.log(`[proactive] ${episodes.length} episoade → ${briefs.length} briefuri, ${previews.length} preview-uri Board (shadow=${flags.shadow})`);
    }

    // Faza 4.4 — Founder Attention Gate (GATED, implicit OFF; erori izolate).
    if (config.founderAttentionGate && (rec.briefable.length || episodes.length)) {
      await runFounderGate({ briefable: rec.briefable, allEpisodes: episodes }, { persist: opts.persist !== false })
        .catch((e) => console.error("[founder-gate]", e.message));
    }

    return {
      triage: Object.fromEntries(Object.entries(triage.byDecision).map(([k, v]) => [k, v.length])),
      episodes, briefable: rec.briefable, quiet: rec.quiet,
      previews, briefs, state: rec.state,
    };
  } catch (e) {
    console.error("[proactive]", e.message);
    return { error: e.message };
  }
}
