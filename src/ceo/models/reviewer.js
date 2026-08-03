// MODEL REVIEWER / ARBITER (§11) — un al doilea model verifica raspunsul primului
// pentru afirmatii nesustinute / halucinatii. NU decide nimic; produce o critica.
// Rezultatul reviewer-ului e tot inferenta (nu fapt). Fondatorul/JARVIS decid.
import { config } from "../../config.js";
import { route } from "./router.js";
import { meteredCall } from "./meteredCall.js";
import { redactSecrets } from "../memory/writeGate.js";
import { classifyForEgress } from "../memory/dataPolicy.js";
import { PROVIDERS, providerMaxClass } from "./registry.js";

// Poarta de egress pentru handoff-ul reviewer/arbiter: continutul efectiv trimis celui
// de-al doilea/treilea model trebuie sa respecte plafonul SPECIFIC al acelui provider.
function egressForReviewer(providerId, text, sensitivity) {
  return classifyForEgress({ text: String(text || ""), sensitivity: sensitivity || "INTERNAL", providerTrust: PROVIDERS[providerId]?.trust || "external", maxClass: providerMaxClass(providerId) });
}

export function reviewerEnabled() { return config.multiModel?.enabled === true && config.multiModel?.reviewer === true; }

/**
 * Cere unui provider DIFERIT sa critice un raspuns.
 * @param {object} p { question, primaryOutput, primaryProvider, contextText, sensitivity }
 * @returns { ok, reviewer, concerns[], unsupported_claims[], agree, note }
 */
export async function reviewOutput(p = {}) {
  if (!reviewerEnabled()) return { ok: false, note: "Reviewer OFF" };
  // Alege un provider diferit de primar, daca exista.
  const r = route({ task: "reasoning", sensitivity: p.sensitivity || "INTERNAL" });
  const candidates = (r.candidates || []).filter((id) => id !== p.primaryProvider);
  const reviewer = candidates[0] || null;
  if (!reviewer) return { ok: false, note: "niciun al doilea model disponibil pentru review" };
  // Continutul de verificat (INCLUSIV contextText, care e trimis modelului) nu poate
  // depasi plafonul de date al reviewer-ului (fail-closed).
  const egr = egressForReviewer(reviewer, `${p.question} ${p.primaryOutput} ${p.contextText || ""}`, p.sensitivity);
  if (!egr.allowed) return { ok: false, note: `reviewer indisponibil pentru clasa de date (${egr.reason})` };

  const system = [
    "Esti recenzent critic. Verifica raspunsul altui model DOAR pe baza contextului dat.",
    "Marcheaza afirmatiile nesustinute de context (posibile halucinatii). Nu adauga fapte noi.",
    "Raspunde compact: CONCERNS: ... ; UNSUPPORTED: ... ; AGREE: yes/no.",
    p.contextText ? `CONTEXT:\n${redactSecrets(String(p.contextText)).slice(0, 3000)}` : "",
  ].filter(Boolean).join("\n\n");
  const user = `INTREBARE: ${redactSecrets(String(p.question || "")).slice(0, 800)}\n\nRASPUNS DE VERIFICAT:\n${redactSecrets(String(p.primaryOutput || "")).slice(0, 2000)}`;

  const call = await meteredCall(reviewer, { system, messages: [{ role: "user", content: user }], maxTokens: 400, purpose: "reviewer", store: p.store });
  if (!call.ok) return { ok: false, note: call.blocked ? call.reason : `review esuat: ${call.reason}` };

  const txt = call.text || "";
  const agree = /AGREE:\s*(yes|da)/i.test(txt);
  const concerns = (txt.match(/CONCERNS:\s*([^\n]+)/i)?.[1] || "").trim();
  const unsupported = (txt.match(/UNSUPPORTED:\s*([^\n]+)/i)?.[1] || "").trim();
  return { ok: true, reviewer, agree, concerns: concerns ? [concerns] : [], unsupported_claims: unsupported && !/none|niciun|-/i.test(unsupported) ? [unsupported] : [], raw: txt.slice(0, 800), is_inference: true };
}

export function arbiterEnabled() { return config.multiModel?.enabled === true && config.multiModel?.arbiter === true; }

/**
 * ARBITER (§12) — se cheama DOAR daca primary si reviewer sunt in dezacord material.
 * Nu decide singur o actiune; produce o sinteza a dezacordului pentru JARVIS/fondator.
 */
export async function arbitrate(p = {}) {
  if (!arbiterEnabled()) return { ok: false, note: "Arbiter OFF" };
  const r = route({ task: "reasoning", sensitivity: p.sensitivity || "INTERNAL" });
  // Prefera un al treilea provider; daca nu exista, foloseste primul admisibil.
  const third = (r.candidates || []).find((id) => id !== p.primaryProvider && id !== p.reviewerProvider) || r.provider;
  if (!third) return { ok: false, note: "niciun arbitru disponibil" };
  const egr = egressForReviewer(third, `${p.question} ${p.primaryOutput} ${p.reviewText} ${p.contextText}`, p.sensitivity);
  if (!egr.allowed) return { ok: false, note: `arbitru indisponibil pentru clasa de date (${egr.reason})` };
  const system = "Esti arbitru. Doua modele sunt in dezacord. Pe baza DOAR a contextului, spune care pozitie e mai bine sustinuta de dovezi si CE dovada lipseste. Nu inventa. Format: BETTER_SUPPORTED: ... ; MISSING_EVIDENCE: ... ; CONFIDENCE: low/med/high.";
  const user = `INTREBARE: ${redactSecrets(String(p.question || "")).slice(0, 600)}\n\nPOZITIA A (primary):\n${redactSecrets(String(p.primaryOutput || "")).slice(0, 1200)}\n\nPOZITIA B (reviewer):\n${redactSecrets(String(p.reviewText || "")).slice(0, 800)}\n\nCONTEXT:\n${redactSecrets(String(p.contextText || "")).slice(0, 2000)}`;
  const call = await meteredCall(third, { system, messages: [{ role: "user", content: user }], maxTokens: 400, purpose: "arbiter", store: p.store });
  if (!call.ok) return { ok: false, note: call.blocked ? call.reason : `arbitraj esuat: ${call.reason}` };
  return { ok: true, arbiter: third, raw: (call.text || "").slice(0, 800), is_inference: true };
}
