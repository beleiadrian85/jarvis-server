// FOUNDER DECISION MODEL (Faza 9). node test/founderModel.test.mjs
import { buildFounderModel, founderModelForPrompt, asksFounderOpinion } from "../src/ceo/founderModel.js";

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// Fara decizii → nu presupune un tipar (anti-halucinatie).
const empty = buildFounderModel([]);
ok(empty.hypotheses.length === 0 && empty.decisions_seen === 0, "fara decizii → zero ipoteze (nu inventeaza tipar)");
ok(/insuficiente decizii/i.test(founderModelForPrompt(empty)), "prompt gol declara onest lipsa de date");

// Decizii care arata apetit de risc + credit → ipoteze invatate.
const mem = [
  { decision_id: "d1", context: "extindere Mârșa", adrian_decision: "hai sa incercam, bagam capital si luam credit", why: "oportunitate mare" },
  { decision_id: "d2", context: "achizitie teren", adrian_decision: "mai bagam, finantam cu linia de credit", why: "indraznet dar merita" },
  { decision_id: "d3", context: "unitate Bell", adrian_decision: "pastram, asteptam pret mai bun", why: "nu vindem acum" },
];
const model = buildFounderModel(mem);
ok(model.decisions_seen === 3 && model.hypotheses.length > 0, "invata ipoteze din decizii reale");
const risk = model.hypotheses.find((h) => h.trait === "risk_tolerance");
ok(risk && risk.leaning === "HIGH", "detecteaza toleranta la risc HIGH din dovezi");
const debt = model.hypotheses.find((h) => h.trait === "debt_appetite");
ok(debt && debt.leaning === "HIGH", "detecteaza apetit pentru credit");
ok(model.hypotheses.every((h) => h.confidence <= 75), "confidence plafonata (nu devine dogma / yes-man)");
ok(model.hypotheses.every((h) => Array.isArray(h.evidence) && Array.isArray(h.counterexamples)), "fiecare ipoteza are evidence + counterexamples");

// Prompt cu garda anti-yes-man.
const p = founderModelForPrompt(model);
ok(/yes-man/i.test(p) && /contrazi/i.test(p), "prompt include regula KNOW ADRIAN, DON'T BE A YES-MAN");

// Detectie intrebare de opinie.
ok(asksFounderOpinion("tu ce ai face in locul meu?") && asksFounderOpinion("care e parerea ta?"), "detecteaza 'tu ce ai face?'");
ok(!asksFounderOpinion("cate task-uri are Nelu?"), "intrebare factuala != cerere de opinie");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — founderModel`);
process.exit(failed === 0 ? 0 : 1);
