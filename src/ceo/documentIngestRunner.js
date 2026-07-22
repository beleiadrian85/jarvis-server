// DOCUMENT INGEST RUNNER (PARTEA III + XIV) — singurul strat cu IO al pipeline-
// ului de documente. Citeste READ-ONLY atasamentele task-urilor create de CEO
// din Operational (tabelele attachments + file_blobs), le trece prin motorul
// PUR runIntake (securitate → parser → schema → dataset), le clasifica, le
// valideaza si le pastreaza in stratul PROPRIU JARVIS (jarvis_state, cheia
// ceo:documents) — NICIODATA nu scrie in Operational. Datele extrase raman
// staging pana la validare; nevoia originala se re-verifica separat.
// Missing ≠ zero; raw upload ≠ trusted data.
import { getState, setState } from "../state.js";
import { audit } from "../audit.js";
import { STATE_KEYS as NERVOUS_KEYS } from "./nervous/contract.js";

const DOCS_KEY = "ceo:documents";           // stratul propriu (staging + memorie doc)
const INGESTED_KEY = "ceo:documents:seen";   // hash-uri deja procesate (idempotent)
const RECV_KEY = "ceo:receivables:staging";  // creantele importate (staging JARVIS, zero Operational)

/** Atasamentele pe task-urile create de CEO (read-only, best-effort). */
async function readCeoAttachments(taskIds) {
  if (!taskIds.length) return [];
  try {
    const { opsQuery, hasOpsDb } = await import("../supervisor/opsdb.js");
    if (!hasOpsDb) return [];
    // Doar task-urile CEO; blobul vine din file_blobs (BYTEA) pe filename.
    const rows = await opsQuery(
      `SELECT a.task_id, a.filename, a.original_name, a.uploaded_by, a.created_at,
              fb.data, fb.mime, fb.size
         FROM attachments a
         JOIN file_blobs fb ON fb.filename = a.filename
        WHERE a.task_id = ANY($1)`,
      [taskIds]
    );
    return rows || [];
  } catch { return []; }
}

/** Hash determinist scurt pentru idempotenta (task+filename+size). */
function docHash(a) {
  const s = `${a.task_id}|${a.filename}|${a.size ?? ""}`;
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `doc:${(h >>> 0).toString(36)}`;
}

/**
 * Ingesteaza documentele noi atasate task-urilor CEO. persist=false → dry-run.
 * Returneaza { ran, ingested: [...], summary }. Nu arunca niciodata.
 */
