// EXECUTIVE BOARD — orchestrarea unei sedinte. REUTILIZEAZA sistemele existente
// (predictionState, cashForecast, riskEngine, healthScore, memory, audit) si face
// UN SINGUR apel LLM per sedinta (disciplina de cost). READ-ONLY total: zero
// importuri din taskflow/approvalGate/mcp — Boardul nu poate executa actiuni.
import { config } from "../config.js";
import { callClaude } from "../claude.js";
import { withTimeout, withRetry, withFallback } from "../resilience.js";
import { buildPredictionState } from "../predictionState.js";
import { buildForecast } from "../engines/cashForecast.js";
import { assessRisks } from "../engines/riskEngine.js";
import { computeHealth } from "../engines/healthScore.js";
import { recall, listDecisions } from "../memory.js";
import { audit } from "../audit.js";
import { createCache } from "../cache.js";
import { norm } from "../lib/text.js";
import { ROLES } from "./boardRoles.js";
import { classifyDecision, selectDirectors } from "./boardRouter.js";
import { buildBoardSystem, buildBoardUser } from "./prompts.js";
import { founderPerspective } from "./founderVoice.js";
import { guardianReview } from "./guardian.js";
import { synthesize } from "./boardSynthesis.js";
import { validateDirectorOutput, REVERSIBILITY } from "./boardValidator.js";

const LLM_TIMEOUT_MS = 45_000;

/**
 * Buget de tokeni DINAMIC: un board de investitie are 8 perspective LLM si nu
 * incape in bugetul unuia de 4 (raspuns trunchiat → JSON invalid → toate
 * perspectivele picate). ~700 tokeni/director + 2000 pentru meta-sedinta.
 */
export function tokensForRoles(llmRoleCount) {
  return Math.min(8000, 2000 + 700 * Math.max(1, llmRoleCount));
}

// Aceeasi intrebare pe aceleasi date nu redeclanseaza analiza (10 min).
const _cache = createCache({ maxEntries: 20, ttlMs: 10 * 60_000 });
let _seq = 0;

const lei = (n) => Math.round(n).toLocaleString("ro-RO") + " lei";

/** Grupare task-uri pt COO/riskEngine (pur, local). */
function groupTasks(tasks = [], asOf) {
  const g = { blocate: 0, azi: 0, intarziate: 0, ok: 0 };
  for (const t of tasks) {
    if (t.status === "blocat") g.blocate++;
    else if (t.deadline && t.deadline < asOf) g.intarziate++;
    else if (t.deadline === asOf) g.azi++;
    else g.ok++;
  }
  return g;
}

/**
 * Dosarul determinist al deciziei: stare Operational + forecast + riscuri +
 * health, cu sursele etichetate si lista datelor lipsa. Toleranta la esec —
 * o sursa picata inseamna date lipsa marcate, nu sedinta blocata.
 */
