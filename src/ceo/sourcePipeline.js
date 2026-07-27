// SOURCE PIPELINE DIAGNOSIS — cand o sursa pare stale ("am incarcat extrasele dar
// datele sunt vechi"), verifica LANTUL upload→detectat→parsat→importat→reconciliat
// INAINTE de a recomanda munca manuala. Nu compensa un bug de integrare prin rutina
// umana permanenta (P13). READ-ONLY (opsdb + jarvis_state staging). Best-effort.
import { getState } from "../state.js";

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const ageDays = (iso, nowMs) => (iso ? Math.round((nowMs - Date.parse(iso)) / 86_400_000) : null);

/** Detecteaza intrebari despre date stale / documente incarcate ce nu apar. */
export function asksPipeline(text) {
  const n = String(text || "").toLowerCase();
  return /(am incarcat|am urcat|am pus).{0,30}(extras|document|factur|fisier)|(extras|date|sold|cifr).{0,20}(vechi|stale|neactualiz|nu (apar|s-au actualizat))|de ce (sunt|apar) (vechi|stale)|nu vad (extras|documentele)/.test(n);
}

/**
 * Diagnostic al pipeline-ului de ingestie. @returns { stages, verdict, note }
 * stages: upload/detected/parsed/imported/reconciled/source_fresh — fiecare cu
 * status OK/STALE/MISSING/UNKNOWN + dovada. Verdict: TECHNICAL_BLOCK / HUMAN_GAP /
 * OK / UNKNOWN — ghideaza daca problema e tehnica (nu munca manuala) sau de proces.
 */
export async function diagnoseSourcePipeline({ nowMs = Date.now(), opsdata = null, store = null } = {}) {
  const S = store || { get: getState };
  const stages = {};
  const add = (k, status, evidence) => (stages[k] = { status, evidence });

  // 1. UPLOAD + freshness sursa banca (opsdb, read-only).
  let bankAgeDays = null, lastOpDays = null, uploadName = null;
  try {
    const ops = opsdata || (await import("../connectors/opsdata.js"));
    const summary = await ops.getBankStatementsSummary?.();
    if (isObj(summary)) {
      uploadName = summary.original_name || summary.latest?.original_name || null;
      bankAgeDays = ageDays(summary.created_at || summary.uploaded_at || summary.latest?.created_at, nowMs);
      lastOpDays = ageDays(summary.last_op || summary.max_op_date, nowMs);
    }
    add("upload", uploadName ? "OK" : "UNKNOWN", uploadName ? `ultimul extras incarcat: ${uploadName}${bankAgeDays != null ? ` (acum ${bankAgeDays}z)` : ""}` : "niciun extras vizibil in sursa");
    add("source_fresh", lastOpDays == null ? "UNKNOWN" : lastOpDays <= 7 ? "OK" : "STALE", lastOpDays != null ? `ultima operatiune bancara: acum ${lastOpDays} zile` : "vechime necunoscuta");
  } catch (e) { add("upload", "UNKNOWN", "opsdb indisponibil"); add("source_fresh", "UNKNOWN", e.message); }

  // 2. DETECTAT + PARSAT (staging documente JARVIS).
  try {
    const docs = (await S.get("ceo:documents", { items: [] }).catch(() => null)) || { items: [] };
    const items = Array.isArray(docs.items) ? docs.items : Array.isArray(docs) ? docs : [];
    const recent = items.slice(-5);
    add("detected", recent.length ? "OK" : "MISSING", recent.length ? `${recent.length} documente in staging` : "niciun document detectat in staging JARVIS");
    const parsed = recent.filter((d) => d.doc_type && d.doc_type !== "unknown");
    add("parsed", recent.length ? (parsed.length ? "OK" : "STALE") : "MISSING", recent.length ? `${parsed.length}/${recent.length} parsate cu tip` : "n/a");
  } catch { add("detected", "UNKNOWN", "staging indisponibil"); add("parsed", "UNKNOWN", ""); }

  // 3. IMPORTAT + RECONCILIAT (receivables staging).
  try {
    const recv = (await S.get("ceo:receivables:staging", null).catch(() => null));
    const cnt = Array.isArray(recv?.items) ? recv.items.length : Array.isArray(recv) ? recv.length : 0;
    add("imported", cnt ? "OK" : "MISSING", cnt ? `${cnt} inregistrari importate (staging)` : "nimic importat inca");
    const reconciled = recv?.reconciled === true || recv?.trust === "RECONCILED";
    add("reconciled", cnt ? (reconciled ? "OK" : "STALE") : "MISSING", cnt ? (reconciled ? "reconciliat" : "importat dar nereconciliat") : "n/a");
  } catch { add("imported", "UNKNOWN", ""); add("reconciled", "UNKNOWN", ""); }

  // Verdict: unde se rupe lantul?
  const order = ["upload", "detected", "parsed", "imported", "reconciled"];
  const firstBreak = order.find((k) => ["MISSING", "STALE"].includes(stages[k]?.status));
  let verdict, note;
  if (!firstBreak && stages.source_fresh?.status === "OK") { verdict = "OK"; note = "pipeline complet + sursa proaspata"; }
  else if (firstBreak && ["upload", "detected", "parsed", "imported"].includes(firstBreak)) {
    verdict = "TECHNICAL_BLOCK";
    note = `lantul se rupe la '${firstBreak}' — problema tehnica de integrare, NU de rezolvat prin rutina manuala. De verificat/reparat pipeline-ul inainte de a cere munca umana.`;
  } else if (firstBreak === "reconciled") { verdict = "HUMAN_GAP"; note = "datele sunt importate dar nereconciliate — aici un pas uman (Dana) rezolva discrepantele ramase."; }
  else { verdict = "UNKNOWN"; note = "nu pot confirma starea pipeline-ului; un upload care pare esuat NU dovedeste ca a esuat."; }

  return { at: new Date(nowMs).toISOString(), stages, verdict, note, breaks_at: firstBreak || null };
}

/** Rezumat pentru prompt: ghideaza JARVIS sa nu propuna munca manuala pe un bug. */
export function pipelineForPrompt(diag) {
  if (!diag?.stages) return "";
  const line = ["upload", "detected", "parsed", "imported", "reconciled", "source_fresh"]
    .map((k) => `${k}=${diag.stages[k]?.status || "?"}`).join(" · ");
  return (
    "DIAGNOSTIC PIPELINE SURSA (verifica intai, nu propune munca manuala pe un bug):\n" +
    line + `\nVERDICT: ${diag.verdict} — ${diag.note}\n` +
    "Daca verdict=TECHNICAL_BLOCK: problema e tehnica (integrare), nu o transforma in rutina manuala. " +
    "Daca HUMAN_GAP: doar discrepantele raman de rezolvat de om. Un upload care pare esuat nu dovedeste ca a esuat."
  );
}
