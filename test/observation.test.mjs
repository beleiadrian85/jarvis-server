// Teste Observation Engine — nucleul PUR (scoring, detectori, validare,
// deduplicare, escaladare) pe date simulate. node test/observation.test.mjs
import { scoreObservation, severityForScore, dataQualityForAge } from "../src/observationEngine/observationScoring.js";
import { validateObservation, partitionValid } from "../src/observationEngine/observationValidator.js";
import { runDetectorRegistry, finalizeObservations } from "../src/observationEngine/observationRegistry.js";
import { reconcile } from "../src/observationEngine/observationDeduplicator.js";
import { applyEscalation } from "../src/observationEngine/observationEscalation.js";
import { worldFingerprint } from "../src/observationEngine/observationCache.js";
import { deterministicSummary } from "../src/observationEngine/observationSummary.js";

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// ── World simulat (bogat) ────────────────────────────────────────────────
const NOW = "2026-07-17T10:00:00.000Z";
const WORLD = {
  now: NOW, asOf: "2026-07-17", period: { from: "2026-07-17", to: "2026-07-17" },
  obligations: [
    { dueDate: "2026-07-20", title: "rata IMM", amountRON: 416000, category: "Credit" },
    { dueDate: "2026-07-24", title: "contributii salarii D112", amountRON: 21000, category: "TVA" },
    { dueDate: "2026-07-10", title: "factura beton", amountRON: 30000, category: "Furnizori" },
  ],
  tasks: [
    { id: "T1", status: "in_lucru", deadline: "2026-07-25", assignee: "Nelu", title: "Conducta" },
    { id: "T2", status: "nou", deadline: null, assignee: null, title: "Aviz ISU" },
    { id: "T3", status: "nou", deadline: null, assignee: "Dana", title: "Dosar banca" },
    { id: "T4", status: "nou", deadline: null, assignee: "Dana", title: "Oferte" },
  ],
  taskGroups: { blocate: 0, azi: 0, intarziate: 0, ok: 4 },
  sales: { total: 30, disponibil: 20, rezervat: 6, vandut: 4, avansIncasat: 0 },
  openingBalance: null, forecast: null,
  predictions: [{ key: "assignee_overload:Nelu", title: "Supraincarcare Nelu", severity: "high", probability: 0.95, score: 93, daysUntilProblem: 3, recommendation: "redistribuie", why: "Nelu: load 12 (media 9)" }],
  health: { score: 58 }, reminders: [],
  decisions: [
    { id: 1, decided_on: "2026-06-01", decision: "Oprim extinderea pe terenul Hipodrom pana vindem Corp 3", review_by: "2026-07-01" },
    { id: 2, decided_on: "2026-07-10", decision: "Continuam extinderea pe terenul Hipodrom cu finantare noua", review_by: null },
  ],
  disciplineFlags: [
    { type: "D3_termen_depasit", taskId: "T9", title: "Conducta C3", assignee: "Nelu", evidence: "termen 2026-06-29" },
    { type: "D1_raport_gol", taskId: "T8", title: "Verificat pod", assignee: "Nelu", evidence: "raport gol" },
    { type: "D4_validare_restanta", taskId: "T5", title: "A", assignee: "Nelu", evidence: "3 zile" },
    { type: "D4_validare_restanta", taskId: "T6", title: "B", assignee: "Dana", evidence: "4 zile" },
    { type: "D4_validare_restanta", taskId: "T7", title: "C", assignee: "Dana", evidence: "5 zile" },
  ],
  auditRecent: [
    { action: "consiliu", detail: "Analizeaza corpul nou Bell Residence extindere", created_at: "2026-07-16" },
    { action: "board_shadow", detail: "Analizeaza corpul nou Bell Residence extindere", created_at: "2026-07-15" },
    { action: "consiliu", detail: "Analizeaza corpul nou Bell Residence extindere", created_at: "2026-07-14" },
    { action: "board_shadow_error", detail: "x", created_at: "2026-07-16" },
  ],
  errors: [{ kind: "board_shadow_error", count: 4, lastAt: "2026-07-16" }],
  pendingApprovals: 7,
  jobs: [{ name: "backup", lastRunAt: "2026-07-10T03:00:00.000Z", expectedHours: 24 }],
  traffic: null,
  sourceMeta: { collectedAt: NOW, missing: [], freshnessHours: 0 },
};

