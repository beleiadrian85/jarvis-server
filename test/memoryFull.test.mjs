// JARVIS MEMORY + MULTI-MODEL — matrice completa (§25): graph, corectii, restore, export,
// dedup, tenant, conversatie, import, keyStore, router/fallback, cost budgets, evaluation,
// contradictii, context sections, connect. node test/memoryFull.test.mjs
// NB: env setat INAINTE de importuri (import dinamic) — config.js citeste flag-urile la
// evaluare, iar `import` static ar fi hoisted inaintea acestor asignari.
process.env.ANTHROPIC_API_KEY = "dummy";
process.env.TELEGRAM_BOT_TOKEN = "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID = "1";
process.env.APP_SECRET = "7429123";
process.env.JARVIS_MULTI_MODEL_ENABLED = "on";
process.env.JARVIS_OPENAI_PROVIDER_ENABLED = "on";
process.env.JARVIS_PRIVATE_MODEL_ENABLED = "on";
process.env.JARVIS_DATA_ROUTING_ENABLED = "on";
process.env.JARVIS_MODEL_EVALUATION_ENABLED = "on";
process.env.JARVIS_MEMORY_IMPORT_ENABLED = "on";
process.env.JARVIS_CONVERSATION_MEMORY_ENABLED = "on";
process.env.OPENAI_API_KEY = "dummy-openai";
process.env.PRIVATE_MODEL_URL = "http://127.0.0.1:59999";

const { remember, correct, exportAll, list } = await import("../src/ceo/memory/store.js");
const { addRelation, neighbors, path, graphStats } = await import("../src/ceo/memory/graph.js");
const { detectContradictions } = await import("../src/ceo/memory/contradiction.js");
const { assembleContext } = await import("../src/ceo/memory/contextAssembler.js");
const { summarizeConversation } = await import("../src/ceo/memory/conversation.js");
const { previewImport, confirmImport } = await import("../src/ceo/memory/import.js");
const { setProviderKey, getProviderKey, keyMeta, deleteProviderKey, hasKeyCached } = await import("../src/ceo/models/keyStore.js");
const { route } = await import("../src/ceo/models/router.js");
const { enabledProviders, providerAllowsClass, capabilityProfile } = await import("../src/ceo/models/registry.js");
const { recordSpend, spentThisMonth, alertStatus } = await import("../src/ceo/models/costGuard.js");
const { recordEvaluation, perfScores } = await import("../src/ceo/models/evaluation.js");
const { needsReview } = await import("../src/ceo/models/riskTrigger.js");
const { consultModel } = await import("../src/ceo/models/gateway.js");

let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(`${c ? "✅" : "❌"} ${n}. ${m}`); if (!c) failed++; };
const mkStore = () => { const mem = {}; return { get: async (k, f) => (k in mem ? mem[k] : f), set: async (k, v) => { mem[k] = v; } }; };

// ── STORE: corectare / restore / export / tenant ──
{
  const store = mkStore();
  const a = await remember({ title: "Sold BT", content: "10000", kind: "fact", source_type: "operational", verification_status: "OBSERVED" }, { store });
  const c = await correct(a.item.id, { title: "Sold BT", content: "12000", kind: "fact", source_type: "operational", verification_status: "OBSERVED" }, { store, reason: "cifra actualizata" });
  ok(c.stored && c.item.version === 2, "correct produce versiune noua (v2)");
  const active = await list({ store, type: "SEMANTIC" });
  ok(active.length === 1 && active[0].content === "12000", "corectia inlocuieste in recall (versiunea greșită iese)");
  await remember({ title: "X", content: "tenant1", kind: "fact", source_type: "op", verification_status: "OBSERVED", tenant_id: "t1" }, { store });
  const onlyT1 = await list({ store, tenant_id: "t1" });
  ok(onlyT1.every((x) => x.tenant_id === "t1"), "izolare pe tenant (list tenant_id)");
  ok((await exportAll({ store })).count >= 3, "export complet (cu istoric)");
}

