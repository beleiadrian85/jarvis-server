// ASK CODEX — WIRING GUARDS. Structural: comenzile trec DOAR prin CommandBus
// (operationalWrite, TASKS-only); zero cale de scriere directa; continut extern
// = UNTRUSTED. node test/codex.wiring.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, "..", "src", "codex");
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".js"));
const all = FILES.map((f) => readFileSync(path.join(DIR, f), "utf8")).join("\n");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// Singura cale de scriere = CommandBus (operationalWrite). Nimic altceva.
ok(!/from\s+["'][^"']*(taskflow|approvalGate)\.js["']/.test(all), "codex NU importa executie directa (taskflow/approvalGate)");
ok(!/(create_task|update_task|delete_task|createDraft)\s*\(/.test(all), "codex NU apeleaza direct create/update/delete_task (doar prin CommandBus)");
ok(/operationalWrite\.js/.test(all), "codex ruteaza comenzile prin operationalWrite (CommandBus, TASKS-only)");
ok(!/CREATE TABLE|ALTER TABLE/i.test(all), "codex nu creeaza schema DB (totul in jarvis_state)");

// Securitate: continutul extern e tratat ca UNTRUSTED (fence/scan).
ok(/untrustedInput\.js/.test(all) || /fenceUntrusted|scanUntrusted/.test(all), "codex trateaza atasamentele/intrebarea ca UNTRUSTED (untrustedInput)");

// Need-to-know: identitatea e aplicata (scoping pe rol).
ok(/identity\.js/.test(all) && /(scopeContext|requestsOutOfScope|identityForPrompt)/.test(all), "codex aplica need-to-know (identity scoping)");

// Reutilizeaza Cognitive Kernel (nu chatbot paralel): conversationMode + dataTrust + sourceTruth.
ok(/conversationMode\.js/.test(all), "codex reutilizeaza conversationMode (kernel comun)");

// CommandBus insusi ramane TASKS-only (garda existenta).
const opsWrite = readFileSync(path.join(__dirname, "..", "src", "ceo", "nervous", "operationalWrite.js"), "utf8");
ok(/assertTasksOnly/.test(opsWrite) && /ALLOWED_WRITE_TOOLS/.test(opsWrite), "CommandBus pastreaza garda TASKS-only");

// API codex: gated + sub PIN (inregistrat in index dupa middleware).
const api = readFileSync(path.join(DIR, "api.js"), "utf8");
ok(/config\.askCodex/.test(api), "API codex gateat cu CODEX_ASK_ENABLED");
const index = readFileSync(path.join(__dirname, "..", "src", "index.js"), "utf8");
ok(/registerCodexApi\(app\)/.test(index) && index.indexOf("registerApi(app)") < index.indexOf("registerCodexApi(app)"), "rutele /api/codex/* montate DUPA middleware-ul PIN");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — codex (wiring)`);
process.exit(failed === 0 ? 0 : 1);
