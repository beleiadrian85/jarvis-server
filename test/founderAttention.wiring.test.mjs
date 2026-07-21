// Teste wiring Founder Attention Gate — flag-uri, garzi de sursa, runner.
// node test/founderAttention.wiring.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";
delete process.env.FOUNDER_ATTENTION_GATE_ENABLED;
delete process.env.FOUNDER_ATTENTION_SHADOW_MODE;
delete process.env.FOUNDER_NOTIFICATIONS_ENABLED;

const { config } = await import("../src/config.js");
const { founderAttentionMode, runFounderGate } = await import("../src/founderAttention/index.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = (f) => readFileSync(path.join(__dirname, "..", "src", f), "utf8");
let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// Flag-uri implicit sigure.
ok(config.founderAttentionGate === false, "FOUNDER_ATTENTION_GATE_ENABLED implicit OFF");
ok(config.founderAttentionShadow === true, "FOUNDER_ATTENTION_SHADOW_MODE implicit ON");
ok(config.founderNotifications === false, "FOUNDER_NOTIFICATIONS_ENABLED implicit OFF");
ok(founderAttentionMode() === "off", "founderAttentionMode() = off implicit");

// Garzi de sursa (teste 16/18/19): zero canale reale, zero Board, zero actiuni.
const FILES = readdirSync(path.join(__dirname, "..", "src", "founderAttention")).map((f) => "founderAttention/" + f);
const all = FILES.map(SRC).join("\n");
ok(!/from\s+["'][^"']*(telegram|notifier|tts)\.js["']/.test(all), "16. zero importuri telegram/notifier — nu POATE notifica");
ok(!/from\s+["'][^"']*(taskflow|approvalGate|mcp)\.js["']/.test(all), "19. zero importuri de executie (taskflow/approvalGate/mcp)");
ok(!/from\s+["'][^"']*executiveBoard/.test(all), "18. zero importuri Board — nu poate convoca");
ok(!/from\s+["'][^"']*sources\/(gmail|calendar)/.test(all), "zero Gmail/Calendar");
ok(!/(sendMessage|createDraft|create_task|CREATE TABLE|ALTER TABLE)/i.test(all), "zero trimiteri/scrieri/schema");
ok(/safe_to_send: false, \/\/ FORTAT/.test(SRC("founderAttention/notificationCandidate.js")), "17. safe_to_send fortat false in cod");
const pipe = SRC("proactiveCeo/pipelineRunner.js");
ok(/config\.founderAttentionGate &&/.test(pipe), "pipelineRunner: apel DOAR cu flag ON");
ok(/\.catch\(\(e\) => console\.error\("\[founder-gate\]"/.test(pipe), "erorile gate-ului izolate de pipeline");
const gate = await import("../src/approvalGate.js");
ok(typeof gate.proposeAction === "function", "approvalGate intact");
ok(!/founderAttention/.test(SRC("brain.js")), "brain.js neatins");

// Runner end-to-end cu episoade injectate (fara IO).
const EP = (over = {}) => ({
  episode_id: "ep:lichiditate_executie", title: "Presiune de lichiditate și execuție Bell Residence",
  category: "lichiditate_executie", observations: ["cash:x"],
  combined_severity: "high", combined_confidence: 80,
  business_impact: ["cash"], unknowns: [],
  requires_board_review: true, requires_founder_attention: true, status: "open",
  _members: [{ data_quality: "complete", _factors: { probability: 0.95, urgencyDays: 2 }, _threatensCore: "cash" }],
  _boardType: "general", _decisions: "Prioritizare plăți / accelerare încasări / finanțare temporară",
  _minUrgencyDays: 2, _hasContradiction: false, _briefReason: "episod nou",
  ...over,
});
const nowMs = Date.parse("2026-07-17T12:00:00.000Z"); // 15:00 Bucuresti — in afara quiet
const r1 = await runFounderGate(
  { briefable: [EP()], allEpisodes: [EP(), EP({ episode_id: "ep:oameni", combined_severity: "medium", requires_board_review: false, title: "Echipa" })] },
  { previousCandidates: {}, counters: null, nowMs, hour: 15, persist: false }
);
ok(!r1.error && r1.candidates.length === 1, `gate end-to-end: 1 candidat (${r1.candidates.length})`);
ok(r1.candidates[0].attention_level === "FOUNDER_DECISION_REQUIRED", "episod real cu decizie → DECISION_REQUIRED");
ok(r1.candidates.every((c) => c.safe_to_send === false), "17. safe_to_send=false pe TOT (chiar cu date complete)");
ok(r1.digest.points >= 1 && r1.digest.points <= 7, `digest generat (${r1.digest.points} puncte)`);
// anti-spam intre rulari
const r2 = await runFounderGate({ briefable: [EP()], allEpisodes: [EP()] },
  { previousCandidates: r1.state.candidates, counters: r1.state.counters, nowMs: nowMs + 3_600_000, hour: 16, persist: false });
ok(r2.candidates.length === 0 && r2.suppressed.length === 1, "7. acelasi episod la o ora → ZERO candidati (cooldown tip)");
// quiet hours end-to-end
const r3 = await runFounderGate({ briefable: [EP({ requires_board_review: false, status: "worsening" })], allEpisodes: [] },
  { previousCandidates: {}, counters: null, nowMs, hour: 23, persist: false });
ok(r3.candidates[0]?.attention_level === "DAILY_DIGEST" && r3.candidates[0]?.quiet_deferred === true, "10. quiet hours → alerta retrogradata in digest");
// eroare izolata
const r4 = await runFounderGate({ briefable: "corupt" }, { previousCandidates: {}, counters: null, nowMs, hour: 12, persist: false });
ok(r4 && (r4.error || r4.candidates), "eroare → izolata, fara exceptie");
// determinism
const d1 = await runFounderGate({ briefable: [EP()], allEpisodes: [EP()] }, { previousCandidates: {}, counters: null, nowMs, hour: 15, persist: false });
ok(JSON.stringify(d1.candidates) === JSON.stringify(r1.candidates.filter(() => true)) || d1.candidates[0].notification_candidate_id === r1.candidates[0].notification_candidate_id, "determinist pe aceeasi intrare");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — founderAttention (wiring)`);
process.exit(failed === 0 ? 0 : 1);
