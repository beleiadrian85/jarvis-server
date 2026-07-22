// DOCUMENT INTAKE PIPELINE (§5, §34, §35) — motor PUR de ingestie documente.
// Rol: transforma un fisier brut (UNTRUSTED) intr-un dataset structurat cu
// nivel de incredere explicit, trecand IN ORDINE prin etapele INTAKE_STAGES
// din contract. ZERO IO: primeste totul prin argumente (parser registry
// injectat) si intoarce doar structuri de date. Date lipsa = null/gap
// explicit, niciodata inventate.
// §9: fiecare document primeste o memorie (document_memory) cu freshness
// (as_of obligatoriu) — un document vechi NU se confunda cu situatia actuala.

import { INTAKE_STAGES, FILE_SECURITY_POLICY, DATA_TRUST_LEVELS, slug } from "./contract.js";
import { fileSecurityCheck, selectParser } from "./parserRegistry.js";
import { discoverSchema, proposeMapping, extractDataset } from "./schemaDiscovery.js";

// ── Helperi locali (puri) ───────────────────────────────────────────────

/** Hash scurt determinist (acelasi algoritm ca crId din contract). */
function shortHash(s) {
  let h = 0;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** document_id determinist din filename + task_id (§9). */
function documentIdFor(filename, taskId) {
  const base = `${filename || "?"}|${taskId || "?"}`;
  return `doc:${slug(filename || "fisier", 24)}-${shortHash(base).slice(0, 6)}`;
}

/** Adauga o etapa in jurnal; etapa TREBUIE sa fie din INTAKE_STAGES. */
function pushStage(stages, stage, ok, note) {
  stages.push({ stage: INTAKE_STAGES.includes(stage) ? stage : "DATASET", ok, note });
}

/** Fallback local de securitate pe FILE_SECURITY_POLICY (§34) — folosit
 *  doar daca registrul injectat nu expune fileSecurityCheck. Conservator:
 *  ce nu se poate verifica se considera problema, nu se presupune curat. */
function localSecurityCheck(file = {}) {
  const problems = [];
  const name = String(file.filename || "");
  if (!name) problems.push("filename lipsa");
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  if (FILE_SECURITY_POLICY.forbidden_extensions.includes(ext)) problems.push(`extensie interzisa: ${ext}`);
  if (file.size == null) problems.push("size necunoscut");
  else if (file.size > FILE_SECURITY_POLICY.max_size_bytes) problems.push("depaseste limita de marime");
  if (file.mime == null) problems.push("mime necunoscut");
  else if (!FILE_SECURITY_POLICY.allowed_mime.includes(file.mime)) problems.push(`mime nepermis: ${file.mime}`);
  return { ok: problems.length === 0, note: problems.join("; ") || "ok" };
}

// ── §5 — Pipeline-ul de intake ──────────────────────────────────────────

export function runIntake({ file = {}, parsers = null, targetFields = [], asOf = null, providedBy = null, task_id = null } = {}) {
  const stages = [];
  const filename = file?.filename ?? null;
  const raw = { filename, mime: file?.mime ?? null, size: file?.size ?? null, trust: "UNTRUSTED" };

  // §9 — memoria documentului; freshness obligatorie.
  const warnings = [];
  if (!asOf) warnings.push("AS_OF necunoscut — nu confunda cu situatia actuala");
  const result = {
    stages,
    raw,
    parsed: null,
    schema: null,
    mapping: null,
    dataset: null,
    document_memory: {
      document_id: documentIdFor(filename, task_id),
      who_provided: providedBy ?? null,
      why_requested: file?.why_requested ?? null,
      task_id: task_id ?? null,
      as_of: asOf ?? null,
      validation: { status: "UNVALIDATED", warnings },
      downstream_usage: [],
      superseded_by: null,
    },
    blocked: null,
  };

  // ── 1) SECURE_FILE_INTAKE (§34) — esec = stop imediat ──
  let sec = null;
  try {
    sec = typeof fileSecurityCheck === "function" ? fileSecurityCheck(file) : localSecurityCheck(file);
  } catch (e) {
    sec = { ok: false, note: `verificare de securitate a esuat: ${e?.message || "eroare necunoscuta"}` };
  }
  const secOk = sec?.ok === true;
  pushStage(stages, "SECURE_FILE_INTAKE", secOk, secOk ? "fisier acceptat in carantina" : (sec?.note || "verificare de securitate esuata"));
  if (!secOk) {
    result.blocked = "SECURITY";
    result.document_memory.validation.status = "BLOCKED_SECURITY";
    return result;
  }

  // ── 2) TYPE_DETECTION + PARSER_SELECTION ──
  let sel = null;
  try {
    sel = typeof selectParser === "function" ? selectParser(file, parsers) : null;
  } catch {
    sel = null;
  }
  const detected = sel?.detected_type ?? sel?.type ?? raw.mime ?? null;
  pushStage(stages, "TYPE_DETECTION", detected != null, detected != null ? `tip detectat: ${detected}` : "tip necunoscut (gap)");

  // selectParser poate intoarce parserul direct sau {ok, parser}.
  const parser = sel && typeof sel.parse === "function" ? sel : sel?.parser ?? null;
  const parserOk = !!(parser && typeof parser.parse === "function" && sel?.ok !== false && parser.available !== false);
  if (!parserOk) {
    pushStage(stages, "PARSER_SELECTION", false,
      `parser indisponibil pentru "${detected ?? "tip necunoscut"}" — gap hint: DOCUMENT_PARSER (candidat de capability request)`);
    result.blocked = "PARSER_UNAVAILABLE";
    result.document_memory.validation.status = "PARSER_UNAVAILABLE";
    return result;
  }
  pushStage(stages, "PARSER_SELECTION", true, `parser selectat: ${parser.name || detected || "necunoscut"}`);

  // ── 3) STRUCTURE_EXTRACTION — parse ──
  let parsedRes = null;
  let parseNote = null;
  try {
    parsedRes = parser.parse(file) ?? null;
  } catch (e) {
    parseNote = `parser a esuat: ${e?.message || "eroare necunoscuta"}`;
  }
  const rows = Array.isArray(parsedRes?.rows) ? parsedRes.rows : Array.isArray(parsedRes) ? parsedRes : null;
  const rowsCount = parsedRes?.rows_count ?? (rows ? rows.length : null);
  const parseOk = parsedRes != null && parsedRes.ok !== false && rowsCount != null;
  pushStage(stages, "STRUCTURE_EXTRACTION", parseOk,
    parseOk ? `${rowsCount} randuri extrase` : (parseNote || parsedRes?.note || "extractie esuata — structura necunoscuta (gap)"));
  if (!parseOk) {
    result.blocked = "PARSE_FAILED";
    result.document_memory.validation.status = "PARSE_FAILED";
    return result;
  }
  result.parsed = { rows_count: rowsCount, trust: "UNVALIDATED" };

  // ── 4) VALIDATION — descoperirea structurii (schema) ──
  let schema = null;
  let schemaNote = null;
  try {
    schema = typeof discoverSchema === "function" ? discoverSchema({ rows: rows ?? [] }) ?? null : null;
  } catch (e) {
    schemaNote = `descoperirea schemei a esuat: ${e?.message || "eroare necunoscuta"}`;
  }
  const schemaOk = schema != null && schema.ok !== false;
  result.schema = schema;
  pushStage(stages, "VALIDATION", schemaOk,
    schemaOk ? "structura descoperita si coerenta" : (schemaNote || schema?.note || "schema necunoscuta (gap)"));
  if (!schemaOk) {
    result.blocked = "SCHEMA_DISCOVERY_FAILED";
    result.document_memory.validation.status = "SCHEMA_DISCOVERY_FAILED";
    return result;
  }

  // ── 5) CLASSIFICATION — coloanele clasificate (nu blocheaza) ──
  // discoverSchema expune coloanele in schema.header.columns / column_types.
  const cols = Array.isArray(schema?.header?.columns) ? schema.header.columns
    : Array.isArray(schema?.column_types) ? schema.column_types
    : Array.isArray(schema?.columns) ? schema.columns : null;
  pushStage(stages, "CLASSIFICATION", !!(cols && cols.length),
    cols && cols.length ? `${cols.length} coloane clasificate` : "coloane neclasificate (gap)");

  // ── 6) ENTITY_MATCHING — maparea pe campurile tinta ──
  let mapping = null;
  let mapNote = null;
  try {
    // proposeMapping asteapta argument OBIECT numit { schema, targetFields }.
    mapping = typeof proposeMapping === "function" ? proposeMapping({ schema, targetFields }) ?? null : null;
  } catch (e) {
    mapNote = `propunerea de mapare a esuat: ${e?.message || "eroare necunoscuta"}`;
  }
  result.mapping = mapping;
  if (mapping?.human_mapping_required === true) {
    // Nu e blocaj tehnic: e nevoie de confirmare umana. dataset ramane null.
    pushStage(stages, "ENTITY_MATCHING", false,
      "HUMAN_MAPPING_REQUIRED — maparea necesita confirmare umana; dataset amanat");
    result.document_memory.validation.status = "HUMAN_MAPPING_REQUIRED";
    return result;
  }
  const mappingOk = mapping != null && mapping.ok !== false;
  pushStage(stages, "ENTITY_MATCHING", mappingOk,
    mappingOk ? "campuri mapate automat pe campurile tinta" : (mapNote || mapping?.note || "mapare esuata (gap)"));
  if (!mappingOk) {
    result.blocked = "MAPPING_FAILED";
    result.document_memory.validation.status = "MAPPING_FAILED";
    return result;
  }

  // ── 7) RECONCILIATION + DATASET — extractia finala ──
  let ds = null;
  let dsNote = null;
  try {
    // extractDataset asteapta argument OBIECT numit { rows, schema, mapping }.
    ds = typeof extractDataset === "function"
      ? extractDataset({ rows: rows ?? [], schema, mapping: mapping?.mapping ?? mapping }) ?? null
      : null;
  } catch (e) {
    dsNote = `extractia dataset-ului a esuat: ${e?.message || "eroare necunoscuta"}`;
  }
  const recon = ds?.reconciliation ?? null;
  const reconOk = recon?.ok === true;
  pushStage(stages, "RECONCILIATION", reconOk,
    reconOk ? (recon.note || "reconciliere trecuta") : (recon ? (recon.note || "reconciliere picata") : "fara verificare de reconciliere (gap) — trust ramane UNVALIDATED"));

  const recordsCount = ds?.records_count ?? (Array.isArray(ds?.records) ? ds.records.length : null);
  const dsOk = ds != null && ds.ok !== false && recordsCount != null;
  if (!dsOk) {
    pushStage(stages, "DATASET", false, dsNote || ds?.note || "dataset indisponibil (gap)");
    result.blocked = "DATASET_EXTRACTION_FAILED";
    result.document_memory.validation.status = "DATASET_EXTRACTION_FAILED";
    return result;
  }
  // §35 — trust-ul NU se cosmetizeaza: declaratia valida a extractorului
  // are prioritate; altfel reconcilierea trecuta = VALIDATED; altfel UNVALIDATED.
  let trust = "UNVALIDATED";
  if (DATA_TRUST_LEVELS.includes(ds?.trust)) trust = ds.trust;
  else if (reconOk) trust = "VALIDATED";
  result.dataset = { records_count: recordsCount, trust };
  pushStage(stages, "DATASET", true, `${recordsCount} inregistrari, trust=${trust}`);
  result.document_memory.validation.status = trust;
  return result;
}
