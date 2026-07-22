// BUCLA COMPLETA: atasament CSV pe task CEO → ingest → import creante →
// reconciliere → staging JARVIS (zero write Operational). node test/receivablesLoop.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

const { ingestPendingDocuments } = await import("../src/ceo/documentIngestRunner.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// Store injectat (fara DB) + un task CEO cu atasament "Situatie clienti".
const db = { "ceo:nervous:tasks": { t1: { operational_id: "OP1", need_id: "need:receivables", human: { title: "Incarca Situatie Clienti" } } } };
const store = { get: async (k, f) => (k in db ? db[k] : f), set: async (k, v) => { db[k] = v; } };
const csv = "Client;Factura;Suma;Incasat;Rest;Scadenta\nAlfa SRL;F-101;1.234,50;1.000,00;234,50;2026-08-15\nBeta SA;F-102;2.000,00;0,00;2.000,00;2026-07-10\nTOTAL;;3.234,50;1.000,00;2.234,50;";
const attachments = [{
  task_id: "OP1", filename: "situatie.csv", original_name: "Situatie clienti incasari.csv",
  uploaded_by: "u-finance", created_at: "2026-07-22", data: Buffer.from(csv), mime: "text/csv", size: csv.length,
}];

const r = await ingestPendingDocuments({ persist: true, attachments, store, registry: db["ceo:nervous:tasks"], nowISO: "2026-07-22T08:00:00Z" });
ok(r.ran && r.ingested.length === 1, "un document ingestat din atasamentul task-ului CEO");
const d = r.ingested[0];
ok(d.doc_type === "CUSTOMER_RECEIVABLES", `clasificat CUSTOMER_RECEIVABLES (a fost ${d.doc_type})`);
ok(d.records_count === 2, `2 creante extrase, randul TOTAL exclus (a fost ${d.records_count})`);
ok(d.receivables && d.receivables.imported_count === 2, "importatorul de creante a rulat pe document");
ok(["UNVALIDATED", "VALIDATED", "RECONCILED"].includes(d.trust), `trust explicit, nu inventat (${d.trust})`);

// Staging JARVIS populat — zero scriere in Operational.
ok(db["ceo:receivables:staging"] && Object.keys(db["ceo:receivables:staging"]).length === 1, "creantele persistate in staging JARVIS (ceo:receivables:staging)");
const stg = Object.values(db["ceo:receivables:staging"])[0];
ok(stg.receivables.length === 2 && stg.receivables[0].client === "Alfa SRL", "staging contine creantele cu client corect");
ok(stg.receivables.every((x) => x.amountRON != null), "sumele parsate (format RO), missing != zero");

// Idempotent: al doilea ingest al aceluiasi document nu dubleaza.
const r2 = await ingestPendingDocuments({ persist: true, attachments, store, registry: db["ceo:nervous:tasks"], nowISO: "2026-07-22T09:00:00Z" });
ok(r2.ingested.length === 0, "acelasi document nu se ingesteaza de 2x (idempotent)");

// Granita: NIMIC din runner nu scrie in Operational (verificare structurala).
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/ceo/documentIngestRunner.js", import.meta.url), "utf8").replace(/\/\/[^\n]*/g, "");
ok(!/createTask|updateTask|create_task|update_task|INSERT|UPDATE\s|DELETE\s/i.test(src), "runner: zero scriere Operational (doar SELECT + jarvis_state staging)");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — receivablesLoop (ingest→import→staging)`);
process.exit(failed === 0 ? 0 : 1);
