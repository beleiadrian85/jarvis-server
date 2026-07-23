// MODEL/REASONING TIERS (Faza 12). node test/modelTiers.test.mjs
import { selectTier, REASONING_TIERS } from "../src/modelRouter.js";

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

ok(REASONING_TIERS[0] && REASONING_TIERS[1] && REASONING_TIERS[2] && REASONING_TIERS[3], "4 tier-uri definite (0-3)");
ok(REASONING_TIERS[2].model === "claude-opus-4-8", "TIER 2 = heavy (Opus)");
ok(REASONING_TIERS[1].model.includes("haiku"), "TIER 1 = fast (Haiku)");

// Ruta determinista → TIER 0.
ok(selectTier({ route: "report" }).tier === 0, "report → TIER 0 (fara model)");
ok(selectTier({ route: "confirm" }).tier === 0, "confirm → TIER 0");

// Chat simplu → TIER 1.
ok(selectTier({ route: "operational_read", text: "cate task-uri are Nelu?" }).tier === 1, "chat operational → TIER 1");

// Decizie de capital / 'ce sa fac' → TIER 2 heavy.
ok(selectTier({ text: "cat capital sa aloc pentru Mârșa?" }).tier === 2, "alocare capital → TIER 2");
ok(selectTier({ text: "tu ce ai face, vindem sau pastram?" }).tier === 2, "'ce ai face' → TIER 2");
ok(selectTier({ route: "strategy" }).tier === 2, "strategie → TIER 2");
ok(selectTier({ text: "cum negociem cu banca creditul mare?" }).tier === 2, "negociere/credit → TIER 2");

// Dovezi conflictuale → TIER 2 + a doua opinie.
const conflict = selectTier({ text: "ce fac?", conflictingEvidence: true });
ok(conflict.tier === 2 && conflict.requiresSecondOpinion === true, "dovezi conflictuale → TIER 2 + second opinion (TIER 3)");

// Capital → cere second opinion adversariala.
ok(selectTier({ text: "aloc tot capitalul?" }).requiresSecondOpinion === true, "decizie de capital → cere a doua opinie");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — modelTiers`);
process.exit(failed === 0 ? 0 : 1);
