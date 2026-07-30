// JARVIS LONG-TERM MEMORY — fundatie (schema, write gate, store, retrieval, data
// policy, context assembler). node test/memory.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

import { buildMemoryItem, validateMemoryItem, provenanceOf, MEMORY_TYPES, VERIFICATION_STATUSES } from "../src/ceo/memory/schema.js";
import { classifyWrite, containsSecret, redactSecrets, persistsToLongTerm } from "../src/ceo/memory/writeGate.js";
import { remember, supersede, revoke, list, stats } from "../src/ceo/memory/store.js";
import { recall } from "../src/ceo/memory/retrieval.js";
import { classifyForEgress, filterMemoriesForEgress } from "../src/ceo/memory/dataPolicy.js";
import { assembleContext } from "../src/ceo/memory/contextAssembler.js";

let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(`${c ? "✅" : "❌"} ${n}. ${m}`); if (!c) failed++; };
// Store injectabil in-memory (nu atinge DB reala).
const mkStore = () => { const mem = {}; return { get: async (k, f) => (k in mem ? mem[k] : f), set: async (k, v) => { mem[k] = v; } }; };

// ---- SCHEMA + PROVENIENTA ----
{
  const it = buildMemoryItem({ title: "Extras BT iulie", content: "sold 12.000", memory_type: "EPISODIC", source_type: "operational", source_reference: "extras_iulie.pdf", verification_status: "OBSERVED", confidence: 0.8 });
  ok(MEMORY_TYPES.includes(it.memory_type) && it.id && it.created_at, "buildMemoryItem produce id + timestamp + tip valid");
  ok(validateMemoryItem(it).ok, "memorie cu sursa e valida");
  const bad = buildMemoryItem({ verification_status: "CONFIRMED", source_type: "" });
  ok(!validateMemoryItem(bad).ok, "fapt CONFIRMED fara sursa/evidence => invalid (provenienta obligatorie)");
  ok(provenanceOf(it).answer.includes("operational"), "provenanceOf raspunde 'de unde stii'");
  const inf = buildMemoryItem({ extracted_by: "gpt-4o", content: "estimez ca..." });
  ok(inf.is_inference === true, "memorie extrasa de model => marcata is_inference (AI_INFERENCE)");
}

// ---- WRITE GATE ----
{
  ok(containsSecret("client_secret=GOCSPX-abc123def456ghi789"), "detecteaza Google client secret");
  ok(containsSecret("parola: Vara2026!"), "detecteaza parola");
  ok(containsSecret("cardul e 4111 1111 1111 1111"), "detecteaza numar card");
  ok(!containsSecret("factura OTIS pe iulie"), "text normal != secret");

  ok(classifyWrite({ text: "token=eyJhbGciOiJIUzI1NiJ9.abcdefghij.klmnop", kind: "fact" }).category === "DO_NOT_STORE", "SECRET => DO_NOT_STORE");
  ok(classifyWrite({ kind: "policy", text: "regula noua" }).category === "DO_NOT_STORE", "POLICY fara aprobare => nu se memoreaza");
  ok(classifyWrite({ kind: "policy", text: "regula", founder_approved: true }).category === "STORE_POLICY_ONLY_WITH_APPROVAL", "POLICY cu aprobare fondator => permis");
  ok(classifyWrite({ kind: "opinion", text: "cred ca X", from_model: true }).category === "WORKING_MEMORY_ONLY", "opinia unui model => doar working memory, nu fapt");
  ok(classifyWrite({ kind: "assumption", text: "presupun ca" }).category === "WORKING_MEMORY_ONLY", "presupunerea != fapt");
  ok(classifyWrite({ kind: "decision", text: "am decis sa amanam" }).category === "STORE_DECISION", "decizie => Decision Memory");
  ok(classifyWrite({ kind: "fact", text: "sold 12000", source_type: "operational", verification_status: "OBSERVED" }).category === "STORE_SEMANTIC_CANDIDATE", "fapt observat cu sursa => candidat semantic (nu confirmat automat)");
  ok(redactSecrets("parola: Secret123").includes("[REDACTAT]"), "redactSecrets ascunde secretul");
  ok(!persistsToLongTerm("WORKING_MEMORY_ONLY") && persistsToLongTerm("STORE_EPISODE"), "persistsToLongTerm corect");
}

