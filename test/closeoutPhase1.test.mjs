// FINAL CLOSEOUT — Faza 1: cele 4 buguri din auditul 27 aug. node test/closeoutPhase1.test.mjs
process.env.ANTHROPIC_API_KEY = "dummy";
process.env.TELEGRAM_BOT_TOKEN = "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID = "1";
process.env.JARVIS_EMAIL_INTELLIGENCE_ENABLED = "on"; // pt. canEmail EMAIL_READ

const { operationalAccess } = await import("../src/ceo/sourceTruth.js");
const { readEmailThread } = await import("../src/ceo/email/adapter.js");
const { planSources } = await import("../src/ceo/infoResolver.js");
const { defaultCheckers } = await import("../src/ceo/resolverSources.js");

let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(`${c ? "✅" : "❌"} ${n}. ${m}`); if (!c) failed++; };

// ── BUG 1: sourceTruth — acces Operational pe hasOpsDb, nu pe hasDb ──
{
  // JARVIS DB up dar Operational DB DOWN → NU declara FULL (nici macar CONNECTED prin opsdb).
  const a = operationalAccess(false, false);
  ok(a.status === "NOT_CONNECTED" && a.read === "NONE" && a.data_domains.length === 0, "opsdb DOWN + MCP DOWN → NOT_CONNECTED / NONE (nu declara acces)");
  // Operational (opsdb) UP → FULL.
  const b = operationalAccess(true, false);
  ok(b.status === "CONNECTED" && b.read.startsWith("FULL") && b.data_domains.length > 5, "opsdb UP → CONNECTED / FULL / toate domeniile");
  // Doar MCP UP (fara opsdb) → PARTIAL, doar task-uri (NU FULL).
  const c = operationalAccess(false, true);
  ok(c.status === "CONNECTED" && c.read.startsWith("PARTIAL") && c.data_domains.join() === "tasks", "doar MCP → PARTIAL / doar task-uri (nu FULL)");
  // Ambele UP → FULL (opsdb castiga).
  const d = operationalAccess(true, true);
  ok(d.read.startsWith("FULL"), "ambele UP → FULL");
}

// ── BUG 2: readEmailThread — forma LISTA de mesaje ──
{
  const perm = { EMAIL_READ: true };
  const mkGmail = (ret) => ({ readThread: async () => ret });
  const ctx = { permissions: perm };
  // helper: adapterul verifica canEmail EMAIL_READ — emailIntel trebuie sa fie configurat.
  const run = async (ret) => readEmailThread("t1", { gmail: mkGmail(ret), ctx: { explicitRequest: true } });

  const multi = await run([{ from: "a@x.ro", subject: "S1", date: "azi", body: "corp mesaj unu" }, { from: "b@x.ro", body: "corp mesaj doi" }]);
  ok(multi.ok && multi.message_count === 2 && /corp mesaj unu/.test(multi.fenced) && /corp mesaj doi/.test(multi.fenced), "thread cu MAI MULTE mesaje (lista) → citit corect, ambele corpuri");
  const one = await run([{ from: "a@x.ro", subject: "S", body: "singurul corp" }]);
  ok(one.ok && one.message_count === 1 && /singurul corp/.test(one.fenced), "thread cu UN mesaj (lista) → citit");
  const empty = await run([]);
  ok(empty.ok && empty.empty === true && empty.message_count === 0, "lista GOALA → ok + empty, fara crash");
  const nullT = await run(null);
  ok(nullT.ok && nullT.message_count === 0, "null → ok, fara crash");
  const noBody = await run([{ from: "a@x.ro", subject: "fara corp" }]);
  ok(noBody.ok && noBody.message_count === 1 && /fara continut text/.test(noBody.fenced), "mesaj FARA body → placeholder, fara crash");
  const objForm = await run({ body: "forma veche obiect" });
  ok(objForm.ok && /forma veche obiect/.test(objForm.fenced), "forma OBIECT {body} → inca suportata (compat)");
  const incomplete = await run([{ snippet: "doar snippet" }, {}]);
  ok(incomplete.ok && incomplete.message_count === 2 && /doar snippet/.test(incomplete.fenced), "structura incompleta (snippet / gol) → robust");
}

// ── BUG 4: Resolver — fiecare cheie din planSources are un checker ──
{
  const checkers = defaultCheckers({});
  const allKeys = new Set();
  for (const intent of ["LEGAL", "GENERIC"]) for (const t of ["lege noua tva", "pretul pietei concurenta", "avem extrasele"]) planSources(intent, t).forEach((k) => allKeys.add(k));
  const missing = [...allKeys].filter((k) => typeof checkers[k] !== "function");
  ok(missing.length === 0, `toate sursele din planSources au checker (lipsa: ${missing.join(",") || "niciuna"})`);
  ok(!planSources("GENERIC", "pretul pietei").includes("official_source"), "BUG reparat: nu mai apare 'official_source' (aliniat la official_primary)");
  ok(typeof checkers.official_primary === "function" && typeof checkers.authorized_drive === "function" && typeof checkers.company_sites === "function", "checkere reale (nu stub-uri moarte) pt web + drive");
}

// ── Read-only invariant (resolver nu scrie) ──
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/ceo/resolverSources.js", import.meta.url), "utf8");
  ok(!/operationalWrite|create_task|update_task|createEmailDraft|messages\.send|drafts\.send/.test(src), "resolver RAMANE read-only (fara scrieri) — driveChecker doar searchDrive");
}

console.log(`\n${n} verificari · ${failed === 0 ? "TOATE TRECUTE" : failed + " ESUATE"} — closeout faza 1`);
process.exit(failed === 0 ? 0 : 1);
