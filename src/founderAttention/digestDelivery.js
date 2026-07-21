// FOUNDER ATTENTION — livrarea Daily CEO Digest (Faza 4.6). SINGURUL canal
// real activat, gated pe FOUNDER_DAILY_DIGEST_ENABLED (separat de alerte:
// FOUNDER_INTERRUPTIVE_ALERTS_ENABLED ramane OFF si NU are cale de trimitere).
// Senderul (pushToOwner) este INJECTAT la boot — modulul nu importa canale.
// Reguli: max 1 digest/zi; nimic daca nu exista continut relevant; nimic daca
// continutul e identic cu ultimul trimis; nimic in quiet hours; zero LLM.
import { config } from "../config.js";
import { audit } from "../audit.js";
import { getState, setState } from "../state.js";
import { bucharestHour, inQuietHours } from "./notificationPolicy.js";
import { buildDailyDigest, DIGEST_SECTIONS } from "./dailyDigest.js";

const DIGEST_STATE_KEY = "founder:digest";

/** Hash determinist scurt pentru dedup de continut. PUR. */
export function contentHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

/** PRIORITATEA ZILEI — o singura fraza, derivata determinist. PUR. */
export function priorityOfDay({ candidates = [], episodes = [] }) {
  const dataReq = candidates.find((c) => c.attention_level === "DATA_REQUIRED_BEFORE_DECISION");
  if (dataReq) return `Obține datele lipsă (${(dataReq.missing_data[0] || "date esențiale").replace(/\.$/, "").toLowerCase()}) ca să putem decide pe „${dataReq.title}”.`;
  const decision = candidates.find((c) => c.attention_level === "FOUNDER_DECISION_REQUIRED");
  if (decision) return `Decide pe „${decision.title}”${decision.deadline ? ` (${decision.deadline})` : ""}.`;
  const worsening = episodes.find((e) => e.status === "worsening");
  if (worsening) return `Oprește agravarea: „${worsening.title}”.`;
  const top = episodes[0];
  return top ? `Ține sub control „${top.title}”.` : "Zi fără presiuni majore — construiește.";
}

/** Textul final: sectiuni numerotate + prioritate + risc + oportunitate. PUR.
 *  Raspunde in ≤60s de citit: ce stiu / ce decid / ce fac oamenii / riscul /
 *  oportunitatea / ce nu stim. */
export function composeDigestMessage({ digest, candidates, episodes, extras = {} }) {
  const numbered = DIGEST_SECTIONS
    .map((s, i) => ({ title: `${i + 1}. ${s}`, items: digest.sections[s] || [] }))
    .filter((s) => s.items.length)
    .map((s) => `${s.title}\n${s.items.map((t) => `• ${t}`).join("\n")}`)
    .join("\n\n");
  const tail = [
    `PRIORITATEA ZILEI:\n${priorityOfDay({ candidates, episodes })}`,
    extras.main_risk ? `RISC PRINCIPAL:\n${extras.main_risk}` : "",
    extras.main_opportunity ? `OPORTUNITATE:\n${extras.main_opportunity}` : "",
  ].filter(Boolean).join("\n\n");
  return `DAILY CEO BRIEF\n\n${numbered}\n\n${tail}`;
}

/**
 * Livreaza digestul zilei. optiuni (injectabile in teste/dry-run):
 *   send (canalul — obligatoriu pt trimitere reala), material {episodes, candidates},
 *   nowMs, hour, state, persist, dryRun.
 * → { sent, reason, text?, points? } — NU arunca niciodata.
 */
