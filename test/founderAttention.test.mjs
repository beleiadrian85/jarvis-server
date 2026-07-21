// Teste Founder Attention Gate — nucleul PUR. node test/founderAttention.test.mjs
import { gateEpisode, hasConfirmedRisk, ATTENTION_LEVELS } from "../src/founderAttention/attentionGate.js";
import { buildNotificationCandidate, groupCandidates } from "../src/founderAttention/notificationCandidate.js";
import { applyQuietHours, applyAntiSpam, inQuietHours, MAX_ALERTS_PER_DAY, MAX_INTERRUPTIVE_PER_DAY } from "../src/founderAttention/notificationPolicy.js";
import { buildDailyDigest, DIGEST_MAX_POINTS, DIGEST_SECTIONS } from "../src/founderAttention/dailyDigest.js";

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

const MEMBER = (over = {}) => ({
  data_quality: "partial", _factors: { probability: 0.7, urgencyDays: 10 }, ...over,
});
const EP = (over = {}) => ({
  episode_id: "ep:lichiditate_executie", title: "Presiune de lichiditate și execuție Bell Residence",
  category: "lichiditate_executie", observations: ["cash:x"],
  combined_severity: "medium", combined_confidence: 75,
  business_impact: ["Presiune pe lichiditate"], unknowns: [],
  requires_board_review: false, requires_founder_attention: false,
  status: "open",
  _members: [MEMBER()], _boardType: "general",
  _decisions: "Prioritizare plăți / accelerare încasări / finanțare temporară",
  _minUrgencyDays: 10, _hasContradiction: false, _briefReason: "episod nou",
  ...over,
});

// ── Teste 1-3: nivelurile de baza ───────────────────────────────────────
ok(gateEpisode(EP({ combined_severity: "low", _members: [MEMBER()] })).level === "AUDIT_ONLY", "1. low → AUDIT_ONLY");
ok(gateEpisode(EP()).level === "DAILY_DIGEST", "2. medium → DAILY_DIGEST");
ok(gateEpisode(EP({ combined_severity: "critical" })).level === "INTERRUPTIVE_ALERT", "3. critical → INTERRUPTIVE_ALERT candidat");
ok(gateEpisode(EP({ combined_severity: "info" })).level === "IGNORE", "info → IGNORE");
ok(gateEpisode(EP({ combined_severity: "high", _minUrgencyDays: 2 })).level === "INTERRUPTIVE_ALERT", "high + termen apropiat → interruptive");
ok(gateEpisode(EP({ combined_severity: "high", status: "worsening" })).level === "INTERRUPTIVE_ALERT", "high + worsening → interruptive");
ok(gateEpisode(EP({ combined_severity: "high" })).level === "DAILY_DIGEST", "high FARA urgenta → digest (nu intrerupe)");

// ── Test 4: date slabe blocheaza alerta ─────────────────────────────────
const poorEp = EP({ combined_severity: "critical", _members: [MEMBER({ data_quality: "poor" })] });
const g4 = gateEpisode(poorEp);
ok(g4.level === "DAILY_DIGEST" && g4.interruptive_blocked === "severitate critical", "4. poor data → alerta BLOCATA, retrogradata in digest");
const poorConfirmed = EP({ combined_severity: "critical", _members: [MEMBER({ data_quality: "poor" }), MEMBER({ data_quality: "complete", _factors: { probability: 1 } })] });
ok(gateEpisode(poorConfirmed).level === "INTERRUPTIVE_ALERT", "4b. risc confirmat determinist → alerta trece si cu date mixte");
ok(hasConfirmedRisk(poorConfirmed) && !hasConfirmedRisk(poorEp), "hasConfirmedRisk: probabilitate certa pe date complete");

// ── Teste 5-6: decizia fondatorului ─────────────────────────────────────
const decEp = EP({ requires_board_review: true, combined_severity: "high", _minUrgencyDays: 2, combined_confidence: 80 });
const g5 = gateEpisode(decEp);
ok(g5.level === "FOUNDER_DECISION_REQUIRED", "5. decizie reala (board + 3 optiuni + termen) → DECISION_REQUIRED");
const g6 = gateEpisode(EP({ requires_board_review: true, combined_severity: "high", _minUrgencyDays: 2, combined_confidence: 40, unknowns: ["Sold bancar neconectat."] }));
ok(g6.level === "DATA_REQUIRED_BEFORE_DECISION", "6. date esentiale lipsa → DATA_REQUIRED (nu decision)");
ok(gateEpisode(EP({ requires_board_review: true, _decisions: "Analiza suplimentara" })).level !== "FOUNDER_DECISION_REQUIRED", "o singura optiune → nu e decizie reala");

