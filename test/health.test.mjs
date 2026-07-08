// Test pur pentru Health Score + parseSales. node test/health.test.mjs
import { computeHealth } from "../src/engines/healthScore.js";
import { parseSales } from "../src/engines/ceoHome.js";

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// parseSales pe textul real de la sales_summary
const salesTxt = `UNITĂȚI BELL RESIDENCE — total 30:
🟢 Disponibile: 20
🟠 Rezervate: 6 (valoare 483.478 €)
✅ Vândute: 4 (valoare 472.896 €)
💰 Avans încasat total: 0 €`;
const s = parseSales(salesTxt);
ok(s.total === 30 && s.disponibil === 20 && s.rezervat === 6 && s.vandut === 4, `parseSales: ${JSON.stringify(s)}`);
ok(s.avansIncasat === 0, "parseSales: avans încasat 0");

// Health cu semnale realiste
const h = computeHealth({
  restante: 0,
  vanzari: s,
  tasks: { blocate: 1, azi: 2, intarziate: 3, ok: 20 },
  soldCunoscut: false,
});
ok(h.score >= 0 && h.score <= 100, `score în [0,100]: ${h.score}`);
ok(h.components.reduce((a, c) => a + c.points, 0) === h.score, "componentele însumează scorul");
ok(h.components.length === 4, "4 componente");
ok(/bun|atenție|critic/.test(h.grade), `grade setat: ${h.grade}`);

// Firmă sănătoasă → scor mare
const hGood = computeHealth({ restante: 0, vanzari: { total: 30, vandut: 20, rezervat: 8, avansIncasat: 100000 }, tasks: { blocate: 0, azi: 0, intarziate: 0, ok: 30 }, soldCunoscut: true, deficit: false });
ok(hGood.score >= 85, `firmă sănătoasă scor înalt: ${hGood.score}`);

// Firmă cu probleme → scor mic
const hBad = computeHealth({ restante: 3, vanzari: { total: 30, vandut: 0, rezervat: 0, avansIncasat: 0 }, tasks: { blocate: 4, azi: 0, intarziate: 5, ok: 1 }, soldCunoscut: true, deficit: true });
ok(hBad.score <= 40, `firmă cu probleme scor mic: ${hBad.score}`);

console.log(`\nExemplu breakdown (realist): ${h.score}/100 ${h.grade}`);
for (const c of h.components) console.log(`  ${c.label}: ${c.points}/${c.max} — ${c.note}`);

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"}`);
process.exit(failed === 0 ? 0 : 1);
