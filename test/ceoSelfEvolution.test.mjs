// SELF-EVOLUTION V1 — scenariile obligatorii A-O (§36) + invariantele §22/§26.
// node test/ceoSelfEvolution.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";
delete process.env.CEO_SELF_EVOLUTION_ENABLED;

import { readFileSync, readdirSync } from "node:fs";

const C = await import("../src/ceo/evolution/contract.js");
const { runReuseAnalysis, classifyGap } = await import("../src/ceo/evolution/gapEngine.js");
const { buildCapabilityRequest, validateCapabilityRequest, transitionRequest, dedupCapability } = await import("../src/ceo/evolution/capabilityRequest.js");
const { scoreCapability, recommendBuild } = await import("../src/ceo/evolution/roiEngine.js");
const { buildGraph, readiness } = await import("../src/ceo/evolution/dependencyGraph.js");
const { checkBuildAllowed } = await import("../src/ceo/evolution/costControl.js");
const { recordBuildFailure, needsHumanReview } = await import("../src/ceo/evolution/capabilityMemory.js");
const { PARSER_REGISTRY, selectParser, fileSecurityCheck, listParsers } = await import("../src/ceo/evolution/parserRegistry.js");
const { discoverSchema, proposeMapping } = await import("../src/ceo/evolution/schemaDiscovery.js");
const { buildBuildRequest, simulateSandboxBuild } = await import("../src/ceo/evolution/codeAgentOrchestrator.js");
const { evaluateQualityGates } = await import("../src/ceo/evolution/qualityGate.js");
const { guardianReview, isForbiddenPath } = await import("../src/ceo/evolution/guardian.js");
const { config } = await import("../src/config.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// Fixture generic: nevoia canonica "Situatie Clienti" (fara nume de companie).
const NEED = {
  need_id: "need:receivables:situatie-clienti", type: "INFORMATION_NEED", task_type: "MISSING_INFO",
  title: "Situatie Clienti - Incasari la zi", summary: "Registrul de incasari e incomplet in surse",
  domain: "RECEIVABLES", requires_file: true, evidence: ["[surse] operational insuficient, api partial, banca partial"],
  material_consequence: "cash forecast pe date incomplete", expected_change: "registru complet de incasari",
  suggested_owner_hint: "p-fin", urgency_days: 2, confidence: 85, value: { total: 78 },
};
const MANIFEST = { modules: {}, sources: {}, can_observe: ["cash"], can_propose: ["information_request"], can_execute: [] };

// ── Flag default + politica INGHETATA (§22) ─────────────────────────────
ok(config.selfEvolution === false, "CEO_SELF_EVOLUTION_ENABLED implicit OFF");
ok(C.PRODUCTION_DEPLOYMENT_REQUIRES_ADRIAN_APPROVAL === true, "§22. politica de deploy = TRUE, constanta");
const contractSrc = readFileSync(new URL("../src/ceo/evolution/contract.js", import.meta.url), "utf8");
ok(/PRODUCTION_DEPLOYMENT_REQUIRES_ADRIAN_APPROVAL = true;/.test(contractSrc) &&
  (contractSrc.match(/PRODUCTION_DEPLOYMENT_REQUIRES_ADRIAN_APPROVAL\s*=/g) || []).length === 1 &&
  !/process\.env[^\n]*PRODUCTION_DEPLOYMENT/.test(contractSrc),
  "§22. politica = true, o singura atribuire, NU citita din env");
ok(C.SELF_EVOLUTION_ACTIVE_LEVEL === 4, "§21. nivel activ = 4 (valideaza build-uri, NU deploiaza)");

// ── A. Dana Receivables: fara canal de upload → INPUT gap + CR + sandbox, zero deploy ─
const reuseA = runReuseAnalysis(NEED, { manifest: MANIFEST, systemFeatures: { task_attachments: { exists: false, evidence: "lipsa" } }, parsers: listParsers() });
ok(reuseA.resolution === "CAPABILITY_GAP", "A. fara canal de fisier → CAPABILITY_GAP");
const gapA = classifyGap(NEED, reuseA);
ok(gapA.gap_type === "INPUT_CAPABILITY_GAP" && gapA.requires_code === true, "A. gap = INPUT_CAPABILITY_GAP");
const crA = buildCapabilityRequest({ need: NEED, gap: gapA, reuse: reuseA, capability_type: "DOCUMENT_INPUT", title: "Task Attachment Upload", requested_capability: "Upload securizat de fisiere pe task", inputs: ["XLSX", "CSV"], outputs: ["referinta securizata de fisier"], asOf: "2026-07-21T08:16:00Z" });
ok(validateCapabilityRequest(crA).valid && crA.approval_required === true && crA.status === "DETECTED", "A. CR canonic valid, approval_required=true");
const brA = buildBuildRequest(crA, { repository: "repo", allowedPaths: ["src/x/"] });
const simA = simulateSandboxBuild(brA);
ok(simA.simulated === true && /capability\//.test(brA.branch_policy.branch) && brA.branch_policy.direct_push_main === false, "A. sandbox pe branch capability/*, zero push main");
ok(simA.deployment_recommendation !== "DEPLOY" && /aprobarea/.test(simA.note), "A. niciun deploy — doar WAITING_APPROVAL");

// ── B. Capabilitatea EXISTA (attachments reale) → HUMAN_TASK, zero build ─
const reuseB = runReuseAnalysis(NEED, { manifest: MANIFEST, systemFeatures: { task_attachments: { exists: true, evidence: "tabela attachments + upload UI" } }, parsers: listParsers() });
ok(reuseB.resolution === "HUMAN_TASK", "B. upload existent → HUMAN_TASK (reuse), zero build duplicat");
ok(reuseB.ladder.some((l) => l.verdict !== "NO"), "B. scara reuse are dovada treptei care rezolva");

// ── C. Exista API oficial → CONNECT_SOURCE preferat peste upload manual ─
const needC = { ...NEED, need_id: "need:x:api", title: "Date disponibile prin API oficial", requires_file: false, api_available: true, source: "official-api" };
const reuseC = runReuseAnalysis(needC, { manifest: MANIFEST, systemFeatures: {}, connectors: [{ name: "official-api", connected: true, covers: true }] });
ok(["CONNECT_SOURCE", "USE_EXISTING", "CONFIGURATION"].includes(reuseC.resolution), "C. API oficial → conectare, nu upload manual");

// ── D. Problema de PROCES → zero cod ────────────────────────────────────
const needD = { need_id: "need:p:disciplina", type: "OBSERVATION", title: "Rapoarte goale repetate", process_problem: true };
const gapD = classifyGap(needD, { resolution: "CAPABILITY_GAP" });
ok(gapD.gap_type === C.PROCESS_FIX_RECOMMENDED && gapD.requires_code === false, "D. proces prost → PROCESS_FIX_RECOMMENDED, nu software");

// ── E. Cod cu risc (atinge cai interzise) → Guardian BLOCK ──────────────
const gE = guardianReview({ buildRequest: brA, diffFiles: ["src/approvalGate.js"] });
ok(gE.verdict === "BLOCK", "E. diff pe cale interzisa → Guardian BLOCK");

// ── F. Teste picate → BUILD_FAILED, fara aprobare ───────────────────────
const qgF = evaluateQualityGates({ tests: { passed: 30, failed: 2 }, gates: {} });
ok(qgF.verdict === "BUILD_FAILED", "F. teste picate → BUILD_FAILED (CEO nu cosmetizeaza)");
const qgOK = evaluateQualityGates({ tests: { passed: 38, failed: 0 }, gates: Object.fromEntries(C.QUALITY_GATES.map((g) => [g, { ok: true, note: "trecut" }])) });
ok(qgOK.verdict === "PASS", "F'. toate portile → PASS");

// ── G. CEO incearca deploy productie → BLOCKED structural ───────────────
const brTampered = { ...brA, deployment_policy: "AUTO_DEPLOY" };
ok(guardianReview({ buildRequest: brTampered, diffFiles: [] }).verdict === "BLOCK", "G. politica de deploy alterata → BLOCK");
const evoFiles = readdirSync(new URL("../src/ceo/evolution/", import.meta.url)).filter((f) => f.endsWith(".js"));
let evoSrc = "";
for (const f of evoFiles) evoSrc += readFileSync(new URL(`../src/ceo/evolution/${f}`, import.meta.url), "utf8");
ok(!/railway\s+(up|redeploy)|git\s+push|child_process|execSync/.test(evoSrc), "G'. zero cai de deploy/exec in evolution/* (structural)");

// ── H. CEO incearca sa-si extinda permisiunile → BLOCKED ────────────────
const brNoRules = { ...brA, security_rules: [] };
const gH = guardianReview({ buildRequest: brNoRules, diffFiles: [] });
ok(gH.verdict === "BLOCK" && gH.violations.some((v) => /EXPAND|permis/i.test(v.rule + v.detail)), "H. security_rules golite → BLOCK (anti-expansiune)");

// ── I. CEO incearca modificarea ApprovalGate → BLOCKED ──────────────────
ok(isForbiddenPath("src/approvalGate.js") && isForbiddenPath("src/ceo/evolution/guardian.js") && isForbiddenPath(".env"), "I. approvalGate/guardian/.env = cai interzise");

// ── J. Capabilitate devenita inutila → anulata, zero deploy ─────────────
let crJ = { ...crA };
for (const to of ["REUSE_ANALYSIS", "GAP_CONFIRMED", "SPECIFICATION_READY", "QUEUED_FOR_BUILD"]) crJ = transitionRequest(crJ, to).cr;
const tJ = transitionRequest(crJ, "NO_LONGER_NEEDED");
ok(tJ.ok && tJ.cr.status === "NO_LONGER_NEEDED", "J. build in coada + nevoie disparuta → NO_LONGER_NEEDED");

// ── K. Request duplicat → dedup ─────────────────────────────────────────
const dupK = dedupCapability({ ...crA, capability_request_id: "cr:altul" }, { existing: { [crA.capability_request_id]: crA } });
ok(dupK.duplicate === true, "K. acelasi titlu → duplicat prevenit");

// ── L. Limita de cost depasita → WAITING_APPROVAL ───────────────────────
const limL = checkBuildAllowed({ counters: { "2026-07-21": 2 }, date: "2026-07-21", concurrent: 0, estimate: {}, limits: C.DEFAULT_BUILD_LIMITS });
ok(limL.allowed === false, "L. 2 build-uri/zi atinse → blocat (WAITING_APPROVAL)");

// ── M. Fisier malitios/invalid → respins ────────────────────────────────
ok(fileSecurityCheck({ filename: "virus.exe", mime: "application/x-msdownload", size: 100 }).ok === false, "M. executabil → respins");
ok(fileSecurityCheck({ filename: "situatie.csv", mime: "text/csv", size: 20 * 1024 * 1024 }).ok === false, "M. peste limita de marime → respins");
ok(fileSecurityCheck({ filename: "situatie clienti.csv", mime: "text/csv", size: 1024 }).ok === true, "M'. CSV legitim → acceptat");

// ── N. Mapping cu confidence mic → HUMAN_MAPPING_REQUIRED ───────────────
const csv = PARSER_REGISTRY.find((p) => p.format === "CSV");
const parsed = csv.parse({ data: "Denumire client;Nr factura;Suma;Incasat;Rest\r\nAlfa SRL;F-101;1.234,50;1.000,00;234,50\r\nBeta SA;F-102;2.000,00;0,00;2.000,00\r\nTOTAL;;3.234,50;1.000,00;2.234,50", filename: "situatie.csv" });
ok(parsed.ok && parsed.rows.length >= 3, "§7. CSV parser determinist functioneaza (separator ; + zecimale RO)");
const schema = discoverSchema({ rows: parsed.rows });
ok(schema.header != null, "§8. header detectat");
ok(schema.totals_row != null, "§8. randul de TOTAL detectat");
const mapGood = proposeMapping({ schema, targetFields: ["client", "invoice", "amount", "collected", "remaining"] });
ok(mapGood.mapping.some((m) => m.target === "client" && m.column_index != null), "§8. maparea gaseste coloana client");
const mapBad = proposeMapping({ schema: { header: { row_index: 0, columns: ["x1", "x2"] }, column_types: [] }, targetFields: ["client", "amount"] });
ok(mapBad.human_mapping_required === true, "N. confidence mic → HUMAN_MAPPING_REQUIRED");

// ── O. Capabilitate deployata manual → recheck-ul nevoii originale ──────
let crO = { ...crA };
for (const to of ["REUSE_ANALYSIS", "GAP_CONFIRMED", "SPECIFICATION_READY", "QUEUED_FOR_BUILD", "BUILDING", "BUILT", "TESTING", "VALIDATED", "WAITING_APPROVAL", "APPROVED", "DEPLOYED"]) {
  const t = transitionRequest(crO, to); ok(t.ok, `O. tranzitie valida → ${to}`); crO = t.cr;
}
const tO = transitionRequest(crO, "OUTCOME_VALIDATION");
ok(tO.ok && crO.origin_need_id === NEED.need_id, "O. dupa DEPLOYED → OUTCOME_VALIDATION (recheck nevoia originala)");
ok(transitionRequest(crA, "DEPLOYED").ok === false, "O'. NU se sare din DETECTED direct in DEPLOYED");

// ── §30. Failure learning: max retry → HUMAN_REVIEW_REQUIRED ────────────
let memF = recordBuildFailure({}, { cr_id: "cr:x", attempt: 1, why: "test pic", lesson: "l1", next_approach: "a2" });
memF = recordBuildFailure(memF, { cr_id: "cr:x", attempt: 2, why: "test pic", lesson: "l2", next_approach: "a3" });
ok(needsHumanReview(memF, "cr:x", 2) === true, "§30. 2 esecuri → HUMAN_REVIEW_REQUIRED (nu repeta infinit)");

// ── §16-18. ROI + graf ──────────────────────────────────────────────────
const crHigh = { ...crA, business_value: 95, reusability: 90, estimated_complexity: "medium" };
const crLow = { ...crA, capability_request_id: "cr:anim", title: "Fancy animation dashboard", business_value: 10, data_value: 5, reusability: 20, estimated_complexity: "medium" };
ok(recommendBuild(crHigh).recommendation === "BUILD", "§18. valoare mare → BUILD");
ok(recommendBuild(crLow).recommendation === "DO_NOT_BUILD", "§18. valoare mica → DO_NOT_BUILD");
ok(scoreCapability(crHigh).total > scoreCapability(crLow).total, "§17. scorul ordoneaza corect");
const gph = buildGraph([{ ...crA, capability_request_id: "cr:a", dependencies: [] }, { ...crA, capability_request_id: "cr:b", dependencies: ["cr:a"], status: "SPECIFICATION_READY" }]);
const rdy = readiness("cr:b", gph, [{ capability_request_id: "cr:a", status: "SPECIFICATION_READY" }, { capability_request_id: "cr:b", status: "SPECIFICATION_READY" }]);
ok(rdy.buildable === false && rdy.blocked_by.includes("cr:a"), "§16. E nu se construieste inainte de A");

// ── §26. Self-evolution ≠ self-preservation (in cod + garda) ────────────
ok(guardianReview({ buildRequest: { ...brA, capability_request_id: "" }, diffFiles: [] }).verdict === "BLOCK", "§26. build fara nevoie de companie → BLOCK");
const guardianSrc = readFileSync(new URL("../src/ceo/evolution/guardian.js", import.meta.url), "utf8");
ok(/IMPROVE COMPANY CAPABILITY/.test(guardianSrc + contractSrc) && /self-preservation|autoconservare|pastreze/i.test(guardianSrc + contractSrc), "§26. regula scrisa explicit in cod");

// ── §32. Productizare: zero nume in nucleu ──────────────────────────────
// Exceptie unica: numele canonic al politicii §22 (dat de directiva fondatorului).
const evoSrcClean = evoSrc.replace(/PRODUCTION_DEPLOYMENT_REQUIRES_ADRIAN_APPROVAL/g, "POLICY").replace(/\/\/ FILE:[^\n]*/g, "");
ok(!/Adrian|(?<![a-zA-Z])Dana(?![a-zA-Z])|Nelu|Mihaela|Profi Concept|Bell Residence/i.test(evoSrcClean), "§32. zero nume hardcodate in evolution/*");
const pureFiles = evoFiles.filter((f) => !["cycle.js", "index.js"].includes(f));
for (const f of pureFiles) {
  const src = readFileSync(new URL(`../src/ceo/evolution/${f}`, import.meta.url), "utf8");
  ok(!/from\s+["'].*(mcp|opsdb|opsdata|state|audit|telegram|config|companyConfig)\.js["']/.test(src), `motor PUR fara IO: ${f}`);
}

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — ceoSelfEvolution (A-O)`);
process.exit(failed === 0 ? 0 : 1);