// ── Candidatul: structura + safe_to_send ────────────────────────────────
const cand = buildNotificationCandidate({ episode: decEp, gate: g5, quiet: { deferred: false, override: false } });
ok(cand.safe_to_send === false, "17. safe_to_send=FALSE fortat");
ok(cand.attention_level === "FOUNDER_DECISION_REQUIRED" && cand.suggested_channel === "telegram", "candidat: nivel + canal sugerat");
ok(cand.decision_needed.includes("Prioritizare") && cand.deadline === "in 2 zile", "candidat: decizia si termenul completate");
ok(cand.notification_candidate_id === "nc:ep:lichiditate_executie:FOUNDER_DECISION_REQUIRED", "candidat: id stabil");
for (const k of ["why_now", "what_changed", "business_impact", "missing_data", "deduplication_key", "confidence", "data_quality"])
  ok(k in cand, `candidat: camp ${k} prezent`);
ok(JSON.stringify(buildNotificationCandidate({ episode: decEp, gate: g5, quiet: { deferred: false, override: false } })) === JSON.stringify(cand), "candidat determinist");

// ── Teste 10-11: quiet hours ────────────────────────────────────────────
ok(inQuietHours(23) && inQuietHours(3) && !inQuietHours(12) && !inQuietHours(7), "10. fereastra quiet 22:00-07:00");
ok(applyQuietHours({ gateLevel: "INTERRUPTIVE_ALERT", severity: "high", confirmedRisk: true, hour: 23 }).deferred === true, "10b. high in quiet → amanat in digest");
const q11 = applyQuietHours({ gateLevel: "INTERRUPTIVE_ALERT", severity: "critical", confirmedRisk: true, hour: 23 });
ok(q11.override === true && q11.deferred === false, "11. critical cu risc confirmat → trece quiet hours");
ok(applyQuietHours({ gateLevel: "INTERRUPTIVE_ALERT", severity: "critical", confirmedRisk: false, hour: 23 }).deferred === true, "11b. critical FARA risc confirmat → NU trece");
ok(applyQuietHours({ gateLevel: "DAILY_DIGEST", severity: "medium", confirmedRisk: false, hour: 23 }).deferred === false, "digestul nu e afectat de quiet hours");
const deferred = buildNotificationCandidate({ episode: EP({ combined_severity: "critical" }), gate: { level: "INTERRUPTIVE_ALERT", reasons: ["critical"] }, quiet: { deferred: true, override: false } });
ok(deferred.attention_level === "DAILY_DIGEST" && deferred.quiet_deferred === true, "candidat amanat de quiet → retrogradat in digest");