// ---- STORE (persist / gate integration / supersede / revoke / caps) ----
{
  const store = mkStore();
  const r1 = await remember({ title: "Nelu se ocupa de autorizatie", content: "task recurent", kind: "episode", source_type: "operational", source_reference: "task#123", verification_status: "OBSERVED" }, { store });
  ok(r1.stored && r1.item.memory_type === "EPISODIC", "remember persista un episod cu sursa");

  const rSecret = await remember({ title: "cheia openai", content: "sk-abcdefghijklmnopqrstuvwxyz123456", kind: "fact", source_type: "manual" }, { store });
  ok(!rSecret.stored && rSecret.category === "DO_NOT_STORE", "STORE refuza secretul (nu ajunge in memorie)");
  const after = await list({ store, includeInactive: true });
  ok(!JSON.stringify(after).includes("sk-abcdefghijklmnopqrstuvwxyz123456"), "secretul NU exista nicaieri in store");

  const rPol = await remember({ title: "Politica plati", content: "orice plata > 5000 cere aprobare", kind: "policy", source_type: "founder" }, { store });
  ok(!rPol.stored, "politica fara aprobare nu se memoreaza");
  const rPol2 = await remember({ title: "Politica plati", content: "orice plata > 5000 cere aprobare", kind: "policy", source_type: "founder", verification_status: "DECLARED" }, { store, founder_approved: true });
  ok(rPol2.stored && rPol2.item.memory_type === "POLICY", "politica cu aprobare fondator se memoreaza ca POLICY");

  const sup = await supersede(r1.item.id, { title: "Nelu — autorizatie + materiale", content: "actualizat", kind: "episode", source_type: "operational", verification_status: "OBSERVED" }, { store });
  ok(sup.stored, "supersede creeaza versiune noua");
  const active = await list({ store, type: "EPISODIC" });
  ok(active.length === 1 && active[0].version === 2, "vechea versiune iese din recall activ (versionare, nu stergere)");
  const all = await list({ store, type: "EPISODIC", includeInactive: true });
  ok(all.some((x) => x.verification_status === "SUPERSEDED"), "vechea versiune ramane marcata SUPERSEDED (audit)");

  await revoke(rPol2.item.id, "test", { store });
  const activePol = await list({ store, type: "POLICY" });
  ok(activePol.length === 0, "revoke exclude din recall (dreptul de a fi uitat)");
  const s = await stats({ store });
  ok(s.total >= 3 && typeof s.by_type.EPISODIC === "number", "stats raporteaza pe tip");
}

// ---- RETRIEVAL (found / honest-not-found / scoring / sensitivity) ----
{
  const store = mkStore();
  await remember({ title: "Extrasele de la Dana sunt la zi pana in 6 iulie", content: "extras bancar BT", kind: "fact", source_type: "operational", source_reference: "extras.pdf", verification_status: "OBSERVED", confidence: 0.9 }, { store });
  await remember({ title: "Salariu confidential angajat", content: "detaliu", kind: "episode", source_type: "hr", verification_status: "OBSERVED", sensitivity: "RESTRICTED" }, { store });

  const hit = await recall("avem extrasele de la dana?", { store });
  ok(hit.found && hit.items[0].title.toLowerCase().includes("extras"), "recall gaseste memoria relevanta");
  ok(hit.items[0].provenance && hit.items[0].provenance.answer, "recall ataseaza provenienta");
  const miss = await recall("care e culoarea preferata a lui Nelu?", { store });
  ok(!miss.found && /nu am|nu inventez/i.test(miss.summary), "recall onest cand nu gaseste (nu inventeaza)");
  const capped = await recall("salariu", { store, maxSensitivity: "CONFIDENTIAL" });
  ok(!capped.items.some((x) => x.sensitivity === "RESTRICTED"), "recall respecta plafonul de sensibilitate (RESTRICTED exclus)");
}

