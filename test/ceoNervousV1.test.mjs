// NERVOUS SYSTEM V1 — testele obligatorii de siguranta A-Z (§28) + politici.
// node test/ceoNervousV1.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";
delete process.env.CEO_NERVOUS_SYSTEM_ENABLED;
delete process.env.CEO_AUTONOMOUS_INFORMATION_TASKS_ENABLED;

import { readFileSync, readdirSync } from "node:fs";

const { config } = await import("../src/config.js");
const { isReadOnlySql } = await import("../src/supervisor/opsdb.js");
const { assertTasksOnly, opsWrite, checkLimits, BLOCKED_WRITE_KINDS } = await import("../src/ceo/nervous/operationalWrite.js");
const { buildNeeds, scoreTaskValue } = await import("../src/ceo/nervous/needEngine.js");
const { buildResponsibilityMap, ownerForDomain } = await import("../src/ceo/nervous/responsibilityMap.js");
const { delegateNeed } = await import("../src/ceo/nervous/delegationEngine.js");
const { checkDuplicate, noteCooldown } = await import("../src/ceo/nervous/dedupEngine.js");
const { buildCeoTask, classifyForAutonomy } = await import("../src/ceo/nervous/taskOrchestrator.js");
const { verifyTaskResult } = await import("../src/ceo/nervous/resultVerification.js");
const { evaluateFollowUp } = await import("../src/ceo/nervous/followUpEngine.js");
const { planEscalation, escalationCost } = await import("../src/ceo/nervous/escalationEngine.js");
const { buildPeopleLoad } = await import("../src/ceo/nervous/peopleLoad.js");
const { recordOutcome, delegationConfidence } = await import("../src/ceo/nervous/orgMemory.js");
const { buildSelfEval } = await import("../src/ceo/nervous/selfEval.js");
const { appendStream, formatStream } = await import("../src/ceo/nervous/activityStream.js");
const { assessNervousHealth } = await import("../src/ceo/nervous/organismHealth.js");
const { idempotencyKey, TASK_VALUE_THRESHOLD, mapOperationalStatus } = await import("../src/ceo/nervous/contract.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// Persoane/domenii GENERICE de test (numele reale traiesc doar in companyConfig).
const PEOPLE = [
  { id: "p-founder", name: "Fondator", role: "fondator", aliases: [] },
  { id: "p-fin", name: "Fin", role: "financiar/contabilitate", aliases: [] },
  { id: "p-ops", name: "Ops", role: "executie/santier", aliases: [] },
];
const USERS = [
  { id: "p-founder", name: "Fondator", role: "Supervizor", blocked: 0 },
  { id: "p-fin", name: "Fin", role: "Executant", blocked: 0 },
  { id: "p-ops", name: "Ops", role: "Executant", blocked: 0 },
];
const DOMAINS = { CASH: { owner: "p-fin", connected: "PARTIAL" }, PROJECTS: { owner: "p-ops", connected: "CONNECTED" }, DECISIONS: { owner: "p-founder", connected: "CONNECTED" } };
const HIST = [
  { id: "T1", title: "trimite solduri banca", status: "acceptat", assignee: "p-fin", creator: "p-founder", deadline: "2026-07-01", project: "Birou", createdAt: "2026-06-20", updatedAt: "2026-07-01" },
  { id: "T2", title: "comanda materiale santier", status: "acceptat", assignee: "p-ops", creator: "p-founder", deadline: "2026-07-05", project: "Altele", createdAt: "2026-06-25", updatedAt: "2026-07-03" },
];

// ── Flag-uri implicite (§11, §34) ────────────────────────────────────────
ok(config.nervousSystem === false, "CEO_NERVOUS_SYSTEM_ENABLED implicit OFF");
ok(config.taskAutonomy === "shadow", "CEO_TASK_AUTONOMY implicit SHADOW");
ok(config.autonomousInfoTasks === false, "AUTONOMOUS_INFORMATION_TASKS implicit FALSE (o decide Adrian)");

// ── A. READ pe modulele permise / opsdb accepta SELECT ──────────────────
ok(isReadOnlySql("SELECT id FROM tasks"), "A. SELECT trece prin opsQuery");
ok(isReadOnlySql("WITH x AS (SELECT 1) SELECT * FROM x"), "A. WITH/CTE trece");

// ── B-G. TASKS-ONLY WRITE, impus in cod ─────────────────────────────────
const mkStore = () => { const db = {}; return { get: async (k, f) => db[k] ?? f, set: async (k, v) => { db[k] = v; }, db }; };
let created = [];
const MCP = { createTask: async (p) => { created.push(p); return `Task creat cu succes • ID: ABC123`; }, updateTask: async () => "ok" };
const CFG_ON = { nervousKill: false, nervousDailyLimit: 0, nervousPerPersonLimit: 0 };
const PAYLOAD = { title: "Trimite soldurile", assignee: "p-fin", priority: "ridicat", deadline: "2026-07-22" };

let st = mkStore();
const wB = await opsWrite("task", PAYLOAD, { idempotency_key: "idem:t1", mcp: MCP, store: st, cfg: CFG_ON, date: "2026-07-21" });
ok(wB.ok === true && created.length === 1 && wB.operational_id === "ABC123", "B. WRITE task → permis, 1 apel MCP, id capturat");

for (const kind of ["obligation", "sale", "supplier", "cash", "user", "invoice", "setting"]) {
  let threw = null;
  try { assertTasksOnly(kind); } catch (e) { threw = e; }
  ok(threw?.code === "WRITE_BOUNDARY_VIOLATION", `C-G. write "${kind}" = BLOCKED structural`);
}
ok(BLOCKED_WRITE_KINDS.includes("user") && BLOCKED_WRITE_KINDS.includes("cash"), "C-G. lista modulelor blocate e explicita");
for (const sql of ["INSERT INTO tasks VALUES (1)", "UPDATE users SET role='x'", "DELETE FROM tasks", "DROP TABLE tasks", "ALTER TABLE tasks ADD c int"]) {
  ok(!isReadOnlySql(sql), `C-G. opsdb refuza: ${sql.split(" ")[0]}`);
}
// Vectorii de ocolire gasiti la review-ul adversarial — blocati pe veci:
ok(!isReadOnlySql("WITH w AS (INSERT INTO tasks(title) VALUES('x') RETURNING id) SELECT * FROM w"), "C-G. CTE cu INSERT → blocat");
ok(!isReadOnlySql("SELECT 1; UPDATE users SET blocked=1"), "C-G. multi-statement (;) → blocat");
ok(!isReadOnlySql("SELECT set_config('default_transaction_read_only','off',false)"), "C-G. set_config (dezarmarea read-only) → blocat");
ok(!isReadOnlySql("SELECT pg_sleep(600)"), "C-G. functii de administrare → blocate");
ok(isReadOnlySql("SELECT id, created_at, updated_at, deleted_at FROM tasks WHERE status IN ('nou','respins')"), "A. SELECT legitim cu coloane created/updated/deleted trece");
ok(isReadOnlySql("SELECT count(*) FROM supplier_due_items WHERE COALESCE(confirmed,0)=0"), "A. SELECT-urile reale existente trec");

// ── H + Q. Idempotenta: dublu apel / restart = 1 singur task ────────────
// registrul persistat contine task-ul creat → al doilea apel nu mai creeaza.
st.db["ceo:nervous:tasks"] = { t1: { idempotency_key: "idem:t1", operational_id: "ABC123" } };
const wH = await opsWrite("task", PAYLOAD, { idempotency_key: "idem:t1", mcp: MCP, store: st, cfg: CFG_ON, date: "2026-07-21" });
ok(wH.ok === true && wH.deduped === true && created.length === 1, "H. task duplicat = 1 singur (idempotency_key)");
const st2 = mkStore(); st2.db["ceo:nervous:tasks"] = st.db["ceo:nervous:tasks"]; // Q: "restart" — alt proces, acelasi registru persistat
const wQ = await opsWrite("task", PAYLOAD, { idempotency_key: "idem:t1", mcp: MCP, store: st2, cfg: CFG_ON, date: "2026-07-21" });
ok(wQ.deduped === true && created.length === 1, "Q. restart nu dubleaza task-ul (registru persistat)");

// ── R. Cron simultan: lock in cycle (garda de sursa) ────────────────────
const cycleSrc = readFileSync(new URL("../src/ceo/nervous/cycle.js", import.meta.url), "utf8");
ok(/_running/.test(cycleSrc) && /ciclu deja in curs/.test(cycleSrc), "R. lock anti-cicluri-simultane in cycle.js");

// ── S. Operational indisponibil = zero false execution ──────────────────
const wS = await opsWrite("task", PAYLOAD, { idempotency_key: "idem:t9", mcp: { createTask: async () => { throw new Error("MCP down"); } }, store: mkStore(), cfg: CFG_ON, date: "2026-07-21" });
ok(wS.ok === false && !wS.operational_id, "S. MCP picat → ok:false, niciun task fals");

// ── Kill switch + limite (§34) ──────────────────────────────────────────
const wK = await opsWrite("task", PAYLOAD, { idempotency_key: "idem:t2", mcp: MCP, store: mkStore(), cfg: { ...CFG_ON, nervousKill: true } });
ok(wK.ok === false && wK.blocked === "KILL_SWITCH", "kill switch → zero scrieri instant");
const lim = checkLimits({ counters: { date: "2026-07-21", total: 5, per_person: {} }, assignee: "p-fin", date: "2026-07-21", limits: { daily_total: 5, per_person: 2 } });
ok(lim.allowed === false, "limita zilnica atinsa → blocat");
const lim2 = checkLimits({ counters: { date: "2026-07-21", total: 1, per_person: { "p-fin": 2 } }, assignee: "p-fin", date: "2026-07-21", limits: { daily_total: 5, per_person: 2 } });
ok(lim2.allowed === false, "limita per persoana atinsa → blocat");

// ── U + I. Missing ≠ zero; informatie existenta = NO TASK ───────────────
const GAP_CASH = { gap_id: "gap:cash", domain: "CASH", severity: "major", data_gap: "Sold bancar necunoscut", why: "654k iesiri/30z fara acoperire", information_request: { to: "Fin", ask: "Introdu soldurile", cadence: "zilnic" } };
const nU = buildNeeds({ asOf: "2026-07-21", dataGaps: [GAP_CASH], balances: null, domainOwners: { CASH: "p-fin" } });
ok(nU.needs.some((n) => n.type === "INFORMATION_NEED" && n.domain === "CASH"), "U. sold lipsa → INFORMATION_NEED (nu zero)");
const nI = buildNeeds({ asOf: "2026-07-21", dataGaps: [GAP_CASH], balances: { freshness: "FRESH", expired: false, totalRON: 100000 }, domainOwners: { CASH: "p-fin" } });
ok(!nI.needs.some((n) => n.domain === "CASH" && n.type === "INFORMATION_NEED"), "I. informatia exista (FRESH) → NU se mai cere");

// ── V + W. Observatie ≠ task; nevoie ≠ actiune ──────────────────────────
const nV = buildNeeds({ asOf: "2026-07-21", observations: [{ title: "Trafic usor in scadere", severity: "medium", evidence: ["[spion] 7z"] }], domainOwners: {} });
const obsNeed = [...nV.needs, ...nV.audit_only].find((n) => /trafic/i.test(n.title || n.summary || ""));
ok(!obsNeed || obsNeed.type === "OBSERVATION" || nV.audit_only.includes(obsNeed), "V. observatie medium ≠ task");
const respMap = buildResponsibilityMap({ people: PEOPLE, users: USERS, tasks: HIST, domains: DOMAINS });
const delObs = delegateNeed({ type: "OBSERVATION", title: "Trafic in scadere", domain: "WEBSITE_TRAFFIC" }, { map: respMap, founderId: "p-founder" });
ok(delObs.target === "NO_ACTION", "W. OBSERVATION → NO_ACTION (nevoia nu e actiune)");

// ── Anti-spam §4: valoare sub prag → AUDIT_ONLY ─────────────────────────
const low = scoreTaskValue({ title: "ceva minor", evidence: [], urgency_days: null });
ok(low.total < TASK_VALUE_THRESHOLD, "§4. semnal fara consecinta materiala → scor sub prag");

// ── K + L. Owner necunoscut nu se ghiceste; fondatorul nu e default ─────
const delK = delegateNeed({ type: "ACTION_NEED", task_type: "OPERATIONAL_FIX", title: "Problema pe domeniu nemapat", domain: "LEGAL", value: { total: 60 }, material_consequence: "risc" }, { map: respMap, founderId: "p-founder" });
ok(delK.target === "RESPONSIBILITY_UNKNOWN" && !delK.person_id, "K. owner necunoscut → RESPONSIBILITY_UNKNOWN (nu ghiceste)");
ok(delK.target !== "ADRIAN" && delK.person_id !== "p-founder", "L. fondatorul NU e owner-ul implicit");
const delCash = delegateNeed({ type: "INFORMATION_NEED", task_type: "CASH_DATA", title: "Solduri", domain: "CASH", suggested_owner_hint: "p-fin", value: { total: 70 }, material_consequence: "cash necunoscut" }, { map: respMap, founderId: "p-founder" });
ok(delCash.person_id === "p-fin", "§7. nevoia de date CASH → owner-ul natural (financiar), nu fondatorul");

// ── Dedup semantic (§12): task similar deja deschis ─────────────────────
const dup = checkDuplicate({ title: "Trimite soldurile bancare", summary: "solduri banca actualizate", domain: "CASH", task_type: "CASH_DATA" },
  { opsTasks: [{ id: "T9", title: "trimite solduri banca la zi", status: "in_lucru", assignee: "p-fin" }], registry: {}, proposals: {}, cooldowns: {}, nowISO: "2026-07-21T08:00:00Z" });
ok(dup.duplicate === true, "§12. task similar deschis → duplicat prevenit");
const cd = noteCooldown({}, { domain: "CASH", task_type: "CASH_DATA", title: "Solduri" }, "2026-07-21T08:00:00Z", 20);
const dupCd = checkDuplicate({ domain: "CASH", task_type: "CASH_DATA", title: "Solduri" }, { cooldowns: cd, nowISO: "2026-07-21T12:00:00Z" });
ok(dupCd.duplicate === true, "§12. cooldown activ → nu cerem aceeasi informatie de 2x");
// Review-fix: registrul NU blocheaza pe veci. Intrare INCHISA → nevoia recurenta trece.
const NEED_CASH = { domain: "CASH", task_type: "CASH_DATA", title: "Solduri" };
const closedReg = { a: { idempotency_key: idempotencyKey(NEED_CASH), lifecycle: "COMPLETED", operational_id: "XYZ111" } };
ok(checkDuplicate(NEED_CASH, { registry: closedReg, nowISO: "2026-07-22T08:00:00Z" }).duplicate === false, "§12. task inchis ieri → soldul se poate cere din nou azi");
// Simulare shadow VECHE (>24h) → nu blocheaza crearea reala dupa activare.
const oldShadow = { b: { idempotency_key: idempotencyKey(NEED_CASH), lifecycle: "PROPOSED", operational_id: null, shadow: true, created_at: "2026-07-01T08:00:00Z" } };
ok(checkDuplicate(NEED_CASH, { registry: oldShadow, nowISO: "2026-07-21T08:00:00Z" }).duplicate === false, "§11→§34. simularea shadow veche nu blocheaza autonomia activata");
// Simulare shadow DE AZI → blocheaza (nu simulam aceeasi nevoie de 2x pe zi).
const todayShadow = { c: { idempotency_key: idempotencyKey(NEED_CASH), lifecycle: "PROPOSED", operational_id: null, shadow: true, created_at: "2026-07-21T07:10:00Z" } };
ok(checkDuplicate(NEED_CASH, { registry: todayShadow, nowISO: "2026-07-21T15:30:00Z" }).duplicate === true, "§12. aceeasi nevoie nu se simuleaza de 2x in aceeasi zi");

// ── O + P. WHY + trigger pe fiecare task ────────────────────────────────
const need = { need_id: "need:cash:solduri", type: "INFORMATION_NEED", task_type: "CASH_DATA", title: "Solduri bancare la zi", summary: "Sold necunoscut", domain: "CASH", evidence: ["[data-map] CASH"], material_consequence: "Fara sold, lichiditatea pe 30z e necunoscuta", expected_change: "CASH devine CONNECTED", urgency_days: 1, confidence: 90, value: { total: 80 } };
const task = buildCeoTask(need, delCash, { asOf: "2026-07-21", projects: ["Birou", "Altele"], defaultProject: "Altele", createdByUserId: "p-founder" });
ok(!!task.internal.why && !!task.human.why, "O. CEO explica WHY (intern + uman)");
ok(!!task.internal.trigger && task.internal.source === "ceo-nervous-system" && !!task.internal.ceo_need_id, "P. fiecare task are source/trigger/need_id");
ok(!!task.internal.idempotency_key && task.idempotency_key === task.internal.idempotency_key, "§5. idempotency_key prezent");
ok(task.human.title.length <= 80 && !task.human.why.includes("\n"), "§6. task-ul uman e scurt, nu eseu");
ok(task.operational_payload.assignee === "p-fin" && task.operational_payload.priority, "§5. payload Operational complet");

// §11 — task-ul uman e AUTO-SUFICIENT: cand nevoia furnizeaza context (referinta
// la task/sursa originala), descrierea il include ca omul sa poata actiona.
const needCtx = { ...need, context: 'Se refera la task-ul Operational #QUKE7V "CERERE COMPENSARE" (termen 2026-06-20, restant 32 zile).' };
const taskCtx = buildCeoTask(needCtx, delCash, { asOf: "2026-07-21" });
ok(/Context: .*QUKE7V/.test(taskCtx.operational_payload.description), "§11. context concret (referinta task original) in descrierea umana");
const taskNoCtx = buildCeoTask(need, delCash, { asOf: "2026-07-21" });
ok(!/Context:/.test(taskNoCtx.operational_payload.description), "§11. fara context furnizat → nu se adauga sectiune goala");

// ── X. Proposal ≠ execution: ACTION/DECISION niciodata autonome ─────────
const laneShadow = classifyForAutonomy(task, { mode: "shadow", autonomousInfoEnabled: true });
ok(laneShadow.lane === "SHADOW", "§11. mode shadow → totul e simulare, chiar cu flag on");
const laneInfo = classifyForAutonomy(task, { mode: "information", autonomousInfoEnabled: true });
ok(laneInfo.lane === "AUTONOMOUS_OK", "§10A. information task + flag → autonom (dupa decizia lui Adrian)");
const verifTask = { ...task, autonomy_class: "VERIFICATION_TASK" };
ok(classifyForAutonomy(verifTask, { mode: "information", autonomousVerifEnabled: true }).lane === "AUTONOMOUS_OK", "VERIFICATION_TASK autonom cu flagul dedicat");
ok(classifyForAutonomy(verifTask, { mode: "information", autonomousInfoEnabled: true }).lane === "NEEDS_APPROVAL", "VERIFICATION fara flagul lui → aprobare");
ok(classifyForAutonomy({ ...task, autonomy_class: "LOW_RISK_OPERATIONAL_TASK" }, { mode: "information", autonomousVerifEnabled: true }).lane === "NEEDS_APPROVAL", "actiunile operationale raman pe aprobare (flag OFF)");
const riskyTask = { ...task, human: { ...task.human, title: "Comanda materiale 150.000 lei" } };
ok(classifyForAutonomy(riskyTask, { mode: "information", autonomousInfoEnabled: true }).lane === "NEEDS_APPROVAL", "continut financiar → aprobare indiferent de clasa (§5)");
const actionTask = { ...task, autonomy_class: "ACTION_TASK" };
ok(classifyForAutonomy(actionTask, { mode: "information", autonomousInfoEnabled: true }).lane === "NEEDS_APPROVAL", "X. ACTION_TASK → intotdeauna aprobare");
const decTask = { ...task, autonomy_class: "DECISION_TASK" };
ok(classifyForAutonomy(decTask, { mode: "information", autonomousInfoEnabled: true }).lane === "NEEDS_APPROVAL", "X. DECISION_TASK → intotdeauna aprobare");

// ── M + N. Bifat ≠ verificat; verificat = loop inchis ───────────────────
const ceoTask = { internal: task.internal, task_type: "CASH_DATA", human: task.human };
const vM = verifyTaskResult({ task: ceoTask, opsTask: { status: "rezolvat", report: "" }, dataChecks: { balances_fresh: false, CASH_DATA: false } });
ok(vM.verified === false, "M. task DONE fara rezultat demonstrabil → NOT VERIFIED");
const vN = verifyTaskResult({ task: ceoTask, opsTask: { status: "rezolvat", report: "solduri introduse" }, dataChecks: { balances_fresh: true, CASH_DATA: true } });
ok(vN.verified === true && vN.gap_closed === true, "N. rezultat demonstrat → VERIFIED, loop inchis");

// ── T. Stale ≠ current ──────────────────────────────────────────────────
const now = Date.parse("2026-07-21T12:00:00Z");
const hT = assessNervousHealth({ sourcesHealth: { bank_lines: { status: "OK", as_of: "2026-07-18T00:00:00Z" } }, nowMs: now, opsTasksAvailable: true, usersAvailable: true, lastCycleAt: "2026-07-21T11:00:00Z" });
ok(hT.detections.some((d) => d.key === "STALE_DATA"), "T. date stale detectate (nu tratate ca actuale)");

// ── Follow-up (§16): prima intarziere ≠ spam; escaladare fondator ultim ──
const fu1 = evaluateFollowUp({ task: ceoTask, opsTask: { status: "in_lucru", deadline: "2026-07-20" }, asOf: "2026-07-21", priorHistory: [] });
ok(fu1.action === "NO_ACTION", "§16. prima intarziere → doar overdue, zero mesaj");
const esc = planEscalation({ task: ceoTask, attempts: [], map: respMap, loads: {}, founderId: "p-founder" });
ok(esc.founder_is_last === true && esc.steps[esc.steps.length - 1]?.target !== undefined, "§17. fondatorul e ULTIMUL pas de escaladare");
ok(escalationCost({ target: "SYSTEM" }) < escalationCost({ person_id: "p-fin", target: "OTHER_ROLE" }), "§17. cost escaladare: SYSTEM < om");

// ── §20. People load: overdue cluster ≠ "muncheste mai bine" ────────────
const loadTasks = [
  { id: "a", title: "t1", status: "in_lucru", assignee: "p-ops", deadline: "2026-07-10" },
  { id: "b", title: "t2", status: "in_lucru", assignee: "p-ops", deadline: "2026-07-12" },
  { id: "c", title: "t3", status: "in_lucru", assignee: "p-ops", deadline: "2026-07-13" },
  { id: "d", title: "t4", status: "blocat", assignee: "p-ops", deadline: "2026-07-25" },
];
const loads = buildPeopleLoad({ people: PEOPLE, tasks: loadTasks, asOf: "2026-07-21", founderId: "p-founder" });
ok(loads.per_person["p-ops"]?.overdue === 3, "§20. overdue numarate corect");
const det = JSON.stringify(loads.detections).toLowerCase();
ok(!det.includes("muncheste") && !det.includes("mai bine"), "§27 PEOPLE. detectia analizeaza cauze, nu moralizeaza");

// ── §21. Memoria organizationala + delegation confidence ────────────────
let mem = recordOutcome({}, { person_id: "p-fin", task_type: "CASH_DATA", outcome: "success", at: "2026-07-21T09:00:00Z" });
mem = recordOutcome(mem, { person_id: "p-fin", task_type: "CASH_DATA", outcome: "success", at: "2026-07-21T10:00:00Z" });
ok(delegationConfidence(mem, "p-fin", "CASH_DATA") > 50, "§21. succes repetat → confidence creste");
ok(delegationConfidence(mem, "p-ops", "CASH_DATA") === 50, "§21. fara istoric → 50 (nu ghicim)");

// ── §22 + §26. Self-eval + activity stream ──────────────────────────────
const se = buildSelfEval({ registry: {}, stream: [], date: "2026-07-21" });
ok(se.metrics && "TASKS_PROPOSED" in se.metrics && "FOUNDER_INTERRUPTION_RATE" in se.metrics, "§22. metricile de self-evaluation exista");
const stream = appendStream([], { at: "2026-07-21T08:14:00Z", event: "need_detected", detail: "sold lipsa" });
ok(stream.length === 1 && formatStream(stream).includes("08:14"), "§26. activity stream cu timestamp uman");

// ── Y + Z + §29. Garzi de sursa pe tot nervous/* ────────────────────────
const dir = new URL("../src/ceo/nervous/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
let srcAll = "";
for (const f of files) srcAll += `\n// FILE:${f}\n` + readFileSync(new URL(f, dir), "utf8");
ok(!/INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|ALTER TABLE|CREATE TABLE|DROP TABLE/i.test(srcAll), "Y. zero SQL de scriere/DDL in nervous/*");
ok(!/writeFileSync|appendFileSync|fs\.promises\.write|child_process/.test(srcAll), "Z. CEO nu isi modifica singur codul (zero fs write/exec)");
const engines = files.filter((f) => !["cycle.js", "index.js", "operationalWrite.js"].includes(f));
for (const f of engines) {
  const src = readFileSync(new URL(f, dir), "utf8");
  ok(!/from\s+["'].*(mcp|opsdb|opsdata|state|audit|telegram|config|companyConfig)\.js["']/.test(src), `motor PUR fara IO: ${f}`);
}
ok(!/Adrian|Dana|Nelu|Mihaela|Profi Concept|Bell Residence/i.test(srcAll.replace(/\/\/ FILE:[^\n]*/g, "")), "§29. zero nume hardcodate in nucleul nervous/*");
const writeImporters = files.filter((f) => /from\s+["'][^"']*mcp\.js["']|import\(["'][^"']*mcp\.js["']\)/.test(readFileSync(new URL(f, dir), "utf8")));
ok(writeImporters.length === 1 && writeImporters[0] === "operationalWrite.js", "§1. mcp.js e importat DOAR de operationalWrite.js (o singura suprafata de scriere)");

// ── Contract: maparea peste statusurile reale Operational (§13) ─────────
ok(mapOperationalStatus("nou") === "ASSIGNED" && mapOperationalStatus("acceptat") === "COMPLETED" && mapOperationalStatus("blocat") === "BLOCKED", "§13. lifecycle mapat pe schema existenta, nu inventat");
ok(idempotencyKey({ domain: "CASH", task_type: "CASH_DATA", title: "Solduri" }) === idempotencyKey({ domain: "CASH", task_type: "CASH_DATA", title: "Solduri" }), "§12. cheie idempotenta deterministe");

// ── Responsibility map: observat ≠ inventat (§8) ────────────────────────
const prof = respMap.people.find((p) => p.id === "p-fin");
ok(prof && prof.known_responsibilities.includes("CASH"), "§8. responsabilitatile declarate vin din config");
ok(prof && Object.keys(prof.historical_task_types || {}).length > 0, "§8. responsabilitatile observate vin din istoric");
ok(ownerForDomain("CASH", respMap) === "p-fin", "§8. ownerForDomain functioneaza");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — ceoNervousV1 (A-Z)`);
process.exit(failed === 0 ? 0 : 1);
