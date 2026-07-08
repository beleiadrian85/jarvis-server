// Test pur pentru filtrarea federată Entity 360. node test/entity.test.mjs
import { matchLines } from "../src/engines/entity360.js";

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

const tasks = `15 task-uri:
• [id:7HYZDH] [normal] Contract Horotan — C3 Cl. Șurii Mici — status: in_lucru — responsabil: Nelu
• [id:D1RWFS] [normal] chirie — Altele — status: nou — responsabil: Adrian
• [id:NJCJJQ] [normal] Conducta — C3 Cl. Șurii Mici — status: rezolvat — responsabil: Nelu`;

// Căutare pe furnizor
ok(matchLines(tasks, "Horotan").length === 1, "găsește Horotan (1 task)");
// Căutare pe responsabil (case + diacritice insensibile)
ok(matchLines(tasks, "nelu").length === 2, "găsește Nelu (2 task-uri, case-insensitive)");
// Căutare pe proiect cu diacritice
ok(matchLines(tasks, "surii mici").length === 2, "găsește proiectul fără diacritice (2)");
// Fără potrivire
ok(matchLines(tasks, "Zzz").length === 0, "fără potrivire → 0");
// Nu întoarce liniile antet scurte irelevante
ok(matchLines(tasks, "task-uri").length >= 1, "antetul poate fi găsit dacă conține cheia");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"}`);
process.exit(failed === 0 ? 0 : 1);