// ── Test 16: scoring determinist ─────────────────────────────────────────
const F = { financialImpactRON: 437000, urgencyDays: 3, probability: 0.9, operationalRisk: true, dataQuality: "partial" };
ok(JSON.stringify(scoreObservation(F)) === JSON.stringify(scoreObservation({ ...F })), "scoring: aceeasi intrare → acelasi scor (determinist)");
ok(scoreObservation(F).score === Math.round(Math.min(100, 30 + 15 + 9 + 5) * 0.85), "scoring: aritmetica exacta a factorilor");
ok(severityForScore(80) === "critical" && severityForScore(60) === "high" && severityForScore(40) === "medium" && severityForScore(20) === "low" && severityForScore(5) === "info", "scoring: praguri de severitate");
ok(scoreObservation({}).score === 0 && scoreObservation({}).severity === "info", "scoring: fara factori → 0/info");
// ── Test 20: datele vechi reduc data_quality ─────────────────────────────
ok(dataQualityForAge("complete", 30) === "partial" && dataQualityForAge("complete", 80) === "poor", "date vechi: >24h → partial, >72h → poor");
ok(dataQualityForAge("complete", 2) === "complete", "date proaspete raman complete");

// ── Detectori pe world simulat ───────────────────────────────────────────
const drafts = runDetectorRegistry(WORLD);
const byType = (t) => drafts.find((d) => d.type === t);
ok(byType("cash_gap_21d"), "cash: obligatii pe 21 de zile detectate");
// Test 14: lipsa soldului declarata explicit
ok(/NU este conectat/i.test(byType("cash_gap_21d").summary) && byType("cash_gap_21d").unknowns.length > 0, "cash: lipsa soldului bancar DECLARATA (nu inventata)");
// Test 15: cash nu e profit
ok(!drafts.some((d) => d.category === "cash" && /profit/i.test(d.summary + d.title)), "cash: niciun detector nu confunda cash-ul cu profitul");
ok(byType("restante") && /restante/.test(byType("restante").title), "cash: restantele detectate");
ok(byType("rezervari_fara_avans"), "sales: rezervari fara avans detectate");
// Test 13: lipsa datelor NU e zero
const emptyWorld = { ...WORLD, sales: null, traffic: null, obligations: [], predictions: [], disciplineFlags: [], decisions: [], errors: [], jobs: [], pendingApprovals: null, auditRecent: [], tasks: [] };
const emptyDrafts = runDetectorRegistry(emptyWorld);
ok(!emptyDrafts.some((d) => ["sales", "traffic", "cash"].includes(d.category)), "lipsa datelor NU produce observatii de zero (sales/traffic/cash tac)");
// Test 27: task fara responsabil
ok(byType("task_no_owner") && byType("task_no_owner").evidence.length > 0, "task important fara responsabil detectat, cu dovezi");
// Test 26: job esuat/oprit
ok(byType("job_stale") && /backup/.test(byType("job_stale").title), "job care nu a rulat detectat");
ok(byType("repeated_errors"), "erori repetitive detectate");
// Test 24: contradictia produce cerinta de explicatie
const contra = byType("decision_contradiction");
ok(contra && contra.contradiction?.needsExplanation === true, "contradictie de decizie detectata (oprim vs continuam pe acelasi subiect)");
ok(contra.unknowns.some((u) => /F40|revizuire explicita|informatii noi/.test(u)), "contradictia CERE explicatie (F40)");
// Test 25: decizie cu revizuire depasita
ok(byType("decision_overdue"), "decizie aprobata cu termen de revizuire depasit detectata");
ok(byType("analysis_no_decision"), "aceeasi problema analizata repetat fara decizie detectata");
// Test 28: founder — formulare neutra
const founder = byType("founder_dependency");
ok(founder && /Compania depinde inca de interventia fondatorului/.test(founder.title), "dependenta de fondator: formulare neutra obligatorie");
ok(!/controleaza excesiv|obsesiv|psiholog/i.test(founder.summary), "founder: fara analiza psihologica sau critica personala");
ok(byType("repeated_discipline") && byType("repeated_discipline").possible_causes.length === 6, "people: cauzele separate in cele 6 tipuri de lipsa");
// people adaptor predictii
ok(drafts.some((d) => d.type === "pred_assignee_overload" && d.category === "people"), "predictionEngine reutilizat: supraincarcarea devine observatie people");

