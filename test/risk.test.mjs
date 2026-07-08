// Test pur pentru Risk Engine. node test/risk.test.mjs
import { assessRisks, formatRisks } from "../src/engines/riskEngine.js";

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// Firmă cu probleme: deficit + blocate + rezervări fără avans
const forecast = {
  firstDeficit: { date: "2026-07-20", balanceAfter: -5000, trigger: "rata IMM" },
  top90: [{ title: "rata IMM", amountRON: 416000, dueDate: "2026-07-30" }],
  monthly: { "2026-07": 628000, "2026-08": 646000 },
};
const risks = assessRisks({
  forecast,
  cash: { restante: 1, scadente3: 1 },
  tasks: { blocate: 2, azi: 0, intarziate: 3, ok: 10 },
  sales: { rezervat: 6, avansIncasat: 0 },
  openingBalance: 100000,
});
ok(risks.length >= 4, `mai multe riscuri detectate (${risks.length})`);
ok(risks[0].level === "🔴", "cel mai sever e 🔴 (sortare corectă)");
ok(risks.every((r) => r.recomandare && r.impact && r.probabilitate), "fiecare risc are impact+probabilitate+recomandare");
ok(risks.some((r) => r.key === "deficit_lichiditate"), "detectează deficit lichiditate");
ok(risks.some((r) => r.key === "rezervari_fara_avans"), "detectează rezervări fără avans");

// Firmă curată: fără riscuri majore
const clean = assessRisks({
  forecast: { firstDeficit: null, top90: [{ title: "x", amountRON: 5000, dueDate: "2026-08-01" }], monthly: { "2026-07": 100, "2026-08": 100 } },
  cash: { restante: 0, scadente3: 0 },
  tasks: { blocate: 0, azi: 0, intarziate: 0, ok: 5 },
  sales: { rezervat: 0, avansIncasat: 50000 },
});
ok(clean.length === 0, `firmă curată → fără riscuri (${clean.length})`);
ok(formatRisks(clean).includes("Fără riscuri"), "formatRisks gol → mesaj pozitiv");

console.log("\n— exemplu raport riscuri —\n");
console.log(formatRisks(risks));

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"}`);
process.exit(failed === 0 ? 0 : 1);
