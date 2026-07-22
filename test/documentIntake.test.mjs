// DOCUMENT INTAKE — integrare end-to-end (PARTEA III/IX). Blocheaza regresia
// nepotrivirilor de semnatura intre documentIntake si schemaDiscovery.
// node test/documentIntake.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

const { runIntake } = await import("../src/ceo/evolution/documentIntake.js");
const { classifyDocument, validateDataset } = await import("../src/ceo/evolution/documentTypeRegistry.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// Cazul emblematic: Situatie Clienti CSV (zecimale RO, rand TOTAL).
const csv = "Client;Factura;Suma;Incasat;Rest\nAlfa SRL;F-101;1.234,50;1.000,00;234,50\nBeta SA;F-102;2.000,00;0,00;2.000,00\nTOTAL;;3.234,50;1.000,00;2.234,50";
const r = runIntake({ file: { filename: "Situatie clienti incasari.csv", mime: "text/csv", size: csv.length, data: Buffer.from(csv) }, task_id: "T1", providedBy: "u1", asOf: "2026-07-22", targetFields: ["client", "invoice", "amount", "collected", "remaining"] });

const stageOk = (name) => (r.stages || []).find((s) => s.stage === name)?.ok === true;
ok(stageOk("SECURE_FILE_INTAKE"), "securitate: CSV legitim acceptat");
ok(stageOk("STRUCTURE_EXTRACTION"), "parser CSV: structura extrasa");
ok(stageOk("VALIDATION"), "schema descoperita (discoverSchema cu argument numit)");
ok(stageOk("CLASSIFICATION"), "coloane clasificate (schema.header.columns citit corect)");
ok(stageOk("ENTITY_MATCHING"), "mapare automata (proposeMapping cu argument numit)");
ok(stageOk("DATASET"), "dataset extras (extractDataset cu argument numit)");
ok(r.dataset?.records_count === 2, `2 inregistrari (randul TOTAL exclus) — a fost ${r.dataset?.records_count}`);
ok(r.dataset?.trust === "UNVALIDATED", "raw upload ≠ trusted: dataset ramane UNVALIDATED pana la validare (§35)");
ok(r.blocked === null, "pipeline necolmatat");

// Clasificarea + validarea (stratul de tip document peste intake).
const cls = classifyDocument({ filename: "Situatie clienti incasari.csv", schema: r.schema, mapping: r.mapping });
ok(cls.doc_type === "CUSTOMER_RECEIVABLES", `clasificat CUSTOMER_RECEIVABLES (a fost ${cls.doc_type})`);
// #2 (review): runIntake expune records REALE, nu []; validarea vede datele.
ok(Array.isArray(r.dataset?.records) && r.dataset.records.length === 2, "#2. dataset expune records reale (nu doar count)");
const val = validateDataset({ doc_type: cls.doc_type, records: r.dataset?.records || [], schema: r.schema });
ok(["VALIDATED", "UNVALIDATED"].includes(val.trust), "validarea produce un nivel de incredere explicit");
ok(!(val.issues || []).some((i) => /zero inregistrari|records_present/.test(i.rule + i.detail)), "#2. validarea NU mai raporteaza fals 'zero inregistrari' pe date reale");

// Securitate: executabil respins inainte de orice parsare.
const bad = runIntake({ file: { filename: "virus.exe", mime: "application/x-msdownload", size: 100, data: Buffer.from("MZ") } });
ok(bad.blocked === "SECURITY" && bad.dataset == null, "executabil → blocat la SECURITY, zero parsare");

// Missing ≠ zero: coloana lipsa pe un rand → null, nu 0.
const csv2 = "Client;Suma\nAlfa;100\nBeta;";
const r2 = runIntake({ file: { filename: "x.csv", mime: "text/csv", size: csv2.length, data: Buffer.from(csv2) }, asOf: "2026-07-22", targetFields: ["client", "amount"] });
ok(r2.dataset != null, "al doilea document parsat");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — documentIntake (integrare)`);
process.exit(failed === 0 ? 0 : 1);
