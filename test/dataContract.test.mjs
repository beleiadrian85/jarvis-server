// OPERATIONAL → JARVIS DATA CONTRACT (Faza 35). node test/dataContract.test.mjs
import { DATA_CONTRACT, CONTRACT_DOMAINS, validateContract, checkFields } from "../src/ceo/dataContract.js";

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// Structura completa — fiecare domeniu are toate cheile obligatorii.
const v = validateContract();
ok(v.ok, `contract valid structural${v.ok ? "" : ": " + v.errors.join("; ")}`);

// Domenii cheie prezente.
ok(["obligations", "income_invoices", "tasks", "sales_units", "bank_statement_lines"].every((d) => CONTRACT_DOMAINS.includes(d)), "domeniile consumate cheie sunt in contract");

// Fiecare domeniu declara CONCLUZII FALSE POSIBILE (forteaza gandirea la drift).
ok(Object.values(DATA_CONTRACT).every((s) => s.possible_false_conclusions.length > 0), "fiecare domeniu declara concluzii false posibile");

// Contractul bancar declara explicit capcana rulaje != sold.
ok(/sold/.test(DATA_CONTRACT.bank_statement_lines.possible_false_conclusions.join(" ")), "bancar: capcana 'rulaje != sold' declarata (sold = UNKNOWN)");

// Contract broken → detectat.
const broken = { x: { source: "a", consumer: "b", fields: [], semantics: "s", freshness: "f", transformations: [], assumptions: [], possible_false_conclusions: [] } };
ok(!validateContract(broken).ok, "contract cu fields gol + fara concluzii false → invalid");

// Drift: consumator citeste un camp NEDECLARAT.
const drift = checkFields("tasks", ["id", "status", "secret_field"]);
ok(!drift.ok && drift.undeclared.includes("secret_field"), "camp nedeclarat → drift detectat");
ok(checkFields("tasks", ["id", "status", "assignee"]).ok, "campuri declarate → OK");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — dataContract`);
process.exit(failed === 0 ? 0 : 1);