// ── GRAPH ──
{
  const store = mkStore();
  await addRelation({ subject: "Dana", predicate: "OWNS", object: "finance", source_type: "founder", verification_status: "DECLARED" }, { store });
  await addRelation({ subject: "finance", predicate: "PART_OF", object: "Profi", source_type: "founder" }, { store });
  const nb = await neighbors("Dana", { store });
  ok(nb.length === 1 && nb[0].other === "finance", "graph: neighbors");
  const p = await path("Dana", "Profi", { store });
  ok(p.found && p.hops === 2, "graph: path multi-hop");
  ok((await graphStats({ store })).relations === 2, "graph: stats");
}

// ── CONTRADICTII ──
{
  const items = [
    { id: "1", title: "Factura A", content: "platita", entities: ["FacturaA"], verification_status: "OBSERVED" },
    { id: "2", title: "Factura A", content: "neplatita", entities: ["FacturaA"], verification_status: "OBSERVED" },
  ];
  const c = detectContradictions(items);
  ok(c.length >= 1 && /plat/.test(c[0].conflict), "detecteaza contradictie platit/neplatit pe aceeasi entitate");
  ok(detectContradictions([items[0]]).length === 0, "fara contradictie cand e o singura memorie");
}

// ── CONTEXT ASSEMBLER: sectiuni ──
{
  const store = mkStore();
  await remember({ title: "Contract semnat cu clientul", content: "valabil", kind: "fact", source_type: "operational", verification_status: "CONFIRMED", confidence: 0.9, source_reference: "c#1" }, { store });
  const ctx = await assembleContext("stare contract client", { store, providerTrust: "external", operationalState: [{ text: "in Operational: contract activ" }] });
  ok(ctx.sections && Array.isArray(ctx.sections.VERIFIED_FACTS), "context are sectiuni structurate");
  ok(ctx.sections.OPERATIONAL_STATE.length === 1, "sectiune STARE OPERATIONALA (sursa oficiala) separata");
  ok(/FAPTE VERIFICATE/.test(ctx.contextText), "textul contextului grupeaza pe sectiuni");
}

// ── CONVERSATIE ──
{
  const s = summarizeConversation([{ role: "user", content: "Am decis sa semnam contractul" }, { role: "user", content: "Nelu se ocupa de autorizatie" }]);
  ok(s.decisions.length === 1 && s.message_count === 2, "conversatie: extrage decizii, nu fiecare mesaj");
  ok(Array.isArray(s.do_not_store), "conversatie: lista do_not_store exista");
}

// ── IMPORT selectiv ──
{
  const store = mkStore();
  const prev = await previewImport([
    { title: "Client Y", content: "prefera email" },
    { title: "cheie", content: "api_key=sk-abcdefghijklmnopqrstuv" },
    { title: "Client Y", content: "prefera email" },
  ], { source: "chatgpt", store });
  ok(prev.provenance === "IMPORTED_FROM_CHATGPT", "import: provenienta marcata");
  ok(prev.candidates[1].has_sensitive && !prev.candidates[1].importable, "import: item cu secret exclus");
  ok(prev.candidates[2].duplicate === true, "import: duplicat detectat (si in cadrul lotului)");
  const conf = await confirmImport([{ title: "Nota", content: "detaliu" }], { source: "chatgpt", store });
  ok(conf.ok && conf.imported === 1, "import: confirmare persista doar importabile");
}

// ── KEY STORE (criptare) ──
{
  const store = mkStore();
  const set = await setProviderKey("openai", "sk-secretkey-abcdef123456", { store });
  ok(set.ok && set.stored_encrypted, "keyStore: cheie stocata criptat");
  ok(!JSON.stringify(store).includes("sk-secretkey-abcdef123456"), "keyStore: fara plaintext in store");
  ok((await getProviderKey("openai", { store })) === "sk-secretkey-abcdef123456", "keyStore: roundtrip decriptare");
  ok(!JSON.stringify(await keyMeta({ store })).includes("sk-secretkey"), "keyStore: meta nu dezvaluie cheia");
  ok(hasKeyCached("openai") === true, "keyStore: cache sincron populat");
  await deleteProviderKey("openai", { store });
  ok((await getProviderKey("openai", { store })) === null, "keyStore: stergere cheie");
}