export async function ingestPendingDocuments({ persist = true, nowISO = null, attachments: injAtt = null, store = null, registry: injReg = null } = {}) {
  try {
    const S = store || { get: getState, set: setState };
    const now = nowISO || new Date().toISOString();
    const registry = injReg || (await S.get(NERVOUS_KEYS.tasks, {})) || {};
    const ceoTaskIds = Object.values(registry).map((r) => r.operational_id).filter(Boolean);
    const attachments = injAtt || await readCeoAttachments(ceoTaskIds);
    if (!attachments.length) return { ran: true, ingested: [], summary: "0 documente pe task-urile CEO" };

    const seen = (await S.get(INGESTED_KEY, {})) || {};
    const docs = (await S.get(DOCS_KEY, {})) || {};
    const { runIntake } = await import("./evolution/documentIntake.js");
    let classify = null, validate = null, freshness = null;
    try {
      const reg = await import("./evolution/documentTypeRegistry.js");
      classify = reg.classifyDocument; validate = reg.validateDataset; freshness = reg.freshnessCheck;
    } catch { /* registry optional — intake ruleaza si fara clasificare */ }

    const ingested = [];
    for (const a of attachments) {
      const hash = docHash(a);
      if (seen[hash]) continue; // idempotent: un document nu se ingesteaza de 2x

      const buf = a.data instanceof Buffer ? a.data : (a.data?.data ? Buffer.from(a.data.data) : null);
      const file = { filename: a.original_name || a.filename, mime: a.mime || "", size: a.size ?? (buf ? buf.length : 0), data: buf };
      const rec = registry[Object.keys(registry).find((k) => registry[k].operational_id === a.task_id)] || {};

      let intake = null, classification = null, validation = null, fresh = null;
      try {
        intake = runIntake({ file, task_id: a.task_id, providedBy: a.uploaded_by, asOf: a.created_at || now, targetFields: ["client", "invoice", "amount", "collected", "remaining", "currency", "status"] });
        if (classify && intake?.schema) {
          classification = classify({ filename: file.filename, schema: intake.schema, mapping: intake.mapping });
          if (validate && intake?.dataset) validation = validate({ doc_type: classification.doc_type, records: intake.dataset.records || [], schema: intake.schema });
          if (freshness) fresh = freshness({ doc_type: classification?.doc_type, document_date: a.created_at || null, nowISO: now });
        }
      } catch (e) { intake = { blocked: e.message }; }

      // RECEIVABLES_IMPORTER (§4): un document de tip CUSTOMER_RECEIVABLES
      // devine dataset canonic de creante + reconciliere — STAGING JARVIS only.
      let receivables = null;
      if (classification?.doc_type === "CUSTOMER_RECEIVABLES" && Array.isArray(intake?.dataset?.records) && intake.dataset.records.length) {
        try {
          const { importReceivables, reconcileReceivables } = await import("./evolution/receivablesImporter.js");
          const imp = importReceivables({ records: intake.dataset.records, docType: "CUSTOMER_RECEIVABLES", documentDate: a.created_at || null, source: "operational_attachment" });
          // Reconciliere read-only fata de facturile din Operational (zero corectie).
          let opsInv = [];
          try { const { getIncomeInvoices } = await import("../connectors/opsdata.js"); opsInv = (await getIncomeInvoices()) || []; } catch { opsInv = []; }
          const rec2 = reconcileReceivables({ imported: imp.receivables, operationalInvoices: opsInv.map((i) => ({ ref: i.ref, client: i.client, amountRON: i.amountRON })) });
          receivables = { imported_count: imp.receivables.length, trust: rec2.trust_after || imp.trust, reconciliation: rec2.summary, reconciliation_need: rec2.reconciliation_need, data_quality: imp.data_quality };
          // Persistam datasetul de creante in stratul propriu (nu Operational).
          const stg = (await S.get(RECV_KEY, {})) || {};
          stg[hash] = { document_id: hash, as_of: imp.as_of, receivables: imp.receivables, trust: receivables.trust, reconciliation: rec2.summary, at: now };
          if (persist) await S.set(RECV_KEY, stg).catch(() => {});
        } catch (e) { receivables = { error: e.message }; }
      }

      const entry = {
        document_id: hash, task_id: a.task_id, need_id: rec.need_id || null,
        source: "operational_attachment", uploaded_by: a.uploaded_by, uploaded_at: a.created_at,
        document_date: a.created_at || null, filename: file.filename, mime: file.mime, size: file.size,
        doc_type: classification?.doc_type || "UNKNOWN_DOCUMENT", classification_confidence: classification?.confidence ?? null,
        parser_stages: intake?.stages || null, blocked: intake?.blocked || null,
        records_count: intake?.dataset?.records_count ?? 0,
        trust: receivables?.trust || (validation?.valid ? validation.trust : (intake?.dataset?.trust || "UNVALIDATED")),
        validation_issues: validation?.issues || [], freshness: fresh || null,
        needs_human_mapping: intake?.mapping?.human_mapping_required === true,
        receivables, at: now,
      };
      docs[hash] = entry;
      seen[hash] = { at: now, task_id: a.task_id };
      ingested.push(entry);
    }

    if (persist && ingested.length) {
      await S.set(DOCS_KEY, docs).catch(() => {});
      await S.set(INGESTED_KEY, seen).catch(() => {});
      await audit("document_ingest", `${ingested.length} documente noi din task-uri CEO (staging, zero write Operational)`, ingested.map((d) => `${d.filename}→${d.doc_type}[${d.trust}]`).join("; ").slice(0, 400), true).catch(() => {});
    }
    return {
      ran: true, ingested,
      summary: ingested.length ? `${ingested.length} documente ingestate (staging): ${ingested.map((d) => `${d.doc_type}/${d.trust}`).join(", ")}` : "0 documente noi",
    };
  } catch (e) {
    return { ran: false, error: e.message, ingested: [] };
  }
}

/** Vederea documentelor pentru ORGANISM/UI (read-only). */
export async function documentsView() {
  const docs = (await getState(DOCS_KEY, {})) || {};
  return Object.values(docs).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 30);
}

/** Creantele importate din documente (staging JARVIS). Consumate de Cash
 *  Intelligence DOAR daca trust in DECISION_GRADE_TRUST — read-only. */
export async function receivablesStaging() {
  const stg = (await getState(RECV_KEY, {})) || {};
  return Object.values(stg).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
