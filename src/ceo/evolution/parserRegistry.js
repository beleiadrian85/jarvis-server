// CEO SELF-EVOLUTION & CAPABILITY BUILDER — PARSER REGISTRY (§7).
// Registrul deterministic de parsere pentru Document Intake Pipeline (§5):
// CSV, JSON si XLSX sunt COMPLETE (parsere proprii, fara dependente externe;
// XLSX = capabilitate construita prin self-evolution, vezi ./xlsxParser.js);
// PDF / IMAGE se declara onest available:false si raporteaza
// PARSER_UNAVAILABLE (capability gap, §2 ANALYSIS_GAP) — nu simulam parsare.
// Modul PUR — zero IO, zero importuri de infrastructura; importuri permise:
// ./contract.js si ./xlsxParser.js. Date lipsa = null/gap explicit,
// niciodata inventate (missing != zero).

import { FILE_SECURITY_POLICY } from "./contract.js";
import { parseXlsx } from "./xlsxParser.js";

// ── Constante ───────────────────────────────────────────────────────────

// Limita dura de randuri pentru CSV: peste → truncare + meta.truncated=true.
export const CSV_MAX_ROWS = 50000;

// Mesajele standard pentru parserele fara biblioteca (capability gap onest).
const UNAVAILABLE_ERRORS = {
  PDF: "PARSER_UNAVAILABLE: biblioteca PDF lipseste — capability gap",
  IMAGE: "PARSER_UNAVAILABLE: biblioteca OCR pentru imagini lipseste — capability gap",
  OTHER: "PARSER_UNAVAILABLE: format nerecunoscut — capability gap",
};

// Numar cu virgula zecimala romaneasca — detectat la nivel de STRING.
// NU se converteste aici: conversia numerica e treaba schemaDiscovery (§8).
const RE_RO_DECIMAL = /^-?\d{1,3}(\.\d{3})*,\d{1,2}$|^-?\d+,\d{1,2}$/;

// ── Utilitare PURE ──────────────────────────────────────────────────────

function clamp01_100(n) {
  return Math.max(0, Math.min(100, n));
}

/** Extensia (lowercase, fara punct) sau "" daca lipseste. PUR. */
function extOf(filename) {
  const s = String(filename || "").toLowerCase();
  const i = s.lastIndexOf(".");
  return i > 0 && i < s.length - 1 ? s.slice(i + 1) : "";
}

/** Mime normalizat (lowercase, fara parametri gen "; charset=..."). PUR. */
function mimeOf(mime) {
  return String(mime || "").toLowerCase().split(";")[0].trim();
}

/** string sau Buffer/Uint8Array → text utf8; alt tip → null (gap explicit). */
function toText(data) {
  if (typeof data === "string") return data;
  if (data instanceof Uint8Array) {
    try {
      return new TextDecoder("utf-8").decode(data); // TextDecoder e global Node, nu IO
    } catch {
      return null;
    }
  }
  return null;
}

/** Scoate BOM-ul UTF-8 de la inceput, daca exista. PUR. */
function stripBom(text) {
  return text && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// ── CSV: parser determinist propriu (fara dependente) ───────────────────

/** Numara aparitiile unui caracter in afara ghilimelelor duble. PUR. */
function countOutsideQuotes(line, ch) {
  let n = 0;
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ; // escape-ul "" comuta de doua ori → net acelasi lucru
    else if (!inQ && c === ch) n++;
  }
  return n;
}

/** Auto-detectie separator pe primele linii ne-goale (max 10).
 *  Candidatii in ordinea preferintei la egalitate: ; tab , — fisierele
 *  cu zecimale romanesti folosesc frecvent ';' (virgula e zecimala).
 *  Heuristica e naiva fata de campuri quoted multi-linie (acceptabil
 *  pentru detectie); parsarea propriu-zisa le trateaza corect. PUR. */
function detectDelimiter(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0).slice(0, 10);
  if (!lines.length) return ",";
  const candidates = [";", "\t", ","];
  let bestChar = ",";
  let bestScore = -1;
  for (const ch of candidates) {
    const counts = lines.map((l) => countOutsideQuotes(l, ch));
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    const consistent = min === max && min > 0;
    // consistenta pe toate liniile bate simpla prezenta; min = semnal robust
    const score = (consistent ? 1000 : 0) + Math.max(0, min);
    if (score > bestScore) {
      bestScore = score;
      bestChar = ch;
    }
  }
  return bestScore > 0 ? bestChar : ",";
}

