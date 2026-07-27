// SOURCE PIPELINE DIAGNOSIS — cand o sursa pare stale ("am incarcat extrasele dar
// datele sunt vechi"), verifica LANTUL upload→detectat→parsat→importat→reconciliat.
// TAXONOMIE CORECTA: MISSING NU inseamna automat esec tehnic. Un esec tehnic se
// afirma DOAR cu confirmed_failures (upload observat + etapa cu error state + log).
// HUMAN_INPUT_REQUIRED doar dupa ce JARVIS a cautat singur in toate sursele.
// READ-ONLY (opsdb + jarvis_state). Best-effort.
import { getState } from "../state.js";

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const ageDays = (iso, nowMs) => (iso ? Math.round((nowMs - Date.parse(iso)) / 86_400_000) : null);
// Normalizare diacritice — "încărcat/extrasele" nu trebuie sa ocoleasca detectia.
const DIA = (s) => String(s || "").replace(/[ăâ]/gi, "a").replace(/[î]/gi, "i").replace(/[șş]/gi, "s").replace(/[țţ]/gi, "t").toLowerCase();

// Verdicturi canonice (taxonomie).
export const PIPELINE_VERDICTS = [
  "PIPELINE_OK", "PIPELINE_NOT_OBSERVED", "UPLOAD_OBSERVED_PROCESSING_PENDING",
  "PARSING_FAILED", "IMPORT_FAILED", "RECONCILIATION_PENDING", "RECONCILIATION_FAILED",
  "SOURCE_STALE", "HUMAN_INPUT_REQUIRED", "INSUFFICIENT_EVIDENCE",
];

/** Detecteaza intrebari despre date stale / documente incarcate ce nu apar. */
export function asksPipeline(text) {
  const n = DIA(text);
  return /(am incarcat|am urcat|am pus).{0,30}(extras|document|factur|fisier)|(extras|date|sold|cifr).{0,20}(vechi|stale|neactualiz|nu (apar|s-au actualizat))|de ce (sunt|apar) (vechi|stale)|nu vad (extras|documentele)/.test(n);
}

/** Utilizatorul DECLARA ca a incarcat ceva? (declared_event). */
export function declaresUpload(text) {
  return /\b(am|tocmai am|deja am)\s+(incarcat|urcat|pus|adaugat|trimis|atasat)\b/.test(DIA(text));
}

/**
 * Diagnostic al pipeline-ului de ingestie, cu TRASABILITATE completa.
 * @param {object} p { text (mesajul userului), nowMs, opsdata, store, errorLogs[] }
 * @returns PipelineDiagnosis { declared_event, observed_events[], searched_sources[],
 *   missing_observations[], confirmed_failures[], verdict, verdict_basis,
 *   next_system_action, human_input_needed, confidence, stages }
 */
