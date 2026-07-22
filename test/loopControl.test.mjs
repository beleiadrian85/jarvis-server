// LOOP PRESSURE CONTROL (§10) + WORKLOAD REVIEW (§2). node test/loopControl.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

const { computeLoopPressure, passesPressure } = await import("../src/ceo/nervous/loopPressure.js");
const { reviewWorkload } = await import("../src/ceo/nervous/workloadReview.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };
const NOW = Date.parse("2026-07-22T08:00:00Z");

// ── LOOP PRESSURE ───────────────────────────────────────────────────────
const reg = (open, closed) => {
  const r = {};
  for (let i = 0; i < open; i++) r[`o${i}`] = { operational_id: `O${i}`, lifecycle: "IN_PROGRESS", created_at: "2026-07-10T08:00:00Z" };
  for (let i = 0; i < closed; i++) r[`c${i}`] = { operational_id: `C${i}`, lifecycle: "COMPLETED", created_at: "2026-07-20T08:00:00Z" };
  return r;
};
ok(computeLoopPressure({ registry: reg(2, 0), nowMs: NOW }).level === "LOW", "2 deschise / 0 inchise → LOW (ritm normal)");
const high = computeLoopPressure({ registry: reg(9, 0), nowMs: NOW });
ok(high.level === "HIGH" && high.throttle === true, "9 deschise / 0 inchise → HIGH + throttle");
ok(high.aging === 9 && high.oldest_days >= 11, "presiunea numara buclele imbatranite + cea mai veche");
const elev = computeLoopPressure({ registry: reg(6, 1), nowMs: NOW });
ok(elev.level === "ELEVATED" && elev.throttle === true, "6 deschise / 1 inchisa → ELEVATED + throttle");
ok(computeLoopPressure({ registry: reg(4, 3), nowMs: NOW }).level === "LOW", "4 deschise / 3 inchise → LOW (inchidem in ritm)");

// passesPressure: urgentele trec, valoarea mica sub presiune NU
const P = high;
ok(passesPressure({ blocking: true, value: { total: 10 } }, P).pass === true, "nevoie critica (blocking) trece chiar sub presiune HIGH");
ok(passesPressure({ urgency_days: 0, value: { total: 10 } }, P).pass === true, "nevoie urgenta (azi) trece sub presiune");
ok(passesPressure({ value: { total: 40 } }, P).pass === false, "valoare 40 < prag HIGH 65 → amanata ca propunere");
ok(passesPressure({ value: { total: 80 } }, P).pass === true, "valoare 80 >= prag → trece");
ok(passesPressure({ value: { total: 10 } }, { throttle: false }).pass === true, "fara throttle → totul trece");

// ── WORKLOAD REVIEW ─────────────────────────────────────────────────────
const opsTasks = [
  { id: "T1", title: "Lucrare critica santier", status: "in_lucru", assignee: "p-exec", priority: "critic", deadline: "2026-07-15", creator: "adrian" },
  { id: "T2", title: "Confirmare furnizor X", status: "in_lucru", assignee: "p-exec", priority: "ridicat", deadline: "2026-07-20", creator: "adrian" },
  { id: "T3", title: "Task blocat materiale", status: "blocat", assignee: "p-exec", priority: "ridicat", deadline: "2026-07-25", creator: "adrian" },
  { id: "T4", title: "Detaliu minor vechi", status: "nou", assignee: "p-exec", priority: "scazut", deadline: "2026-06-01", creator: "CEO_AI" },
  { id: "T5", title: "Task normal neurgent", status: "nou", assignee: "p-exec", priority: "normal", deadline: "2026-09-01", creator: "adrian" },
  { id: "TX", title: "Task acceptat (inchis)", status: "acceptat", assignee: "p-exec", priority: "normal", deadline: "2026-07-01", creator: "adrian" },
];
const wr = reviewWorkload({ person_id: "p-exec", opsTasks, asOf: "2026-07-22" });
ok(wr.total_open === 5, `5 task-uri deschise (cel acceptat exclus) — a fost ${wr.total_open}`);
ok(wr.buckets.KEEP_NOW.length === 3, "max 3 prioritati active (KEEP_NOW)");
ok(wr.buckets.KEEP_NOW[0].id === "T1", "cel mai important/urgent (critic+restant) e prima prioritate");
ok(wr.buckets.CANCEL_CANDIDATES.some((t) => t.id === "T4"), "task JARVIS vechi + prioritate mica → candidat de anulare (propunere)");
ok(wr.buckets.DEFER.some((t) => t.id === "T5"), "task valid dar neurgent → DEFER");
ok(wr.buckets.REASSIGN_CANDIDATES.length === 0 && /nu se ghiceste/i.test(wr.note), "reassign gol — nu se ghiceste ownerul (§2)");
ok(/recomandari, nu schimbari/i.test(wr.note), "task-urile oamenilor raman recomandari, nu schimbari unilaterale");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — loopControl`);
process.exit(failed === 0 ? 0 : 1);