/** Masina de stari CSV: ghilimele duble cu escape "", CRLF/LF/CR,
 *  linii goale ignorate, limita CSV_MAX_ROWS cu truncare semnalata. PUR. */
function parseCsvText(text, delim) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  let truncated = false;

  const pushField = () => { row.push(field); field = ""; };
  const isBlankRow = (r) => r.length === 0 || (r.length === 1 && String(r[0]).trim() === "");
  const pushRow = () => {
    if (!isBlankRow(row)) rows.push(row); // liniile goale se ignora
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escape ""
        else inQuotes = false;
      } else {
        field += c; // inclusiv delimitatori si newline-uri din campuri quoted
      }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === delim) { pushField(); continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++; // CRLF = un singur newline
      pushField();
      pushRow();
      if (rows.length >= CSV_MAX_ROWS) {
        truncated = text.slice(i + 1).trim().length > 0; // mai era continut real
        break;
      }
      continue;
    }
    field += c;
  }
  if (!truncated && (field.length > 0 || row.length > 0)) {
    pushField();
    pushRow();
  }
  return { rows, truncated };
}

const csvParser = {
  format: "CSV",
  available: true,
  warnings: [],

  canParse({ filename = "", mime = "" } = {}) {
    const ext = extOf(filename);
    const m = mimeOf(mime);
    return ext === "csv" || ext === "tsv"
      || m === "text/csv" || m === "application/csv" || m === "text/tab-separated-values";
  },

  parse({ data, filename = "" } = {}) {
    void filename; // nefolosit la CSV — continutul decide totul
    const raw = toText(data);
    if (raw == null) {
      return { ok: false, error: "NO_DATA: date lipsa sau tip nesuportat (se accepta string sau Buffer)" };
    }
    const text = stripBom(raw);
    if (!text.trim()) return { ok: false, error: "NO_DATA: continut gol" };

    const delimiter = detectDelimiter(text);
    const { rows, truncated } = parseCsvText(text, delimiter);

    // detectie zecimala RO la nivel de STRING (esantion) — fara conversie (§8)
    let roCells = 0;
    for (const r of rows.slice(0, 500)) {
      for (const cell of r) {
        if (RE_RO_DECIMAL.test(String(cell).trim())) roCells++;
      }
    }
    return {
      ok: true,
      rows,
      meta: {
        delimiter: delimiter === "\t" ? "tab" : delimiter,
        row_count: rows.length,
        truncated,
        ro_decimal_cells: roCells,
        ro_decimal_detected: roCells > 0,
      },
    };
  },

  validate(parsed) {
    if (!parsed || parsed.ok !== true) {
      return { valid: false, warnings: [`PARSE_FAILED: ${parsed && parsed.error ? parsed.error : "necunoscut"}`] };
    }
    const rows = parsed.rows || [];
    const warnings = [];
    if (!rows.length) {
      warnings.push("EMPTY: zero randuri dupa parsare");
      return { valid: false, warnings };
    }
    const widths = new Set(rows.map((r) => r.length));
    if (widths.size > 1) {
      warnings.push(`RAGGED_ROWS: latimi de rand diferite (${[...widths].sort((a, b) => a - b).join(", ")})`);
    }
    if (parsed.meta && parsed.meta.truncated) {
      warnings.push(`TRUNCATED: peste ${CSV_MAX_ROWS} randuri — restul a fost taiat (meta.truncated=true)`);
    }
    if (rows[0] && rows[0].length <= 1 && rows.length > 1) {
      warnings.push("SINGLE_COLUMN: o singura coloana — posibil delimitator nedetectat");
    }
    return { valid: true, warnings };
  },

  normalize(parsed) {
    if (!parsed || parsed.ok !== true) return { rows: [], columns: [] };
    const rows = parsed.rows || [];
    if (!rows.length) return { rows: [], columns: [] };
    const width = Math.max(0, ...rows.map((r) => r.length));
    const columns = Array.from({ length: width }, (_, i) => `col_${i}`);
    // randurile mai scurte se completeaza cu "" (gap explicit, nu valoare inventata)
    const out = rows.map((r) => (r.length === width ? r : [...r, ...Array(width - r.length).fill("")]));
    return { rows: out, columns };
  },

  confidence(parsed) {
    if (!parsed || parsed.ok !== true) return 0;
    const rows = parsed.rows || [];
    if (!rows.length) return 0;
    let c = 90; // parser determinist — incredere mare cand structura e curata
    const w0 = rows[0].length;
    const raggedRatio = rows.filter((r) => r.length !== w0).length / rows.length;
    if (raggedRatio > 0) c -= Math.min(30, Math.round(raggedRatio * 100));
    if (w0 <= 1 && rows.length > 1) c -= 25; // posibil delimitator gresit
    if (parsed.meta && parsed.meta.truncated) c -= 10;
    return clamp01_100(c);
  },
};

