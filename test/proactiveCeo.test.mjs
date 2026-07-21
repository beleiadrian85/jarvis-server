// Teste Proactive CEO Pipeline — nucleul PUR (triaj, episoade, anti-spam,
// preview Board, CEO Brief). node test/proactiveCeo.test.mjs
import { triageObservation, triageAll, adjustedConfidence } from "../src/proactiveCeo/signalTriage.js";
import { groupIntoEpisodes, reconcileEpisodes, EPISODE_COOLDOWN_MS } from "../src/proactiveCeo/executiveEpisodes.js";
import { buildBoardPreview } from "../src/proactiveCeo/boardPreview.js";
import { buildCeoBrief, BRIEF_MAX_CHARS, BRIEF_SECTIONS } from "../src/proactiveCeo/ceoBrief.js";

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

const OBS = (over = {}) => ({
  observation_id: "obs:x", type: "cash_gap_21d", category: "cash",
  title: "Obligatii de 509.071 lei in 21 zile", summary: "Presiune de cash: 509.071 lei in 21 de zile, sold necunoscut.",
  detected_at: "2026-07-17T10:00:00.000Z", period_analyzed: { from: "2026-07-17", to: "2026-07-17" },
  severity: "medium", confidence: 70, data_quality: "partial",
  evidence: ["[operational] rata IMM 416.000 lei pe 2026-07-30"], sources: ["operational", "cashForecast"],
  metrics: {}, baseline: {}, deviation: {},
  business_impact: ["Presiune pe lichiditate"], urgency_reason: "Prima scadenta in 3 zile.",
  possible_causes: [], unknowns: ["Sold bancar neconectat."], recommended_next_analysis: [],
  requires_board_review: false, requires_founder_attention: false, requires_immediate_action: false,
  deduplication_key: "cash:cash_gap_21d:cash-21z", status: "new", safe_to_notify: false,
  _score: 50, _factors: { urgencyDays: 3, financialImpactRON: 509071 }, _contradiction: null,
  ...over,
});

// ── Test 1+2: triaj ──────────────────────────────────────────────────────
ok(triageObservation(OBS({ severity: "info", _score: 5 })).decision === "ignore", "observatie info → ignore");
ok(triageObservation(OBS({ severity: "low", confidence: 50 })).decision === "audit_only", "observatie minora → audit_only, fara escaladare");
ok(triageObservation(OBS()).decision === "group", "observatie medium → group");
const crit = triageObservation(OBS({ severity: "critical", requires_board_review: true, requires_founder_attention: true }));
ok(crit.decision === "founder_attention" && crit.reasons.length > 0, "observatie critica → candidat Board + atentia fondatorului");
ok(triageObservation(OBS({ severity: "high", confidence: 80, requires_founder_attention: false })).decision === "founder_attention", "high cu incredere → candidat Board (si atentie fondator implicita)");
// Test 10: data_quality poor reduce confidence
ok(adjustedConfidence(OBS({ confidence: 80, data_quality: "poor" })) === 56, "data_quality poor → confidence ×0.7");
ok(adjustedConfidence(OBS({ confidence: 80 })) === 80, "data_quality partial → confidence intact");

// ── Test 3: observatii corelate → UN episod ─────────────────────────────
const cash = OBS();
const avans = OBS({ category: "sales", type: "rezervari_fara_avans", deduplication_key: "sales:rezervari_fara_avans:avans", title: "6 rezervari fara avans", unknowns: [] });
const tasks = OBS({ category: "projects", type: "pred_task_overrun", deduplication_key: "projects:pred_task_overrun:x", title: "7 task-uri risca termenul", unknowns: [] });
const ep1 = groupIntoEpisodes([cash, avans, tasks]);
ok(ep1.length === 1 && ep1[0].episode_id === "ep:lichiditate_executie", "cash + avans + task-uri → UN episod de lichiditate si executie");
ok(/Presiune de lichiditate/.test(ep1[0].title), "titlul canonic al episodului");
ok(ep1[0].observations.length === 3, "episodul contine cele 3 observatii");
// ── Test 4: necorelate → episoade separate ──────────────────────────────
const people = OBS({ category: "people", type: "repeated_discipline", deduplication_key: "people:repeated_discipline:Nelu", title: "Tipar repetat Nelu" });
const ep2 = groupIntoEpisodes([cash, people]);
ok(ep2.length === 2 && new Set(ep2.map((e) => e.episode_id)).size === 2, "cash + people → 2 episoade separate");

// severitate combinata = max; confidence redus la date slabe
const epSev = groupIntoEpisodes([cash, OBS({ severity: "high", deduplication_key: "cash:restante:r" })])[0];
ok(epSev.combined_severity === "high", "severitatea combinata = maximul membrilor");
const epPoor = groupIntoEpisodes([OBS({ data_quality: "poor", confidence: 80 })])[0];
ok(epPoor.combined_confidence === Math.round(80 * 0.8), "date slabe → confidence combinat redus");

// ── Teste 5/6/7: tranzitii de episod ────────────────────────────────────
ok(groupIntoEpisodes([OBS({ status: "worsening" }), avans])[0].status === "worsening", "membru worsening → episod worsening");
ok(groupIntoEpisodes([OBS({ status: "improving" }), { ...avans, status: "repeated" }])[0].status === "improving", "improving fara worsening → episod improving");
ok(groupIntoEpisodes([OBS({ status: "resolved" })])[0].status === "resolved", "toti membrii resolved → episod resolved (inchis)");

