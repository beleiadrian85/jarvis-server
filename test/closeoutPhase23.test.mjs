// CLOSEOUT Faza 2 (Telegram delivery) + Faza 3 (single-instance). node test/closeoutPhase23.test.mjs
process.env.ANTHROPIC_API_KEY = "dummy";
process.env.TELEGRAM_BOT_TOKEN = "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID = "1";

const { deliverToTelegram, isImmediateSeverity } = await import("../src/ceo/notifications/delivery.js");
const { pushNotification, buildNotification } = await import("../src/ceo/notifications/center.js");
const { lockIdFor, dayKey, bucketKey } = await import("../src/cronLock.js");

let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(`${c ? "✅" : "❌"} ${n}. ${m}`); if (!c) failed++; };
const mkStore = () => { const mem = {}; return { get: async (k, f) => (k in mem ? mem[k] : f), set: async (k, v) => { mem[k] = v; } }; };

// ── FAZA 2: clasificare severitate ──
ok(isImmediateSeverity("CRITICAL") && isImmediateSeverity("FOUNDER_DECISION"), "CRITICAL + FOUNDER_DECISION → imediat");
ok(!isImmediateSeverity("INFORMATIONAL") && !isImmediateSeverity("HIGH") && !isImmediateSeverity("MEDIUM"), "INFO/HIGH/MEDIUM → NU imediat (digest)");

// ── FAZA 2: livrare doar pt CRITICAL/DECISION, INFO nu se trimite ──
{
  const store = mkStore(); const sent = [];
  const sender = async (t) => sent.push(t);
  const crit = await deliverToTelegram(buildNotification({ id: "a1", severity: "CRITICAL", title: "Deficit iminent", reason: "obligatii > cash", source: "cash" }), { store, sender });
  ok(crit.sent && sent.length === 1 && /🔴 CRITIC/.test(sent[0]), "CRITICAL → trimis pe Telegram, format critic");
  const dec = await deliverToTelegram(buildNotification({ id: "a2", severity: "FOUNDER_DECISION", title: "Aprobare avans" }), { store, sender });
  ok(dec.sent && /🟠 DECIZIE/.test(sent[1]) && /decizia ta/.test(sent[1]), "FOUNDER_DECISION → trimis compact, cere decizie");
  const info = await deliverToTelegram(buildNotification({ id: "a3", severity: "INFORMATIONAL", title: "Vizita noua site" }), { store, sender });
  ok(!info.sent && info.reason === "digest_only" && sent.length === 2, "INFO → NU se trimite individual (digest)");
}

// ── FAZA 2: dedup + cooldown (nu re-trimite aceeasi alerta la fiecare cron) ──
{
  const store = mkStore(); let count = 0; const sender = async () => { count++; };
  const n1 = buildNotification({ id: "x1", severity: "CRITICAL", title: "T", deduplication_key: "cash:deficit" });
  const r1 = await deliverToTelegram(n1, { store, sender, nowISO: "2026-08-27T08:00:00Z", cooldownMin: 180 });
  const r2 = await deliverToTelegram(buildNotification({ id: "x2", severity: "CRITICAL", title: "T", deduplication_key: "cash:deficit" }), { store, sender, nowISO: "2026-08-27T09:00:00Z", cooldownMin: 180 });
  ok(r1.sent && !r2.sent && r2.reason === "cooldown" && count === 1, "aceeasi alerta (dedup key) in cooldown → NU se re-trimite");
  const r3 = await deliverToTelegram(buildNotification({ id: "x3", severity: "CRITICAL", title: "T", deduplication_key: "cash:deficit" }), { store, sender, nowISO: "2026-08-27T12:00:00Z", cooldownMin: 180 });
  ok(r3.sent && count === 2, "dupa expirarea cooldown-ului → se poate re-trimite");
}

// ── FAZA 2: pushNotification integreaza livrarea + o marcheaza ──
{
  const store = mkStore(); const sent = [];
  const r = await pushNotification({ id: "p1", severity: "CRITICAL", title: "Blocaj productie", deduplication_key: "prod:block" }, { store, sender: async (t) => sent.push(t), deliveryStore: store });
  ok(r.created && r.telegram?.sent && sent.length === 1 && r.notification.telegram_sent_at, "pushNotification: creeaza + livreaza CRITICAL + marcheaza telegram_sent_at");
  const r2 = await pushNotification({ id: "p2", severity: "INFORMATIONAL", title: "info banal" }, { store, sender: async (t) => sent.push(t), deliveryStore: store });
  ok(r2.created && !r2.telegram?.sent && sent.length === 1, "pushNotification: INFO creat dar NU trimis pe Telegram");
}

// ── FAZA 3: helpers cron lock ──
ok(lockIdFor("morning_09") === lockIdFor("morning_09") && lockIdFor("a") !== lockIdFor("b") && Number.isInteger(lockIdFor("x")), "lockIdFor: determinist, distinct, int");
ok(/^\d{4}-\d{2}-\d{2}$/.test(dayKey("2026-08-27T23:30:00Z")), "dayKey: format zi");
{
  const b1 = bucketKey(10, "2026-08-27T08:03:00Z"); const b2 = bucketKey(10, "2026-08-27T08:07:00Z"); const b3 = bucketKey(10, "2026-08-27T08:13:00Z");
  ok(b1 === b2 && b1 !== b3, "bucketKey: acelasi bucket de 10 min → aceeasi cheie; bucket diferit → cheie diferita");
}

console.log(`\n${n} verificari · ${failed === 0 ? "TOATE TRECUTE" : failed + " ESUATE"} — closeout faza 2+3`);
process.exit(failed === 0 ? 0 : 1);
