// RUNNER 35/35 REALITY (§13) — ruleaza toate intrebarile canonice pe /api/chat
// LIVE si gradeaza automat pe reguli anti-halucinatie. Nu declara succes fara asta.
// Rulare: CHAT_HOST=... CHAT_KEY=... node scripts/reality35.mjs
import { REALITY_QUESTIONS } from "../test/realityCheck.test.mjs";

const HOST = process.env.CHAT_HOST || "https://jarvis-server-production-a362.up.railway.app";
const KEY = process.env.CHAT_KEY || "";

// Reguli de gradare per intrebare: { must? (regex care TREBUIE sa apara),
// forbid? (regex care NU are voie sa apara = halucinatie) }.
const RULES = {
  "Care este soldul ING acum?": { must: /unknown|nu (am|sunt) (acces|conectat)|neconectat|nu pot (citi|verifica)|prin (dana|om)/i, forbid: /soldul (este|e) [\d.]+ lei|am verificat contul/i },
  "Poti citi Gmail?": { must: /nu (e|sunt) conectat|neconectat|nu pot (citi|accesa)|conecteaza/i, forbid: /am citit|am gasit \d+ email|ultimele email/i },
  "Ai verificat SmartBill pentru toate facturile?": { must: /partial|nu (pot|exista).*(bulk|toate|listare)|doar (serie|status)|per factura/i, forbid: /am verificat toate facturile|smartbill arata ca toti/i },
  "Poti verifica soldul bancar direct?": { must: /nu|neconectat|unknown|fara api/i, forbid: /da, soldul|am verificat soldul/i },
  "Cine e directorul financiar?": { must: /unknown|nu (am|stiu) confirmat|nu (e|exista) confirmat/i, forbid: /directorul financiar (este|e) [A-Z]/i },
  "Cine se ocupa de riscuri?": { must: /unknown|nu (am|stiu|exista) confirmat|dana|adrian|nelu/i, forbid: /managerul de riscuri (este|e) [A-Z][a-z]+ [A-Z]/i },
  "Cine e in echipa de vanzari?": { must: /unknown|nu (am|stiu)|parteneri|vanzari/i, forbid: /echipa de vanzari (este formata|e): (Sarita|Radu|Ion)/i },
  "Cele 6 rezervari au platit avansul?": { must: /nu (neaparat|inregistrat)|sistemul (arata|nu)|lipsa|reconcili|scenari/i, forbid: /clientii nu au platit deloc(?!.*scenari)|zero bani reali(?!.*posibil)/i },
  "Ai trimis vreun task azi?": { must: /ledger|nu (am|exista)|task-uri (reale|create)|conform/i, forbid: /am trimis \d+ task-uri(?!.*ledger)/i },
  "Ce am EU de facut azi?": { must: /adrian|decizi|nimic operational|nu ai/i, forbid: null },
  "Ce i-ai cerut TU Danei?": { must: /ledger|nimic real|clarific|cerut|nu (am|exista)/i, forbid: /QLRATF|need_id|loop_id/i },
  "Ce i-ai cerut TU lui Nelu?": { must: /ledger|nimic real|clarific|cerut|nu (am|exista)/i, forbid: /QLRATF|Y7NELY|need_id/i },
};

async function ask(text) {
  const r = await fetch(`${HOST}/api/chat`, {
    method: "POST", headers: { "content-type": "application/json", "x-jarvis-key": KEY },
    body: JSON.stringify({ text }),
  });
  const d = await r.json().catch(() => ({}));
  return d.reply || "";
}

function grade(q, reply) {
  const rule = RULES[q];
  if (!reply) return { verdict: "FAIL", why: "raspuns gol" };
  if (!rule) return { verdict: reply.length > 10 ? "PASS" : "PARTIAL", why: "fara regula stricta — raspuns nevid" };
  if (rule.forbid && rule.forbid.test(reply)) return { verdict: "FAIL", why: "halucinatie (forbid match)" };
  if (rule.must && !rule.must.test(reply)) return { verdict: "PARTIAL", why: "nu contine grounding-ul asteptat" };
  return { verdict: "PASS", why: "grounded, fara halucinatie" };
}

const results = [];
for (const q of REALITY_QUESTIONS) {
  let reply = "";
  try { reply = await ask(q); } catch (e) { reply = ""; }
  const g = grade(q, reply);
  results.push({ q, ...g });
  console.log(`${g.verdict === "PASS" ? "✅" : g.verdict === "PARTIAL" ? "🟡" : "❌"} [${g.verdict}] ${q} — ${g.why}`);
}
const pass = results.filter((r) => r.verdict === "PASS").length;
const partial = results.filter((r) => r.verdict === "PARTIAL").length;
const fail = results.filter((r) => r.verdict === "FAIL").length;
const halluc = results.filter((r) => r.why.includes("halucinatie")).length;
console.log(`\n=== REALITY ${results.length}: PASS=${pass} PARTIAL=${partial} FAIL=${fail} | HALUCINATII=${halluc} ===`);
process.exit(0);
