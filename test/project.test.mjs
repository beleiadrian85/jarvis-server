// Test pur pentru parserele Project Intelligence + parseTaskLines(project).
import { parseProjectCosts, parseProductionCostPerMp } from "../src/engines/projectIntel.js";
import { parseTaskLines } from "../src/taskparse.js";

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };
const near = (a, b, e = 0.5) => Math.abs(a - b) <= e;

const costsTxt = `Costuri pe proiecte:
• C3 Cl. Șurii Mici: TOTAL 494.962,44 lei (materiale: 1.268,99 · producție: 493.693,45 · taskuri: 0)
• Altele: TOTAL 0 lei (materiale: 0 · producție: 0 · taskuri: 0)`;
const c = parseProjectCosts(costsTxt);
ok(c.length === 2, `2 proiecte parsate (${c.length})`);
const c3 = c.find((x) => /C3/.test(x.project));
ok(c3 && near(c3.total, 494962.44), `C3 total 494.962,44 (${c3?.total})`);
ok(c3 && near(c3.productie, 493693.45) && near(c3.materiale, 1268.99), "C3 producție + materiale corecte");

const prodTxt = "Producție C3 — total: 493.693,45 lei · suprafață: 1860 mp · cost/mp: 265,43 lei";
ok(near(parseProductionCostPerMp(prodTxt), 265.43), `cost/mp 265,43 (${parseProductionCostPerMp(prodTxt)})`);

// parseTaskLines extrage acum proiectul
const taskLine = "• [id:NJCJJQ] [normal] Conducta — C3 Cl. Șurii Mici — status: rezolvat — termen: 2026-06-29 — responsabil: Nelu — creat de: Adrian";
const t = parseTaskLines(taskLine)[0];
ok(t && t.project === "C3 Cl. Șurii Mici", `proiect extras din task: "${t?.project}"`);
ok(t && t.status === "rezolvat" && t.assignee === "Nelu", "celelalte câmpuri intacte");

const altLine = "• [id:D1RWFS] [normal] chirie — Altele — status: nou — termen: 2026-07-08 — responsabil: Adrian — creat de: Adrian";
ok(parseTaskLines(altLine)[0].project === "Altele", "proiect Altele extras corect");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"}`);
process.exit(failed === 0 ? 0 : 1);