// ── JSON: parser complet (array de obiecte sau obiect cu proprietate array) ─

const jsonParser = {
  format: "JSON",
  available: true,
  warnings: [],

  canParse({ filename = "", mime = "" } = {}) {
    const ext = extOf(filename);
    const m = mimeOf(mime);
    return ext === "json" || m === "application/json" || m === "text/json";
  },

  parse({ data, filename = "" } = {}) {
    void filename;
    const raw = toText(data);
    if (raw == null) {
      return { ok: false, error: "NO_DATA: date lipsa sau tip nesuportat (se accepta string sau Buffer)" };
    }
    const text = stripBom(raw);
    if (!text.trim()) return { ok: false, error: "NO_DATA: continut gol" };
    let value;
    try {
      value = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: `JSON_INVALID: ${e && e.message ? e.message : "parsare esuata"}` };
    }
    if (Array.isArray(value)) {
      return { ok: true, rows: value, meta: { root: "array", row_count: value.length } };
    }
    if (value && typeof value === "object") {
      // prima proprietate (in ordinea cheilor) a carei valoare e array
      const key = Object.keys(value).find((k) => Array.isArray(value[k]));
      if (key) {
        return { ok: true, rows: value[key], meta: { root: "object", property: key, row_count: value[key].length } };
      }
    }
    return { ok: false, error: "JSON_SHAPE: nu e array de obiecte si nici obiect cu o proprietate array" };
  },

  validate(parsed) {
    if (!parsed || parsed.ok !== true) {
      return { valid: false, warnings: [`PARSE_FAILED: ${parsed && parsed.error ? parsed.error : "necunoscut"}`] };
    }
    const rows = parsed.rows || [];
    const warnings = [];
    if (!rows.length) {
      warnings.push("EMPTY: zero inregistrari");
      return { valid: false, warnings };
    }
    const shapes = new Set(
      rows.map((r) => (Array.isArray(r) ? "array" : r && typeof r === "object" ? "object" : "scalar"))
    );
    if (shapes.size > 1) warnings.push(`MIXED_SHAPES: elemente de forme diferite (${[...shapes].sort().join(", ")})`);
    if (shapes.has("scalar")) warnings.push("SCALAR_ROWS: elemente care nu sunt obiecte/array-uri — date netabulare");
    return { valid: !shapes.has("scalar"), warnings };
  },

  normalize(parsed) {
    if (!parsed || parsed.ok !== true) return { rows: [], columns: [] };
    const rows = parsed.rows || [];
    if (!rows.length) return { rows: [], columns: [] };
    const first = rows[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      // mod obiect: coloanele = uniunea cheilor in ordinea primei aparitii;
      // elementele ne-obiect se sar (semnalate deja de validate ca MIXED_SHAPES)
      const columns = [];
      const objRows = rows.filter((r) => r && typeof r === "object" && !Array.isArray(r));
      for (const r of objRows) {
        for (const k of Object.keys(r)) {
          if (!columns.includes(k)) columns.push(k);
        }
      }
      return { rows: objRows, columns };
    }
    if (Array.isArray(first)) {
      const arrRows = rows.filter((r) => Array.isArray(r));
      const width = Math.max(0, ...arrRows.map((r) => r.length));
      const columns = Array.from({ length: width }, (_, i) => `col_${i}`);
      const out = arrRows.map((r) => (r.length === width ? r : [...r, ...Array(width - r.length).fill(null)]));
      return { rows: out, columns };
    }
    // scalari → o singura coloana (forma tabulara minimala, fara inventii)
    return { rows: rows.map((r) => [r]), columns: ["col_0"] };
  },

  confidence(parsed) {
    if (!parsed || parsed.ok !== true) return 0;
    const rows = parsed.rows || [];
    if (!rows.length) return 0;
    const sample = rows.slice(0, 1000);
    const first = sample[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      const objs = sample.filter((r) => r && typeof r === "object" && !Array.isArray(r));
      const union = new Set();
      for (const r of objs) for (const k of Object.keys(r)) union.add(k);
      if (!union.size) return 20;
      let cover = 0;
      for (const r of objs) cover += Object.keys(r).length / union.size;
      const consistency = objs.length ? cover / objs.length : 0; // 0..1
      let c = Math.round(50 + 45 * consistency);
      if (objs.length !== sample.length) c -= 20; // forme mixte
      return clamp01_100(c);
    }
    if (Array.isArray(first)) {
      const widths = new Set(sample.filter((r) => Array.isArray(r)).map((r) => r.length));
      return widths.size === 1 ? 85 : 65;
    }
    return 20; // scalari — abia tabular
  },
};

