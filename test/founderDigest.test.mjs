// Teste Daily CEO Digest — livrare controlata (Faza 4.6).
// node test/founderDigest.test.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";
delete process.env.FOUNDER_DAILY_DIGEST_ENABLED;
delete process.env.FOUNDER_INTERRUPTIVE_ALERTS_ENABLED;

const { config } = await import("../src/config.js");
const { deliverDailyDigest, composeDigestMessage, priorityOfDay, contentHash } = await import("../src/founderAttention/digestDelivery.js");
const { buildDailyDigest } = await import("../src/founderAttention/dailyDigest.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = (f) => readFileSync(path.join(__dirname, "..", "src", f), "utf8");
let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// Flag-uri separate, implicit OFF; digestul NU poate activa alertele.
ok(config.founderDailyDigest === false, "FOUNDER_DAILY_DIGEST_ENABLED implicit OFF");
ok(config.founderInterruptiveAlerts === false, "8. FOUNDER_INTERRUPTIVE_ALERTS_ENABLED implicit OFF");
const fa = ["digestDelivery.js", "founderGateRunner.js", "attentionGate.js", "notificationCandidate.js", "notificationPolicy.js", "dailyDigest.js", "index.js"]
  .map((f) => SRC("founderAttention/" + f)).join("\n");
ok(!/founderInterruptiveAlerts/.test(fa.replace(/\/\/[^\n]*/g, "")), "8b. alertele interruptive NU au NICIO cale de trimitere in cod");
ok(!/from\s+["'][^"']*telegram\.js["']/.test(fa), "senderul e injectat — founderAttention nu importa canale");
ok(/startDigestSchedule\(\{ send: pushToOwner \}\)/.test(SRC("index.js")), "boot: senderul injectat din index.js");
ok(!/from\s+["'][^"']*executiveBoard/.test(SRC("founderAttention/digestDelivery.js")), "10. zero Board execution in livrare");

// Material simulat.
const EP = (over = {}) => ({
  episode_id: "ep:lichiditate_executie", title: "Presiune de lichiditate și execuție Bell Residence",
  category: "lichiditate_executie", observations: ["cash:x"], combined_severity: "high",
  combined_confidence: 83, business_impact: ["cash"], unknowns: ["Soldul bancar curent nu este conectat."],
  requires_board_review: true, requires_founder_attention: true, status: "open",
  _members: [{ data_quality: "partial", _factors: { probability: 0.9, urgencyDays: 2 } }],
  _boardType: "general", _decisions: "Prioritizare plăți / accelerare încasări / finanțare temporară",
  _minUrgencyDays: 2, _hasContradiction: false, _briefReason: "episod nou", ...over,
});
const CAND = (over = {}) => ({
  notification_candidate_id: "nc:ep:lichiditate_executie:DATA_REQUIRED_BEFORE_DECISION",
  episode_id: "ep:lichiditate_executie", attention_level: "DATA_REQUIRED_BEFORE_DECISION",
  title: "Presiune de lichiditate și execuție Bell Residence",
  why_now: "decizie reala, dar lipsesc date esentiale", what_changed: "episod nou",
  business_impact: ["cash"], decision_needed: "Prioritizare plăți / accelerare încasări / finanțare temporară",
  deadline: "in 2 zile", confidence: 83, data_quality: "partial",
  missing_data: ["Soldul bancar curent nu este conectat."], suggested_channel: "digest",
  safe_to_send: false, deduplication_key: "ep:lichiditate_executie:DATA_REQUIRED_BEFORE_DECISION", ...over,
});
const MATERIAL = { episodes: [EP()], candidates: [CAND()] };
const now = Date.parse("2026-07-21T07:40:00+03:00"); // 07:40 Bucuresti
const BASE = { material: MATERIAL, nowMs: now, hour: 8, state: {}, persist: false, dryRun: false };

// 1. date relevante → EXACT 1 mesaj.
let sent = [];
const send = async (t) => sent.push(t);
const r1 = await deliverDailyDigest({ ...BASE, send, dryRun: true }); // dry intai (flag off local)
ok(r1.reason === "dry_run" && r1.text.includes("DAILY CEO BRIEF"), "dry-run: text generat fara trimitere");
// simulam flag ON prin dryRun=false + config... flag off → flag_off; testam calea de trimitere cu dryRun bypass:
const rFlag = await deliverDailyDigest({ ...BASE, send });
ok(rFlag.reason === "flag_off" && sent.length === 0, "flag OFF → nicio trimitere posibila");
// fortam calea completa prin config temporar (doar in proces, nu in env persistat)
config.founderDailyDigest = true;
const r2 = await deliverDailyDigest({ ...BASE, send });
ok(r2.sent === true && sent.length === 1, "1. date relevante → EXACT 1 mesaj");
ok(r2.text === sent[0], "continutul trimis = continutul compus");
// 4. max 7 puncte; 6. DATA_REQUIRED formulat corect; format complet.
ok(r2.points <= 7, `4. max 7 puncte (${r2.points})`);
ok(/Întâi avem nevoie de date: Soldul bancar/.test(r2.text), "6. DATA_REQUIRED → „Întâi avem nevoie de date”");
ok(/DAILY CEO BRIEF/.test(r2.text) && /PRIORITATEA ZILEI:/.test(r2.text), "format: antet + prioritatea zilei");
ok(/1\. CE NECESITĂ ATENȚIA TA/.test(r2.text), "sectiuni numerotate");
ok(/Obține datele lipsă/.test(r2.text), "prioritatea zilei derivata din DATA_REQUIRED");
// 3. aceeasi zi → 0 suplimentar.
const r3 = await deliverDailyDigest({ ...BASE, send, state: { lastSentDate: "2026-07-21", lastHash: "x" } });
ok(r3.sent === false && r3.reason === "deja_trimis_azi" && sent.length === 1, "3. aceeasi zi → ZERO digest suplimentar (fara exceptii)");
// 5. duplicate: continut identic alta zi → 0.
const r5 = await deliverDailyDigest({ ...BASE, send, state: { lastSentDate: "2026-07-20", lastHash: contentHash(r2.text) } });
ok(r5.sent === false && r5.reason === "continut_neschimbat", "5. continut identic → nu se retrimite");
// 2. fara date relevante → 0 mesaje.
const r6 = await deliverDailyDigest({ ...BASE, send, material: { episodes: [], candidates: [] } });
ok(r6.sent === false && r6.reason === "nimic_relevant" && sent.length === 1, "2. nimic relevant → ZERO mesaje");
// 9. quiet hours respectate.
const r7 = await deliverDailyDigest({ ...BASE, send, hour: 23 });
ok(r7.sent === false && r7.reason === "quiet_hours", "9. quiet hours → nu se trimite");
// 7. critical NU produce alerta separata — doar digest (o singura trimitere).
sent = [];
const critMat = { episodes: [EP({ combined_severity: "critical", unknowns: [] })], candidates: [CAND({ attention_level: "FOUNDER_DECISION_REQUIRED" })] };
const r8 = await deliverDailyDigest({ ...BASE, send, material: critMat });
ok(r8.sent === true && sent.length === 1 && !/ALERT/i.test(sent[0].split("\n")[0]), "7. critical → tot UN digest, nicio alerta separata");
config.founderDailyDigest = false;
// 11. zero actiuni — livrarea nu importa nimic executabil.
ok(!/(create_task|proposeAction|runBoardMeeting|createDraft)/.test(fa), "11. zero actiuni posibile din founderAttention");
// eroare izolata
const r9 = await deliverDailyDigest({ ...BASE, material: "corupt", send });
ok(r9.sent === false, "eroare de material → izolata, fara exceptie");
// determinism compunere
ok(composeDigestMessage({ digest: buildDailyDigest(MATERIAL), ...MATERIAL }) === composeDigestMessage({ digest: buildDailyDigest(MATERIAL), ...MATERIAL }), "compunere determinista");
ok(priorityOfDay({ candidates: [], episodes: [] }).includes("construiește"), "prioritate implicita sigura");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — founderDigest`);
process.exit(failed === 0 ? 0 : 1);
