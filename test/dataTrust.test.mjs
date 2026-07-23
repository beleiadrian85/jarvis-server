// DATA TRUST SCORE (Faza 4). node test/dataTrust.test.mjs
import { TRUST_DOMAINS, TRUST_DIMENSIONS, scoreDomain, buildTrustReport, trustForPrompt, qualify } from "../src/ceo/dataTrust.js";

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

ok(TRUST_DOMAINS.includes("CASH") && TRUST_DOMAINS.includes("BANK") && TRUST_DIMENSIONS.length === 5, "domenii + 5 dimensiuni");

// Domeniu complet, proaspat, reconciliat, sursa buna → HIGH.
const good = scoreDomain("TASKS", { present: true, fields_present: 7, fields_expected: 7, age_hours: 1, source: "operational_db", reconciled: true, contradictions: 0 });
ok(good.band === "HIGH" && good.score >= 75, "date complete+proaspete+reconciliate → HIGH");

// Date absente → band NONE, completeness 0, MOTIV declarat (nu scor cosmetic).
const none = scoreDomain("BANK", { present: false });
ok(none.band === "NONE" && none.dims.COMPLETENESS === 0 && none.reasons.some((r) => /nu inseamna valoare 0/.test(r)), "date absente → NONE cu motiv (missing != zero)");

// Cash cunoscut dar nereconciliat cu banca → cel mult MEDIUM, motiv reconciliere.
const cash = scoreDomain("CASH", { present: true, fields_present: 3, fields_expected: 4, age_hours: 5, source: "operational_db", reconciled: false, contradictions: 0 });
ok(cash.band !== "HIGH" && cash.reasons.some((r) => /reconcilia/.test(r)), "cash nereconciliat → sub HIGH, motiv reconciliere");

// Date vechi → freshness scazut coboara banda.
const stale = scoreDomain("SALES", { present: true, fields_present: 4, fields_expected: 4, age_hours: 300, source: "operational_db", reconciled: null, contradictions: 0 });
ok(stale.dims.FRESHNESS <= 45, "date vechi → freshness scazut");

// Contradictii → consistency scazut.
const contra = scoreDomain("RECEIVABLES", { present: true, fields_present: 4, fields_expected: 4, age_hours: 2, source: "operational_db", reconciled: true, contradictions: 2 });
ok(contra.dims.CONSISTENCY <= 40, "contradictii → consistency scazut");

// Raport global + prompt de calificare.
const report = buildTrustReport({
  CASH: { present: true, fields_present: 2, fields_expected: 4, age_hours: 5, source: "manual_entry", reconciled: false },
  TASKS: { present: true, fields_present: 7, fields_expected: 7, age_hours: 1, source: "operational_db", reconciled: true },
  BANK: { present: false },
});
ok(["HIGH", "MEDIUM", "LOW", "NONE"].includes(report.overall_band) && report.domains.length === TRUST_DOMAINS.length, "raport global peste toate domeniile");
ok(/CASH/.test(trustForPrompt(report)), "promptul evidentiaza domeniile sub HIGH");
ok(/incredere/.test(qualify("CASH", report)), "qualify() ofera prefix onest de incredere");
ok(qualify("BANK", report) === "date indisponibile", "qualify() pt. domeniu absent = indisponibil");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — dataTrust`);
process.exit(failed === 0 ? 0 : 1);