export async function collectBoardData() {
  const state = await buildPredictionState().catch(() => null);
  const asOf = state?.asOf || new Date().toISOString().slice(0, 10);
  const obligations = state?.obligations || [];
  const tasks = state?.tasks || [];
  const sales = state?.sales || null;
  const openingBalance = state?.openingBalance ?? null;

  const forecast = obligations.length ? buildForecast(obligations, { openingBalance }) : null;
  const taskGroups = groupTasks(tasks, asOf);
  const cash = {
    restante: obligations.filter((o) => o.dueDate && o.dueDate < asOf).length,
    scadente3: obligations.filter((o) => {
      if (!o.dueDate || o.dueDate < asOf) return false;
      const d = (new Date(o.dueDate) - new Date(asOf)) / 86_400_000;
      return d <= 3;
    }).length,
  };
  const risks = assessRisks({ forecast, cash, tasks: taskGroups, sales, openingBalance });
  const health = computeHealth({
    restante: cash.restante, vanzari: sales || {}, tasks: taskGroups,
    soldCunoscut: openingBalance != null, deficit: !!forecast?.firstDeficit,
  });

  const data_available = [];
  const data_missing = [];
  (obligations.length ? data_available : data_missing).push(
    obligations.length ? `[operational] ${obligations.length} obligatii de plata` : "obligatii de plata (Operational indisponibil)");
  (tasks.length ? data_available : data_missing).push(
    tasks.length ? `[operational] ${tasks.length} task-uri active` : "task-uri (Operational indisponibil)");
  (sales ? data_available : data_missing).push(
    sales ? `[operational] vanzari: ${sales.vandut ?? 0} vandute, ${sales.rezervat ?? 0} rezervate din ${sales.total ?? "?"}` : "situatia vanzarilor");
  (openingBalance != null ? data_available : data_missing).push(
    openingBalance != null ? `[declarat] sold curent ${lei(openingBalance)}` : "sold curent bancar");

  const dataQuality = data_missing.length === 0 ? "completa" : data_missing.length <= 2 ? "partiala" : "slaba";

  // Text pentru dosarul LLM — cifre DOAR de aici.
  const L = [];
  L.push(`Data: ${asOf}. Health Score companie: ${health.score}/100 (${health.grade}) — ` +
    health.components.map((c) => `${c.label} ${c.points}/${c.max} (${c.note})`).join("; ") + ".");
  if (forecast) {
    L.push(`[cashForecast] Necesar de plati: 30z ${lei(forecast.horizonTotals[30] || 0)}, 90z ${lei(forecast.horizonTotals[90] || 0)}.` +
      (forecast.firstDeficit ? ` DEFICIT proiectat din ${forecast.firstDeficit.date} (${lei(forecast.firstDeficit.balanceAfter)}).` : "") +
      (forecast.top90[0] ? ` Cea mai mare plata: ${forecast.top90[0].title} ${lei(forecast.top90[0].amountRON)} pe ${forecast.top90[0].dueDate}.` : ""));
  }
  L.push(`[operational] Task-uri: ${taskGroups.ok} ok, ${taskGroups.azi} scadente azi, ${taskGroups.intarziate} intarziate, ${taskGroups.blocate} blocate. ` +
    `Plati: ${cash.restante} restante, ${cash.scadente3} scadente in 3 zile.`);
  if (sales) L.push(`[operational] Vanzari: ${sales.vandut ?? 0} vandute, ${sales.rezervat ?? 0} rezervate, ${sales.disponibil ?? "?"} disponibile din ${sales.total ?? "?"}; avans incasat: ${sales.avansIncasat ?? 0}.`);
  if (risks.length) L.push(`[riskEngine] Riscuri evaluate determinist:\n` +
    risks.map((r) => `  ${r.level} ${r.descriere} — impact: ${r.impact}; probabilitate: ${r.probabilitate}; recomandare: ${r.recomandare}`).join("\n"));
  L.push(`Date lipsa: ${data_missing.length ? data_missing.join("; ") : "niciuna"}.`);

  return { asOf, dataBlock: L.join("\n"), data_available, data_missing, dataQuality, risks, health, taskGroups, cash };
}

/** Apelul LLM implicit: UN call, cu timeout + 1 retry + fallback null. */
function defaultLlm(maxTokens) {
  const call = ({ system, user }) => callClaude({
    system, messages: [{ role: "user", content: user }],
    maxTokens, model: config.model,
  });
  return withFallback(withRetry(withTimeout(call, LLM_TIMEOUT_MS), { retries: 1 }), () => null);
}