export async function deliverDailyDigest(opts = {}) {
  try {
    if (!config.founderDailyDigest && !opts.dryRun) return { sent: false, reason: "flag_off" };
    const nowMs = opts.nowMs ?? Date.now();
    const hour = opts.hour ?? bucharestHour(nowMs);
    const today = new Date(nowMs).toISOString().slice(0, 10);

    // Max 1/zi — fara exceptii in aceasta faza.
    const st = opts.state !== undefined
      ? (opts.state || {})
      : await getState(DIGEST_STATE_KEY, {}).catch(() => ({}));
    if (st.lastSentDate === today) return { sent: false, reason: "deja_trimis_azi" };
    if (inQuietHours(hour)) return { sent: false, reason: "quiet_hours" };

    // Materialul: snapshot READ-ONLY al lantului (fara LLM, fara persistenta).
    const material = opts.material || await liveMaterial();
    const digest = buildDailyDigest({ episodes: material.episodes, candidates: material.candidates });
    if (digest.points === 0) {
      if (opts.persist !== false && !opts.dryRun)
        await audit("ceo_digest_skipped", "nimic relevant azi — nu se trimite").catch(() => {});
      return { sent: false, reason: "nimic_relevant", points: 0 };
    }

    const text = composeDigestMessage({ digest, candidates: material.candidates, episodes: material.episodes, extras: material.extras || {} });
    const hash = contentHash(text);
    if (st.lastHash === hash) return { sent: false, reason: "continut_neschimbat", points: digest.points };

    if (opts.dryRun) {
      if (opts.persist !== false)
        await audit("ceo_digest_preview", `${digest.points} puncte (dry-run, netrimis)`, text.slice(0, 1900)).catch(() => {});
      return { sent: false, reason: "dry_run", text, points: digest.points };
    }
    if (typeof opts.send !== "function") return { sent: false, reason: "fara_canal" };

    // Trimiterea reala — EXACT un mesaj.
    await opts.send(text);
    if (opts.persist !== false) {
      await setState(DIGEST_STATE_KEY, { lastSentDate: today, lastHash: hash }).catch(() => {});
      await audit("ceo_digest_sent", `${digest.points} puncte, 1 mesaj`, text.slice(0, 1900)).catch(() => {});
    }
    console.log(`[digest] trimis: ${digest.points} puncte (1 mesaj)`);
    return { sent: true, reason: "trimis", text, points: digest.points };
  } catch (e) {
    console.error("[digest]", e.message);
    return { sent: false, reason: "eroare", error: e.message };
  }
}

/** Snapshot live al lantului + PACHETUL DE CONTEXT EXECUTIV (ciclul de
 *  dimineata consolidat: un singur flux 07:40, fara cron-uri duplicate).
 *  Pachetul se persista in jarvis_state "ceo:context" → Board + Command Center. */
async function liveMaterial() {
  const { runObservationCycle } = await import("../observationEngine/observationRunner.js");
  const { runProactivePipeline } = await import("../proactiveCeo/pipelineRunner.js");
  const { runFounderGate } = await import("./founderGateRunner.js");
  const { getState: gs, setState: ss } = await import("../state.js");

  const obs = await runObservationCycle({ kind: "digest-snapshot", noCache: true, llm: null, persist: false, previousState: {} });
  if (obs.error || !obs.observations?.length) return { episodes: [], candidates: [] };
  const prevEpisodes = await gs("proactive:episodes", {}).catch(() => ({}));
  const pipe = await runProactivePipeline(obs.observations, { persist: false, previousEpisodes: prevEpisodes });
  if (pipe.error) return { episodes: [], candidates: [] };
  const gate = await runFounderGate(
    { briefable: pipe.episodes, allEpisodes: pipe.episodes },
    { persist: false, previousCandidates: {}, counters: null }
  );
  const candidates = gate.error ? [] : gate.candidates;

  // Contextul executiv (risc/oportunitate + esentialul pt Board) — best-effort.
  let extras = {};
  try {
    const ceo = await import("../ceo/index.js");
    const ctx = await ceo.collectCeoContext();
    const a = ceo.ceoShadowAnswers(ctx);
    extras = {
      main_risk: (a.q10_riscuri_30_zile || [])[0] || "",
      main_opportunity: ((a.q9_top3_oportunitati || [])[0] || "").split(" · ")[0],
    };
    await ss("ceo:context", {
      at: ctx.world.now,
      priorities: a.priorities, cash_min: a.q2_cash?.minim,
      receivables: a.receivables?.statement, data_health: a.data_health,
      unknowns: a.q7_informatii_lipsa?.slice(0, 4),
    }).catch(() => {});
  } catch (e) { console.warn("[digest.context]", e.message); }

  return { episodes: pipe.episodes, candidates, extras };
}