export async function diagnoseSourcePipeline({ text = "", nowMs = Date.now(), opsdata = null, store = null, errorLogs = null } = {}) {
  const S = store || { get: getState };
  const stages = {};
  const observed_events = [];
  const searched_sources = [];
  const missing_observations = [];
  const confirmed_failures = arr(errorLogs); // DOAR erori confirmate real (injectate/din log)
  const add = (k, status, evidence) => (stages[k] = { status, evidence });

  const declared_event = declaresUpload(text) ? "user_declared_upload" : null;

  // 1. UPLOAD observabil + freshness (opsdb bank statements).
  let bankAgeDays = null, lastOpDays = null, uploadName = null;
  try {
    searched_sources.push("opsdb.bank_statements");
    const ops = opsdata || (await import("../connectors/opsdata.js"));
    const summary = await ops.getBankStatementsSummary?.();
    if (isObj(summary)) {
      uploadName = summary.original_name || summary.latest?.original_name || null;
      bankAgeDays = ageDays(summary.created_at || summary.uploaded_at || summary.latest?.created_at, nowMs);
      lastOpDays = ageDays(summary.last_op || summary.max_op_date, nowMs);
    }
    if (uploadName) observed_events.push(`upload_observed:${uploadName}${bankAgeDays != null ? `(${bankAgeDays}z)` : ""}`);
    else missing_observations.push("niciun upload recent observat in bank_statements");
    add("upload", uploadName ? "OBSERVED" : "NOT_OBSERVED", uploadName ? `ultimul extras: ${uploadName}` : "niciun extras vizibil in sursa");
    add("source_fresh", lastOpDays == null ? "UNKNOWN" : lastOpDays <= 7 ? "OK" : "STALE", lastOpDays != null ? `ultima operatiune: acum ${lastOpDays}z` : "vechime necunoscuta");
  } catch (e) { add("upload", "UNKNOWN", "opsdb indisponibil"); add("source_fresh", "UNKNOWN", e.message); }

  // 2. DETECTAT + PARSAT (staging documente JARVIS).
  try {
    searched_sources.push("jarvis_state:ceo:documents");
    const docs = (await S.get("ceo:documents", { items: [] }).catch(() => null)) || { items: [] };
    const items = Array.isArray(docs.items) ? docs.items : Array.isArray(docs) ? docs : [];
    const recent = items.slice(-5);
    if (recent.length) observed_events.push(`documents_staged:${recent.length}`); else missing_observations.push("niciun document in staging JARVIS");
    add("detected", recent.length ? "OBSERVED" : "NOT_OBSERVED", recent.length ? `${recent.length} documente in staging` : "niciun document detectat");
    const parsed = recent.filter((d) => d.doc_type && d.doc_type !== "unknown");
    const parseErr = recent.filter((d) => d.parse_status === "ERROR" || d.error);
    if (parseErr.length) confirmed_failures.push(`parse_error:${parseErr.length}`);
    add("parsed", !recent.length ? "NOT_OBSERVED" : parseErr.length ? "ERROR" : parsed.length ? "OBSERVED" : "PENDING", recent.length ? `${parsed.length}/${recent.length} parsate` : "n/a");
  } catch { add("detected", "UNKNOWN", ""); add("parsed", "UNKNOWN", ""); }

  // 3. IMPORTAT + RECONCILIAT (receivables staging).
  try {
    searched_sources.push("jarvis_state:ceo:receivables:staging");
    const recv = (await S.get("ceo:receivables:staging", null).catch(() => null));
    const cnt = Array.isArray(recv?.items) ? recv.items.length : Array.isArray(recv) ? recv.length : 0;
    if (cnt) observed_events.push(`imported:${cnt}`); else missing_observations.push("nimic importat in staging");
    if (recv?.import_error) confirmed_failures.push("import_error");
    add("imported", recv?.import_error ? "ERROR" : cnt ? "OBSERVED" : "NOT_OBSERVED", cnt ? `${cnt} importate` : "nimic importat");
    const reconciled = recv?.reconciled === true || recv?.trust === "RECONCILED";
    add("reconciled", recv?.reconcile_error ? "ERROR" : !cnt ? "NOT_OBSERVED" : reconciled ? "OBSERVED" : "PENDING", cnt ? (reconciled ? "reconciliat" : "importat, nereconciliat") : "n/a");
    if (recv?.reconcile_error) confirmed_failures.push("reconcile_error");
  } catch { add("imported", "UNKNOWN", ""); add("reconciled", "UNKNOWN", ""); }

  // ── VERDICT (taxonomie stricta) ──
  let verdict, verdict_basis, next_system_action, human_input_needed = false;
  const st = (k) => stages[k]?.status;

  if (confirmed_failures.some((f) => /parse_error/.test(f))) { verdict = "PARSING_FAILED"; verdict_basis = `error state confirmat: ${confirmed_failures.join(",")}`; next_system_action = "raporteaza eroarea de parsare + reincercare tehnica"; }
  else if (confirmed_failures.includes("import_error")) { verdict = "IMPORT_FAILED"; verdict_basis = "import cu error state confirmat"; next_system_action = "reia importul / raporteaza"; }
  else if (confirmed_failures.includes("reconcile_error")) { verdict = "RECONCILIATION_FAILED"; verdict_basis = "reconciliere cu error state confirmat"; next_system_action = "reia reconcilierea"; }
  else if (st("imported") === "OBSERVED" && st("reconciled") !== "OBSERVED") { verdict = "RECONCILIATION_PENDING"; verdict_basis = "importat, reconcilierea nu a rulat inca"; next_system_action = "ruleaza reconcilierea; discrepantele raman pentru Dana"; human_input_needed = true; }
  else if (st("upload") === "OBSERVED" && (st("parsed") === "PENDING" || st("parsed") === "NOT_OBSERVED")) { verdict = "UPLOAD_OBSERVED_PROCESSING_PENDING"; verdict_basis = "upload observat, procesarea inca in curs"; next_system_action = "asteapta/porneste procesarea; nu cere reincarcare"; }
  else if (declared_event && observed_events.every((e) => !/upload_observed/.test(e))) {
    // Declarat upload DAR nicio dovada de upload observabila → NU spune ca a esuat.
    verdict = "PIPELINE_NOT_OBSERVED"; verdict_basis = `utilizatorul declara upload, dar nu exista dovada in sursele verificate (${searched_sources.join(", ")}); ZERO error logs → nu se poate afirma esec`;
    next_system_action = "cauta in toate sursele accesibile; abia apoi cere info minima: 'in ce interfata l-ai incarcat?'"; human_input_needed = true; verdict = "HUMAN_INPUT_REQUIRED";
  }
  else if (st("source_fresh") === "STALE" && st("upload") === "OBSERVED") { verdict = "SOURCE_STALE"; verdict_basis = "pipeline ok dar ultima operatiune e veche"; next_system_action = "confirma daca exista extrase mai noi de incarcat"; }
  else if (st("upload") === "OBSERVED" && st("reconciled") === "OBSERVED" && st("source_fresh") === "OK") { verdict = "PIPELINE_OK"; verdict_basis = "lant complet + sursa proaspata"; next_system_action = "nimic"; }
  else { verdict = "INSUFFICIENT_EVIDENCE"; verdict_basis = "nu pot confirma starea pipeline-ului din sursele accesibile"; next_system_action = "cauta suplimentar; un upload care pare esuat NU dovedeste ca a esuat"; }

  const confidence = confirmed_failures.length ? "HIGH" : verdict === "HUMAN_INPUT_REQUIRED" ? "MEDIUM" : verdict === "INSUFFICIENT_EVIDENCE" ? "LOW" : "MEDIUM";

  return {
    at: new Date(nowMs).toISOString(), declared_event, observed_events, searched_sources,
    missing_observations, confirmed_failures, verdict, verdict_basis, next_system_action,
    human_input_needed, confidence, stages,
  };
}

