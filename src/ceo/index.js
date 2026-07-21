// CEO AI — orchestratorul (CODEX Master Phase). Compune toate motoarele intr-o
// imagine unica si raspunde DETERMINIST (fara LLM) la intrebarile de CEO.
// Regula: fiecare raspuns e FUNDAMENTAT pe surse sau declara DATA GAP explicit.
// READ-ONLY total: zero actiuni, zero task-uri, zero notificari.
import { COMPANY } from "./companyConfig.js";
import { buildDataMap, formatDataMap } from "./companyDataMap.js";
import { buildDataGaps, formatDataGaps } from "./dataGapEngine.js";
import { buildLiquidityModel, formatLiquidity, computeMinimumCash } from "./cashIntelligence.js";
import { buildReceivablesRegister, confirmedForCash } from "./receivablesEngine.js";
import { topPriorities } from "./priorityEngine.js";
import { buildFunnel, salesSnapshot } from "./salesIntelligence.js";
import { buildTeamProfiles } from "./peopleIntelligence.js";
import { buildActionProposal, recordProposals } from "./proposalEngine.js";
import { improvementsFromGaps, recordImprovements } from "./improvementEngine.js";
import { ceoSystemHealth, formatSystemHealth } from "./selfAudit.js";
import { getState, setState } from "../state.js";

export { COMPANY, buildDataMap, formatDataMap, buildDataGaps, formatDataGaps };
export { buildLiquidityModel, formatLiquidity, buildFunnel, buildTeamProfiles };
export { ceoSystemHealth, formatSystemHealth };
export { analyzeDecision, preflightDecision, validateDecisionAnalysis } from "./decisionEngineV2.js";
export { buildActionProposal, validateProposal, recordProposals, listProposals } from "./proposalEngine.js";
export { buildImprovementProposal, improvementsFromGaps, recordImprovements } from "./improvementEngine.js";
export { buildLoopRecord, recordLoop, closeLoop, adjustConfidence, strategyConfidence } from "./closedLoop.js";
// Master Phase 2 — Data Loop + Management Loop.
export { setBalance, getBalances, validateBalanceEntry } from "./balanceStore.js";
export { computeMinimumCash } from "./cashIntelligence.js";
export { buildReceivablesRegister, confirmedForCash } from "./receivablesEngine.js";
export { buildFinancingRegister } from "./financingRegister.js";
export { topPriorities, scorePriority } from "./priorityEngine.js";
export { whoNeedsToDoWhat, forward30, NO_ACTION } from "./managementView.js";
export { buildCapabilityManifest } from "./capabilityManifest.js";
export { decideProposal } from "./proposalEngine.js";
export { scoreImprovement, rankBacklog } from "./improvementEngine.js";

/** Contextul complet al CEO-ului (world + episoade + gate), READ-ONLY. */
export async function collectCeoContext() {
  const { collectWorld } = await import("../observationEngine/observationSources.js");
  const { runObservationCycle } = await import("../observationEngine/observationRunner.js");
  const { runProactivePipeline } = await import("../proactiveCeo/pipelineRunner.js");
  const { runFounderGate } = await import("../founderAttention/founderGateRunner.js");

  const world = await collectWorld();
  const obs = await runObservationCycle({ kind: "ceo-context", noCache: true, llm: null, persist: false, previousState: {} });
  const prevEpisodes = await getState("proactive:episodes", {}).catch(() => ({}));
  const pipe = obs.observations?.length
    ? await runProactivePipeline(obs.observations, { persist: false, previousEpisodes: prevEpisodes })
    : { episodes: [], briefs: [], previews: [] };
  const gate = pipe.episodes?.length
    ? await runFounderGate({ briefable: pipe.episodes, allEpisodes: pipe.episodes }, { persist: false, previousCandidates: {}, counters: null })
    : { candidates: [], digest: null };

  // Snapshot zilnic vanzari (pentru baseline-ul de trend) — doar date reale.
  const snap = salesSnapshot(world.sales, world.asOf);
  if (snap) {
    const hist = await getState("sales:history", []).catch(() => []);
    if (!hist.some((h) => h.date === snap.date)) {
      await setState("sales:history", [...hist.slice(-60), snap]).catch(() => {});
    }
  }
  const history = await getState("sales:history", []).catch(() => []);

  // Master Phase 2 — sursele noi (best-effort, read-only).
  const { getBalances } = await import("./balanceStore.js");
  const { getIncomeInvoices, getEstimatedInflows, getBankStatementsSummary, getSupplierBacklog } = await import("../connectors/opsdata.js");
  const [balances, incomeInvoices, inflows, bankStatements, supplierBacklog] = await Promise.all([
    getBalances().catch(() => null),
    getIncomeInvoices().catch(() => null),
    getEstimatedInflows().catch(() => null),
    getBankStatementsSummary().catch(() => null),
    getSupplierBacklog().catch(() => null),
  ]);

  return {
    world, observations: obs.observations || [], episodes: pipe.episodes || [],
    candidates: gate.candidates || [], salesHistory: history,
    balances, incomeInvoices, inflows, bankStatements, supplierBacklog,
  };
}

