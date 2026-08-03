// MODEL GATEWAY (§4, §10-§23) — UNICUL punct de egress catre modele. Fluxul:
//   1) asambleaza context TEMPORAR din memoria JARVIS (filtrat prin Data Classification)
//   2) Data Routing alege un LANT de fallback (RESTRICTED nu iese la externi)
//   3) Cost Guard verifica plafonul (zi/luna)
//   4) apeleaza providerul (doar text; fara tool-uri); pe esec, urca in lantul de fallback
//      DOAR daca politica de date permite; altfel mesaj onest (nu trimite date neaprobat)
//   5) marcheaza rezultatul ca INFERENTA (nu fapt, nu sursa de adevar)
//   6) audit + evaluare; NU scrie nimic in memorie sau Operational
import { config } from "../../config.js";
import { assembleContext } from "../memory/contextAssembler.js";
import { classifyForEgress } from "../memory/dataPolicy.js";
import { redactSecrets } from "../memory/writeGate.js";
import { PROVIDERS, providerAllowsClass, providerMaxClass, estimateCost } from "./registry.js";
import { route } from "./router.js";
import { callProvider } from "./providers.js";
import { wouldExceed, recordSpend } from "./costGuard.js";
import { auditModelCall } from "./audit.js";
import { recordEvaluation, evaluationEnabled, perfScores } from "./evaluation.js";
import { fallbackBlockedMessage } from "./health.js";

export function multiModelEnabled() { return config.multiModel?.enabled === true; }

/**
 * Consulta un model ca MOTOR de rationament, cu context temporar din memorie.
 * @param {object} p { query, task, sensitivity, prefer, maxTokens, extraFacts[],
 *   systemExtra, store, nowISO, purpose, envelope_id, allowFallback }
 */
export async function consultModel(p = {}) {
  if (!multiModelEnabled()) return { ok: false, reason: "Multi-Model OFF (JARVIS_MULTI_MODEL_ENABLED)", output: null, is_inference: true };

  const sensitivity = String(p.sensitivity || "INTERNAL").toUpperCase();
  const promptEgress = classifyForEgress({ text: String(p.query || ""), sensitivity, providerTrust: "external" });

  const perf = evaluationEnabled() ? await perfScores(p.task, { store: p.store }).catch(() => ({})) : {};
  const r = route({ task: p.task, sensitivity, prefer: p.prefer, perf });
  if (!r.provider) return { ok: false, reason: r.reason, output: null, is_inference: true, dropped: [] };

  // Lant de fallback: doar provideri admisibili pentru clasa de date.
  const chain = (p.allowFallback === false ? [r.provider] : r.candidates).filter((id) => providerAllowsClass(id, sensitivity));

  let lastReason = null;
  for (let attempt = 0; attempt < chain.length; attempt++) {
    const providerId = chain[attempt];
    const trust = PROVIDERS[providerId].trust;

    // Prompt cu date RESTRICTED nu merge la extern.
    if (!promptEgress.allowed && trust === "external") { lastReason = "prompt cu date RESTRICTED nu poate merge la model extern (fail-closed)"; continue; }

    // Plafonul SPECIFIC al acestui provider (ex. google=INTERNAL) — nu doar trust-ul,
    // ca fallback-ul sa nu trimita CONFIDENTIAL unui provider care admite doar INTERNAL.
    const maxClass = providerMaxClass(providerId);
    const ctx = await assembleContext(p.query || "", { providerTrust: trust, providerMaxClass: maxClass, maxItems: p.maxItems || 6, extraFacts: p.extraFacts || [], store: p.store, operationalState: p.operationalState || [], tenant_id: p.tenant_id });

    const est = estimateCost(providerId, { inTokens: Math.ceil((ctx.contextText.length + String(p.query).length) / 4), outTokens: p.maxTokens || 800 });
    const guard = await wouldExceed(est, { store: p.store, nowISO: p.nowISO });
    if (guard.blocked) {
      await auditModelCall({ provider: providerId, purpose: p.purpose, data_classification: sensitivity, result_status: "blocked_cost", blocked_reason: guard.reason, envelope_id: p.envelope_id }, { store: p.store });
      return { ok: false, reason: `Cost Guard: ${guard.reason}`, output: null, is_inference: true, provider: providerId };
    }

    const system = [
      "Esti un motor de rationament consultat de JARVIS. NU esti sursa de adevar; Operational ramane sursa oficiala.",
      "Foloseste DOAR contextul furnizat. Distinge fapt de inferenta. Daca lipseste ceva, spune ca lipseste — nu inventa.",
      ctx.instructions, p.systemExtra ? String(p.systemExtra).slice(0, 800) : "", "CONTEXT:", ctx.contextText,
    ].filter(Boolean).join("\n\n");
    const userMsg = redactSecrets(String(p.query || "")).slice(0, 3000);

    const t0 = Date.now?.() || 0;
    let call;
    try { call = await callProvider(providerId, { system, messages: [{ role: "user", content: userMsg }], maxTokens: p.maxTokens || 800 }); }
    catch (e) {
      lastReason = `apel ${providerId} esuat: ${e.message}`;
      await auditModelCall({ provider: providerId, purpose: p.purpose, data_classification: sensitivity, result_status: "error", blocked_reason: e.message, fallback_used: attempt > 0, envelope_id: p.envelope_id }, { store: p.store });
      if (evaluationEnabled()) await recordEvaluation({ task_type: p.task, provider: providerId, validation: "failed", latency: (Date.now?.() || 0) - t0 }, { store: p.store }).catch(() => {});
      continue; // urca in lantul de fallback (admisibil pentru clasa de date)
    }

    const actualCost = estimateCost(providerId, call.usage || {});
    await recordSpend(actualCost, { store: p.store, nowISO: p.nowISO }).catch(() => {});
    await auditModelCall({ provider: providerId, model: call.model, purpose: p.purpose, data_classification: sensitivity, memory_items_used: ctx.used, redactions: ctx.dropped, usage: call.usage, cost: actualCost, latency: (Date.now?.() || 0) - t0, result_status: "ok", fallback_used: attempt > 0, envelope_id: p.envelope_id }, { store: p.store });
    if (evaluationEnabled()) await recordEvaluation({ task_type: p.task, provider: providerId, validation: "passed", latency: (Date.now?.() || 0) - t0, cost: actualCost }, { store: p.store }).catch(() => {});

    return {
      ok: true, provider: providerId, provider_trust: trust, output: call.text,
      is_inference: true, verification_status: "UNVERIFIED",
      contextUsed: ctx.used, dropped: ctx.dropped, foundMemory: ctx.foundMemory,
      contradictions: ctx.contradictions || [], sections: ctx.sections,
      cost: actualCost, route_reason: r.reason, fallback_used: attempt > 0, chain,
      caveat: "Rezultat de model (inferenta). NU e memorat automat si NU e sursa oficiala. Verifica la sursa inainte de decizie.",
    };
  }

  // Tot lantul a esuat sau a fost blocat. Daca s-a blocat din motive de clasa de date,
  // mesaj onest (nu am trimis la un provider neaprobat).
  const blockedByPolicy = !promptEgress.allowed || sensitivity === "RESTRICTED";
  return { ok: false, reason: blockedByPolicy ? fallbackBlockedMessage(sensitivity) : (lastReason || "niciun provider disponibil"), output: null, is_inference: true, chain };
}
