// CLOSEOUT Faza 4 — Morning Brief: cash real, zero placeholder. node test/closeoutPhase4.test.mjs
process.env.ANTHROPIC_API_KEY = "dummy";
process.env.TELEGRAM_BOT_TOKEN = "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID = "1";
import { readFileSync } from "node:fs";
const { formatCashSection } = await import("../src/morning.js");

let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(`${c ? "✅" : "❌"} ${n}. ${m}`); if (!c) failed++; };

// Fara placeholder in cod.
const src = readFileSync(new URL("../src/morning.js", import.meta.url), "utf8");
ok(!/CASH-FLOW \/ CREDITE: —/.test(src) && !/placeholder pana la Faza/.test(src), "placeholder cash ELIMINAT din cod");

// Date lipsa → "Date insuficiente", niciodata cifra inventata.
const none = formatCashSection(null);
ok(/Date insuficiente/.test(none), "cash indisponibil → 'Date insuficiente' (nu 0, nu estimare)");

// Cu date reale → cifre reale.
const cash = { toReceive: { amount: 120000, count: 5, soon: 80000 }, toPay: { amount: 45000, count: 12 }, estimated: { amount: 1500000, count: 1 }, bank_balance: null };
const s = formatCashSection(cash);
ok(/120\.000 lei/.test(s) && /5 facturi/.test(s), "de încasat: cifre reale");
ok(/45\.000 lei/.test(s) && /12/.test(s), "de plătit: cifre reale");
ok(/AȘTEPTĂRI/.test(s), "încasări estimate marcate ca AȘTEPTĂRI (nu bani siguri)");
ok(/Sold bancar: Date insuficiente/.test(s), "sold bancar = Date insuficiente (nu e conectat)");

// Partial: unele surse lipsesc → doar acelea sunt "insuficiente", restul reale.
const partial = formatCashSection({ toReceive: null, toPay: { amount: 30000, count: 3 }, estimated: null, bank_balance: null });
ok(/De încasat.*Date insuficiente/s.test(partial) && /30\.000 lei/.test(partial), "partial: lipsa marcata insuficient, restul real");

console.log(`\n${n} verificari · ${failed === 0 ? "TOATE TRECUTE" : failed + " ESUATE"} — closeout faza 4`);
process.exit(failed === 0 ? 0 : 1);
