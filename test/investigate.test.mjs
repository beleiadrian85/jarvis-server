// INVESTIGATIE MULTI-SURSA (Information Resolver LIVE). node test/investigate.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

import { extractTerms, needsInvestigation, operationalChecker, defaultCheckers, setPersonEmail, getPersonEmails } from "../src/ceo/resolverSources.js";
import { resolve, investigationSummary } from "../src/ceo/infoResolver.js";

let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(`${c ? "✅" : "❌"} ${n}. ${m}`); if (!c) failed++; };
const mkStore = () => { const mem = {}; return { get: async (k, f) => (k in mem ? mem[k] : f), set: async (k, v) => { mem[k] = v; } }; };

// Extractie termeni + detectie investigatie.
ok(extractTerms("avem extrasele de la Dana la zi?").includes("extrasele"), "extractTerms scoate termenii relevanti (fara stopwords)");
ok(needsInvestigation("avem extrasele la zi?") && needsInvestigation("ce mi-a raspuns clientul?") && needsInvestigation("verifica daca am primit contractul"), "detecteaza intrebarile de investigatie");
ok(!needsInvestigation("cat e ora?"), "intrebare simpla != investigatie");

// Mapare persoana → email.
{ const store = mkStore();
  await setPersonEmail("Dana", "dana@profi.ro", { store });
  const m = await getPersonEmails({ store });
  ok(m.dana === "dana@profi.ro", "mapare persoana→email salvata"); }

// Resolver cu checkere injectate (Operational + Email) → gasit ≠ confirmat.
{ const inv = await resolve({ question: "avem extrasele la zi?", intent: "VERIFY", evidence_requirements: ["coverage_end_date"], checkers: {
    operational: async () => [{ field: "bank_statement", claim: "extras", value: "extras_iulie.pdf", observed_at: "2026-07-06", evidence_class: "OBSERVED_IN_OPERATIONAL" }],
    email: async () => [{ field: "email", claim: "Extrase iulie", value: "Dana", observed_at: "2026-07-25", evidence_class: "FOUND_IN_EMAIL" }],
  } });
  ok(inv.sources_checked.includes("operational") && inv.sources_checked.includes("email"), "investigheaza Operational + Email");
  ok(inv.evidence.length === 2, "aduna dovezi din ambele surse");
  ok(inv.unresolved_unknowns.includes("coverage_end_date"), "dovada ceruta lipsa → unknown (nu declara complet)");
  ok(inv.conclusion === "FOUND_PARTIAL", "gasit partial ≠ confirmat");
  ok(/Am verificat.*operational.*email/i.test(investigationSummary(inv).replace(/,/g," ")), "rezumatul listeaza sursele verificate"); }

// Contradictie intre surse.
{ const inv = await resolve({ question: "e platita factura?", checkers: {
    operational: async () => [{ field: "x", claim: "plata", value: "neplatita", evidence_class: "OBSERVED_IN_OPERATIONAL" }],
    email: async () => [{ field: "x", claim: "plata", value: "platita", evidence_class: "FOUND_IN_EMAIL" }],
  } });
  ok(inv.contradictions.length >= 1 && inv.conclusion === "CONTRADICTION", "surse contradictorii → CONTRADICTION (nu alege una arbitrar)"); }

// operationalChecker e read-only (nu importa scriere).
{ const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/ceo/resolverSources.js", import.meta.url), "utf8");
  ok(!/operationalWrite|taskflow|approvalGate|create_task|update_task/.test(src), "resolverSources NU importa/apeleaza scrieri (read-only pe Operational)");
  ok(/searchEmail/.test(src) && !/createEmailDraft|drafts\.send|messages\.send/.test(src), "email = DOAR searchEmail (read-only, fara trimitere/draft)"); }

// defaultCheckers acopera sursele planificate.
{ const c = defaultCheckers({});
  ok(typeof c.operational === "function" && typeof c.email === "function" && typeof c.official_primary === "function", "defaultCheckers: operational + email + web"); }

console.log(`\n${n} verificari · ${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — investigate`);
process.exit(failed === 0 ? 0 : 1);