const lei = (n) => typeof n === "number" ? Math.round(n).toLocaleString("ro-RO") + " lei" : String(n);

// Ajutoare sigure (ctx poate veni fara sursele noi — teste vechi raman valide).
function buildReceivablesRegisterSafe(ctx) {
  try {
    if (ctx.incomeInvoices === undefined && ctx.inflows === undefined) return null;
    return buildReceivablesRegister({
      asOf: ctx.world.asOf, incomeInvoices: ctx.incomeInvoices ?? null,
      estimatedInflows: ctx.inflows ?? null, sales: ctx.world.sales ?? null,
    });
  } catch { return null; }
}
function confirmedForCashSafe(register) {
  try { return confirmedForCash(register); } catch { return null; }
}

/**
 * Cele 10 raspunsuri de CEO — DETERMINISTE, pe surse sau DATA GAP. PUR peste
 * contextul dat (injectabil in teste).
 */
export function ceoShadowAnswers(ctx) {
  const { world, observations = [], episodes = [], candidates = [], salesHistory = [] } = ctx;
  const map = buildDataMap({ world });
  const gaps = buildDataGaps(map);

  // Master Phase 2: soldul din balanceStore (daca e proaspat) + incasarile
  // confirmate din registrul de receivables intra in modelul de lichiditate.
  const bankBalance = ctx.balances && !ctx.balances.expired && ctx.balances.totalRON != null
    ? ctx.balances.totalRON : (world.openingBalance ?? null);
  const receivables = buildReceivablesRegisterSafe(ctx);
  const confirmedIn = receivables ? confirmedForCashSafe(receivables) : null;

  const liq = buildLiquidityModel({
    asOf: world.asOf, bankBalance,
    confirmedReceivables: confirmedIn, probableReceivables: null,
    obligations: world.obligations || [], projectCommitments: null,
  });
  const funnel = buildFunnel({ sales: world.sales, history: salesHistory });
  const team = buildTeamProfiles({ people: COMPANY.people, tasks: world.tasks || [], flags: world.disciplineFlags || [], asOf: world.asOf });
  const improvements = improvementsFromGaps(gaps);

  const topProblems = [
    ...observations.filter((o) => ["medium", "high", "critical"].includes(o.severity))
      .map((o) => ({ score: o._score ?? 0, text: `${o.title} [${o.severity}]`, ev: o.evidence?.[0] })),
    ...(map.notConnected.includes("CASH") ? [{ score: 60, text: "Soldul bancar nu e conectat — lichiditatea NETA e necunoscuta", ev: "[data-map] CASH=NOT_CONNECTED" }] : []),
  ].sort((a, b) => b.score - a.score).slice(0, 5);

  const personTasks = (name) => {
    const p = team.find((t) => t.person.toLowerCase() === name);
    const req = gaps.filter((g) => g.information_request?.to?.toLowerCase() === name)
      .map((g) => g.information_request.ask);
    return { profile: p, requests: req };
  };
  const dana = personTasks("dana"), nelu = personTasks("nelu");

  const decisionsNear = [
    ...episodes.filter((e) => e._minUrgencyDays != null && e._minUrgencyDays <= 7 && e.status !== "resolved")
      .map((e) => `${e.title} — in ${e._minUrgencyDays} zile`),
    ...candidates.filter((c) => ["FOUNDER_DECISION_REQUIRED", "DATA_REQUIRED_BEFORE_DECISION"].includes(c.attention_level))
      .map((c) => `${c.attention_level === "DATA_REQUIRED_BEFORE_DECISION" ? "(intai datele) " : ""}${c.title}`),
  ];

  const opportunities = [];
  if (world.sales?.rezervat > 0 && (world.sales?.avansIncasat ?? 0) === 0)
    opportunities.push({ text: `Colectarea avansurilor pe cele ${world.sales.rezervat} rezervari = cash rapid si pipeline confirmat`, ev: "[operational] sales_summary" });
  if ((world.sales?.disponibil ?? 0) > 0)
    opportunities.push({ text: `${world.sales.disponibil} unitati disponibile cu funnel amonte neconectat — conectarea lead-urilor deblocheaza vanzarea sistematica`, ev: "[data-map] LEADS=NOT_CONNECTED" });
  opportunities.push({ text: "Conectarea soldului bancar transforma forecastul brut in zi-exacta-a-deficitului (decizie de finantare la timp)", ev: "[data-map] CASH" });

  const out30 = liq.horizons[30]?.outflows.total_known ?? 0;
  const risks30 = [
    `Iesiri certe de ${lei(out30)} in 30 de zile fara vizibilitate pe acoperire (sold necunoscut)`,
    ...episodes.filter((e) => e.status === "worsening").map((e) => `${e.title} — deja in agravare`),
    ...(observations.some((o) => o.type === "restante") ? ["Restantele acumuleaza penalitati zilnic"] : []),
    "Rezervarile fara avans se pot anula fara cost — pipeline-ul de vanzari poate scadea silentios",
  ].slice(0, 5);

  // Master Phase 2: punctul minim de cash + prioritatile + management view.
  const minCash = computeMinimumCash({
    asOf: world.asOf, bankBalance,
    confirmedReceivables: confirmedIn, obligations: world.obligations || [],
  });
  const priorities = topPriorities({ observations, episodes, gaps, asOf: world.asOf });

  return {
    generated_at: world.now, company: COMPANY.name,
    q1_top5_probleme: topProblems.length ? topProblems.map((p) => `${p.text}${p.ev ? ` · ${p.ev}` : ""}`) : ["Fara probleme medium+ in datele curente."],
    q2_cash: { rezumat: formatLiquidity(liq), ce_nu_stim: liq.data_gaps, incredere: liq.confidence, minim: minCash },
    receivables: receivables ? { statement: receivables.statement, totals: receivables.totals, gaps: receivables.data_gaps } : null,
    priorities: priorities.priorities,
    q3_dana: dana.requests.length || dana.profile?.interventions.length
      ? [...dana.requests, ...(dana.profile?.interventions || []).map((i) => i.note)]
      : ["Nimic urgent fundamentat pe date pentru Dana azi."],
    q4_nelu: nelu.profile?.interventions.length
      ? nelu.profile.interventions.map((i) => i.note)
      : ["Nimic urgent fundamentat pe date pentru Nelu azi."],
    q5_adrian: [
      ...candidates.filter((c) => c.attention_level === "DATA_REQUIRED_BEFORE_DECISION").map((c) => `Asigura datele: ${c.missing_data[0] || "?"} (blocheaza decizia „${c.title}”)`),
      ...candidates.filter((c) => c.attention_level === "FOUNDER_DECISION_REQUIRED").map((c) => `Decide: ${c.title}`),
      ...(decisionsNear.length === 0 && candidates.length === 0 ? ["Zi fara decizii blocate pe tine — construieste."] : []),
    ],
    q6_decizii_apropiate: decisionsNear.length ? [...new Set(decisionsNear)] : ["Nicio decizie cu termen ≤7 zile in date."],
    q7_informatii_lipsa: gaps.slice(0, 6).map((g) => `${g.data_gap} (${g.domain}) — ${g.why}`),
    q8_sisteme_de_imbunatatit: improvements.slice(0, 5).map((i) => `${i.problem} → ${i.proposed_change}`),
    q9_top3_oportunitati: opportunities.slice(0, 3).map((o) => `${o.text} · ${o.ev}`),
    q10_riscuri_30_zile: risks30,
    data_health: { score: map.healthScore, not_connected: map.notConnected },
    funnel_connected: funnel.connected, funnel_missing: funnel.not_connected,
  };
}