// ── Teste 8/9 + 5/6/7 (reconciliere anti-spam) ──────────────────────────
const now = Date.parse("2026-07-17T10:00:00.000Z");
const epA = groupIntoEpisodes([cash, avans]);
const r1 = reconcileEpisodes({ previous: {}, episodes: epA, nowMs: now });
ok(r1.briefable.length === 1 && r1.briefable[0]._briefReason === "episod nou", "episod nou → brief emis");
// aceeasi problema, acelasi set → fara brief duplicat (cooldown)
const r2 = reconcileEpisodes({ previous: r1.state, episodes: groupIntoEpisodes([cash, avans]), nowMs: now + 3_600_000 });
ok(r2.briefable.length === 0 && r2.quiet.length === 1, "aceeasi problema in cooldown → FARA brief duplicat");
// severitate crescuta → brief nou chiar in cooldown
const worse = groupIntoEpisodes([OBS({ severity: "critical", requires_board_review: true }), avans]);
const r3 = reconcileEpisodes({ previous: r1.state, episodes: worse, nowMs: now + 3_600_000 });
ok(r3.briefable.length === 1 && r3.briefable[0]._briefReason === "severitate crescuta", "severitate crescuta → brief nou");
// worsening → brief nou
const r3b = reconcileEpisodes({ previous: r1.state, episodes: groupIntoEpisodes([OBS({ status: "worsening" }), avans]), nowMs: now + 3_600_000 });
ok(r3b.briefable.length === 1 && r3b.briefable[0]._briefReason === "in agravare", "agravare → brief nou (episod actualizat)");
// informatie noua (membru nou) dupa cooldown → brief
const r4 = reconcileEpisodes({ previous: r1.state, episodes: groupIntoEpisodes([cash, avans, tasks]), nowMs: now + EPISODE_COOLDOWN_MS + 1000 });
ok(r4.briefable.length === 1 && /informatie noua/.test(r4.briefable[0]._briefReason), "date noi → brief actualizat");
// rezolvat → brief O data
const resolvedEp = groupIntoEpisodes([OBS({ status: "resolved" }), { ...avans, status: "resolved" }]);
const r5 = reconcileEpisodes({ previous: r1.state, episodes: resolvedEp, nowMs: now + 3_600_000 });
ok(r5.briefable.length === 1 && r5.briefable[0]._briefReason === "episod rezolvat", "episod rezolvat → brief de inchidere");
const r6 = reconcileEpisodes({ previous: r5.state, episodes: resolvedEp, nowMs: now + 7_200_000 });
ok(r6.briefable.length === 0, "rezolvarea se anunta O SINGURA data");

// ── Teste 11/12/13: preview Board ───────────────────────────────────────
const epOameni = groupIntoEpisodes([people, OBS({ category: "founder", type: "founder_dependency", deduplication_key: "founder:founder_dependency:dep", requires_board_review: true })])[0];
const pv1 = buildBoardPreview(epOameni);
ok(pv1.decision_type === "hiring" && JSON.stringify(pv1.directors) === JSON.stringify(["CEO", "COO", "CHRO", "CFO", "GUARDIAN", "FOUNDER_VOICE"]), "episod oameni → directorii de hiring (matricea Boardului reutilizata)");
ok(pv1.questions.every((q) => q.question.includes(epOameni.title)) && pv1.questions.length === 4, "intrebarile pleaca de la intrebarea canonica a rolului + contextul episodului");
const epCash = groupIntoEpisodes([{ ...cash, requires_board_review: true }])[0];
const pv2 = buildBoardPreview(epCash);
ok(!pv2.directors.includes("FOUNDER_VOICE"), "Founder Voice DOAR cand e relevant (nu la episodul general de cash)");
ok(pv2.missing_information.some((m) => /Sold bancar/.test(m)), "preview: datele lipsa preluate din unknowns");
ok(/NU este convocat/.test(pv2.note), "preview declara explicit ca Boardul NU e convocat");
const epPiata = groupIntoEpisodes([OBS({ category: "traffic", type: "traffic_drop", severity: "critical", deduplication_key: "traffic:traffic_drop:site", requires_board_review: true })])[0];
const pv3 = buildBoardPreview(epPiata);
ok(pv3.decision_type === "marketing" && pv3.directors.includes("GUARDIAN"), "risc major (critical) → Guardian adaugat chiar si la marketing");

// ── Test 14: CEO Brief scurt, cu cele 5 sectiuni ────────────────────────
const brief = buildCeoBrief(epCash);
ok(BRIEF_SECTIONS.every((s) => brief.text.includes(s)), "brief: toate cele 5 sectiuni prezente");
ok(brief.text.length <= BRIEF_MAX_CHARS, `brief: maxim ${BRIEF_MAX_CHARS} caractere (${brief.text.length})`);
ok(brief.sections.urgency === "MEDIE", "urgenta derivata strict din severitatea combinata");
ok(/Sold bancar/.test(brief.sections.missing), "brief: datele lipsa declarate");
ok(/Prioritizare plăți/.test(brief.sections.decision), "brief: meniul de decizie canonic pentru lichiditate");
const briefResolved = buildCeoBrief(groupIntoEpisodes([OBS({ status: "resolved" })])[0]);
ok(/S-a închis/.test(briefResolved.sections.know) && briefResolved.sections.urgency === "SCĂZUTĂ", "brief de inchidere pentru episod rezolvat");
// determinism
ok(buildCeoBrief(epCash).text === brief.text, "acelasi episod → acelasi brief (determinist)");
const t2 = triageAll([cash, avans, people]);
ok(JSON.stringify(t2.triage === undefined ? Object.keys(t2.byDecision).sort() : null) === JSON.stringify(Object.keys(triageAll([cash, avans, people]).byDecision).sort()), "triaj determinist pe lot");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — proactiveCeo (pur)`);
process.exit(failed === 0 ? 0 : 1);
