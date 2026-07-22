// COGNITIVE ORCHESTRATOR + AUTONOMY LADDER + DOCUMENT INGEST BOUNDARY.
// node test/ceoCognitive.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

import { readFileSync, readdirSync } from "node:fs";
const { activeAutonomyLevel, level3ReadinessScore, AUTONOMY_LADDER, READINESS_DIMENSIONS } = await import("../src/ceo/autonomyLadder.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// ── Autonomy ladder: nivel derivat din flag-uri, nu declarat ────────────
ok(activeAutonomyLevel({}) === 0, "fara flag-uri → LEVEL 0 (read-only)");
ok(activeAutonomyLevel({ nervousSystem: true }) === 1, "nervous on → LEVEL 1 (propune)");
ok(activeAutonomyLevel({ nervousSystem: true, autonomousInfoTasks: true }) === 2, "info tasks → LEVEL 2");
ok(activeAutonomyLevel({ autonomousOperationalActions: true }) === 4, "actiuni operationale → LEVEL 4");
ok(Object.keys(AUTONOMY_LADDER).length === 6, "6 niveluri definite (0-5)");

// ── Level 3 readiness: dovezi insuficiente → NU ready (nu inventam) ──────
const empty = level3ReadinessScore({ selfEval: {}, registry: {}, days_observed: 0 });
ok(empty.recommendation.startsWith("NOT_ENOUGH_EVIDENCE"), "fara dovezi → NOT_ENOUGH_EVIDENCE (nu ghicim readiness)");
ok(READINESS_DIMENSIONS.length === 10, "10 dimensiuni de pregatire");

// Dovezi bune, dar putine cicluri → tot NOT_ENOUGH (istoric insuficient).
const good1 = level3ReadinessScore({
  selfEval: { TASKS_CREATED: 3, TASKS_USEFUL: 3, WRONG_OWNER: 0, TASKS_DUPLICATE_PREVENTED: 5, TASKS_REJECTED: 8, UNNECESSARY_ESCALATIONS: 0, data_health: 80 },
  registry: {}, days_observed: 1,
});
ok(good1.recommendation.startsWith("NOT_ENOUGH_EVIDENCE"), "3 task-uri / 1 zi → inca insuficient istoric");

// Dovezi bune + istoric suficient → READY (recomandare, nu decizie).
const reg = {};
for (let i = 0; i < 6; i++) reg[`t${i}`] = { operational_id: `OP${i}`, lifecycle: "COMPLETED", verification: { verified: true } };
const good2 = level3ReadinessScore({
  selfEval: { TASKS_CREATED: 6, TASKS_USEFUL: 6, WRONG_OWNER: 0, TASKS_DUPLICATE_PREVENTED: 4, TASKS_REJECTED: 10, UNNECESSARY_ESCALATIONS: 0, data_health: 85 },
  registry: reg, days_observed: 3,
});
ok(good2.recommendation.startsWith("READY_FOR_FOUNDER_REVIEW"), "6 bucle inchise / 3 zile / metrici bune → READY_FOR_FOUNDER_REVIEW (recomandare)");
ok(good2.closed_loops === 6 && good2.evidence_gate.closed_loops === true, "readiness cere bucle reale INCHISE (§14 dovezi, nu timp)");
ok(/aproba/.test(good2.note), "readiness = recomandare, fondatorul aproba (scris in nota)");
// Task-uri create dar ZERO inchise → NU ready (regula de fond: inchide bucle).
const openOnly = {}; for (let i = 0; i < 6; i++) openOnly[`o${i}`] = { operational_id: `X${i}`, lifecycle: "IN_PROGRESS" };
const noClosed = level3ReadinessScore({ selfEval: { TASKS_CREATED: 6, TASKS_USEFUL: 6, WRONG_OWNER: 0, TASKS_DUPLICATE_PREVENTED: 4, TASKS_REJECTED: 10, data_health: 85 }, registry: openOnly, days_observed: 5 });
ok(noClosed.recommendation.startsWith("NOT_ENOUGH_EVIDENCE") && noClosed.blockers.some((b) => /closed_loops/.test(b)), "6 create dar 0 inchise → NOT_ENOUGH_EVIDENCE (bucle neinchise)");

// ── Boundary: ingest runner NU scrie NICIODATA in Operational ───────────
const ingestSrc = readFileSync(new URL("../src/ceo/documentIngestRunner.js", import.meta.url), "utf8");
ok(!/create_task|update_task|INSERT|UPDATE|DELETE|createTask|updateTask/i.test(ingestSrc.replace(/\/\/[^\n]*/g, "")), "ingest runner: zero scriere Operational (doar SELECT + jarvis_state)");
ok(/SELECT/.test(ingestSrc) && /opsQuery/.test(ingestSrc), "ingest citeste atasamentele READ-ONLY prin opsQuery");
ok(/UNVALIDATED|trust/.test(ingestSrc), "raw upload ≠ trusted: nivel de incredere pastrat");

// ── Orchestrator: coordonator, nu creier paralel (fara logica de decizie) ─
const orchSrc = readFileSync(new URL("../src/ceo/cognitiveOrchestrator.js", import.meta.url), "utf8");
ok(/runNervousCycle/.test(orchSrc), "orchestratorul REUTILIZEAZA runNervousCycle (nu reimplementeaza)");
ok(!/create_task|createTask|opsWrite\(/.test(orchSrc), "orchestratorul nu scrie direct — deleaga la nervous");

// ── Productizare: zero nume hardcodate in noile module core ─────────────
for (const f of ["autonomyLadder.js", "cognitiveOrchestrator.js", "documentIngestRunner.js"]) {
  const src = readFileSync(new URL(`../src/ceo/${f}`, import.meta.url), "utf8");
  ok(!/Adrian|(?<![a-zA-Z])Dana(?![a-zA-Z])|Nelu|Mihaela|Profi Concept|Bell Residence/i.test(src), `zero nume hardcodate: ${f}`);
}

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — ceoCognitive`);
process.exit(failed === 0 ? 0 : 1);
