// Test pur (fără rețea) pentru Financial Brain: parsare obligații reale +
// matematica forecast-ului. Rulează: node test/cashForecast.test.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseObligations, parseAmount, EUR_RON } from "../src/connectors/financial.js";
import { buildForecast } from "../src/engines/cashForecast.js";
import { formatForecast } from "../src/engines/financialBrain.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(path.join(__dirname, "fixtures", "obligations.txt"), "utf8");

let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failed++; };
const near = (a, b, eps = 1) => Math.abs(a - b) <= eps;

// 1) Parsare
const obs = parseObligations(raw);
ok(obs.length === 98, `parsate 98 obligații (got ${obs.length})`);
ok(obs.every((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.dueDate)), "toate au dată validă");
ok(obs.every((o) => o.amountRON > 0), "toate au sumă RON > 0");

// 2) Conversie EUR (BCR Leasing 2.100 EUR → RON)
const eurItem = obs.find((o) => o.currency === "EUR");
ok(eurItem && near(eurItem.amountRON, 2100 * EUR_RON), `EUR convertit la RON (2100€ → ${eurItem?.amountRON})`);

// 3) parseAmount unitar
ok(near(parseAmount("416.000 RON").amountRON, 416000), "parseAmount 416.000 RON = 416000");
ok(near(parseAmount("2.100 EUR").amountRON, 2100 * EUR_RON), "parseAmount 2.100 EUR convertit");

// 4) Forecast la o dată fixă de referință (deterministă)
const f = buildForecast(obs, { asOf: "2026-07-08" });
ok(f.count === 98, `toate 98 sunt în viitor față de 2026-07-08 (got ${f.count})`);

// Orizonturile trebuie să fie monoton crescătoare
const h = f.horizonTotals;
ok(h[7] <= h[30] && h[30] <= h[60] && h[60] <= h[90] && h[90] <= h[180] && h[180] <= h[365],
   `orizonturi monoton crescătoare (7:${h[7]} ≤ 30:${h[30]} ≤ 90:${h[90]} ≤ 365:${h[365]})`);

// Suma lunară trebuie să egaleze totalul viitor
const monthlySum = Object.values(f.monthly).reduce((a, b) => a + b, 0);
ok(near(monthlySum, f.totalFuture, 5), `Σ lunar (${monthlySum}) = total viitor (${f.totalFuture})`);

// 30 zile (până 2026-08-07) trebuie să includă rata IMM 416.000 din 30 iul
ok(h[30] >= 416000, `necesar 30 zile include rata IMM (${h[30]} lei)`);

// Cea mai mare plată în 90 zile = rata IMM 416.000
ok(f.top90[0] && f.top90[0].amountRON === 416000, `top plată 90z = rata IMM 416.000 (got ${f.top90[0]?.amountRON})`);

// 5) Deficit: cu sold de 100.000 lei trebuie să apară deficit; fără sold → null
const fDef = buildForecast(obs, { asOf: "2026-07-08", openingBalance: 100000 });
ok(fDef.firstDeficit && fDef.firstDeficit.date, `deficit detectat cu sold 100k (${fDef.firstDeficit?.date})`);
ok(f.firstDeficit === null, "fără sold → firstDeficit null");

// 6) Formatare — conține secțiuni cheie și [VOCE]
const rep = formatForecast(f);
ok(rep.includes("CASH FORECAST") && rep.includes("Pe orizonturi"), "raport conține anteturile");
ok(/\[VOCE\]/.test(rep), "raport conține [VOCE]");

console.log("\n— exemplu raport —\n");
console.log(formatForecast(fDef, { openingBalanceKnown: true }));

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"}`);
process.exit(failed === 0 ? 0 : 1);
