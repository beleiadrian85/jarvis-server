// COGNITIVE TRACE PERSISTENCE (Faza 31). node test/cognitiveTrace.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
import { recordTrace, recentTraces, getTrace, traceForLog } from "../src/ceo/cognitiveTrace.js";

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// Store fake (in-memory) — fara DB reala.
const mem = {};
const store = { get: async (k, f) => (k in mem ? mem[k] : f), set: async (k, v) => { mem[k] = v; } };

const t1 = await recordTrace({
  input: "cat capital sa aloc?", actor: "Adrian", conversation_mode: "DECISION", intent: "capital_allocation",
  route: "strategy", tier: 2, models: ["claude-opus-4-8"], sources: ["operational_db", "external_intel"],
  facts: ["cash UNKNOWN"], latency_ms: 4200, result: "recomandare + DATA_REQUIRED",
}, { nowISO: "2026-07-23T10:00:00.000Z", store });

ok(t1.trace_id && t1.tier === 2 && t1.egress === false, "trace stampilat cu id + tier + egress=false");
ok(t1.models.includes("claude-opus-4-8"), "modelul e inregistrat FACTUAL (nu mai intrebam 'ce model ai folosit')");

await recordTrace({ input: "cate taskuri Nelu?", actor: "Adrian", tier: 1, models: ["claude-haiku-4-5-20251001"] }, { nowISO: "2026-07-23T10:05:00.000Z", store });

const recent = await recentTraces(10, { store });
ok(recent.length === 2 && recent[0].input.includes("cate taskuri"), "recentTraces returneaza ultimele, cel mai nou primul");

const fetched = await getTrace(t1.trace_id, { store });
ok(fetched && fetched.intent === "capital_allocation", "getTrace dupa id");
ok(/tier=2/.test(traceForLog(t1)) && /models=claude-opus-4-8/.test(traceForLog(t1)), "traceForLog arata tier + model");

// Ring buffer marginit — nu creste nelimitat.
for (let i = 0; i < 120; i++) await recordTrace({ input: `q${i}`, tier: 0 }, { nowISO: "2026-07-23T11:00:00.000Z", store });
ok(mem["ceo:cognitive-trace"].traces.length <= 100, "ring buffer marginit la 100");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — cognitiveTrace`);
process.exit(failed === 0 ? 0 : 1);