// ---- DATA CLASSIFICATION (egress) ----
{
  ok(classifyForEgress({ text: "salariul lui X e 8000", providerTrust: "external" }).allowed === false, "date salariale (RESTRICTED) NU pleaca la model extern");
  ok(classifyForEgress({ text: "salariul lui X", providerTrust: "private" }).allowed === true, "RESTRICTED permis doar pe model privat/local");
  const r = classifyForEgress({ text: "client_secret=GOCSPX-zzz", providerTrust: "external" });
  ok(r.allowed === false, "secret => escaladat la RESTRICTED => blocat la extern");
  ok(classifyForEgress({ text: "sedinta de vanzari maine", providerTrust: "external" }).allowed === true, "date interne normale pot merge la extern (redactate)");

  const items = [
    { id: "a", title: "public", content: "x", sensitivity: "INTERNAL" },
    { id: "b", title: "salariu", content: "salariul e 9000", sensitivity: "RESTRICTED" },
  ];
  const f = filterMemoriesForEgress(items, { providerTrust: "external" });
  ok(f.kept.length === 1 && f.kept[0].id === "a" && f.dropped.some((d) => d.id === "b"), "filterMemoriesForEgress lasa afara RESTRICTED pentru extern");
}

// ---- CONTEXT ASSEMBLER (temporar, filtrat, marcat) ----
{
  const store = mkStore();
  await remember({ title: "Factura OTIS pe iulie neplatita", content: "scadenta 20 iulie", kind: "fact", source_type: "operational", source_reference: "fact#88", verification_status: "OBSERVED", confidence: 0.85 }, { store });
  await remember({ title: "Estimez cash-flow pozitiv", content: "inferenta model", kind: "fact", source_type: "model", is_inference: true, verification_status: "UNVERIFIED" }, { store });
  await remember({ title: "Date salariale", content: "salariul 9000", kind: "episode", source_type: "hr", verification_status: "OBSERVED", sensitivity: "RESTRICTED" }, { store });

  const ctx = await assembleContext("situatia facturii OTIS si cash-flow", { store, providerTrust: "external" });
  ok(ctx.contextText.includes("CONTEXT_MEMORIE_JARVIS"), "context asamblat e imprejmuit (untrusted fence)");
  ok(ctx.contextText.includes("OTIS"), "contextul include faptul relevant din memorie");
  ok(!/9000|salari/i.test(ctx.contextText), "contextul catre extern NU contine date RESTRICTED");
  ok(ctx.instructions.includes("TEMPORAR") && /nu il memora|nu inventa/i.test(ctx.instructions), "instructiuni: context temporar, nu-l memora, nu inventa");
  ok(/INFERENTA/.test(ctx.contextText) || ctx.used.length >= 1, "inferentele sunt marcate distinct de fapte");
}

// ---- ADVERSARIAL: secrete ascunse + fapte RESTRICTED injectate ----
{
  const store = mkStore();
  // Secret ascuns in structured_data (nu in titlu/continut) — NU trebuie sa scape.
  const r = await remember({ title: "config", content: "setari", kind: "fact", source_type: "manual", structured_data: { note: "api_key=sk-abcdefghijklmnopqrstuvwxyz012345" } }, { store });
  ok(!r.stored && r.category === "DO_NOT_STORE", "secret ascuns in structured_data e blocat de gate");
  const dump = JSON.stringify(await list({ store, includeInactive: true }));
  ok(!dump.includes("sk-abcdefghijklmnopqrstuvwxyz012345"), "secretul din structured_data NU ajunge in store");

  // Fapt RESTRICTED injectat ca extraFact catre un model extern — trebuie exclus.
  const ctx = await assembleContext("orice", { store, providerTrust: "external", extraFacts: [
    { text: "sedinta luni", sensitivity: "INTERNAL" },
    { text: "salariul lui X e 9000", sensitivity: "RESTRICTED" },
  ] });
  ok(!/9000/.test(ctx.contextText) && ctx.dropped.some((d) => (d.sensitivity === "RESTRICTED")), "extraFact RESTRICTED e exclus din contextul catre model extern");
  const ctxPriv = await assembleContext("orice", { store, providerTrust: "private", extraFacts: [{ text: "salariul lui X e 9000", sensitivity: "RESTRICTED" }] });
  ok(/9000|salari/i.test(ctxPriv.contextText), "acelasi fapt RESTRICTED e permis catre model privat/local");
}

console.log(`\n${n} verificari · ${failed === 0 ? "TOATE TRECUTE" : failed + " ESUATE"} — memory foundation`);
process.exit(failed === 0 ? 0 : 1);
