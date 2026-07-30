// MODEL GATEWAY (§4, §10-§19) — UNICUL punct de egress catre modele. Fluxul:
//   1) asambleaza context TEMPORAR din memoria JARVIS (filtrat prin Data Classification)
//   2) Data Routing alege providerul (RESTRICTED nu iese la externi)
//   3) Cost Guard verifica plafonul zilnic
//   4) apeleaza providerul (doar text; fara tool-uri)
//   5) marcheaza rezultatul ca INFERENTA (nu fapt, nu sursa de adevar)
//   6) NU scrie nimic in memorie sau Operational
// Rezultatul managerial trece separat prin ManagerialDecisionEnvelope (in brain.js).
import { config } from "../../config.js";
import { assembleContext } from "../memory/contextAssembler.js";
import { classifyForEgress } from "../memory/dataPolicy.js";
import { redactSecrets } from "../memory/writeGate.js";
import { PROVIDERS } from "./registry.js";
import { route } from "./router.js";
import { callProvider } from "./providers.js";
import { estimateCost } from "./registry.js";
import { wouldExceed, recordSpend } from "./costGuard.js";

export function multiModelEnabled() { return config.multiModel?.enabled === true; }

/**
 * Consulta un model ca MOTOR de rationament, cu context temporar din memorie.
 * @param {object} p { query, task, sensitivity, prefer, maxTokens, extraFacts[],
 *   systemExtra, store, nowISO }
 * @returns { ok, provider, output, is_inference, contextUsed, dropped, cost, reason }
 */
export async function consultModel(p = {}) {
  if (!multiModelEnabled()) return { ok: false, reason: "Multi-Model OFF (JARVIS_MULTI_MODEL_ENABLED)", output: null, is_inference: true };

  const sensitivity = p.sensitivity || "INTERNAL";
  // Data Routing pe prompt-ul in sine (nu doar pe memorie).
  const promptEgress = classifyForEgress({ text: String(p.query || ""), sensitivity, providerTrust: "external" });

  const r = route({ task: p.task, sensitivity, prefer: p.prefer });
  if (!r.provider) return { ok: false, reason: r.reason, output: null, is_inference: true, dropped: [] };
  const trust = PROVIDERS[r.provider].trust;

  // Daca prompt-ul e blocat pentru externi dar am rutat catre un extern → refuz.
  if (!promptEgress.allowed && trust === "external") {
    return { ok: false, reason: "prompt cu date RESTRICTED nu poate merge la model extern (fail-closed)", output: null, is_inference: true, dropped: [{ reason: promptEgress.reason }] };
  }

  // Context temporar din memorie, filtrat pentru nivelul de incredere al providerului.
  const ctx = await assembleContext(p.query || "", { providerTrust: trust, maxItems: p.maxItems || 6, extraFacts: p.extraFacts || [], store: p.store });

  // Cost Guard.
  const est = estimateCost(r.provider, { inTokens: Math.ceil((ctx.contextText.length + String(p.query).length) / 4), outTokens: p.maxTokens || 800 });
  const guard = await wouldExceed(est, { store: p.store, nowISO: p.nowISO });
  if (guard.blocked) return { ok: false, reason: `Cost Guard: ${guard.reason}`, output: null, is_inference: true, provider: r.provider };

  const system = [
    "Esti un motor de rationament consultat de JARVIS. NU esti sursa de adevar; Operational ramane sursa oficiala.",
    "Foloseste DOAR contextul furnizat. Distinge fapt de inferenta. Daca lipseste ceva, spune ca lipseste — nu inventa.",
    ctx.instructions,
    p.systemExtra ? String(p.systemExtra).slice(0, 800) : "",
    "CONTEXT:", ctx.contextText,
  ].filter(Boolean).join("\n\n");

  const userMsg = redactSecrets(String(p.query || "")).slice(0, 3000);
  let call;
  try { call = await callProvider(r.provider, { system, messages: [{ role: "user", content: userMsg }], maxTokens: p.maxTokens || 800 }); }
  catch (e) { return { ok: false, reason: `apel provider esuat: ${e.message}`, output: null, is_inference: true, provider: r.provider }; }

  const actualCost = estimateCost(r.provider, call.usage || {});
  await recordSpend(actualCost, { store: p.store, nowISO: p.nowISO }).catch(() => {});

  return {
    ok: true, provider: r.provider, provider_trust: trust,
    output: call.text,
    is_inference: true, // TOT ce vine de la model e inferenta, nu fapt confirmat
    verification_status: "UNVERIFIED",
    contextUsed: ctx.used, dropped: ctx.dropped, foundMemory: ctx.foundMemory,
    cost: actualCost, route_reason: r.reason,
    caveat: "Rezultat de model (inferenta). NU e memorat automat si NU e sursa oficiala. Verifica la sursa inainte de decizie.",
  };
}