// ── ROUTER: clasa de date + capabilitati + lant fallback ──
{
  ok(enabledProviders().includes("openai") && enabledProviders().includes("private"), "provideri activi in test (openai + private)");
  ok(providerAllowsClass("openai", "RESTRICTED") === false, "matrice: openai NU are voie RESTRICTED");
  ok(providerAllowsClass("private", "RESTRICTED") === true, "matrice: private are voie RESTRICTED");
  const rInt = route({ task: "strategy", sensitivity: "INTERNAL" });
  ok(rInt.provider && rInt.candidates.length >= 1, "router: alege provider pentru INTERNAL");
  const rRes = route({ task: "reasoning", sensitivity: "RESTRICTED" });
  ok(rRes.provider === "private", "router: RESTRICTED → doar private (fail-closed pe externi)");
  const rTools = route({ task: "reasoning", sensitivity: "INTERNAL", needsTools: true });
  ok(!rTools.candidates.includes("private"), "router: filtreaza pe capabilitate (private fara tools exclus)");
  ok(Array.isArray(rInt.candidates), "router: intoarce lant de fallback");
}

// ── COST GUARD budgets ──
{
  const store = mkStore();
  await recordSpend(0.3, { store, nowISO: "2026-08-01T10:00:00Z" });
  await recordSpend(0.2, { store, nowISO: "2026-08-15T10:00:00Z" });
  const m = await spentThisMonth({ store, nowISO: "2026-08-20T10:00:00Z" });
  ok(Math.abs(m.usd - 0.5) < 1e-9 && m.month === "2026-08", "cost: suma lunara corecta");
  ok(typeof (await alertStatus({ store, nowISO: "2026-08-20T10:00:00Z" })).alert === "boolean", "cost: alertStatus structural");
}

// ── EVALUATION ──
{
  const store = mkStore();
  await recordEvaluation({ task_type: "strategy", provider: "openai", validation: "passed" }, { store });
  await recordEvaluation({ task_type: "strategy", provider: "openai", validation: "passed", accepted: true }, { store });
  const ps = await perfScores("strategy", { store });
  ok(typeof ps.openai === "number" && ps.openai > 0.5, "evaluation: perfScores calculeaza scor");
}

// ── RISK TRIGGER ──
{
  ok(needsReview({ text: "analiza contract cu clauze de reziliere", task: "document" }).review === true, "risk: contract → review");
  ok(needsReview({ text: "cat e ora", task: "reasoning" }).review === false, "risk: banal → fara review");
  ok(needsReview({ text: "x", contradictions: 1 }).review === true, "risk: contradictii → review");
}

// ── GATEWAY fail-closed pe RESTRICTED (nu apeleaza extern) ──
{
  const store = mkStore();
  const r = await consultModel({ query: "date salariale confidentiale", task: "reasoning", sensitivity: "RESTRICTED", store, prefer: "openai" });
  ok(r.ok === false, "gateway: RESTRICTED nu produce raspuns de la extern (fail-closed sau eroare privat)");
  ok(r.provider === undefined || r.provider === "private", "gateway: pentru RESTRICTED nu se ruteaza la openai (extern)");
}

// ── CAPABILITY PROFILE ──
{
  const p = capabilityProfile("openai");
  ok(p && Array.isArray(p.capabilities) && Array.isArray(p.data_classifications_allowed), "capabilityProfile complet (§10)");
  ok(!p.data_classifications_allowed.includes("RESTRICTED"), "profil openai: RESTRICTED absent din matrice");
}

console.log(`\n${n} verificari · ${failed === 0 ? "TOATE TRECUTE" : failed + " ESUATE"} — memory+multimodel full`);
process.exit(failed === 0 ? 0 : 1);
