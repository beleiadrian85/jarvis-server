// EXTENSIE — Persistent Request Memory + People Supervision (adversarial).
process.env.ANTHROPIC_API_KEY ||= "dummy"; process.env.TELEGRAM_BOT_TOKEN ||= "dummy"; process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";
const { requestMemoryView, openLoops, followUpLadder, insistenceScore, recordCommitment, dueCommitments, answerSupervisionQuestions } = await import("../src/ceo/nervous/requestMemory.js");
const { buildOperationalProfile, buildScorecard, detectRepeatedFailure, founderSupervision } = await import("../src/ceo/nervous/peopleSupervision.js");
let failed = 0; const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };
const REC = { id: "idem:x", need_id: "need:cash:sold", operational_id: "AB12CD", owner: "p-fin", task_type: "CASH_DATA",
  human: { title: "Actualizeaza soldurile", why: "cash flow", deadline: "2026-07-20", expected_result: "solduri la zi" },
  internal: { verification_method: "DATA", priority: "critic" }, lifecycle: "COMPLETED", shadow: false,
  created_at: "2026-07-19T08:12:00Z", followups: [], outcome: null, gap_closed: null };
const REG = { "idem:x": REC };
// restart → memoria persista (view derivat din registrul persistat)
const view = requestMemoryView(REG, { nowISO: "2026-07-22T08:00:00Z" });
ok(view.length === 1 && view[0].owner === "p-fin" && view[0].asked_at === "2026-07-19T08:12:00Z", "memoria cererilor: cine/ce/cand persistate");
// task bifat fara rezultat verificat → loop DESCHIS
ok(view[0].open_loop === true && openLoops(REG).length === 1, "task COMPLETED fara gap_closed → OPEN LOOP");
ok(openLoops({ "idem:y": { ...REC, outcome: "success", gap_closed: true } }).length === 0, "rezultat verificat → loop inchis");
// follow-up ladder + insistenta
const lad = followUpLadder({ ...REC, lifecycle: "IN_PROGRESS" }, { nowISO: "2026-07-22T08:00:00Z" });
ok(lad.level >= 1 && lad.message_template.length > 10, "deadline depasit → nivel >=1 cu mesaj contextual");
ok(insistenceScore({ ...REC, lifecycle: "IN_PROGRESS" }, { nowISO: "2026-07-22T08:00:00Z" }).tier !== "low", "sold critic intarziat → insistenta ridicata");
// promisiune ratata → verificare la termen
const cm = recordCommitment({}, { person_id: "p-fin", what: "trimit situatia", due: "2026-07-20", source: "task#AB12CD", at: "2026-07-19" });
ok(dueCommitments(cm, "2026-07-21T08:00:00Z").some((c) => c.overdue), "promisiune ratata → detectata la termen");
// cereri repetitive → candidat de automatizare
const REG3 = { a: { ...REC, id: "a" }, b: { ...REC, id: "b", created_at: "2026-07-10T08:00:00Z" }, c: { ...REC, id: "c", created_at: "2026-07-01T08:00:00Z" } };
ok(answerSupervisionQuestions(REG3, {}).automation_candidates.some((x) => x.task_type === "CASH_DATA"), "3 cereri acelasi tip → automation candidate");
// aceeasi greseala cu cauze diferite → NU repeated pattern
ok(detectRepeatedFailure({ records: [{ blocker: "furnizor" }, { blocker: "alta cauza" }] }).repeated === false, "cauze diferite → NU repeated failure");
ok(detectRepeatedFailure({ records: [{ blocker: "furnizor" }, { blocker: "furnizor" }] }).repeated === true, "aceeasi cauza x2 → REPEATED_PATTERN_REVIEW");
// profil factual, fara judecati
const prof = buildOperationalProfile({ person: { id: "p-fin", responsibilities: ["cash"] }, registry: REG, opsTasks: [], memory: {}, asOf: "2026-07-22" });
ok(!/lenes|nu se implica|slab/i.test(JSON.stringify(prof)), "FACTS FIRST — zero judecati de caracter");
const sc = buildScorecard(prof);
ok("delivery_reliability" in sc && !("total" in sc), "scorecard multidimensional, fara numar unic");
// fondatorul ca blocker → spus explicit
const fs2 = founderSupervision({ registry: {}, proposals: { p1: { state: "proposed", problem: "decizie X", recorded_at: "2026-07-15" } }, founderId: "p-f", asOf: "2026-07-22" });
ok(fs2.blockers.length >= 1, "decizie care asteapta fondatorul → semnalata factual");
console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — ceoSupervision`);
process.exit(failed === 0 ? 0 : 1);
