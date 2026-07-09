import assert from "node:assert/strict";
import { buildContext, neededSources, SOURCES } from "../src/contextBuilder.js";

const M = "un mesaj oarecare";

// 1) Shape stabil: toate sursele prezente, boolean; `date` mereu true.
for (const route of ["simple", "report", "operational_read", "strategy", "clarify", "codebase", "confirm"]) {
  const c = buildContext(M, route);
  for (const s of SOURCES) assert.equal(typeof c[s], "boolean", `${route}.${s} nu e boolean`);
  assert.equal(c.date, true, `${route}: date trebuie true`);
}
console.log("✅ shape stabil + date mereu true");

// 2) route=report → weather, calendar, gmail, operational, reminders.
const rep = buildContext(M, "report");
for (const s of ["weather", "calendar", "gmail", "operational", "reminders"]) assert.equal(rep[s], true, `report lipseste ${s}`);
assert.equal(rep.drive, false);
console.log("✅ report → weather, calendar, gmail, operational, reminders");

// 3) route=operational_read → doar operational.
const op = buildContext(M, "operational_read");
assert.equal(op.operational, true);
assert.equal(op.gmail, false);
assert.equal(op.weather, false);
console.log("✅ operational_read → operational");

// 4) route=strategy → operational, reports, memory, history.
const st = buildContext(M, "strategy");
for (const s of ["operational", "reports", "memory", "history"]) assert.equal(st[s], true, `strategy lipseste ${s}`);
console.log("✅ strategy → operational, reports, memory, history");

// 5) route=capability_missing → capabilities (+ limitations).
const cm = buildContext(M, "capability_missing");
assert.equal(cm.capabilities, true);
assert.equal(cm.limitations, true);
assert.equal(cm.operational, false);
console.log("✅ capability_missing → capabilities, limitations");

// 6) route=codebase → capabilities + codebase.
const cb = buildContext(M, "codebase");
assert.equal(cb.capabilities, true);
assert.equal(cb.codebase, true);
console.log("✅ codebase → capabilities, codebase");

// 7) neededSources → lista corecta (contine 'date').
const need = neededSources(buildContext(M, "operational_read")).sort();
assert.deepEqual(need, ["date", "operational"]);
console.log("✅ neededSources:", need.join(", "));

// 8) Pruning dupa capabilities: gmail off → nu se incarca gmail; operational ramane.
const pruned = buildContext(M, "report", { capabilities: { gmail: false, operational: true, googleCalendar: true, memory: true } });
assert.equal(pruned.gmail, false, "gmail trebuia eliminat (capability off)");
assert.equal(pruned.operational, true, "operational trebuia pastrat");
console.log("✅ pruning capabilities: gmail off → eliminat");

// 9) Ruta necunoscuta → fallback prudent (capabilities).
const unk = buildContext(M, "xyz");
assert.equal(unk.capabilities, true);
console.log("✅ ruta necunoscuta → fallback capabilities");

// 10) Pur: acelasi input → acelasi output (fara efecte/nedeterminism).
assert.deepEqual(buildContext(M, "report"), buildContext(M, "report"));
console.log("✅ pur & determinist");

console.log("TOATE TRECUTE — contextBuilder (C4)");