/** Rezumat pentru prompt: verdict trasabil, fara a inventa esec tehnic. */
export function pipelineForPrompt(diag) {
  if (!diag?.verdict) return "";
  return (
    "DIAGNOSTIC PIPELINE SURSA (verdict TRASABIL — NU inventa esec tehnic):\n" +
    `- declarat de user: ${diag.declared_event || "nimic"}\n` +
    `- evenimente observate: ${diag.observed_events.join(", ") || "niciunul"}\n` +
    `- surse verificate: ${diag.searched_sources.join(", ")}\n` +
    `- esecuri CONFIRMATE (cu log): ${diag.confirmed_failures.join(", ") || "NICIUNUL"}\n` +
    `- VERDICT: ${diag.verdict} — ${diag.verdict_basis}\n` +
    `- urmatoarea actiune sistem: ${diag.next_system_action}\n` +
    "REGULA: 'extrasele nu au intrat/au esuat' se afirma DOAR cu esecuri confirmate. " +
    "Daca verdict=PIPELINE_NOT_OBSERVED/HUMAN_INPUT_REQUIRED: spune 'nu pot observa inca documentul in pipeline', NU 'a esuat'. " +
    "Nu spune 'am verificat' fara sa fi verificat efectiv sursele in acest tur."
  );
}
