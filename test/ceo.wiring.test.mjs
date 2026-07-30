// Teste wiring CEO AI — garzi de sursa, API read-only, invariante de siguranta.
// node test/ceo.wiring.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = (f) => readFileSync(path.join(__dirname, "..", "src", f), "utf8");
let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// Garzi de sursa pe modulele CEO "core" (fara subdirectorul nervous/ — acela
// are UNICA suprafata de scriere TASKS-ONLY, cu garzile lui dedicate A-Z in
// ceoNervousV1.test.mjs: assertTasksOnly, kill switch, idempotenta, limite).
const FILES = readdirSync(path.join(__dirname, "..", "src", "ceo")).filter((f) => f.endsWith(".js")).map((f) => "ceo/" + f);
const all = FILES.map(SRC).join("\n");
ok(!/from\s+["'][^"']*(taskflow|approvalGate|mcp)\.js["']/.test(all), "zero importuri de executie in CEO core (proposal ≠ execution, structural)");
ok(!/from\s+["'][^"']*(notifier|tts)\.js["']/.test(all), "zero canale de notificare in CEO core (telegram doar in api.js, gated)");
ok(!/from\s+["'][^"']*sources\/(gmail|calendar)/.test(all), "zero scrieri Gmail/Calendar");
ok(!/(create_task|update_task|delete_task|createDraft)\(/.test(all), "zero apeluri de scriere/actiune in CEO core");
ok(!/CREATE TABLE|ALTER TABLE/i.test(all), "zero schema DB noua (totul in jarvis_state)");
ok(!/runBoardMeeting/.test(all), "Boardul nu e convocat de CEO core (separat, gated)");
const gate = await import("../src/approvalGate.js");
ok(typeof gate.proposeAction === "function" && typeof gate.confirmActionById === "function", "approvalGate intact si nemodificat");
// brain.js poate importa DOAR sourceTruth din ceo/ (harta read-only a surselor,
// anti-halucinatie) — NU module de scriere/actiune (nervous/evolution/api/proposal).
{
  const b = SRC("brain.js");
  const ceoImports = [...b.matchAll(/from\s+["']\.\/ceo\/([^"']+)["']/g), ...b.matchAll(/import\(\s*["']\.\/ceo\/([^"']+)["']/g)].map((m) => m[1]);
  // Grounding + guvernanta manageriala read-only (Constitution/ManagerialReasoning/
  // QualityGate = PURE; founderModel = invatare, jarvis_state). Fara executie.
  const allowed = new Set(["sourceTruth.js", "actionLedger.js", "evidencePacket.js", "externalIntel.js", "constitution.js", "managerialReasoning.js", "qualityGate.js", "managerialClaimValidator.js", "managerialFinalizer.js", "sourcePipeline.js", "founderModel.js", "resolverSources.js"]);
  ok(ceoImports.every((p) => allowed.has(p)), `brain.js importa din ceo/ DOAR grounding+guvernanta read-only — are: ${ceoImports.join(",") || "nimic"}`);
}

// API read-only (Command Center foundation).
const api = SRC("ceo/api.js");
ok((api.match(/app\.get\(/g) || []).length >= 8 && !/app\.(put|delete|patch)\(/.test(api), "API: fara PUT/DELETE/PATCH");
// Exact 7 POST-uri permise (MP2-4 + Nervous V1 + Self-Evolution V1): sold,
// decizie Inbox (±send L2), credentiale Google, mapping identitate,
// nervous-cycle (shadow-safe), capabilities/decision (decizia fondatorului pe
// capabilitati — zero deploy), evolution-scan (scan shadow-safe, zero build).
// Singurul outbound = decizie cu send:true pe information_request (LEVEL 2).
const posts = api.match(/app\.post\("([^"]+)"/g) || [];
ok(posts.length === 9 && ["bank-balance", "proposals/decision", "google-credentials", "people-mapping", "nervous-cycle", "capabilities/decision", "evolution-scan", "cognitive-cycle", "external-scan"].every((p) => posts.join(",").includes(p)),
   `API: DOAR cele 9 POST-uri sanctionate (${posts.length}) — external-scan = read-only (web+jarvis_state), zero write Operational`);
ok(/registerCeoApi\(app\)/.test(SRC("index.js")) &&
   SRC("index.js").indexOf("registerApi(app)") < SRC("index.js").indexOf("registerCeoApi(app)"),
   "rutele /api/ceo/* montate DUPA middleware-ul PIN existent");

// Invariantele obligatorii (sursa + comportament, dublate de suita pura):
ok(/UNKNOWN/.test(SRC("ceo/cashIntelligence.js")) && /NICIODATA/.test(SRC("ceo/cashIntelligence.js")), "missing data != zero (declarat si impus)");
ok(/NOT_CONNECTED/.test(SRC("ceo/salesIntelligence.js")), "stagii funnel fara sursa = NOT_CONNECTED, nu simulate");
ok(/DATA_REQUIRED/.test(SRC("ceo/decisionEngineV2.js")), "decizie cu date lipsa != recomandare finala");
ok(/requires_founder_approval: true/.test(SRC("ceo/proposalEngine.js")), "recommendation != approval (fondatorul decide)");
ok(/LOOP_STATES/.test(SRC("ceo/closedLoop.js")) && /verified/.test(SRC("ceo/closedLoop.js")), "approval != verified result (stari separate)");
ok(/approval_required: true/.test(SRC("ceo/improvementEngine.js")), "zero auto-modificare de cod (Change Control)");
ok(!/self.?modif/i.test(all) || /NU isi modifica/.test(all), "fara self-modifying code");

// Config-driven: nucleul citeste compania din config.
ok(/from "\.\/companyConfig\.js"/.test(SRC("ceo/dataGapEngine.js")) && /from "\.\/companyConfig\.js"/.test(SRC("ceo/decisionEngineV2.js")), "compania vine din companyConfig (INSTANCE #1)");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — ceo (wiring)`);
process.exit(failed === 0 ? 0 : 1);
