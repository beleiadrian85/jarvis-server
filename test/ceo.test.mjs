// Teste CEO AI — nucleul PUR (data map, gaps, cash, sales, people, decision v2,
// proposals, improvements, closed loop). node test/ceo.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

const { buildDataMap } = await import("../src/ceo/companyDataMap.js");
const { buildDataGaps } = await import("../src/ceo/dataGapEngine.js");
const { buildLiquidityModel, CONCEPTS, HORIZONS } = await import("../src/ceo/cashIntelligence.js");
const { buildFunnel, FUNNEL_STAGES } = await import("../src/ceo/salesIntelligence.js");
const { buildPersonProfile, buildTeamProfiles } = await import("../src/ceo/peopleIntelligence.js");
const { preflightDecision, validateDecisionAnalysis, analyzeDecision } = await import("../src/ceo/decisionEngineV2.js");
const { buildActionProposal, validateProposal } = await import("../src/ceo/proposalEngine.js");
const { buildImprovementProposal, validateImprovement, improvementsFromGaps } = await import("../src/ceo/improvementEngine.js");
const { adjustConfidence, buildLoopRecord } = await import("../src/ceo/closedLoop.js");
const { ceoShadowAnswers } = await import("../src/ceo/index.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// ── COMPANY DATA MAP ─────────────────────────────────────────────────────
const map = buildDataMap({});
ok(map.domains.length === 22, `22 domenii in harta (${map.domains.length})`);
ok(map.healthScore >= 0 && map.healthScore <= 100, `health score 0-100 (${map.healthScore})`);
ok(map.partial.includes("CASH") && map.partial.includes("BANK"), "CASH/BANK = PARTIAL (extrase + input manual; soldul automat inca lipseste)");
ok(map.notConnected.includes("EMAIL") && map.notConnected.includes("CALENDAR"), "EMAIL/CALENDAR = NOT_CONNECTED (OAuth neconfigurat — adevarul)");
ok(map.domains.every((d) => d.owner && d.source), "fiecare domeniu are sursa + owner");
// sursa picata LIVE degradeaza starea (ZERO ≠ NU AM DATE)
const mapDown = buildDataMap({ world: { sourceMeta: { missing: ["obligatii de plata"] }, obligations: [], tasks: [], sales: null } });
ok(mapDown.domains.find((d) => d.domain === "PAYABLES").connected === "NOT_CONNECTED", "sursa picata → PAYABLES degradat (nu zero obligatii!)");

// ── DATA GAPS ────────────────────────────────────────────────────────────
const gaps = buildDataGaps(map);
ok(gaps[0].domain === "CASH", "gap #1 = soldul bancar (prioritate ROI)");
ok(gaps[0].why.includes("forecast") && gaps[0].temporary_solution.includes("Dana") && gaps[0].permanent_solution.includes("conector"), "gap-ul canonic: WHY + TEMPORAR (Dana) + PERMANENT (conector)");
ok(gaps[0].information_request?.sent === false && /09:00/.test(gaps[0].information_request.ask), "Information Request pregatit dar NETRIMIS");
ok(gaps.every((g) => g.priority > 0), "gap-urile sunt prioritizate");

// ── CASH INTELLIGENCE: missing != zero; cash != profit ──────────────────
const OB = [
  { dueDate: "2026-07-30", title: "rata IMM", amountRON: 416000, category: "Credit" },
  { dueDate: "2026-07-24", title: "D112", amountRON: 21000, category: "Credit" },
  { dueDate: "2026-07-30", title: "avans", amountRON: 8200, category: "Salarii" },
  { dueDate: "2026-07-22", title: "lift", amountRON: 1210, category: "Mentenanță" },
];
const liq = buildLiquidityModel({ asOf: "2026-07-21", bankBalance: null, obligations: OB });
ok(liq.bank_balance === "UNKNOWN", "sold lipsa → UNKNOWN, NU zero");
ok(liq.horizons[30].projected_liquidity === "UNKNOWN", "lichiditate proiectata fara sold → UNKNOWN, nu se inventeaza");
ok(liq.horizons[30].outflows.total_known === 446410, "iesirile CERTE se calculeaza exact");
ok(liq.horizons[30].outflows.debt_service === 416000 && liq.horizons[30].outflows.payroll_tax === 29200, "separare debt service / payroll (D112 = salarii, o singura galeata)");
ok(liq.data_gaps.includes("BANK_BALANCE") && liq.data_gaps.includes("CONFIRMED_RECEIVABLES"), "componentele lipsa devin Data Gaps");
ok(CONCEPTS.PROFIT.includes("NU e cash") && CONCEPTS.EXPECTED_CASH.includes("NU e cash"), "cash ≠ profit ≠ expected cash (definitii stricte)");
const liqFull = buildLiquidityModel({ asOf: "2026-07-21", bankBalance: 100000, confirmedReceivables: [], probableReceivables: [], obligations: OB, projectCommitments: [] });
ok(liqFull.horizons[30].projected_liquidity === 100000 - 446410, "cu sold cunoscut → lichiditate exacta");
ok(liqFull.complete === true && liq.complete === false, "complete doar cu toate componentele");
ok(HORIZONS.join(",") === "0,7,14,21,30,60,90", "orizonturile cerute");

// ── SALES: stagii neconectate nu se simuleaza ───────────────────────────
const funnel = buildFunnel({ sales: { total: 30, disponibil: 20, rezervat: 6, vandut: 4, avansIncasat: 0 }, history: [] });
ok(FUNNEL_STAGES.length === 9, "funnel cu 9 stagii");
ok(funnel.stages.LEAD.status === "NOT_CONNECTED" && funnel.stages.LEAD.value === null, "LEAD neconectat → null, nu zero");
ok(funnel.connected.includes("RESERVATION") && funnel.connected.includes("CONTRACT"), "stagiile cu sursa sunt conectate");
ok(funnel.detections.some((d) => d.key === "rezervari_fara_avans"), "detectie: rezervari fara avans");
ok(funnel.detections.some((d) => d.key === "fara_baseline"), "fara istoric → NU se inventeaza trend");
const funnelHist = buildFunnel({ sales: { total: 30, disponibil: 20, rezervat: 6, vandut: 4, avansIncasat: 0 }, history: [{ date: "2026-07-01", vandut: 4 }, { date: "2026-07-21", vandut: 4 }] });
ok(funnelHist.detections.some((d) => d.key === "inventar_stagnant"), "cu istoric → stagnarea detectata pe dovezi");

// ── PEOPLE: performanta != numar de task-uri ────────────────────────────
const prof = buildPersonProfile({
  person: { name: "Nelu", role: "executie" },
  tasks: [{ status: "in_lucru", deadline: "2026-07-10" }, { status: "rezolvat" }],
  flags: [{ type: "D1_raport_gol" }, { type: "D1_raport_gol" }, { type: "D3_termen_depasit" }],
  asOf: "2026-07-21",
});
ok(/NU este masura/.test(prof.task_count_note), "nota explicita: task count ≠ performanta");
ok(prof.factors.complexity.value === "necunoscut" && prof.unknown_factors.length >= 4, "factorii fara sursa raman NECUNOSCUTI (nu ghiciti)");
ok(prof.factors.repeated_errors.value.includes("D1_raport_gol×2"), "greseala repetata detectata cu dovezi");
ok(prof.interventions.some((i) => i.type === "analiza_cauza" && /F11/.test(i.note)), "F11: repetarea → analiza cauza (nu sanctiune)");
const profFirst = buildPersonProfile({ person: { name: "Dana", role: "fin" }, tasks: [], flags: [{ type: "D4_validare_restanta" }], asOf: "2026-07-21" });
ok(profFirst.interventions.some((i) => i.type === "invatare"), "prima greseala = invatare (F11)");
ok(buildTeamProfiles({ people: [{ name: "Nelu", aliases: [] }], tasks: [{ assignee: "Nelu", status: "nou" }], flags: [], asOf: "2026-07-21" })[0].person === "Nelu", "profiluri pe echipa");

// ── DECISION V2: 6+1; date critice lipsa != recomandare ─────────────────
const pre = preflightDecision({ question: "Incepem corpul 2?", criticalData: { sold_bancar: null, cost_constructie: 5000000 } });
ok(pre?.status === "DATA_REQUIRED" && pre.missing_data.includes("sold_bancar"), "date critice lipsa → DATA_REQUIRED FARA apel LLM");
ok(preflightDecision({ question: "x", criticalData: { a: 1 } }) === null, "date complete → trece la analiza");
const S = (name) => ({ name, description: "d", upside: "u", downside: "d", cash_impact: "necunoscut", profit_impact: "necunoscut", time_impact: "t", risk: "r", reversibility: "reversibila", people_impact: "p", company_value_impact: "v", unknowns: [], confidence: 60 });
ok(validateDecisionAnalysis({ status: "RECOMMENDED", scenarios: [S("a"), S("b")], scenario7: { recommendation: "b", why_now: "pentru ca..." } }).valid, "6+1 valid cu 2 scenarii REALE (nu se umple la 6)");
ok(!validateDecisionAnalysis({ status: "RECOMMENDED", scenarios: [S("a")], scenario7: { recommendation: "a", why_now: "x" } }).valid, "1 scenariu → invalid (minim 2 optiuni reale)");
ok(!validateDecisionAnalysis({ status: "RECOMMENDED", scenarios: Array.from({ length: 7 }, (_, i) => S("s" + i)), scenario7: { recommendation: "x", why_now: "y" } }).valid, "7 scenarii → invalid (max 6)");
ok(!validateDecisionAnalysis({ status: "RECOMMENDED", scenarios: [S("a"), S("b")], scenario7: { recommendation: "b" } }).valid, "scenariul 7 fara DE CE ACUM → invalid");
const dec = await analyzeDecision({ question: "Q?", dataBlock: "date", criticalData: {}, llm: async () => JSON.stringify({ status: "RECOMMENDED", scenarios: [S("a"), S("b"), S("c")], scenario7: { recommendation: "c", why_now: "cash pozitiv acum", conditions: [], stop_conditions: [], confidence: 70 } }) });
ok(dec.status === "RECOMMENDED" && dec.scenario7.recommendation === "c", "analiza completa cu LLM injectat");
const decBad = await analyzeDecision({ question: "Q?", dataBlock: "d", criticalData: {}, llm: async () => "gunoi" });
ok(decBad.status === "DATA_REQUIRED", "raspuns model invalid → DATA_REQUIRED, nu recomandare falsa");

// ── PROPOSALS: proposal != execution; recommendation != approval ────────
const prop = buildActionProposal({ problem: "Sold lipsa", evidence: ["[data-map] CASH"], recommendation: "Cere soldul", assignee: "dana", deadline: "zilnic", expected_result: "sold in sistem", verification_rule: "CASH=CONNECTED" });
ok(prop.state === "draft" && prop.executed === false && prop.requires_founder_approval === true, "propunere: draft, neexecutata, cere aprobarea fondatorului");
ok(prop.task_proposal.sent === false, "task proposal NETRIMIS in shadow");
ok(!validateProposal({ ...prop, executed: true }).valid, "propunere ≠ executie (executed=true respins)");
ok(!validateProposal({ ...prop, task_proposal: { ...prop.task_proposal, sent: true } }).valid, "task trimis in shadow → respins");
ok(!validateProposal({ ...prop, evidence: [] }).valid, "propunere fara dovezi → respinsa (observatie ≠ fapt)");

// ── IMPROVEMENTS ────────────────────────────────────────────────────────
const imps = improvementsFromGaps(gaps);
ok(imps.length > 0 && imps.every((i) => validateImprovement(i).valid), "improvements valide din gaps");
ok(imps.every((i) => i.approval_required === true), "orice improvement cere aprobare (zero auto-modificare)");
ok(!validateImprovement(buildImprovementProposal({ problem: "x" })).valid, "improvement incomplet → invalid");

// ── CLOSED LOOP ─────────────────────────────────────────────────────────
ok(adjustConfidence(50, "success") === 60 && adjustConfidence(50, "failure") === 35, "confidence ajustat determinist");
ok(adjustConfidence(92, "success") === 95 && adjustConfidence(10, "failure") === 5, "confidence plafonat 5-95");
const loop = buildLoopRecord({ strategy_key: "presiune_avansuri", recommendation: "Cere avansuri", because: "rezervari fragile", expected_effect: "cash +" });
ok(loop.state === "recommended" && loop.outcome === null, "bucla: recomandat ≠ aprobat ≠ verificat");

// ── SHADOW ANSWERS: fundamentate sau DATA GAP ───────────────────────────
const CTX = {
  world: {
    now: "2026-07-21T08:00:00.000Z", asOf: "2026-07-21",
    obligations: OB, tasks: [{ assignee: "Nelu", status: "in_lucru", deadline: "2026-07-10", title: "Conducta" }],
    sales: { total: 30, disponibil: 20, rezervat: 6, vandut: 4, avansIncasat: 0 },
    openingBalance: null, disciplineFlags: [{ type: "D3_termen_depasit", assignee: "Nelu" }],
    decisions: [], sourceMeta: { missing: [], freshnessHours: 0 },
  },
  observations: [{ title: "Obligatii mari 21z", severity: "medium", _score: 50, evidence: ["[operational] x"], type: "cash_gap_21d" }],
  episodes: [], candidates: [{ attention_level: "DATA_REQUIRED_BEFORE_DECISION", title: "Lichiditate", missing_data: ["sold"] }],
  salesHistory: [],
};
const ans = ceoShadowAnswers(CTX);
ok(ans.q1_top5_probleme.length >= 1 && ans.q1_top5_probleme.length <= 5, "Q1: top probleme (max 5)");
ok(ans.q2_cash.ce_nu_stim.includes("BANK_BALANCE"), "Q2: cash — declara explicit ce NU stim");
ok(ans.q3_dana.some((t) => /sold/i.test(t)), "Q3: Dana — cererea de sold (fundamentata pe gap)");
ok(ans.q5_adrian.some((t) => /sold|datele/i.test(t)), "Q5: Adrian — asigura datele blocante");
ok(ans.q7_informatii_lipsa.length >= 3, "Q7: informatiile lipsa listate");
ok(ans.q9_top3_oportunitati.length === 3 && ans.q9_top3_oportunitati.every((o) => /\[/.test(o)), "Q9: 3 oportunitati, fiecare cu sursa");
ok(ans.q10_riscuri_30_zile.length >= 2, "Q10: riscuri pe 30 zile fundamentate");
ok(JSON.stringify(ceoShadowAnswers(CTX)) === JSON.stringify(ans), "raspunsuri deterministe");

// ── PRODUCTIZARE: nucleul nu hardcodeaza compania ───────────────────────
import { readFileSync } from "node:fs";
const CORE = ["companyDataMap.js", "dataGapEngine.js", "cashIntelligence.js", "salesIntelligence.js", "peopleIntelligence.js", "decisionEngineV2.js", "proposalEngine.js", "improvementEngine.js", "closedLoop.js", "selfAudit.js"];
const coreSrc = CORE.map((f) => readFileSync(new URL(`../src/ceo/${f}`, import.meta.url), "utf8"));
const hardcoded = CORE.filter((f, i) => /Dana|Nelu|Mihaela|Bell Residence/i.test(coreSrc[i].replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")));
ok(hardcoded.length === 0, `nucleul generic fara nume hardcodate (${hardcoded.join(",") || "curat"}) — compania e in companyConfig`);

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — ceo (pur)`);
process.exit(failed === 0 ? 0 : 1);