/** Ruleaza contextul + raspunsurile + persistenta shadow (propuneri/improvements). */
export async function runCeoShadow({ persist = true } = {}) {
  const ctx = await collectCeoContext();
  const answers = ceoShadowAnswers(ctx);
  const map = buildDataMap({ world: ctx.world });
  const gaps = buildDataGaps(map);
  if (persist) {
    const improvements = improvementsFromGaps(gaps);
    await recordImprovements(improvements, { persist: true });
    // Information Request-urile devin propuneri SHADOW (netrimise).
    const proposals = gaps.filter((g) => g.information_request).map((g) => {
      const p = buildActionProposal({
        id: `prop:inforeq:${g.domain.toLowerCase()}`,
        problem: g.data_gap, evidence: [`[data-map] ${g.domain}`, g.why],
        recommendation: `Cere: ${g.information_request.ask}`,
        assignee: g.information_request.to, deadline: g.information_request.cadence,
        expected_result: "Data disponibila pentru CEO AI", verification_rule: "Domeniul trece pe CONNECTED in data map",
        source: "data-gap-engine", severity: g.severity === "major" ? "high" : "medium",
      });
      // PRIMA ACTIUNE CONTROLATA (Master Phase 3): planul complet de livrare —
      // gata, dar NETRIMIS. Dupa APPROVE, fluxul viitor executa pasii de mai jos.
      if (g.domain === "CASH") {
        p.readiness = "READY_FOR_FIRST_CONTROLLED_EXECUTION";
        p.what_it_unlocks = "Lichiditate NETA, punctul minim de cash, ziua deficitului — instant.";
        p.risk_if_nothing = "654k+ lei iesiri/30z fara vizibilitate pe acoperire.";
        p.delivery_plan = {
          steps: ["trimite cererea (Telegram, prin approvalGate)", "confirma livrarea", "asteapta soldurile (formular Command Center)",
            "valideaza intrarile (balanceStore)", "recalculeaza cash + min/deficit", "inchide gap-ul CASH", "actualizeaza CEO Brief", "masoara outcome (closed loop)"],
          sent: false, gated_by: "aprobarea explicita a lui Adrian + activarea livrarii (faza separata)",
        };
      }
      return p;
    });
    await recordProposals(proposals, { persist: true });
  }
  return answers;
}
