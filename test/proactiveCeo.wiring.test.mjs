// Teste wiring Proactive CEO — flag-uri, garzi de sursa, runner integrat.
// node test/proactiveCeo.wiring.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";
delete process.env.PROACTIVE_CEO_PIPELINE_ENABLED;
delete process.env.PROACTIVE_CEO_SHADOW_MODE;
delete process.env.PROACTIVE_CEO_NOTIFICATIONS_ENABLED;
delete process.env.PROACTIVE_CEO_BOARD_EXECUTION_ENABLED;

const { config } = await import("../src/config.js");
const { proactiveCeoMode, runProactivePipeline } = await import("../src/proactiveCeo/index.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = (f) => readFileSync(path.join(__dirname, "..", "src", f), "utf8");
let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// ── Flag-uri implicit sigure ─────────────────────────────────────────────
ok(config.proactiveCeoPipeline === false, "PROACTIVE_CEO_PIPELINE_ENABLED implicit OFF");
ok(config.proactiveCeoShadow === true, "PROACTIVE_CEO_SHADOW_MODE implicit ON (sigur)");
ok(config.proactiveCeoNotifications === false, "PROACTIVE_CEO_NOTIFICATIONS_ENABLED implicit OFF");
ok(config.proactiveCeoBoardExecution === false, "PROACTIVE_CEO_BOARD_EXECUTION_ENABLED implicit OFF");
ok(proactiveCeoMode() === "off", "proactiveCeoMode() = off implicit");

// ── Garzi de sursa (teste 15-20) ────────────────────────────────────────
const FILES = readdirSync(path.join(__dirname, "..", "src", "proactiveCeo")).map((f) => "proactiveCeo/" + f);
const all = FILES.map(SRC).join("\n");
ok(!/from\s+["'][^"']*(taskflow|approvalGate|mcp)\.js["']/.test(all), "zero importuri taskflow/approvalGate/mcp (zero actiuni)");
ok(!/from\s+["'][^"']*(telegram|notifier|tts)\.js["']/.test(all), "zero importuri telegram/notifier (zero notificari in shadow)");
ok(!/from\s+["'][^"']*sources\/(gmail|calendar|drive)\.js["']/.test(all) && !/google\.js/.test(all), "zero importuri Gmail/Calendar");
ok(!/(create_task|update_task|delete_task|add_observation|createDraft|sendMessage)/.test(all), "zero scrieri Operational/Gmail/mesaje");
// Test 16: zero convocare Board live — doar matricea de selectie (pura)
ok(!/boardSession|runBoardMeeting/.test(all), "Boardul NU e convocat (fara boardSession/runBoardMeeting)");
ok(/from\s+["']\.\.\/executiveBoard\/boardRouter\.js["']/.test(SRC("proactiveCeo/boardPreview.js")), "matricea directorilor REUTILIZATA din Board (nu duplicata)");
ok(!/CREATE TABLE|ALTER TABLE/i.test(all), "zero schema DB noua");
const gate = await import("../src/approvalGate.js");
ok(typeof gate.proposeAction === "function" && typeof gate.confirmActionById === "function", "approvalGate intact");
// integrarea in observationRunner e GATED
const runner = SRC("observationEngine/observationRunner.js");
ok(/config\.proactiveCeoPipeline && emitted\.length/.test(runner), "observationRunner: apel DOAR cu flag ON (implicit OFF → no-op)");
ok(/\.catch\(\(e\) => console\.error\("\[proactive\]"/.test(runner), "erorile pipeline-ului izolate de Observation Engine");
ok(!/proactiveCeo/.test(SRC("brain.js")), "brain.js neatins — raspunsurile vizibile neschimbate");

// ── Pipeline end-to-end cu observatii injectate (fara IO) ───────────────
const OBS = (over = {}) => ({
  observation_id: "obs:x", type: "cash_gap_21d", category: "cash",
  title: "Obligatii mari in 21 zile", summary: "Presiune de cash.",
  detected_at: "2026-07-17T10:00:00.000Z", period_analyzed: {},
  severity: "medium", confidence: 70, data_quality: "partial",
  evidence: ["[operational] date"], sources: ["operational"],
  metrics: {}, baseline: {}, deviation: {}, business_impact: ["cash"],
  urgency_reason: "3 zile.", possible_causes: [], unknowns: ["Sold necunoscut."],
  recommended_next_analysis: [], requires_board_review: false,
  requires_founder_attention: false, requires_immediate_action: false,
  deduplication_key: "cash:cash_gap_21d:x", status: "new", safe_to_notify: false,
  _score: 50, _factors: { urgencyDays: 3, financialImpactRON: 509071 }, _contradiction: null,
  ...over,
});
const batch = [
  OBS({ requires_board_review: true, requires_founder_attention: true, severity: "high" }),
  OBS({ category: "sales", type: "rezervari_fara_avans", deduplication_key: "sales:rfa:x", title: "6 rezervari fara avans" }),
  OBS({ category: "people", type: "repeated_discipline", deduplication_key: "people:rd:Nelu", title: "Tipar Nelu" }),
  OBS({ severity: "info", deduplication_key: "cash:minor:x", _score: 5 }),
];
const nowMs = Date.parse("2026-07-17T10:00:00.000Z");
const r1 = await runProactivePipeline(batch, { previousEpisodes: {}, persist: false, nowMs });
ok(!r1.error && r1.episodes.length === 2, `pipeline: 2 episoade din 4 observatii (${r1.episodes.length})`);
ok(r1.triage.ignore === 1, "observatia info ignorata la triaj");
ok(r1.briefs.length === 2 && r1.previews.length === 1, "2 briefuri + 1 preview Board (doar episodul cu escaladare)");
ok(r1.briefs.every((b) => b.text.length <= 900), "briefurile raman scurte");
// anti-spam la a doua trecere identica
const r2 = await runProactivePipeline(batch, { previousEpisodes: r1.state, persist: false, nowMs: nowMs + 3_600_000 });
ok(r2.briefs.length === 0 && r2.quiet.length === 2, "aceleasi date la o ora → zero briefuri noi (cooldown episod)");
// eroare izolata: intrare corupta → {error}, fara exceptie
const r3 = await runProactivePipeline("corupt", { previousEpisodes: {}, persist: false, nowMs });
ok(r3 && (r3.error || r3.episodes), "intrare corupta → izolat, fara exceptie propagata");
// determinism
const d1 = await runProactivePipeline(batch, { previousEpisodes: {}, persist: false, nowMs });
ok(JSON.stringify(d1.briefs) === JSON.stringify(r1.briefs), "aceeasi intrare → aceleasi briefuri (determinist)");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — proactiveCeo (wiring)`);
process.exit(failed === 0 ? 0 : 1);