// ── Parsere indisponibile: recunosc formatul, dar raporteaza gap-ul onest ─

/** Fabrica de parser "available:false" — canParse recunoaste formatul,
 *  parse raporteaza PARSER_UNAVAILABLE (nu exista parsare simulata). PUR. */
function unavailableParser({ format, extensions = [], mimes = [], fallback = false }) {
  const error = UNAVAILABLE_ERRORS[format] || UNAVAILABLE_ERRORS.OTHER;
  return {
    format,
    available: false,
    warnings: [error],
    canParse({ filename = "", mime = "" } = {}) {
      if (fallback) return true; // OTHER prinde orice a ramas neprins
      return extensions.includes(extOf(filename)) || mimes.includes(mimeOf(mime));
    },
    parse() {
      return { ok: false, error };
    },
    validate(parsed) {
      void parsed;
      return { valid: false, warnings: [error] };
    },
    normalize(parsed) {
      void parsed;
      return { rows: [], columns: [] };
    },
    confidence(parsed) {
      void parsed;
      return 0;
    },
  };
}

// ── XLSX: parser complet propriu (capabilitate construita — ./xlsxParser.js) ─

/** data → Buffer pentru parserul binar: Buffer/Uint8Array trec direct;
 *  string-ul se interpreteaza ca base64 (transport uzual pentru binare);
 *  altceva → null (gap explicit). PUR. */
function toBinary(data) {
  if (data instanceof Uint8Array) return data; // include Buffer
  if (typeof data === "string" && data.length) {
    // XLSX nu poate veni ca text — daca e string, singura forma valida e base64
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(data)) {
      try {
        return Buffer.from(data, "base64");
      } catch {
        return null;
      }
    }
    return null;
  }
  return null;
}

const xlsxParser = {
  format: "XLSX",
  available: true,
  warnings: [],

  canParse({ filename = "", mime = "" } = {}) {
    const ext = extOf(filename);
    const m = mimeOf(mime);
    return ext === "xlsx" || ext === "xls"
      || m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      || m === "application/vnd.ms-excel";
  },

  parse({ data, filename = "" } = {}) {
    void filename; // continutul (arhiva ZIP) decide totul
    const buf = toBinary(data);
    if (buf == null) {
      return { ok: false, error: "NO_DATA: date lipsa sau tip nesuportat (se accepta Buffer sau base64)" };
    }
    return parseXlsx(buf); // nu arunca niciodata — { ok:false, error } la esec
  },

  validate(parsed) {
    if (!parsed || parsed.ok !== true) {
      return { valid: false, warnings: [`PARSE_FAILED: ${parsed && parsed.error ? parsed.error : "necunoscut"}`] };
    }
    const rows = parsed.rows || [];
    const warnings = [...(parsed.warnings || [])];
    const nonEmpty = rows.filter((r) => Array.isArray(r) && r.some((c) => c !== null && c !== undefined && String(c).trim() !== ""));
    if (!nonEmpty.length) {
      warnings.push("EMPTY: zero randuri cu continut dupa parsare");
      return { valid: false, warnings };
    }
    if (parsed.meta && parsed.meta.truncated) {
      warnings.push("TRUNCATED: peste limita de randuri — restul a fost taiat (meta.truncated=true)");
    }
    if (parsed.meta && Array.isArray(parsed.meta.date_candidates) && parsed.meta.date_candidates.length) {
      warnings.push(`DATE_CANDIDATES: coloanele ${parsed.meta.date_candidates.join(", ")} au format numeric de data (seriale Excel NEconvertite)`);
    }
    return { valid: true, warnings };
  },

  normalize(parsed) {
    if (!parsed || parsed.ok !== true) return { rows: [], columns: [] };
    const rows = parsed.rows || [];
    if (!rows.length) return { rows: [], columns: [] };
    const width = Math.max(0, ...rows.map((r) => (Array.isArray(r) ? r.length : 0)));
    const columns = Array.from({ length: width }, (_, i) => `col_${i}`);
    // randurile mai scurte se completeaza cu null (missing != zero, nu "")
    const out = rows.map((r) => {
      const base = Array.isArray(r) ? r : [];
      return base.length === width ? base : [...base, ...Array(width - base.length).fill(null)];
    });
    return { rows: out, columns };
  },

  confidence(parsed) {
    if (!parsed || parsed.ok !== true) return 0;
    const rows = parsed.rows || [];
    const cells = parsed.meta && typeof parsed.meta.cells === "number" ? parsed.meta.cells : 0;
    if (!rows.length || !cells) return 0;
    let c = 90; // parser determinist pe format binar strict — incredere mare
    const warnCount = (parsed.warnings || []).length;
    if (warnCount > 0) c -= Math.min(30, warnCount * 5); // fiecare avertisment scade increderea
    if (parsed.meta && parsed.meta.truncated) c -= 10;
    return clamp01_100(c);
  },
};

