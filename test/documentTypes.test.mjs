// DATASET / DOCUMENT TYPE REGISTRY (PARTEA IV) — clasificare, validare,
// prospetime, contradictii. Modul PUR — testele nu ating IO.
// node test/documentTypes.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

const {
  DOCUMENT_TYPES,
  classifyDocument,
  validateDataset,
  freshnessCheck,
  contradictionCheck,
} = await import("../src/ceo/evolution/documentTypeRegistry.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// ── Registrul: forma canonica ───────────────────────────────────────────
const EXPECTED_TYPES = [
  "CUSTOMER_RECEIVABLES", "BANK_BALANCE", "BANK_STATEMENT", "SALES_STATUS",
  "CONSTRUCTION_PROGRESS", "SUPPLIER_STATUS", "PAYABLES", "FINANCING_STATUS",
  "CONTRACT_REGISTER", "LEADS_EXPORT", "MARKETING_REPORT", "UNKNOWN_DOCUMENT",
];
ok(EXPECTED_TYPES.every((t) => t in DOCUMENT_TYPES), "registrul contine toate cele 12 tipuri");
ok(Object.values(DOCUMENT_TYPES).every((d) =>
  d.expected_columns && Array.isArray(d.required_fields) && Array.isArray(d.optional_fields) &&
  Array.isArray(d.validation_rules) && typeof d.freshness_policy?.max_age_days === "number" &&
  typeof d.responsible_role === "string" && Array.isArray(d.consumer_modules) &&
  typeof d.verification_method === "string"
), "fiecare tip are toate campurile canonice");
ok(Object.values(DOCUMENT_TYPES).every((d) =>
  ["finance", "operations", "sales", "management"].includes(d.responsible_role)
), "responsible_role e rol GENERIC (fara nume de persoane)");
const cr = DOCUMENT_TYPES.CUSTOMER_RECEIVABLES;
ok(cr.required_fields.length === 2 && cr.required_fields.includes("client") && cr.required_fields.includes("amount"),
  "CUSTOMER_RECEIVABLES: required = client + amount");
ok(cr.freshness_policy.max_age_days === 7 &&
  cr.consumer_modules.includes("receivablesEngine") && cr.consumer_modules.includes("cashIntelligence"),
  "CUSTOMER_RECEIVABLES: freshness 7 zile + consumatori receivablesEngine/cashIntelligence");

// ── Clasificare: situatie clienti cu coloane recognoscibile ─────────────
const schemaCR = { header: { row_index: 0, columns: ["Client", "Suma", "Incasat", "Rest"] } };
const c1 = classifyDocument({ filename: "Situatie clienti incasari.xlsx", schema: schemaCR });
ok(c1.doc_type === "CUSTOMER_RECEIVABLES", "clasificare: 'Situatie clienti incasari.xlsx' → CUSTOMER_RECEIVABLES");
ok(c1.confidence >= 50, `clasificare: confidence >= 50 (a fost ${c1.confidence})`);
ok(typeof c1.why === "string" && c1.why.length > 0, "clasificare: why explicat");

// ── Clasificare: fisier nerecognoscibil → UNKNOWN, fara ghicit ──────────
const c2 = classifyDocument({ filename: "raport_necunoscut.xlsx", schema: { header: { row_index: 0, columns: ["Col A", "Col B"] } } });
ok(c2.doc_type === "UNKNOWN_DOCUMENT", "clasificare: fisier nerecognoscibil → UNKNOWN_DOCUMENT (nu ghicim)");
ok(c2.confidence < 50 && /nesigura|umana/.test(c2.why), "clasificare: confidence sub prag + why onest (mapare umana)");
ok(c2.mapping_quality === "UNKNOWN", "clasificare: UNKNOWN → mapping_quality UNKNOWN");

// ── Clasificare pe filename singur (sold / extras / furnizori / leads) ──
ok(classifyDocument({ filename: "Solduri banci la zi.xlsx" }).doc_type === "BANK_BALANCE", "clasificare filename: sold → BANK_BALANCE");
ok(classifyDocument({ filename: "Extras cont iulie.pdf" }).doc_type === "BANK_STATEMENT", "clasificare filename: extras → BANK_STATEMENT");
ok(classifyDocument({ filename: "Furnizori restanti.xlsx" }).doc_type === "SUPPLIER_STATUS", "clasificare filename: furnizori → SUPPLIER_STATUS");
ok(classifyDocument({ filename: "leads_export_google.csv" }).doc_type === "LEADS_EXPORT", "clasificare filename: leads → LEADS_EXPORT");

// ── mapping_quality pe mapare buna ──────────────────────────────────────
const goodMapping = { mapping: [
  { target: "client", column_index: 0, confidence: 90 },
  { target: "amount", column_index: 1, confidence: 90 },
] };
const c3 = classifyDocument({ filename: "Situatie clienti incasari.xlsx", schema: schemaCR, mapping: goodMapping });
ok(c3.mapping_quality === "GOOD", "clasificare: mapare completa pe required → mapping_quality GOOD");

// ── Validare: inregistrari bune → VALIDATED ─────────────────────────────
const goodRecords = [
  { client: "client-1", amount: 1000, invoice: "F-001", due_date: "2026-07-01", currency: "RON" },
  { client: "client-2", amount: 2500.5, invoice: "F-002", due_date: "15.07.2026", currency: "RON" },
  { client: "client-3", amount: "1.234,56", invoice: "F-003", currency: "RON" },
];
const v1 = validateDataset({ doc_type: "CUSTOMER_RECEIVABLES", records: goodRecords });
ok(v1.valid === true && v1.trust === "VALIDATED", "validare: records bune → VALIDATED");
ok(v1.stats.records === 3 && v1.stats.required_coverage.client === 100, "validare: stats corecte (3 records, client 100%)");

// ── Validare: amount lipsa pe jumatate → UNVALIDATED cu issues ──────────
const halfMissing = [
  { client: "client-1", amount: 1000 },
  { client: "client-2", amount: null },
  { client: "client-3" },
  { client: "client-4", amount: 500 },
];
const v2 = validateDataset({ doc_type: "CUSTOMER_RECEIVABLES", records: halfMissing });
ok(v2.valid === false && v2.trust === "UNVALIDATED", "validare: amount lipsa pe jumatate → UNVALIDATED");
ok(v2.issues.some((i) => i.rule === "required_fields_present" && /amount/.test(i.detail)), "validare: issue onest pe required_fields_present");

// ── Validare: duplicate pe factura detectate ────────────────────────────
const dupInvoices = [
  { client: "client-1", amount: 1000, invoice: "F-001" },
  { client: "client-2", amount: 2000, invoice: "F-001" },
  { client: "client-3", amount: 3000, invoice: "F-002" },
];
const v3 = validateDataset({ doc_type: "CUSTOMER_RECEIVABLES", records: dupInvoices });
ok(v3.trust === "UNVALIDATED" && v3.issues.some((i) => i.rule === "no_duplicate_invoices"), "validare: factura duplicata → UNVALIDATED cu issue");

// ── Validare: suma nenumerica + data neparseabila → issues ──────────────
const badValues = [
  { client: "client-1", amount: "n/a", due_date: "candva" },
  { client: "client-2", amount: 100 },
];
const v4 = validateDataset({ doc_type: "CUSTOMER_RECEIVABLES", records: badValues });
ok(v4.issues.some((i) => i.rule === "amounts_numeric") && v4.issues.some((i) => i.rule === "dates_valid"),
  "validare: valori nenumerice + date neparseabile → issues explicite");

// ── Validare: totaluri nepotrivite → UNVALIDATED ────────────────────────
const v5 = validateDataset({
  doc_type: "CUSTOMER_RECEIVABLES",
  records: [{ client: "a", amount: 100 }, { client: "b", amount: 200 }],
  schema: { totals_row: { index: 3, total: 1000 } },
});
ok(v5.issues.some((i) => i.rule === "totals_match") && v5.trust === "UNVALIDATED", "validare: suma != total (±1%) → UNVALIDATED");

// ── Validare: records cu provenienta (forma extractDataset) ─────────────
const provRecords = [
  { client: { VALUE: "client-1", SOURCE_ROW: 1, CONFIDENCE: 90 }, amount: { VALUE: "1000", SOURCE_ROW: 1, CONFIDENCE: 90 } },
  { client: { VALUE: "client-2", SOURCE_ROW: 2, CONFIDENCE: 90 }, amount: { VALUE: "2000", SOURCE_ROW: 2, CONFIDENCE: 90 } },
];
const v6 = validateDataset({ doc_type: "CUSTOMER_RECEIVABLES", records: provRecords });
ok(v6.valid === true && v6.trust === "VALIDATED", "validare: forma cu provenienta ({VALUE,...}) suportata");

// ── Validare: tip necunoscut / zero records → onest, fara aruncat ───────
const v7 = validateDataset({ doc_type: "UNKNOWN_DOCUMENT", records: goodRecords });
ok(v7.valid === false && v7.trust === "UNVALIDATED", "validare: UNKNOWN_DOCUMENT → UNVALIDATED (fara registru nu validam)");
const v8 = validateDataset({ doc_type: "CUSTOMER_RECEIVABLES", records: [] });
ok(v8.valid === false && v8.issues.some((i) => /missing != zero/.test(i.detail)), "validare: zero records → issue explicit (missing != zero)");

// ── Prospetime: vechi de 30 zile pe politica de 7 → fresh false ─────────
const f1 = freshnessCheck({ doc_type: "CUSTOMER_RECEIVABLES", document_date: "2026-06-22", nowISO: "2026-07-22" });
ok(f1.fresh === false && f1.age_days === 30 && f1.policy_days === 7, "prospetime: 30 zile pe politica 7 → fresh false");
const f2 = freshnessCheck({ doc_type: "CUSTOMER_RECEIVABLES", document_date: "2026-07-20", nowISO: "2026-07-22" });
ok(f2.fresh === true && f2.age_days === 2, "prospetime: 2 zile pe politica 7 → fresh true");

// ── Prospetime: fara AS_OF → UNKNOWN, nu se presupune actual ────────────
const f3 = freshnessCheck({ doc_type: "CUSTOMER_RECEIVABLES", document_date: null, nowISO: "2026-07-22" });
ok(f3.fresh === "UNKNOWN" && f3.age_days === null && /AS_OF necunoscut/.test(f3.note),
  "prospetime: document_date null → UNKNOWN + nota AS_OF necunoscut");

// ── Contradictii: doc 1000 vs existing 2000 → 1 contradictie ────────────
const x1 = contradictionCheck({
  records: [{ client: "client-1", invoice: "F-001", amount: 1000 }],
  existing: [{ client: "client-1", invoice: "F-001", amount: 2000 }],
});
ok(x1.contradictions.length === 1 && x1.contradictions[0].doc_value === 1000 && x1.contradictions[0].existing_value === 2000,
  "contradictii: 1000 vs 2000 → 1 contradictie cu valorile ambelor surse");
ok(/suprascri/.test(x1.contradictions[0].detail), "contradictii: detail spune explicit ca NU se suprascrie");

// ── Contradictii: valori identice → zero ────────────────────────────────
const x2 = contradictionCheck({
  records: [{ client: "client-1", invoice: "F-001", amount: 1000 }],
  existing: [{ client: "client-1", invoice: "F-001", amount: 1000 }],
});
ok(x2.contradictions.length === 0, "contradictii: valori identice → zero contradictii");

// ── Contradictii: diferenta sub 1% → toleranta, zero ────────────────────
const x3 = contradictionCheck({
  records: [{ client: "client-1", amount: 1000 }],
  existing: [{ client: "client-1", amount: 1005 }],
});
ok(x3.contradictions.length === 0, "contradictii: diferenta 0.5% (sub toleranta 1%) → zero");

// ── Contradictii: fara date existente → nota onesta, nu 'totul e ok' ────
const x4 = contradictionCheck({ records: [{ client: "client-1", amount: 1000 }], existing: [] });
ok(x4.contradictions.length === 0 && /nu s-a putut/.test(x4.note), "contradictii: fara date existente → nota onesta (comparatia nu s-a facut)");

// ── Determinism: aceleasi intrari → aceleasi iesiri ─────────────────────
const d1 = JSON.stringify(classifyDocument({ filename: "Situatie clienti incasari.xlsx", schema: schemaCR }));
const d2 = JSON.stringify(classifyDocument({ filename: "Situatie clienti incasari.xlsx", schema: schemaCR }));
ok(d1 === d2, "determinism: clasificarea e identica la apeluri repetate");

console.log(failed ? `\n${failed} teste picate` : "\nToate testele au trecut");
process.exit(failed ? 1 : 0);
