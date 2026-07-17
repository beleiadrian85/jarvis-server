// OBSERVATION ENGINE — sinteza. LLM-ul DOAR explica si sintetizeaza; nu
// inventeaza observatii, cifre sau severitate. Se apeleaza EXCLUSIV cand
// exista observatii semnificative (altfel cost LLM zero). Esecul LLM pastreaza
// rezultatul determinist (fallback pe sinteza-tempate).
import { config } from "../config.js";
import { callClaude } from "../claude.js";
import { withTimeout, withFallback } from "../resilience.js";

const LLM_TIMEOUT_MS = 60_000;
// Lectia sonnet-5 (de 2 ori azi): buget generos — thinking consuma din max_tokens.
const MAX_TOKENS = 3000;

/** Sinteza determinista (fallback fara LLM) — mereu disponibila. */
export function deterministicSummary(observations = []) {
  if (!observations.length) return "Nicio observatie semnificativa.";
  const bySev = {};
  for (const o of observations) bySev[o.severity] = (bySev[o.severity] || 0) + 1;
  const top = observations[0];
  return (
    `${observations.length} observatii (` +
    Object.entries(bySev).map(([s, n]) => `${n} ${s}`).join(", ") +
    `). Cea mai importanta: ${top.title} — ${top.urgency_reason || top.summary.slice(0, 120)}`
  );
}

/** Sinteza LLM (optionala). llm injectabil in teste; null → doar determinist. */
export async function summarizeObservations(observations, { llm } = {}) {
  const fallbackText = deterministicSummary(observations);
  if (!observations.length) return { text: fallbackText, llmUsed: false };

  const call = llm || (({ system, user }) => callClaude({
    system, messages: [{ role: "user", content: user }], maxTokens: MAX_TOKENS, model: config.model,
  }));
  const resilient = withFallback(withTimeout(call, LLM_TIMEOUT_MS), () => null);

  const block = observations.map((o) =>
    `- [${o.severity}] (${o.category}) ${o.title} · dovezi: ${o.evidence.slice(0, 2).join(" | ")}` +
    (o.unknowns.length ? ` · necunoscute: ${o.unknowns[0]}` : "")
  ).join("\n");

  const out = await resilient({
    system:
      "Esti stratul de sinteza al motorului de observatie JARVIS (PROFI CONCEPT / Bell Residence). " +
      "Primesti observatii DETERMINISTE deja detectate, scorate si prioritizate. " +
      "NU inventezi observatii, cifre sau severitati noi. NU recomanzi executie de plati. " +
      "Scrii in romana, 3-6 fraze: ce se intampla, de ce conteaza, ce merita analizat mai departe. " +
      "Mentionezi explicit limitarile de date acolo unde apar in necunoscute.",
    user: `Observatiile rularii (deja validate):\n${block}\n\nScrie sinteza scurta.`,
  });
  if (!out || !String(out).trim()) return { text: fallbackText, llmUsed: false };
  return { text: String(out).trim(), llmUsed: true };
}
