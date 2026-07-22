// NERVOUS SYSTEM V1 — MANAGEMENT ACTIV (§4/§5/§12/§20/§24).
// Acopera cele 3 motoare PURE noi: responseClassifier, insistenceEngine,
// executionHeatmap. Determinist, fara IO, fara nume de oameni/companie.
// node test/activeManagement.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

const { classifyResponse, classifyBlocker } = await import("../src/ceo/nervous/responseClassifier.js");
const { insistenceScore, nextCheckAt } = await import("../src/ceo/nervous/insistenceEngine.js");
const { buildExecutionHeatmap } = await import("../src/ceo/nervous/executionHeatmap.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// ── classifyResponse: cate o categorie pe fiecare tip de raspuns ──────────
ok(classifyResponse({ text: "am finalizat, e gata", opsStatus: "rezolvat" }).category === "DONE", "response DONE (text + status rezolvat)");
ok(classifyResponse({ text: "orice", opsStatus: "acceptat" }).category === "DONE", "response DONE (status acceptat puternic)");
ok(classifyResponse({ text: "sunt blocat, astept furnizorul" }).category === "BLOCKED", "response BLOCKED (text)");
ok(classifyResponse({ text: "nimic relevant", opsStatus: "blocat" }).category === "BLOCKED", "response BLOCKED (status blocat)");
ok(classifyResponse({ text: "mai am nevoie de o zi, termen nou" }).category === "NEED_MORE_TIME", "response NEED_MORE_TIME");
ok(classifyResponse({ text: "vezi fisierul atasat", hasAttachment: true }).category === "INFORMATION_ATTACHED", "response INFORMATION_ATTACHED (cu atasament)");
ok(classifyResponse({ text: "vezi fisierul atasat", hasAttachment: false }).category !== "INFORMATION_ATTACHED", "fara atasament NU e INFORMATION_ATTACHED (promisiune != livrare)");
ok(classifyResponse({ text: "nu e treaba mea, gresit atribuit" }).category === "NOT_MY_RESPONSIBILITY", "response NOT_MY_RESPONSIBILITY");
ok(classifyResponse({ text: "" }).category === "NO_RESPONSE", "response NO_RESPONSE (text gol, fara status)");

// confidence: status puternic ancoreaza sus; text gol da 0.
ok(classifyResponse({ text: "gata", opsStatus: "rezolvat" }).confidence >= 85, "confidence mare cand statusul confirma");
ok(classifyResponse({ text: "" }).confidence === 0, "confidence 0 pe raspuns gol");
// missing != done: doar text gol nu inseamna DONE.
ok(classifyResponse({ text: "", opsStatus: "in_lucru" }).category === "NO_RESPONSE", "missing != done (in_lucru fara text)");

// ── classifyBlocker: tipuri + who_can_remove derivat generic ──────────────
const b1 = classifyBlocker({ text: "astept marfa de la furnizor" });
ok(b1.blocker_type === "WAITING_SUPPLIER" && b1.who_can_remove === "OTHER_PERSON", "blocker WAITING_SUPPLIER → OTHER_PERSON");
const b2 = classifyBlocker({ text: "am nevoie de o decizie, trebuie sa aprobi" });
ok(b2.blocker_type === "MISSING_DECISION" && b2.who_can_remove === "FOUNDER", "blocker MISSING_DECISION → FOUNDER");
const b3 = classifyBlocker({ text: "nu inteleg ce trebuie sa fac, e neclar" });
ok(b3.blocker_type === "UNCLEAR_TASK" && b3.who_can_remove === "OWNER", "blocker UNCLEAR_TASK → OWNER (cel care a cerut)");
const b4 = classifyBlocker({ text: "nu am datele soldului bancar" });
ok(b4.blocker_type === "MISSING_INFORMATION" && b4.who_can_remove === "SYSTEM", "blocker MISSING_INFORMATION cautabil → SYSTEM");
const b5 = classifyBlocker({ text: "nu stiu parerea colegului despre asta" });
ok(b5.blocker_type === "MISSING_INFORMATION" && b5.who_can_remove === "OTHER_PERSON", "MISSING_INFORMATION necautabil de sistem → OTHER_PERSON");
const b6 = classifyBlocker({ text: "ceva neclasificabil complet" });
ok(b6.blocker_type === "OTHER" && b6.who_can_remove === "UNKNOWN", "blocker fara semnal → OTHER/UNKNOWN (nu ghicim)");

// ── insistenceScore: cele 3 exemple din directiva ────────────────────────
const poze = insistenceScore({ businessImpact: "low", urgencyDays: 4, ownerResponse: "responding" });
ok(poze.level === "LOW", `poze santier normale → LOW (${poze.score})`);
const soldAzi = insistenceScore({ businessImpact: "medium", urgencyDays: 0 });
ok(soldAzi.level === "HIGH", `sold bancar pt decizie azi → HIGH (${soldAzi.score})`);
const docBanca = insistenceScore({ businessImpact: "high", urgencyDays: 0, cashImpactRON: 150000 });
ok(docBanca.level === "CRITICAL", `document banca cu termen → CRITICAL (${docBanca.score})`);
// impact monetar mare singur forteaza CRITICAL (missing != zero pe rest).
ok(insistenceScore({ cashImpactRON: 120000 }).level === "CRITICAL", "cashImpactRON >= 100k → CRITICAL");
// ownerul care raspunde primeste mai putina presiune decat cel tacut.
ok(insistenceScore({ businessImpact: "medium", ownerResponse: "silent" }).score >
   insistenceScore({ businessImpact: "medium", ownerResponse: "responding" }).score, "tacerea creste insistenta, raspunsul o scade");

// ── nextCheckAt: cadenta pe nivel (nowMs obligatoriu) ────────────────────
const now = Date.parse("2026-07-22T09:00:00Z");
const H = 3600_000, D = 24 * H;
ok(Date.parse(nextCheckAt({ level: "CRITICAL", nowMs: now })) - now === 4 * H, "nextCheckAt CRITICAL = +4h");
ok(Date.parse(nextCheckAt({ level: "HIGH", nowMs: now })) - now === 1 * D, "nextCheckAt HIGH = +1 zi");
ok(Date.parse(nextCheckAt({ level: "MEDIUM", nowMs: now })) - now === 2 * D, "nextCheckAt MEDIUM = +2 zile");
ok(Date.parse(nextCheckAt({ level: "LOW", nowMs: now })) - now === 4 * D, "nextCheckAt LOW = +4 zile");
let threw = false;
try { nextCheckAt({ level: "HIGH" }); } catch { threw = true; }
ok(threw, "nextCheckAt arunca fara nowMs (determinism, nu Date.now)");

// ── buildExecutionHeatmap: bucla MOVING, una BLOCKED, cash UNKNOWN ────────
const registry = {
  a: { domain: "PROJECT", lifecycle: "IN_PROGRESS", updatedAt: "2026-07-22T08:00:00Z", internal: { task_title: "turnare placa" } },
  b: { domain: "PROJECT", lifecycle: "BLOCKED", updatedAt: "2026-07-15", internal: { task_title: "instalatie" } },
  c: { domain: "CASH", lifecycle: "ASSIGNED", updatedAt: "2026-07-22", internal: { task_title: "cere sold" } },
};
const hm = buildExecutionHeatmap({ registry, needs: [{ domain: "SALES", title: "lead nou" }], asOf: "2026-07-22", balances: null });
ok(hm.domains.projects.state === "BLOCKED", "heatmap projects → BLOCKED (blocajul bate miscarea)");
ok(hm.domains.projects.totals.MOVING === 1 && hm.domains.projects.totals.BLOCKED === 1, "heatmap projects numara MOVING si BLOCKED");
ok(hm.domains.cash.state === "UNKNOWN", "heatmap cash → UNKNOWN fara sold (missing != zero)");
ok(hm.domains.cash.evidence.some((e) => /sold/.test(e.ref)), "heatmap cash: evidence explica lipsa soldului");
ok(hm.domains.sales.state === "WAITING", "heatmap sales → WAITING (nevoie deschisa fara raspuns)");
ok(hm.domains.people.state === "UNKNOWN" && hm.domains.decisions.state === "UNKNOWN", "domenii fara date → UNKNOWN, nu inventate");
// cu sold valid, cash iese din UNKNOWN.
const hm2 = buildExecutionHeatmap({ registry, asOf: "2026-07-22", balances: { total: 42000, asOf: "2026-07-22" } });
ok(hm2.domains.cash.state !== "UNKNOWN", "cash cu sold valid nu mai e UNKNOWN");
ok(typeof hm.legend === "object" && !!hm.legend.MOVING, "heatmap are legend descriptiva");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — activeManagement`);
process.exit(failed === 0 ? 0 : 1);
