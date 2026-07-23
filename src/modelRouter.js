/**
 * C11 — Model Router (INERT, COMPLET PUR).
 *
 * routeModel(input) — DECIDE fluxul: ce provider, ce pipeline, ce fallback, dacă
 * se poate executa. NU executa nimic, NU cheama niciun model, NU face IO.
 *
 * GARANTII: zero importuri (nici OpenAI/Claude/MCP/approvalGate/config/DB).
 * Pur si determinist. Zero posibilitate de egress.
 *
 * Provider ∈ { claude, chatgpt, deterministic, none }.
 * Fallback: chatgpt→claude, claude→deterministic, deterministic→none.
 */

const STRATEGY_ROUTES = new Set(["strategy", "council"]);
const DETERMINISTIC_ROUTES = new Set([
  "report", "operationalFastPath", "clarify", "capability_missing",
  "action_propose", "confirm", "memory", "drive",
]);
const CLAUDE_ROUTES = new Set(["operational_read", "simple", "email", "draft"]);

const COST = { deterministic: "none", claude: "low", chatgpt: "high", none: "none" };
const LATENCY = { deterministic: "<1s", claude: "2-6s", chatgpt: "3-8s", none: "instant" };
const FALLBACK = { chatgpt: "claude", claude: "deterministic", deterministic: "none", none: null };

const str = (v) => (v == null ? "" : String(v));
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

// ── TIER-uri de rationament (Faza 12) — explicit, ca rutele vechi sa nu decida
// accidental modelul. TIER 0 determinist (fara model), TIER 1 fast (chat),
// TIER 2 heavy CEO reasoning, TIER 3 adversarial second opinion.
export const REASONING_TIERS = {
  0: { name: "deterministic", model: "none", use: "rapoarte, confirmari, memory, coduri fixe" },
  1: { name: "fast", model: "claude-haiku-4-5-20251001", use: "chat operational, intrebari simple" },
  2: { name: "heavy", model: "claude-opus-4-8", use: "capital allocation, 'ce sa fac?', strategie, negociere, people, dovezi conflictuale" },
  3: { name: "adversarial", model: "claude-opus-4-8", use: "a doua opinie adversariala pe decizii mari" },
};

// Semnale (in intent/text) care CER heavy reasoning (TIER 2).
const HEAVY_CUES = [
  "capital", "aloc", "investit", "cat sa bag", "ce sa fac", "ce ai face", "tu ce",
  "strategie", "strategic", "negoci", "vand sau", "vindem sau", "risc mare",
  "imprumut", "credit mare", "concediez", "angajez", "conflict", "dilema",
];

/**
 * Selecteaza TIER-ul de rationament dupa ruta/intent/text. Determinist, PUR.
 * @returns { tier, name, model, reason, requiresSecondOpinion }
 */
export function selectTier({ route = "", intent = "", text = "", conflictingEvidence = false } = {}) {
  const blob = `${str(route)} ${str(intent)} ${str(text)}`.toLowerCase();
  if (DETERMINISTIC_ROUTES.has(str(route))) return tier(0, "ruta determinista (fara model)");
  const heavy = conflictingEvidence || HEAVY_CUES.some((c) => blob.includes(c)) || STRATEGY_ROUTES.has(str(route));
  if (heavy) {
    const t = tier(2, conflictingEvidence ? "dovezi conflictuale → heavy reasoning" : "decizie de capital/strategie/negociere → heavy reasoning");
    // Decizii cu miza mare (bani/capital/negociere/strategie) sau dovezi
    // conflictuale → merita a doua opinie adversariala (TIER 3).
    t.requiresSecondOpinion = conflictingEvidence || /capital|invest|imprumut|credit|\bbag\b|mai bag|aloc|vind|vandut|strategi|negoci|\d{2,}k|milion|1m/.test(blob);
    return t;
  }
  return tier(1, "chat operational → fast model");
}

function tier(n, reason) {
  const t = REASONING_TIERS[n];
  return { tier: n, name: t.name, model: t.model, reason, requiresSecondOpinion: false };
}

export function routeModel(input) {
  const inp = isObj(input) ? input : {};
  const route = str(inp.route);
  const caps = isObj(inp.capabilities) ? inp.capabilities : {};
  const options = isObj(inp.options) ? inp.options : {};

  const chatgptAvailable = options.chatgptAvailable != null ? options.chatgptAvailable === true : caps.strategy === true;
  const claudeAvailable = options.claudeAvailable !== false; // implicit disponibil

  // 1) Provider dorit dupa ruta.
  let provider, reason;
  if (STRATEGY_ROUTES.has(route)) {
    if (chatgptAvailable) { provider = "chatgpt"; reason = "ruta de strategie → ChatGPT (strategy activa)"; }
    else { provider = "claude"; reason = "strategie dezactivata → fallback Claude"; }
  } else if (DETERMINISTIC_ROUTES.has(route)) {
    provider = "deterministic"; reason = "ruta determinista (fara model)";
  } else if (CLAUDE_ROUTES.has(route)) {
    provider = "claude"; reason = "ruta operationala/chat → Claude";
  } else {
    provider = "claude"; reason = "ruta necunoscuta → Claude (implicit)";
  }

  // 2) Fallback pe indisponibilitate (chatgpt→claude→deterministic).
  if (provider === "chatgpt" && !chatgptAvailable) { provider = "claude"; reason = "ChatGPT indisponibil → Claude"; }
  if (provider === "claude" && !claudeAvailable) { provider = "deterministic"; reason = "Claude indisponibil → determinist"; }

  const requiresApproval = route === "action_propose"
    || (isObj(inp.executiveBrief) && inp.executiveBrief.needsApproval === true)
    || options.requiresApproval === true;

  const active = provider === "chatgpt";
  // approval necesar → nu se poate executa; ChatGPT/none nu executa niciodata.
  const canExecute = !requiresApproval && provider !== "chatgpt" && provider !== "none";

  return {
    provider,
    pipeline: buildPipeline(route),
    reason,
    active,
    canExecute,
    requiresApproval,
    estimatedCost: COST[provider],
    estimatedLatency: LATENCY[provider],
    fallback: FALLBACK[provider],
    metadata: { version: 1, router: "jarvis", route },
  };
}

function buildPipeline(route) {
  const p = ["decisionEngine"];
  if (route !== "confirm") p.push("contextBuilder");
  if (STRATEGY_ROUTES.has(route)) p.push("executiveBrief", "strategyEngine");
  else if (route === "report") p.push("executiveBrief");
  p.push("responseComposer");
  return p;
}