// ── Teste 7-8, 12-13: anti-spam si limite ───────────────────────────────
const now = Date.parse("2026-07-17T12:00:00.000Z");
const mk = (id, level, sev = "high") => ({
  notification_candidate_id: `nc:${id}:${level}`, episode_id: id, attention_level: level,
  deduplication_key: `${id}:${level}`, _severity: sev, title: id, why_now: "x",
});
const s1 = applyAntiSpam({ previous: {}, counters: null, candidates: [mk("ep:a", "INTERRUPTIVE_ALERT")], nowMs: now, today: "2026-07-17" });
ok(s1.allowed.length === 1, "prima alerta → permisa");
const s2 = applyAntiSpam({ previous: s1.previous, counters: s1.counters, candidates: [mk("ep:a", "INTERRUPTIVE_ALERT")], nowMs: now + 3_600_000, today: "2026-07-17" });
ok(s2.allowed.length === 0 && s2.suppressed[0].reason === "cooldown_tip_alerta", "7. episod identic in cooldown → ZERO candidat nou");
const s3 = applyAntiSpam({ previous: s1.previous, counters: s1.counters, candidates: [mk("ep:a", "INTERRUPTIVE_ALERT", "critical")], nowMs: now + 3_600_000, today: "2026-07-17" });
ok(s3.allowed.length === 1, "8. worsening (severitate crescuta) → candidat nou trece de cooldown");
const many = Array.from({ length: 7 }, (_, i) => mk(`ep:${i}`, "FOUNDER_DECISION_REQUIRED"));
const s4 = applyAntiSpam({ previous: {}, counters: null, candidates: many, nowMs: now, today: "2026-07-17" });
ok(s4.allowed.length === MAX_ALERTS_PER_DAY && s4.suppressed.some((s) => s.reason === "max_alerte_pe_zi"), `12. max ${MAX_ALERTS_PER_DAY} alerte/zi`);
const manyInt = Array.from({ length: 4 }, (_, i) => mk(`ep:i${i}`, "INTERRUPTIVE_ALERT"));
const s5 = applyAntiSpam({ previous: {}, counters: null, candidates: manyInt, nowMs: now, today: "2026-07-17" });
ok(s5.allowed.length === MAX_INTERRUPTIVE_PER_DAY && s5.suppressed.some((s) => s.reason === "max_interruptive_pe_zi"), `13. max ${MAX_INTERRUPTIVE_PER_DAY} interruptive/zi`);
const sNextDay = applyAntiSpam({ previous: {}, counters: s5.counters, candidates: [mk("ep:n", "INTERRUPTIVE_ALERT")], nowMs: now + 86_400_000, today: "2026-07-18" });
ok(sNextDay.allowed.length === 1, "contoarele se reseteaza a doua zi");

// ── Test 14: grupare ────────────────────────────────────────────────────
const g14 = groupCandidates([mk("ep:a", "INTERRUPTIVE_ALERT"), mk("ep:b", "INTERRUPTIVE_ALERT"), mk("ep:c", "DAILY_DIGEST")]);
ok(g14.length === 2 && /2 alerte importante/.test(g14[0].title) && g14[0].grouped_from.length === 2, "14. 2 interruptive → UNA grupata (+digest separat)");
ok(groupCandidates([mk("ep:a", "INTERRUPTIVE_ALERT")]).length === 1, "o singura alerta → negrupata");

// ── Teste 9, 15: digest ─────────────────────────────────────────────────
const epsMany = [
  EP({ episode_id: "ep:1", status: "worsening", combined_severity: "high", title: "Agravare 1" }),
  EP({ episode_id: "ep:2", status: "resolved", title: "Rezolvat 1" }),
  EP({ episode_id: "ep:3", _minUrgencyDays: 4, title: "Decizie aproape" }),
  EP({ episode_id: "ep:4", unknowns: ["Sold bancar neconectat."] }),
  EP({ episode_id: "ep:5", status: "worsening", title: "Agravare 2" }),
  EP({ episode_id: "ep:6", status: "worsening", title: "Agravare 3" }),
  EP({ episode_id: "ep:7", status: "worsening", title: "Agravare 4" }),
  EP({ episode_id: "ep:8", combined_severity: "low", title: "Zgomot" }), // sub prag → exclus
];
const dg = buildDailyDigest({ episodes: epsMany, candidates: [cand] });
ok(dg.points <= DIGEST_MAX_POINTS, `15. digest max ${DIGEST_MAX_POINTS} puncte (${dg.points})`);
ok(DIGEST_SECTIONS.every((s) => s in dg.sections), "digest: cele 5 sectiuni definite");
ok(dg.sections["CE S-A REZOLVAT"].includes("Rezolvat 1"), "9. rezolvarea apare in digest (o data — garantat de reconcilierea episodului)");
ok(!JSON.stringify(dg.sections).includes("Zgomot"), "zgomotul sub prag NU intra in digest");
ok(dg.sections["CE NECESITĂ ATENȚIA TA"].length >= 1, "candidatii de decizie apar la atentie");
ok(buildDailyDigest({ episodes: [], candidates: [] }).text.includes("liniste"), "digest gol → mesaj sigur");

ok(ATTENTION_LEVELS.length === 6, "cele 6 niveluri definite");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — founderAttention (pur)`);
process.exit(failed === 0 ? 0 : 1);
