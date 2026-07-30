// MODEL REVIEWER / ARBITER (§11) — un al doilea model verifica raspunsul primului
// pentru afirmatii nesustinute / halucinatii. NU decide nimic; produce o critica.
// Rezultatul reviewer-ului e tot inferenta (nu fapt). Fondatorul/JARVIS decid.
import { config } from "../../config.js";
import { route } from "./router.js";
import { callProvider } from "./providers.js";
import { redactSecrets } from "../memory/writeGate.js";

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

  const system = [
    "Esti recenzent critic. Verifica raspunsul altui model DOAR pe baza contextului dat.",
    "Marcheaza afirmatiile nesustinute de context (posibile halucinatii). Nu adauga fapte noi.",
    "Raspunde compact: CONCERNS: ... ; UNSUPPORTED: ... ; AGREE: yes/no.",
    p.contextText ? `CONTEXT:\n${String(p.contextText).slice(0, 3000)}` : "",
  ].filter(Boolean).join("\n\n");
  const user = `INTREBARE: ${redactSecrets(String(p.question || "")).slice(0, 800)}\n\nRASPUNS DE VERIFICAT:\n${redactSecrets(String(p.primaryOutput || "")).slice(0, 2000)}`;

  let call;
  try { call = await callProvider(reviewer, { system, messages: [{ role: "user", content: user }], maxTokens: 400 }); }
  catch (e) { return { ok: false, note: `review esuat: ${e.message}` }; }

  const txt = call.text || "";
  const agree = /AGREE:\s*(yes|da)/i.test(txt);
  const concerns = (txt.match(/CONCERNS:\s*([^\n]+)/i)?.[1] || "").trim();
  const unsupported = (txt.match(/UNSUPPORTED:\s*([^\n]+)/i)?.[1] || "").trim();
  return { ok: true, reviewer, agree, concerns: concerns ? [concerns] : [], unsupported_claims: unsupported && !/none|niciun|-/i.test(unsupported) ? [unsupported] : [], raw: txt.slice(0, 800), is_inference: true };
}
