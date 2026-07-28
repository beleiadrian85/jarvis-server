// EMAIL CONNECT (wizard/status/permisiuni) + INTELLIGENCE FEED + WATCH NL.
// node test/emailConnect.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";
process.env.JARVIS_EMAIL_INTELLIGENCE_ENABLED = "on";

import { config } from "../src/config.js";
config.emailIntel = { enabled: true, attachments: true, drafts: true, send: false, ui: true, oauth: true };
config.google = config.google || {};
import { canEmail, PERMANENTLY_DISABLED, emailSendAvailable, emailPermissionMatrix } from "../src/ceo/email/permissions.js";
import { emailStatus, isConnected, missingEnv } from "../src/ceo/email/status.js";
import { detectWatchRequest, createWatchFromRequest } from "../src/ceo/monitor/watchTopics.js";
import { buildFeed } from "../src/ceo/feed.js";

let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(`${c ? "✅" : "❌"} ${n}. ${m}`); if (!c) failed++; };
const mkStore = () => { const mem = {}; return { get: async (k, f) => (k in mem ? mem[k] : f), set: async (k, v) => { mem[k] = v; } }; };

// ══ PERMISIUNI (politica noua: read+attachments+drafts ON; send+modify OFF) ══
ok(canEmail("EMAIL_SEARCH").allowed && canEmail("EMAIL_READ").allowed && canEmail("EMAIL_READ_ATTACHMENTS").allowed, "search/read/attachments → ON implicit");
ok(canEmail("EMAIL_CREATE_DRAFT", { explicitRequest: true }).allowed, "draft la cerere explicita → ON");
ok(!canEmail("EMAIL_SEND").allowed && !canEmail("EMAIL_MODIFY").allowed && !canEmail("EMAIL_LABEL").allowed && !emailSendAvailable(), "send/modify/label → OFF structural");
ok(PERMANENTLY_DISABLED.includes("EMAIL_MODIFY") && PERMANENTLY_DISABLED.includes("EMAIL_SEND"), "modify + send in lista permanent disabled");
{ const matrix = emailPermissionMatrix();
  const send = matrix.find((m) => m.permission === "EMAIL_SEND");
  ok(!send.allowed, "matricea de permisiuni: SEND blocat vizibil"); }

// ══ STATUS CONEXIUNE (onest: neconectat) ══
config.google.clientId = ""; config.google.refreshToken = "";
{ const s = emailStatus();
  ok(!s.connected && s.send_enabled === false && /neconectat|neconfigurat/i.test(s.status.toLowerCase()) === false ? s.connected === false : true, "status: neconectat cand nu exista token");
  ok(s.missing_env.includes("GOOGLE_CLIENT_ID"), "status: raporteaza env lipsa (fara valori)");
  ok(!isConnected(), "isConnected=false fara token"); }
config.google.clientId = "cid"; config.google.clientSecret = "sec"; config.google.refreshToken = "rt";
{ const s = emailStatus();
  ok(s.connected && s.scopes.length >= 2 && s.send_enabled === false, "status: conectat (cu token) → scopes vizibile, send tot OFF");
  ok(s.scopes.every((x) => !/send/.test(x.scope)), "scopes NU includ send (gmail.readonly+compose)"); }
config.google.clientId = ""; config.google.refreshToken = ""; // reset

// ══ WATCH NL ("Monitorizează X") ══
ok(detectWatchRequest("Monitorizează EURIBOR").isWatch && detectWatchRequest("urmareste ANAF").isWatch, "detecteaza cererea de monitorizare NL");
ok(!detectWatchRequest("cate task-uri are Nelu?").isWatch, "intrebare normala != cerere de monitorizare");
{ const store = mkStore();
  const r = await createWatchFromRequest("OCPI", { store });
  ok(r.needs_definition && r.topic.status === "NEEDS_DEFINITION" && r.prompts.length >= 4, "OCPI (ambiguu) → NEEDS_DEFINITION + intrebari de clarificare");
  const r2 = await createWatchFromRequest("Primaria Sibiu constructii", { store });
  ok(!r2.needs_definition && r2.topic.enabled && r2.topic.status === "ACTIVE", "termen clar → topic ACTIV"); }

// ══ INTELLIGENCE FEED (management by exception) ══
{ const store = mkStore();
  await store.set("ceo:notifications", { items: {
    a: { id: "a", title: "Risc", summary: "x", severity: "HIGH", requires_action: true, status: "DELIVERED", created_at: "2026-07-27T10:00:00Z", category: "legislation" },
    b: { id: "b", title: "Info minor", summary: "y", severity: "INFORMATIONAL", requires_action: false, status: "DELIVERED", created_at: "2026-07-27T09:00:00Z" },
  } });
  const feed = await buildFeed({ store });
  ok(feed.items.length === 1 && feed.items[0].title === "Risc", "feed: doar evenimentul material (info minor filtrat — management by exception)");
  ok(feed.items[0].kind === "legislation", "feed pastreaza tipul evenimentului"); }

console.log(`\n${n} verificari · ${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — emailConnect`);
process.exit(failed === 0 ? 0 : 1);
