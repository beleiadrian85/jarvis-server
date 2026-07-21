// FOUNDER ATTENTION — runner-ul gate-ului. Orchestrat, izolat, GATED.
// Episoade → gate determinist → quiet hours → anti-spam/limite → candidati
// (safe_to_send=false FORTAT) → digest preview → audit + jarvis_state.
// NU trimite nimic. NU convoaca Boardul. Erorile raman izolate.
import { config } from "../config.js";
import { audit } from "../audit.js";
import { getState, setState } from "../state.js";
import { gateEpisode, hasConfirmedRisk } from "./attentionGate.js";
import { buildNotificationCandidate, groupCandidates } from "./notificationCandidate.js";
import { applyQuietHours, applyAntiSpam, bucharestHour } from "./notificationPolicy.js";
import { buildDailyDigest } from "./dailyDigest.js";

const CAND_STATE_KEY = "founder:candidates";
const LIMITS_STATE_KEY = "founder:limits";

/**
 * O trecere prin gate. optiuni (injectabile in teste): previousCandidates,
 * counters, nowMs, hour, persist, flags.
 * → { gated, candidates, suppressed, digest, state } sau { error }.
 */
export async function runFounderGate({ briefable = [], allEpisodes = [] } = {}, opts = {}) {
  try {
    const flags = opts.flags || {
      shadow: config.founderAttentionShadow,
      notifications: config.founderNotifications,
    };
    const nowMs = opts.nowMs ?? Date.now();
    const hour = opts.hour ?? bucharestHour(nowMs);
    const today = new Date(nowMs).toISOString().slice(0, 10);

    // 1) Gate determinist pe episoadele eligibile (deja anti-spammate la nivel de episod).
    const gated = briefable.map((ep) => {
      const gate = gateEpisode(ep);
      const quiet = applyQuietHours({
        gateLevel: gate.level, severity: ep.combined_severity,
        confirmedRisk: hasConfirmedRisk(ep), hour,
      });
      return { episode: ep, gate, quiet };
    });

    // 2) Candidati doar pentru nivelurile care ajung la fondator.
    let candidates = gated
      .filter((g) => !["IGNORE", "AUDIT_ONLY"].includes(g.gate.level))
      .map((g) => ({
        ...buildNotificationCandidate(g),
        _severity: g.episode.combined_severity,
      }));
    candidates = groupCandidates(candidates);

    // 3) Anti-spam: cooldown per tip + limite zilnice.
    const previous = opts.previousCandidates !== undefined
      ? opts.previousCandidates
      : await getState(CAND_STATE_KEY, {}).catch(() => ({}));
    const counters = opts.counters !== undefined
      ? opts.counters
      : await getState(LIMITS_STATE_KEY, null).catch(() => null);
    const spam = applyAntiSpam({ previous, counters, candidates, nowMs, today });

    // safe_to_send ramane FALSE indiferent de flag-uri in aceasta faza.
    const finalCandidates = spam.allowed.map((c) => ({ ...c, safe_to_send: false }));

    // 4) Digest preview (compact, max 7 puncte).
    const digest = buildDailyDigest({ episodes: allEpisodes, candidates: finalCandidates });

    // 5) Persistenta: DOAR audit + jarvis_state.
    if (opts.persist !== false) {
      await setState(CAND_STATE_KEY, spam.previous).catch(() => {});
      await setState(LIMITS_STATE_KEY, spam.counters).catch(() => {});
      await audit(
        "founder_gate",
        `${briefable.length} episoade → ${finalCandidates.length} candidati, ${spam.suppressed.length} suprimati`,
        JSON.stringify({
          niveluri: gated.map((g) => ({ ep: g.episode.episode_id, nivel: g.gate.level, quiet: g.quiet })),
          suprimati: spam.suppressed,
        }).slice(0, 1900),
      ).catch(() => {});
      for (const c of finalCandidates) {
        await audit("notification_candidate", `${c.notification_candidate_id} [${c.attention_level}]`,
          JSON.stringify(c).slice(0, 1900)).catch(() => {});
      }
      if (digest.points > 0) {
        await audit("ceo_digest", `${digest.points} puncte`, digest.text.slice(0, 1900)).catch(() => {});
      }
    }
    if (finalCandidates.length) {
      console.log(`[founder-gate] ${finalCandidates.length} candidati (${spam.suppressed.length} suprimati), digest ${digest.points}p (shadow=${flags.shadow})`);
    }
    return {
      gated: gated.map((g) => ({ episode_id: g.episode.episode_id, level: g.gate.level, quiet: g.quiet })),
      candidates: finalCandidates, suppressed: spam.suppressed, digest,
      state: { candidates: spam.previous, counters: spam.counters },
    };
  } catch (e) {
    console.error("[founder-gate]", e.message);
    return { error: e.message };
  }
}
