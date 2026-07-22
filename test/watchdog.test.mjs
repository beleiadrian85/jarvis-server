// OPEN LOOP WATCHDOG (§2, §24) + gate-ul de follow-up real. node test/watchdog.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

import { readFileSync } from "node:fs";
const { decideLoopAction, runWatchdog, LOOP_ACTIONS } = await import("../src/ceo/nervous/openLoopWatchdog.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };
const NOW = Date.parse("2026-07-22T08:00:00Z");
const rec = (over) => ({ operational_id: "OP1", lifecycle: "IN_PROGRESS", human: { title: "Clarifica X", deadline: over ? "2026-07-15" : "2026-07-30" }, followups: [], created_at: "2026-07-10T08:00:00Z" });

// Restant, fara reminder → FOLLOW_UP.
const d1 = decideLoopAction(rec(true), { insistence: { level: "MEDIUM" }, nowMs: NOW, asOf: "2026-07-22" });
ok(d1.action === "FOLLOW_UP" && d1.needs_followup === true, "restant fara reminder → FOLLOW_UP");
ok(!!d1.next_check_at, "§24 — orice decizie are next_check_at (WAIT nu e pasiv)");

// In termen → WAIT dar cu next_check_at.
const d2 = decideLoopAction(rec(false), { insistence: { level: "LOW" }, nowMs: NOW, asOf: "2026-07-22" });
ok(d2.action === "WAIT" && !!d2.next_check_at, "in termen → WAIT + next_check_at");

// Rezultat raportat, neverificat → VERIFY (bifat != rezolvat).
const d3 = decideLoopAction(rec(true), { opsTask: { id: "OP1", status: "rezolvat", report: "gata" }, insistence: { level: "MEDIUM" }, nowMs: NOW, asOf: "2026-07-22" });
ok(d3.action === "VERIFY", "rezultat raportat dar neverificat → VERIFY");

// Blocat → ASK_BLOCKER (nu esec).
const d4 = decideLoopAction(rec(true), { opsTask: { id: "OP1", status: "blocat" }, insistence: { level: "HIGH" }, nowMs: NOW, asOf: "2026-07-22" });
ok(d4.action === "ASK_BLOCKER", "blocat → ASK_BLOCKER (nu task nereusit)");

// Nevoia nu mai e valida → NO_LONGER_NEEDED.
const d5 = decideLoopAction(rec(true), { stillNeeded: false, nowMs: NOW, asOf: "2026-07-22" });
ok(d5.action === "NO_LONGER_NEEDED", "nevoia nu mai e valida → NO_LONGER_NEEDED");

// Reminder deja trimis + impact mare → ESCALATE (reevaluare, nu spam).
const recFu = { ...rec(true), followups: [{ at: "2026-07-20T08:00:00Z", action: "FOLLOW_UP" }] };
const d6 = decideLoopAction(recFu, { insistence: { level: "HIGH" }, nowMs: NOW, asOf: "2026-07-22" });
ok(d6.action === "ESCALATE", "reminder deja trimis + impact HIGH → ESCALATE (nu al doilea reminder)");

// runWatchdog acopera doar buclele deschise reale.
const reg = { a: rec(true), b: { ...rec(false), lifecycle: "COMPLETED" }, c: { lifecycle: "PROPOSED" } };
reg.a.operational_id = "A"; reg.b.operational_id = "B";
const wd = runWatchdog({ registry: reg, nowMs: NOW, resolveCtx: () => ({ asOf: "2026-07-22" }) });
ok(wd.length === 1 && wd[0].task_id === "A", "watchdog acopera doar buclele deschise reale (nu inchise/shadow)");
ok(wd.every((l) => LOOP_ACTIONS.includes(l.action)), "toate actiunile sunt canonice");

// Gate-ul de follow-up REAL: OFF implicit + result-check-first + structural.
const cycleSrc = readFileSync(new URL("../src/ceo/nervous/cycle.js", import.meta.url), "utf8");
ok(/cfg\.autonomousFollowup === true/.test(cycleSrc), "follow-up real e gated pe flag dedicat (OFF implicit)");
ok(/result-check-first|hasResult/.test(cycleSrc), "§3 — result-check-first: nu deranja daca rezultatul exista deja");
ok(/FINALIZAT \/ BLOCAT \+ motiv \/ TERMEN NOU/.test(cycleSrc), "§4 — follow-up cere raspuns structurat clasificabil");
const cfgSrc = readFileSync(new URL("../src/config.js", import.meta.url), "utf8");
ok(/autonomousFollowup:.*CEO_AUTONOMOUS_FOLLOWUP_ENABLED/.test(cfgSrc), "flag CEO_AUTONOMOUS_FOLLOWUP_ENABLED definit");

// ── REGULA "un task = o responsabilitate": clarificare pe ORIGINAL, nu task nou ─
const { buildNeeds } = await import("../src/ceo/nervous/needEngine.js");
const overdue = [{ id: "7HYZDH", title: "Contract Horotan", status: "in_lucru", assignee: "nelu", deadline: "2026-07-03", creator: "adrian" }];
const out = buildNeeds({ asOf: "2026-07-23", opsTasks: overdue, domainOwners: { TASKS: "adrian" } });
const clar = out.needs.find((n) => n.original_task_id === "7HYZDH");
ok(clar && clar.deliver_as === "observation_on_original", "clarificarea unui restant → OBSERVATIE pe original (nu task nou)");
ok(clar && clar.need_id === "need:clarify:7HYZDH", "need_id STABIL pe ID-ul task-ului (dedup imun la titlu)");
ok(clar && /FINALIZAT \/ BLOCAT \+ motiv \/ TERMEN NOU/.test(clar.observation_text || ""), "observatia cere raspuns structurat");
// Doua formulari ale aceluiasi restant → acelasi need_id (fara dublura).
const out2 = buildNeeds({ asOf: "2026-07-24", opsTasks: overdue, domainOwners: { TASKS: "adrian" } });
ok(out2.needs.find((n) => n.original_task_id === "7HYZDH")?.need_id === clar.need_id, "acelasi task original → acelasi need_id la orice rulare (zero task-despre-task duplicat)");
const nSrc = readFileSync(new URL("../src/ceo/nervous/operationalWrite.js", import.meta.url), "utf8");
ok(/export async function opsObservation/.test(nSrc) && /add_observation/.test(nSrc), "opsObservation: clarificare pe orice task prin add_observation (TASKS-ONLY)");
// Bug real (gasit live): add_observation asteapta 'note', nu 'text'.
const { opsObservation, opsTaskReminder } = await import("../src/ceo/nervous/operationalWrite.js");
let cap; const mockMcp = { mcpCall: async (t, a) => { cap = a; return "ok"; } };
await opsObservation("ABC123", "x", { mcp: mockMcp });
ok(cap && "note" in cap && !("text" in cap), "add_observation foloseste campul 'note' (nu 'text') — bug real reparat");
ok((nSrc.match(/add_observation.*note:/g) || []).length === 2 && !/add_observation.*text:/.test(nSrc), "ambele apeluri add_observation folosesc 'note'");

// Bug real (gasit live): sincronizarea de status NU trebuie sa resusciteze
// buclele inchise intentionat (NO_LONGER_NEEDED/EXPIRED) cand task-ul Operational
// apare "rezolvat" — un duplicat inchis nu se mai baga in VERIFY.
ok(/!\["COMPLETED", "FAILED", "NO_LONGER_NEEDED", "EXPIRED"\]\.includes\(rec\.lifecycle\)/.test(cycleSrc),
  "sync-ul de lifecycle respecta starile terminale (nu resusciteaza bucle inchise)");
// Watchdog: o bucla NO_LONGER_NEEDED nu mai apare in urmarire (e inchisa).
const regClosed = { z: { operational_id: "Z1", lifecycle: "NO_LONGER_NEEDED" } };
ok(runWatchdog({ registry: regClosed, nowMs: NOW, resolveCtx: () => ({}) }).length === 0, "bucla NO_LONGER_NEEDED nu mai e urmarita de watchdog");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — watchdog`);
process.exit(failed === 0 ? 0 : 1);