// ── Finalizare + schema ──────────────────────────────────────────────────
const finalized = finalizeObservations(drafts, WORLD);
const { valid, rejected } = partitionValid(finalized);
ok(valid.length === finalized.length && rejected.length === 0, `toate observatiile finalizate respecta schema (${valid.length})`);
// Test 18: sursele etichetate
ok(valid.every((o) => o.evidence.every((e) => /^\[[^\]]+\]/.test(e))), "toate dovezile au sursa etichetata [sursa]");
// Test 19: confidence 0-100
ok(valid.every((o) => o.confidence >= 0 && o.confidence <= 100), "confidence limitat 0-100");
const clamped = finalizeObservations([{ ...drafts[0], confidence: 250 }], WORLD)[0];
ok(clamped.confidence === 100, "confidence >100 → limitat la 100");
// Test 17: fara dovezi → respins
const noEvidence = { ...valid[0], evidence: [] };
ok(!validateObservation(noEvidence).valid, "observatie fara dovezi → RESPINSA");
ok(!validateObservation({ ...valid[0], evidence: ["fara eticheta"] }).valid, "dovada fara eticheta [sursa] → respinsa");
// Test 34: structura stabila
ok(JSON.stringify(finalizeObservations(runDetectorRegistry(WORLD), WORLD)) === JSON.stringify(finalized), "aceeasi intrare → structura identica (determinism)");
// Test 9 (amprenta): date identice → aceeasi amprenta
ok(worldFingerprint(WORLD) === worldFingerprint(JSON.parse(JSON.stringify(WORLD))), "date identice → amprenta identica (fara reanalizare)");
ok(worldFingerprint(WORLD) !== worldFingerprint({ ...WORLD, pendingApprovals: 2 }), "date diferite → amprenta diferita");

