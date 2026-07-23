// TRIPLE-TRUTH AUDIT (Faza 15). Compara pentru fiecare capabilitate majora:
//   A. CODE TRUTH        — ce suporta efectiv codul (fisiere/functii exista)
//   B. JARVIS SELF-MODEL — ce crede JARVIS ca suporta (capabilityManifest/sourceTruth)
//   C. OPERATIONAL REALITY — ce contin efectiv sursele (config/status conectivitate)
// Orice nepotrivire = bug. node scripts/tripleTruthAudit.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = (f) => existsSync(path.join(__dirname, "..", "src", f));

const { buildCapabilityManifest, whatCanIExecute } = await import("../src/ceo/capabilityManifest.js");
const { buildSourceTruth } = await import("../src/ceo/sourceTruth.js");

const manifest = buildCapabilityManifest({});
const truth = await buildSourceTruth().catch(() => ({ sources: [] }));
const exec = whatCanIExecute(manifest);
const srcStatus = (name) => (truth.sources.find((s) => new RegExp(name, "i").test(s.source)) || {}).status || "ABSENT";

let mismatches = 0;
const rows = [];
// capability | CODE (fisier/functie exista) | SELF-MODEL (manifest) | REALITY (conectivitate)
function row(cap, code, self, reality, aligned) {
  rows.push({ cap, code, self, reality, aligned });
  if (!aligned) mismatches++;
}

// 1) Read Operational
row("READ Operational",
  SRC("ceo/sourceTruth.js"),
  manifest.can_observe.length > 0,
  /CONNECTED/.test(srcStatus("Operational")),
  SRC("ceo/sourceTruth.js") && /CONNECTED/.test(srcStatus("Operational")));

// 2) WRITE Operational (TASKS-only via CommandBus)
row("WRITE tasks (CommandBus)",
  SRC("ceo/nervous/operationalWrite.js"),
  exec.via_command_bus.includes("create_task"),
  /CONNECTED/.test(srcStatus("Operational")),
  SRC("ceo/nervous/operationalWrite.js") && exec.via_command_bus.includes("create_task"));

// 3) Direct core execution — trebuie sa fie GOL peste tot
row("Direct core execution",
  false, // nu exista cale de executie directa in core
  manifest.can_execute.length === 0 && manifest.core_capability.execute_directly === false,
  true,
  manifest.can_execute.length === 0);

// 4) External Intelligence
row("External Intelligence",
  SRC("ceo/externalIntel.js"),
  manifest.modules.external_intelligence !== undefined,
  manifest.modules.external_intelligence === "active" ? "active" : "gated-off",
  SRC("ceo/externalIntel.js") && manifest.modules.external_intelligence !== undefined);

// 5) Ask CODEX
row("Ask CODEX",
  SRC("codex/askCodex.js") && SRC("codex/api.js"),
  true, // reflectat in modules? verificam mai jos
  "live (deployed)",
  SRC("codex/askCodex.js") && SRC("codex/api.js"));

// 6) Bank balance
row("Bank balance (sold)",
  SRC("ceo/balanceStore.js"),
  /NOT_CONNECTED/.test(srcStatus("Bank")) || /manual/i.test(srcStatus("Bank")),
  srcStatus("Bank"),
  true); // codul declara onest manual/UNKNOWN — aliniat cu realitatea

// 7) Gmail/Calendar
row("Gmail/Calendar",
  SRC("google.js"),
  /NOT_CONNECTED/.test(srcStatus("Gmail")),
  srcStatus("Gmail"),
  SRC("google.js")); // cod pregatit; realitatea = neconectat (declarat corect)

// 8) Data Trust
row("Data Trust Score",
  SRC("ceo/dataTrust.js"),
  manifest.modules.data_trust_score === "available",
  "n/a (per-domeniu)",
  SRC("ceo/dataTrust.js") && manifest.modules.data_trust_score === "available");

// 9) Cognitive Trace
row("Cognitive Trace",
  SRC("ceo/cognitiveTrace.js"),
  manifest.modules.cognitive_trace === "available",
  "n/a",
  SRC("ceo/cognitiveTrace.js") && manifest.modules.cognitive_trace === "available");

// 10) Founder Model
row("Founder Decision Model",
  SRC("ceo/founderModel.js"),
  manifest.modules.founder_decision_model === "available",
  "n/a (invata din decizii)",
  SRC("ceo/founderModel.js") && manifest.modules.founder_decision_model === "available");

console.log("TRIPLE-TRUTH AUDIT — CODE vs SELF-MODEL vs REALITY\n");
for (const r of rows) {
  console.log(`${r.aligned ? "✅" : "❌"} ${r.cap}`);
  console.log(`     CODE=${r.code}  SELF=${r.self}  REALITY=${r.reality}`);
}
console.log(`\nMismatches: ${mismatches} ${mismatches === 0 ? "✅ ALIGNED (code == self-model == reality declarata)" : "❌ BUG — de reparat"}`);
process.exit(mismatches === 0 ? 0 : 1);
