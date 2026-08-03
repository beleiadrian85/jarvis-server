// SHADOW MODE + rollout controlat per tip (§3, §9). node test/shadow.test.mjs
process.env.ANTHROPIC_API_KEY = "dummy";
process.env.TELEGRAM_BOT_TOKEN = "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID = "1";
// episodic ON, semantic SHADOW, document OFF — inainte de importuri (config la eval).
process.env.JARVIS_EPISODIC_MEMORY_ENABLED = "on";
process.env.JARVIS_SEMANTIC_MEMORY_ENABLED = "shadow";
process.env.JARVIS_DOCUMENT_MEMORY_ENABLED = "off";

const { remember, list, listShadow, promote, stats } = await import("../src/ceo/memory/store.js");
const { recall } = await import("../src/ceo/memory/retrieval.js");
const { assembleContext } = await import("../src/ceo/memory/contextAssembler.js");

let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(`${c ? "✅" : "❌"} ${n}. ${m}`); if (!c) failed++; };
const mkStore = () => { const mem = {}; return { get: async (k, f) => (k in mem ? mem[k] : f), set: async (k, v) => { mem[k] = v; } }; };

{
  const store = mkStore();
  // EPISODIC (on) → activ.
  const ep = await remember({ title: "Sedinta cu Nelu", content: "planificare", kind: "episode", source_type: "operational", verification_status: "OBSERVED" }, { store });
  ok(ep.stored && ep.item.shadow !== true, "EPISODIC on → stocat activ (nu shadow)");

  // SEMANTIC (shadow) → candidat shadow.
  const se = await remember({ title: "Clientul prefera transfer", content: "fapt", kind: "fact", source_type: "email", verification_status: "OBSERVED" }, { store });
  ok(se.stored && se.item.shadow === true, "SEMANTIC shadow → stocat ca shadow candidate");

  // DOCUMENT (off) → nu se stocheaza.
  const doc = await remember({ title: "Contract X", content: "corp", kind: "document", source_type: "drive" }, { store });
  ok(doc.stored === false && /OFF/.test(doc.reason), "DOCUMENT off → NU se stocheaza");

  // Recall NU vede shadow.
  const rc = await recall("client transfer", { store });
  ok(!rc.items.some((x) => x.shadow === true) && !rc.items.some((x) => x.title.includes("transfer")), "recall NU include candidatii shadow");

  // Context assembler NU foloseste shadow.
  const ctx = await assembleContext("clientul prefera", { store, providerTrust: "external" });
  ok(!/transfer/.test(ctx.contextText), "context (pt model) NU include shadow");

  // listShadow ii vede.
  const sh = await listShadow({ store });
  ok(sh.length === 1 && sh[0].title.includes("transfer"), "listShadow returneaza candidatii");

  // stats separa shadow de active.
  const st = await stats({ store });
  ok(st.active === 1 && st.shadow === 1, "stats: active vs shadow separate");

  // Promovare → devine activ, apare in recall.
  const pr = await promote(sh[0].id, { store });
  ok(pr.ok, "promote muta din shadow in activ");
  const rc2 = await recall("client transfer", { store });
  ok(rc2.items.some((x) => x.title.includes("transfer")), "dupa promovare, apare in recall");
  ok((await listShadow({ store })).length === 0, "dupa promovare, shadow gol");
}

console.log(`\n${n} verificari · ${failed === 0 ? "TOATE TRECUTE" : failed + " ESUATE"} — shadow mode`);
process.exit(failed === 0 ? 0 : 1);
