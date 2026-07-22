// REACTIVE TASK-UPDATE WATCH (§2, §3): schimbarea pe un task CEO → ciclu reactiv.
// node test/reactiveWatch.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

import { readFileSync } from "node:fs";
const { pollCeoTaskUpdates } = await import("../src/ceo/nervous/reactiveWatch.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

const db = {};
const store = { get: async (k, f) => (k in db ? db[k] : f), set: async (k, v) => { db[k] = v; } };
db["ceo:nervous:tasks"] = { t1: { operational_id: "OP1" }, t2: { operational_id: "OP2" } };
let fired = [];
const trigger = (r) => fired.push(r);

// 1) Seed (prima observare) → NU declanseaza, doar memoreaza.
const opsV1 = [{ id: "OP1", status: "in_lucru", report: "", updatedAt: "2026-07-22T08:00:00Z" }, { id: "OP2", status: "nou", report: "", updatedAt: "2026-07-22T08:00:00Z" }];
const r1 = await pollCeoTaskUpdates({ opsTasks: opsV1, store, trigger });
ok(r1.changed.length === 0 && fired.length === 0, "seed (prima observare) → zero declansare");
ok(db["ceo:nervous:opssnap"] && Object.keys(db["ceo:nervous:opssnap"]).length === 2, "amprentele task-urilor CEO memorate");

// 2) Fara schimbare → tot zero.
const r2 = await pollCeoTaskUpdates({ opsTasks: opsV1, store, trigger });
ok(r2.changed.length === 0 && fired.length === 0, "fara schimbare → zero declansare");

// 3) OP1 primeste raport (om a raspuns) → detectat + ciclu reactiv declansat.
const opsV2 = [{ id: "OP1", status: "rezolvat", report: "am terminat, atasez dovada", updatedAt: "2026-07-22T10:00:00Z" }, { id: "OP2", status: "nou", report: "", updatedAt: "2026-07-22T08:00:00Z" }];
const r3 = await pollCeoTaskUpdates({ opsTasks: opsV2, store, trigger });
ok(r3.changed.length === 1 && r3.changed[0].id === "OP1", "schimbare pe OP1 (status+raport) → detectata");
ok(r3.triggered === true && fired.length === 1 && /task-updated:OP1/.test(fired[0]), "→ ciclu reactiv declansat imediat (nu asteapta cron)");

// 4) Task non-CEO se schimba → ignorat (doar task-urile CEO conteaza).
const opsV3 = [...opsV2, { id: "OTHER", status: "blocat", report: "x", updatedAt: "2026-07-22T11:00:00Z" }];
fired = [];
const r4 = await pollCeoTaskUpdates({ opsTasks: opsV3, store, trigger });
ok(r4.changed.length === 0 && fired.length === 0, "task non-CEO schimbat → ignorat");

// 5) Cablat in poll-ul existent (notifier), gated pe nervous.
const notif = readFileSync(new URL("../src/notifier.js", import.meta.url), "utf8");
ok(/checkCeoTaskUpdates/.test(notif) && /pollCeoTaskUpdates/.test(notif) && /config\.nervousSystem/.test(notif), "reutilizeaza poll-ul notifier, gated pe nervous (zero microserviciu nou)");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — reactiveWatch`);
process.exit(failed === 0 ? 0 : 1);
