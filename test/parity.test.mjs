import assert from "node:assert/strict";

// Env dummy INAINTE de import (decisionEngine → capabilities → config).
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

const { classify } = await import("../src/decisionEngine.js");
const { norm } = await import("../src/lib/text.js");
const intents = await import("../src/intents.js");

/**
 * HARNESS DE PARITATE C3 (pur — fara DB/MCP/Claude/Google/OpenAI).
 *
 * brainRoute() = transcriere FIDELA a lanțului din brain.handleMessage
 * (pașii 0.5 → 8), folosind ACELEASI intents ca aplicatia. Nu importa brain.js
 * si nu-l modifica; e doar oracolul de referinta pentru comparatie.
 *
 * Presupunem "conectat" (hasGoogle/hasOperational=true) ca sa testam LOGICA de
 * rutare, nu sub-ramura connected/not-connected.
 */
function brainRoute(text, ctx) {
  const n = norm(text);
  const hasOp = !!ctx.hasOperational;
  // 0.5 briefing
  if (/^\/?(supervizor|briefing|brief|ce probleme)\b/.test(n) || n === "ce e cu operational") return "report/briefing";
  // 0.6 sales
  if (/^\/?(raport\s+)?(vanzari|v[aâ]nz[aă]ri|parteneri|spion)\b/.test(n) || /cum (stau|merg) (vanzarile|v[aâ]nz[aă]rile|partenerii)/.test(n)) return "report/sales";
  // 1 morning
  if (["buna dimineata jarvis", "buna dimineata", "neata jarvis"].some((w) => n.includes(w)) || n === "/raport" || n === "raport") return "report/morning";
  // 1.5–1.9 (gated hasOperational)
  if (hasOp && intents.isCashForecastTopic(text)) return "report/cash";
  if (hasOp && intents.isCeoHomeTopic(text)) return "report/ceo";
  if (hasOp && intents.isRiskTopic(text)) return "report/risk";
  if (hasOp && intents.isProjectTopic(text)) return "report/project";
  if (hasOp && intents.extractEntity(text)) return "report/entity";
  // 2 reminder settle
  if (/^(rezolvat|amana|ignora)\s*#?(\d+)(?:\s+(\d+))?$/.test(n)) return "memory";
  // 2.5 consiliu
  if (/\bconsiliu\b/.test(n)) return "council";
  // 3 decizii
  if (/noteaz[aă] decizia[:\s]+/i.test(text)) return "memory";
  if (n === "/decizii" || n === "decizii") return "memory";
  // 4 tine minte
  if (/[tț]ine minte[:\s]+/i.test(text)) return "memory";
  // 5 create task
  if (/creeaz[aă]\s+task/i.test(text)) return "action_propose/create_task";
  // 5.5 calendar
  if (intents.isCalendarTopic(text)) return "action_propose/calendar";
  // 5.7 email
  if (intents.isEmailTopic(text)) return "email";
  // 6 drive
  if (/caut[aă]\s+[iî]n\s+drive[:\s]+/i.test(text)) return "drive";
  // 7 draft
  if (/draft(?:\s+r[aă]spuns)?(?:\s+la)?[:\s]+/i.test(text)) return "draft";
  // 8 general chat
  if (hasOp && intents.isOperationalTopic(text)) return "operational_read";
  return "simple";
}

// Normalizeaza Decision → string comparabil cu brainRoute.
function deRoute(d) {
  if (d.route === "report") return `report/${d.kind}`;
  if (d.route === "action_propose") return `action_propose/${d.kind}`;
  return d.route;
}

const CTX = { hasOperational: true, hasGoogle: true, hasStrategy: false };

const MESSAGES = [
  "salut, ce faci",
  "buna dimineata Jarvis",
  "cum stam cu firma",
  "arata-mi cash forecast",
  "ce riscuri am acum",
  "cum stau proiectele",
  "tot ce tine de Horotan",
  "ce face Nelu la task-uri",
  "ce email am de la banca",
  "pune-mi o alarma maine la 9",
  "creeaza task: suna furnizorul de gresie",
  "cauta in drive: contract Infosys",
  "tine minte: notarul cere actele pana vineri",
  "noteaza decizia: amanam corpul C2",
  "rezolvat #4",
  "consiliu: sa vand terenul din Marsa",
  // divergente INTENTIONATE (functionalitati noi, inactive)
  "ce ai face in locul meu",
  "arata-mi logurile de pe railway",
  "ce zice google analytics",
  "vreau sa vad banking",
  // draft email (C2.1 — acum modelat in decisionEngine, paritate cu brain step 7)
  "draft raspuns la emailul de la avocat",
  "draft: scrie-i lui Dana ca am primit actele",
  "scrie draft pentru email catre notar",
];

function statusOf(b, d, dec) {
  if (b === d) return "PARITY";
  if (dec.route === "strategy") return "INTENTIONAL"; // ruta noua, inactiva → fallback Claude
  if (dec.route === "clarify" && /capability_missing/.test(dec.reason)) return "INTENTIONAL";
  if (b === "draft") return "GAP"; // decisionEngine nu are inca ruta draft
  return "REGRESSION";
}

const counts = { PARITY: 0, INTENTIONAL: 0, GAP: 0, REGRESSION: 0 };
const regressions = [];
const gaps = [];

console.log("=== HARNESS PARITATE C3 (decisionEngine vs brain.js) ===\n");
console.log("MESAJ".padEnd(42), "BRAIN".padEnd(24), "DECISIONENGINE".padEnd(22), "STATUS");
for (const msg of MESSAGES) {
  const dec = classify(msg, CTX);
  const b = brainRoute(msg, CTX);
  const d = deRoute(dec);
  const st = statusOf(b, d, dec);
  counts[st]++;
  if (st === "REGRESSION") regressions.push({ msg, b, d });
  if (st === "GAP") gaps.push({ msg, b, d: dec.route + (dec.reason ? ` (${dec.reason})` : "") });
  const icon = { PARITY: "✅", INTENTIONAL: "🟡", GAP: "🟠", REGRESSION: "❌" }[st];
  console.log(`"${msg}"`.slice(0, 41).padEnd(42), b.padEnd(24), (d + (dec.route === "clarify" ? ":" + dec.reason.split(":")[1] : "")).padEnd(22), `${icon} ${st}`);
}

console.log("\n=== SUMAR ===");
console.log(`PARITY: ${counts.PARITY} | INTENTIONAL: ${counts.INTENTIONAL} | GAP: ${counts.GAP} | REGRESSION: ${counts.REGRESSION}`);
if (gaps.length) {
  console.log("\n🟠 GAP-uri (de rezolvat inainte de C3):");
  for (const g of gaps) console.log(`   "${g.msg}" → brain: ${g.b}  |  decisionEngine: ${g.d}`);
}
if (regressions.length) {
  console.log("\n❌ REGRESII REALE:");
  for (const r of regressions) console.log(`   "${r.msg}" → brain: ${r.b}  |  decisionEngine: ${r.d}`);
}

// Asertii: ZERO regresii reale SI ZERO gap-uri (draft e acum modelat — C2.1).
assert.equal(counts.REGRESSION, 0, `Regresii reale: ${JSON.stringify(regressions)}`);
assert.equal(counts.GAP, 0, `Gap-uri ramase: ${JSON.stringify(gaps)}`);
assert.ok(counts.PARITY >= 17, `Paritate insuficienta: doar ${counts.PARITY}`);

console.log("\nTOATE TRECUTE — harness paritate (zero regresii reale)");