// ── Deduplicare / statusuri / cooldown ───────────────────────────────────
const mkObs = (key, score, severity = "medium") => ({
  ...valid[0], deduplication_key: key, observation_id: `obs:${key}`, _score: score, severity,
  title: `obs ${key}`, category: "cash", type: "t",
});
const nowMs = Date.parse(NOW);
// nou
const r1 = reconcile({ previous: {}, observations: [mkObs("k1", 50)], nowMs });
ok(r1.emitted.length === 1 && r1.emitted[0].status === "new", "prima aparitie → status new");
// Test 10: agravare
const r2 = reconcile({ previous: { k1: { score: 40, severity: "medium", count: 1, lastSeenMs: nowMs - 3_600_000, lastEmittedMs: nowMs - 3_600_000, title: "t", category: "cash", type: "t" } }, observations: [mkObs("k1", 55)], nowMs });
ok(r2.emitted.length === 1 && r2.emitted[0].status === "worsening", "scor +10 → worsening (iese din cooldown)");
// Test 11: ameliorare
const r3 = reconcile({ previous: { k1: { score: 70, severity: "high", count: 2, lastSeenMs: nowMs - 3_600_000, lastEmittedMs: nowMs - 3_600_000, title: "t", category: "cash", type: "t" } }, observations: [mkObs("k1", 50)], nowMs });
ok(r3.emitted[0]?.status === "improving", "scor -10 → improving");
// Test 23: cooldown pe repeated
const r4 = reconcile({ previous: { k1: { score: 50, severity: "medium", count: 2, lastSeenMs: nowMs - 3_600_000, lastEmittedMs: nowMs - 3_600_000, title: "t", category: "cash", type: "t" } }, observations: [mkObs("k1", 52)], nowMs });
ok(r4.emitted.length === 0 && r4.suppressed.some((s) => s.reason === "cooldown"), "repeated in fereastra de cooldown → suprimat");
const r5 = reconcile({ previous: { k1: { score: 50, severity: "medium", count: 2, lastSeenMs: nowMs - 90_000_000, lastEmittedMs: nowMs - 25 * 3_600_000, title: "t", category: "cash", type: "t" } }, observations: [mkObs("k1", 52)], nowMs });
ok(r5.emitted.length === 1 && r5.emitted[0].status === "repeated", "dupa cooldown → re-emis ca repeated");
// Test 12: rezolvare (emisa O singura data)
const r6 = reconcile({ previous: { gone: { score: 60, severity: "high", count: 3, lastSeenMs: nowMs - 3_600_000, lastEmittedMs: nowMs - 3_600_000, title: "problema veche", category: "cash", type: "t" } }, observations: [], nowMs });
ok(r6.emitted.length === 1 && r6.emitted[0].status === "resolved" && /Rezolvat/.test(r6.emitted[0].title), "problema disparuta → observatie resolved");
const r7 = reconcile({ previous: r6.state, observations: [], nowMs: nowMs + 1000 });
ok(r7.emitted.length === 0, "resolved se emite O SINGURA data");
// Test 21: semnale slabe filtrate
const r8 = reconcile({ previous: {}, observations: [mkObs("weak", 10, "info")], nowMs });
ok(r8.emitted.length === 0 && r8.suppressed.some((s) => s.reason === "semnal_slab"), "semnal slab (scor<15, count<3) → filtrat");
const r9 = reconcile({ previous: { weak: { score: 10, severity: "info", count: 2, lastSeenMs: nowMs - 3_600_000, lastEmittedMs: 0, title: "w", category: "cash", type: "t" } }, observations: [mkObs("weak", 10, "info")], nowMs });
ok(r9.emitted.length === 1, "semnal slab persistent (count≥3) → emis");
// Test 22: limita maxima per rulare
const many = [mkObs("a", 90, "critical"), mkObs("b", 80, "critical"), mkObs("c", 70, "high")];
const r10 = reconcile({ previous: {}, observations: many, nowMs, maxPerRun: 2 });
ok(r10.emitted.length === 2 && r10.suppressed.some((s) => s.reason === "peste_limita"), "maxim 2/rulare → al 3-lea suprimat");
ok(r10.emitted[0]._score >= r10.emitted[1]._score, "prioritizare dupa scor descrescator");

// ── Test 29: escaladarea marcata corect ──────────────────────────────────
const esc1 = applyEscalation({ ...valid[0], severity: "critical", _factors: { urgencyDays: 2 } });
ok(esc1.requires_board_review && esc1.requires_immediate_action, "critical + urgent → board review + actiune imediata");
const esc2 = applyEscalation({ ...valid[0], severity: "medium", _factors: { financialImpactRON: 437000 } });
ok(esc2.requires_board_review && /impact financiar/.test(esc2.escalation_reason), "impact ≥100k lei → board review cu motiv");
const esc3 = applyEscalation({ ...valid[0], severity: "low", _factors: {}, _threatensCore: null, _contradiction: null, status: "new" });
ok(!esc3.requires_board_review && esc3.escalation_reason === null, "observatie minora → fara escaladare");
const escC = applyEscalation({ ...valid[0], severity: "medium", category: "decisions", _contradiction: { needsExplanation: true }, _factors: {} });
ok(escC.requires_board_review && /contradictie/.test(escC.escalation_reason), "contradictie de decizie → board review");

// Sinteza determinista (fallback fara LLM)
ok(/Nicio observatie/.test(deterministicSummary([])) && deterministicSummary(valid).length > 20, "sinteza determinista disponibila mereu");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — observation (pur)`);
process.exit(failed === 0 ? 0 : 1);
