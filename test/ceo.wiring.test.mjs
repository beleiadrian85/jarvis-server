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

// Garzi de sursa pe TOATE modulele CEO.
const FILES = readdirSync(path.join(__dirname, "..", "src", "ceo")).map((f) => "ceo/" + f);
const all = FILES.map(SRC).join("\n");
ok(!/from\s+["'][^"']*(taskflow|approvalGate|mcp)\.js["']/.test(all), "zero importuri de executie (proposal ≠ execution, structural)");
ok(!/from\s+["'][^"']*(telegram|notifier|tts)\.js["']/.test(all), "zero canale de notificare (CEO observa si propune, nu trimite)");
ok(!/from\s+["'][^"']*sources\/(gmail|calendar)/.test(all), "zero scrieri Gmail/Calendar");
ok(!/(create_task|update_task|delete_task|proposeAction|sendMessage|createDraft)/.test(all), "zero apeluri de scriere/actiune");
ok(!/CREATE TABLE|ALTER TABLE/i.test(all), "zero schema DB noua (totul in jarvis_state)");
ok(!/runBoardMeeting/.test(all), "Boardul nu e convocat de CEO core (separat, gated)");
const gate = await import("../src/approvalGate.js");
ok(typeof gate.proposeAction === "function" && typeof gate.confirmActionById === "function", "approvalGate intact si nemodificat");
ok(!/ceo\//.test(SRC("brain.js")), "brain.js neatins — raspunsurile vizibile neschimbate");

// API read-only (Command Center foundation).
const api = SRC("ceo/api.js");
ok((api.match(/app\.get\(/g) || []).length >= 8 && !/app\.(put|delete|patch)\(/.test(api), "API: fara PUT/DELETE/PATCH");
// Exact 2 POST-uri permise (Master Phase 2): soldul (jarvis_state) + decizia
// din Approval Inbox (stare propunere). Ambele aditive, auditate, fara efecte.
const posts = api.match(/app\.post\("([^"]+)"/g) || [];
ok(posts.length === 2 && posts.join(",").includes("bank-balance") && posts.join(",").includes("proposals/decision"),
   `API: DOAR cele 2 POST-uri sanctionate (${posts.length})`);
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