const pdfParser = unavailableParser({
  format: "PDF",
  extensions: ["pdf"],
  mimes: ["application/pdf"],
});

const imageParser = unavailableParser({
  format: "IMAGE",
  extensions: ["png", "jpg", "jpeg"],
  mimes: ["image/png", "image/jpeg"],
});

const otherParser = unavailableParser({ format: "OTHER", fallback: true });

// ── Registrul canonic (ordinea = ordinea de selectie) ───────────────────

export const PARSER_REGISTRY = [csvParser, jsonParser, xlsxParser, pdfParser, imageParser, otherParser];

/** Primul parser din registru care recunoaste fisierul, sau null. PUR. */
export function selectParser({ filename = "", mime = "" } = {}) {
  for (const parser of PARSER_REGISTRY) {
    if (parser.canParse({ filename, mime })) return parser;
  }
  return null;
}

/** Inventarul registrului — pentru capability reporting (§20). PUR. */
export function listParsers() {
  return PARSER_REGISTRY.map((p) => ({ format: p.format, available: p.available }));
}

// ── §34 — Verificarea de securitate a fisierului (FILE_SECURITY_POLICY) ─

/** Aplica politica de securitate din contract asupra metadatelor fisierului.
 *  Verifica: dimensiune, mime permis, extensii interzise (inclusiv duble),
 *  nume sanitizabil, fara cai in nume. PUR — nu citeste continutul. */
export function fileSecurityCheck({ filename = "", mime = "", size = 0 } = {}) {
  const P = FILE_SECURITY_POLICY;
  const violations = [];
  const name = String(filename || "");

  // nume prezent + fara separatoare de cale / traversare
  if (!name) violations.push("FILENAME_MISSING: lipseste numele fisierului");
  else if (/[\\/]|\.\./.test(name)) violations.push("PATH_IN_FILENAME: separatoare de cale sau '..' in nume");

  // dimensiune in limita politicii
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
    violations.push("SIZE_INVALID: dimensiune necunoscuta sau invalida");
  } else if (size > P.max_size_bytes) {
    violations.push(`SIZE_LIMIT: ${size} > ${P.max_size_bytes} bytes`);
  }

  // mime in lista alba
  const m = mimeOf(mime);
  if (!P.allowed_mime.includes(m)) {
    violations.push(`MIME_NOT_ALLOWED: ${m || "(lipsa)"}`);
  }

  // extensii interzise — inclusiv extensii duble (ex. raport.ps1.csv)
  const segments = name.toLowerCase().split(".").slice(1);
  const ext = segments.length ? segments[segments.length - 1] : "";
  if (P.forbidden_extensions.includes(ext)) {
    violations.push(`FORBIDDEN_EXTENSION: .${ext}`);
  }
  for (const seg of segments.slice(0, -1)) {
    if (P.forbidden_extensions.includes(seg)) {
      violations.push(`SUSPICIOUS_DOUBLE_EXTENSION: .${seg}`);
    }
  }

  // nume sanitizabil: dupa aplicarea politicii trebuie sa ramana ceva util
  if (name) {
    const sanitized = name.replace(P.filename_sanitize, "_");
    if (!/[a-z0-9]/i.test(sanitized.replace(/[._-]/g, ""))) {
      violations.push("FILENAME_UNSANITIZABLE: numele nu contine caractere valide dupa sanitizare");
    }
  }

  return { ok: violations.length === 0, violations };
}