/** Parsare toleranta a JSON-ului din raspunsul modelului. → obiect sau null. */
export function parseBoardJson(text) {
  if (!text || typeof text !== "string") return null;
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

/** Placeholder pentru o perspectiva LLM lipsa/invalida — sedinta continua. */
function missingPerspective(role, why) {
  return {
    role, position: "insufficient_data", confidence: 0,
    arguments: [`Perspectiva ${role} indisponibila: ${why}.`],
    evidence: [], risks: [], conditions: [], alternatives: [],
    unanswered_questions: [`Reia analiza ${role} cand sursa/modelul raspunde.`],
  };
}

/**
 * Ruleaza o sedinta completa de Board. NU decide, NU executa — intoarce
 * obiectul-sedinta (BoardMeeting). Optiuni pentru teste: llm, data, memories,
 * priorDecisions, id, noCache, shadow.
 */
export async function runBoardMeeting(question, opts = {}) {
  const type = opts.type || classifyDecision(question);
  const roleIds = selectDirectors(type);
  const llmRoleIds = roleIds.filter((id) => ROLES[id]?.llm);

  const data = opts.data || await collectBoardData();
  const fingerprint = JSON.stringify([norm(question).slice(0, 160), data.asOf, data.dataQuality,
    data.taskGroups, data.cash, data.risks.map((r) => r.key)]);
  if (!opts.noCache) {
    const hit = _cache.get(fingerprint);
    if (hit !== undefined) return hit;
  }

  const [memories, priorDecisions] = await Promise.all([
    opts.memories ? Promise.resolve(opts.memories) : recall(question, 6).catch(() => []),
    opts.priorDecisions ? Promise.resolve(opts.priorDecisions) : listDecisions(10).catch(() => []),
  ]);

  // UNICUL apel LLM al sedintei (buget de tokeni scalat cu numarul de roluri).
  const llm = opts.llm || defaultLlm(tokensForRoles(llmRoleIds.length));
  const raw = await llm({
    system: buildBoardSystem(roleIds),
    user: buildBoardUser({ question, type, dataBlock: data.dataBlock, memories, priorDecisions }),
  });
  const parsed = parseBoardJson(raw) || {};

  // Normalizare perspective LLM: rol lipsa sau structura invalida → marcata
  // lipsa, sedinta continua (un director picat nu blocheaza Boardul).
  const missing_perspectives = [];
  const byRole = new Map((Array.isArray(parsed.perspectives) ? parsed.perspectives : [])
    .filter((p) => p && typeof p.role === "string")
    .map((p) => [p.role.toUpperCase(), p]));
  const perspectives = llmRoleIds.map((id) => {
    const p = byRole.get(id);
    if (!p) { missing_perspectives.push(id); return missingPerspective(id, "fara raspuns de la model (timeout/eroare)"); }
    const v = validateDirectorOutput({ ...p, role: id });
    if (!v.valid) { missing_perspectives.push(id); return missingPerspective(id, `structura invalida (${v.errors[0]})`); }
    return { ...p, role: id, confidence: Math.max(0, Math.min(100, Number(p.confidence) || 0)) };
  });

  // Perspectivele DETERMINISTE (nu LLM): Founder Voice citind DOAR principii
  // documentate; Guardianul se adauga dupa sinteza.
  if (roleIds.includes("FOUNDER_VOICE")) perspectives.push(founderPerspective(question));

  const reversibility = REVERSIBILITY.includes(parsed.reversibility) ? parsed.reversibility : "necunoscuta";
  const contradictsPrior = parsed.contradicts_prior && typeof parsed.contradicts_prior === "object" &&
    typeof parsed.contradicts_prior.ref === "string" ? parsed.contradicts_prior : null;

  // Sinteza determinista (CEO) + verificarea Guardianului.
  let synthesis = synthesize({
    directors: perspectives, dataQuality: data.dataQuality, reversibility, contradictsPrior,
  });
  const g = guardianReview({ question, directors: perspectives, synthesis });
  if (roleIds.includes("GUARDIAN")) perspectives.push(g.output);
  synthesis = { ...synthesis, codex_compliance: { compliant: g.compliant, issues: g.issues } };

  const meeting = {
    id: opts.id || `bm-${(++_seq).toString(36)}-${Math.abs(fingerprint.length * 2654435761 % 1e9).toString(36)}`,
    asOf: data.asOf, type, question,
    problem: typeof parsed.problem === "string" && parsed.problem ? parsed.problem : question,
    purpose: typeof parsed.purpose === "string" && parsed.purpose ? parsed.purpose : "decizie de analizat in Board",
    data_available: data.data_available, data_missing: data.data_missing,
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.filter((x) => typeof x === "string") : [],
    options: Array.isArray(parsed.options) ? parsed.options.filter((x) => typeof x === "string") : [],
    perspectives,
    risks: Array.isArray(parsed.risks) && parsed.risks.length
      ? parsed.risks.filter((x) => typeof x === "string")
      : data.risks.map((r) => `${r.level} ${r.descriere}`),
    impact: {
      financial: parsed.impact?.financial || "neevaluat",
      operational: parsed.impact?.operational || "neevaluat",
      human: parsed.impact?.human || "neevaluat",
      legal: parsed.impact?.legal || "neevaluat",
      brand_sales: parsed.impact?.brand_sales || "neevaluat",
    },
    reversibility,
    scenarios: {
      success: parsed.scenarios?.success || "nedescris",
      failure: parsed.scenarios?.failure || "nedescris",
    },
    // Structura invalida/neconforma → recomandarea NU se emite (regula CODEX).
    recommendation: g.blockEmission ? null : synthesis,
    blocked: g.blockEmission ? { by: "GUARDIAN", issues: g.issues } : null,
    missing_perspectives,
    founder_decision: null, // punctul 20 — decide Adrian, ulterior
    outcome: null,          // punctul 21 — rezultatul, ulterior
    lesson: null,           // punctul 22 — lectia, ulterior
  };

  if (!opts.noCache) _cache.set(fingerprint, meeting);
  await audit(
    opts.shadow ? "board_shadow" : "board_meeting",
    `${type}: ${String(question).slice(0, 160)}`,
    JSON.stringify({
      rec: meeting.recommendation?.recommendation || "BLOCATA",
      consensus: synthesis.consensus_level, confidence: synthesis.confidence,
      roles: roleIds, missing: missing_perspectives, dq: data.dataQuality,
      disagreements: synthesis.major_disagreements.length,
    }).slice(0, 1900),
  ).catch(() => {});

  return meeting;
}
