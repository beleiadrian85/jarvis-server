// CANONICAL CHANGE EVENTS (Fazele 5-6). node test/changeEvents.test.mjs
import { EVENT_TYPES, diffDomain, detectChanges, affectedAreas, eventsForLog } from "../src/ceo/changeEvents.js";

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// Vocabular canonic complet.
ok(EVENT_TYPES.includes("TASK_UPDATED") && EVENT_TYPES.includes("SOURCE_STALE") && EVENT_TYPES.includes("SOURCE_RECOVERED"), "vocabular canonic (TASK_UPDATED..SOURCE_RECOVERED)");

// Task modificat → un singur TASK_UPDATED updated.
const prevT = [{ id: 1, status: "open", assignee: "Nelu", report: "", updatedAt: "2026-07-20" }];
const nextT = [{ id: 1, status: "done", assignee: "Nelu", report: "gata", updatedAt: "2026-07-22" }];
const e1 = diffDomain("tasks", prevT, nextT);
ok(e1.length === 1 && e1[0].type === "TASK_UPDATED" && e1[0].change === "updated", "task modificat → TASK_UPDATED updated");

// Fara schimbare → zero evenimente.
ok(diffDomain("tasks", prevT, prevT).length === 0, "task nemodificat → zero evenimente");

// Prima observare (seed, prev=null) → zero evenimente (nu N 'created').
ok(diffDomain("tasks", null, nextT).length === 0, "seed (prev=null) → nu emite create in masa");

// Creare noua.
const e2 = diffDomain("tasks", prevT, [...prevT, { id: 2, status: "open", assignee: "Dana" }]);
ok(e2.length === 1 && e2[0].change === "created", "task nou → created");

// Sursa indisponibila (next=null) → SOURCE_STALE, NU stergeri.
const e3 = diffDomain("tasks", prevT, null);
ok(e3.length === 1 && e3[0].type === "SOURCE_STALE", "sursa cazuta → SOURCE_STALE (nu stergeri!)");

// Sursa revenita → SOURCE_RECOVERED.
const e4 = diffDomain("tasks", prevT, prevT, { wasStale: true });
ok(e4.some((e) => e.type === "SOURCE_RECOVERED"), "sursa revenita → SOURCE_RECOVERED");

// Multi-domeniu + zone afectate.
const events = detectChanges(
  { tasks: prevT, sales: [{ id: "u1", stage: "liber" }] },
  { tasks: nextT, sales: [{ id: "u1", stage: "rezervat" }] },
);
ok(events.some((e) => e.type === "TASK_UPDATED") && events.some((e) => e.type === "SALE_CHANGED"), "detectChanges multi-domeniu");
const areas = affectedAreas(events);
ok(areas.includes("tasks") && areas.includes("sales"), "affectedAreas → doar zonele schimbate");
ok(/TASK_UPDATED/.test(eventsForLog(events)), "eventsForLog rezuma tipurile");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — changeEvents`);
process.exit(failed === 0 ? 0 : 1);
