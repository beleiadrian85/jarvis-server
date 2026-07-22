// CEO SELF-EVOLUTION & CAPABILITY BUILDER — XLSX PARSER (capabilitate construita).
// Parser XLSX DETERMINIST, pur JavaScript, FARA dependente externe:
// singurele module permise sunt node:zlib (inflateRawSync) si node:buffer.
// XLSX = arhiva ZIP cu XML-uri OOXML; parsam manual structura ZIP
// (EOCD → Central Directory → Local Headers) si extragem:
//   xl/workbook.xml            → lista sheets + r:id
//   xl/_rels/workbook.xml.rels → maparea rId → target (calea sheet-ului)
//   xl/sharedStrings.xml       → stringurile partajate (<si> cu <t> multiple)
//   xl/styles.xml (OPTIONAL)   → numFmtId pentru coloane candidate de data
//   primul sheet               → celulele propriu-zise
// REGULI: missing != zero (celula lipsa → null, niciodata 0); datele Excel
// seriale NU se convertesc automat (raman numere; coloanele cu format de
// data se marcheaza best-effort in meta.date_candidates); parseXlsx NU
// arunca niciodata — orice esec devine { ok:false, error }.

import { inflateRawSync } from "node:zlib";
import { Buffer } from "node:buffer";

// ── Constante ───────────────────────────────────────────────────────────

// Limita dura de randuri (aliniata cu CSV_MAX_ROWS din parserRegistry).
export const XLSX_MAX_ROWS = 50000;

// Semnaturi ZIP (little-endian).
const SIG_EOCD = 0x06054b50; // End of Central Directory
const SIG_CDIR = 0x02014b50; // Central Directory entry
const SIG_LOCAL = 0x04034b50; // Local file header

// numFmtId built-in Excel care reprezinta date/ore (best effort).
const BUILTIN_DATE_NUMFMT = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

// ── Utilitare ZIP ───────────────────────────────────────────────────────

/** Cauta End of Central Directory de la coada (comentariul ZIP poate avea
 *  pana la 65535 bytes). Returneaza offsetul EOCD sau -1. */
function findEocd(buf) {
  const min = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

/** Extrage toate intrarile din arhiva ZIP → Map(nume → Buffer decomprimat).
 *  Arunca Error cu mesaj clar la structura invalida (prins in parseXlsx). */
function readZipEntries(buf) {
  if (!buf || buf.length < 22) throw new Error("ZIP_INVALID: fisier prea mic pentru o arhiva ZIP");
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error("ZIP_INVALID: lipseste End of Central Directory (nu e arhiva ZIP)");

  const entryCount = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  // ZIP64: campurile pe 16/32 biti sunt saturate — nesuportat (fisiere <15MB oricum)
  if (entryCount === 0xffff || cdOffset === 0xffffffff) throw new Error("ZIP64 nesuportat");
  if (cdOffset >= buf.length) throw new Error("ZIP_INVALID: offset Central Directory in afara fisierului");

  const entries = new Map();
  let p = cdOffset;
  for (let n = 0; n < entryCount; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CDIR) {
      throw new Error("ZIP_INVALID: intrare Central Directory corupta");
    }
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    if (compSize === 0xffffffff || uncompSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error("ZIP64 nesuportat");
    }
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    // local header: nameLen/extraLen locale pot diferi de cele centrale
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== SIG_LOCAL) {
      throw new Error(`ZIP_INVALID: local header corupt pentru '${name}'`);
    }
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    if (dataStart + compSize > buf.length) {
      throw new Error(`ZIP_INVALID: date trunchiate pentru '${name}'`);
    }
    const raw = buf.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 8) data = inflateRawSync(raw); // DEFLATE
    else if (method === 0) data = Buffer.from(raw); // STORE (copie raw)
    else throw new Error(`ZIP_METHOD: metoda de compresie ${method} nesuportata pentru '${name}'`);
    entries.set(name, data);
  }
  return entries;
}

// ── Utilitare XML (regex robust pe structura OOXML cunoscuta) ───────────

/** Decodeaza entitatile XML de baza + referintele numerice &#N; / &#xN;. */
export function decodeXmlEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Valoarea atributului dintr-un sir de atribute (orice ordine, ghilimele
 *  simple sau duble) sau null daca lipseste. */
function attrOf(attrs, name) {
  // numele poate contine ':' (ex. r:id) — se escapeaza pentru regex
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?:^|\\s)${esc}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  if (!m) return null;
  return decodeXmlEntities(m[1] != null ? m[1] : m[2]);
}

/** Concateneaza toate textele <t>...</t> dintr-un fragment (un <si> poate
 *  avea mai multe run-uri <r><t>..</t></r>; <t/> self-closing = gol). */
function concatT(xml) {
  let out = "";
  const re = /<t\b[^>]*?(\/>|>([\s\S]*?)<\/t>)/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    if (m[2] != null) out += decodeXmlEntities(m[2]);
  }
  return out;
}

// ── Referinta celulei (A1, BC23) → indexi deterministi ──────────────────

/** "BC23" → { col: 54, row: 22 } (indexi 0-based) sau null daca invalida. */
export function cellRefToIndex(ref) {
  const m = /^([A-Z]{1,3})(\d+)$/.exec(String(ref || "").toUpperCase());
  if (!m) return null;
  let col = 0;
  for (let i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64);
  const row = parseInt(m[2], 10);
  if (!Number.isFinite(row) || row < 1) return null;
  return { col: col - 1, row: row - 1 };
}

// ── Parsarea partilor OOXML ─────────────────────────────────────────────

/** xl/workbook.xml → [{ name, rid }] in ordinea din fisier. */
function parseWorkbookSheets(xml) {
  const sheets = [];
  const re = /<sheet\b([^>]*?)\/?>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const name = attrOf(m[1], "name");
    const rid = attrOf(m[1], "r:id");
    if (name != null) sheets.push({ name, rid });
  }
  return sheets;
}

/** xl/_rels/workbook.xml.rels → Map(rId → cale absoluta in arhiva). */
function parseRels(xml) {
  const rels = new Map();
  const re = /<Relationship\b([^>]*?)\/?>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const id = attrOf(m[1], "Id");
    let target = attrOf(m[1], "Target");
    if (!id || !target) continue;
    // targeturile sunt relative la xl/ (sau absolute cu '/')
    if (target.startsWith("/")) target = target.slice(1);
    else target = `xl/${target}`;
    // normalizeaza eventualele "xl/./worksheets" → "xl/worksheets"
    target = target.replace(/\/\.\//g, "/");
    rels.set(id, target);
  }
  return rels;
}

/** xl/sharedStrings.xml → array de stringuri (fiecare <si> → un string). */
function parseSharedStrings(xml) {
  const out = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml)) !== null) out.push(concatT(m[1]));
  return out;
}

/** xl/styles.xml (best effort) → array styleIndex → esteFormatDeData.
 *  Se uita la cellXfs/<xf numFmtId=..>: built-in de data sau numFmt custom
 *  al carui formatCode contine tokeni de data (d/m/y/h) in afara "..." . */
function parseStyleDateFlags(xml) {
  // numFmt custom: id → formatCode
  const customDate = new Set();
  const reFmt = /<numFmt\b([^>]*?)\/?>/g;
  let m;
  while ((m = reFmt.exec(xml)) !== null) {
    const id = Number(attrOf(m[1], "numFmtId"));
    const code = attrOf(m[1], "formatCode") || "";
    // scoate portiunile literale "..." si [..] apoi cauta tokeni de data
    const bare = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
    if (Number.isFinite(id) && /[dmyh]/i.test(bare) && !/[#0?]/.test(bare)) customDate.add(id);
  }
  // cellXfs: lista <xf> in ordine = indexul de stil al celulelor (atributul s)
  const flags = [];
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!cellXfs) return flags;
  const reXf = /<xf\b([^>]*?)\/?>/g;
  while ((m = reXf.exec(cellXfs[1])) !== null) {
    const id = Number(attrOf(m[1], "numFmtId"));
    flags.push(Number.isFinite(id) && (BUILTIN_DATE_NUMFMT.has(id) || customDate.has(id)));
  }
  return flags;
}

/** Parseaza celulele unui sheet OOXML → randuri aliniate pe index de coloana.
 *  Celula/randul lipsa → null (missing != zero). */
function parseSheetCells(xml, { sharedStrings, styleDateFlags, warnings }) {
  const sparse = []; // sparse[row][col]
  const dateCols = new Set();
  let cells = 0;
  let truncated = false;
  let autoRow = 0; // fallback cand atributul r lipseste
  let autoCol = 0;

  // atentie: <c .../> self-closing SAU <c ...>...</c> — atribute in orice ordine
  const re = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    const inner = m[2] || "";
    const ref = attrOf(attrs, "r");
    let pos = ref ? cellRefToIndex(ref) : null;
    if (!pos) {
      // fara referinta valida: avanseaza determinist pe ultimul rand cunoscut
      pos = { row: autoRow, col: autoCol };
      if (ref) warnings.push(`CELL_REF_INVALID: referinta '${ref}' ignorata (pozitionare secventiala)`);
    }
    autoRow = pos.row;
    autoCol = pos.col + 1;

    if (pos.row >= XLSX_MAX_ROWS) { truncated = true; continue; }

    const t = attrOf(attrs, "t");
    const vMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
    const vRaw = vMatch ? vMatch[1] : null;

    let value = null;
    if (t === "s") {
      const idx = vRaw == null ? NaN : Number(decodeXmlEntities(vRaw).trim());
      if (Number.isFinite(idx) && idx >= 0 && idx < sharedStrings.length) value = sharedStrings[idx];
      else { warnings.push(`SHARED_STRING_MISSING: index '${vRaw}' in afara tabelei`); value = null; }
    } else if (t === "str") {
      value = vRaw == null ? null : decodeXmlEntities(vRaw);
    } else if (t === "inlineStr") {
      value = concatT(inner);
    } else if (t === "b") {
      value = vRaw == null ? null : decodeXmlEntities(vRaw).trim() === "1";
    } else if (t === "e") {
      value = null; // celula cu eroare Excel (#DIV/0! etc.) → gap explicit
      warnings.push(`CELL_ERROR: celula ${ref || `r${pos.row + 1}c${pos.col + 1}`} contine o eroare Excel`);
    } else {
      // fara t sau t="n" → numar; NU se converteste serialul de data automat
      if (vRaw != null) {
        const n = Number(decodeXmlEntities(vRaw).trim());
        value = Number.isFinite(n) ? n : null;
        if (value === null) warnings.push(`NUMBER_INVALID: valoarea '${vRaw}' nu e numar`);
      }
    }

    // marcheaza coloanele cu format numeric de data (best effort din styles)
    if (styleDateFlags.length && (t == null || t === "n") && vRaw != null) {
      const s = Number(attrOf(attrs, "s"));
      if (Number.isFinite(s) && styleDateFlags[s]) dateCols.add(pos.col);
    }

    if (!sparse[pos.row]) sparse[pos.row] = [];
    sparse[pos.row][pos.col] = value;
    cells++;
  }

  // sparse → dens: golurile (celule/randuri lipsa) devin null, NU 0
  const rows = [];
  for (let r = 0; r < sparse.length; r++) {
    const src = sparse[r];
    if (!src) { rows.push([]); continue; } // rand complet lipsa
    const row = [];
    for (let c = 0; c < src.length; c++) row.push(c in src && src[c] !== undefined ? src[c] : null);
    rows.push(row);
  }
  return { rows, cells, truncated, date_candidates: [...dateCols].sort((a, b) => a - b) };
}

// ── API PRINCIPAL ───────────────────────────────────────────────────────

/** Parseaza un fisier XLSX (Buffer/Uint8Array) → structura tabulara.
 *  NU arunca niciodata: orice esec → { ok:false, error }. Determinist. */
export function parseXlsx(buf) {
  try {
    if (typeof buf === "string") {
      return { ok: false, error: "NO_DATA: se asteapta Buffer/Uint8Array, nu string" };
    }
    if (!(buf instanceof Uint8Array)) {
      return { ok: false, error: "NO_DATA: date lipsa sau tip nesuportat (se accepta Buffer)" };
    }
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
    const entries = readZipEntries(b);
    const warnings = [];

    // workbook + rels → lista de sheets si target-ul primului sheet
    const wbXml = entries.has("xl/workbook.xml") ? entries.get("xl/workbook.xml").toString("utf8") : null;
    const relsXml = entries.has("xl/_rels/workbook.xml.rels")
      ? entries.get("xl/_rels/workbook.xml.rels").toString("utf8") : null;
    const sheetList = wbXml ? parseWorkbookSheets(wbXml) : [];
    const rels = relsXml ? parseRels(relsXml) : new Map();
    if (!wbXml) warnings.push("WORKBOOK_MISSING: xl/workbook.xml lipseste — fallback pe sheet1");

    // primul sheet: target-ul din rels sau fallback conventional
    let sheetPath = null;
    let sheetName = null;
    if (sheetList.length) {
      sheetName = sheetList[0].name;
      if (sheetList[0].rid && rels.has(sheetList[0].rid)) sheetPath = rels.get(sheetList[0].rid);
    }
    if (!sheetPath || !entries.has(sheetPath)) {
      if (entries.has("xl/worksheets/sheet1.xml")) {
        if (sheetPath) warnings.push(`SHEET_TARGET_MISSING: '${sheetPath}' lipseste — fallback pe sheet1.xml`);
        sheetPath = "xl/worksheets/sheet1.xml";
      } else {
        return { ok: false, error: "XLSX_INVALID: niciun worksheet gasit in arhiva" };
      }
    }
    if (!sheetName) sheetName = "Sheet1";

    // shared strings (optional — sheeturile pot fi doar numerice/inline)
    const sharedStrings = entries.has("xl/sharedStrings.xml")
      ? parseSharedStrings(entries.get("xl/sharedStrings.xml").toString("utf8")) : [];

    // styles (OPTIONAL, best effort) — doar pentru date_candidates
    let styleDateFlags = [];
    if (entries.has("xl/styles.xml")) {
      try {
        styleDateFlags = parseStyleDateFlags(entries.get("xl/styles.xml").toString("utf8"));
      } catch {
        styleDateFlags = []; // best effort: styles corupt nu strica parsarea
      }
    }

    const sheetXml = entries.get(sheetPath).toString("utf8");
    const { rows, cells, truncated, date_candidates } = parseSheetCells(sheetXml, {
      sharedStrings, styleDateFlags, warnings,
    });

    return {
      ok: true,
      rows,
      sheet_name: sheetName,
      sheets: sheetList.length ? sheetList.map((s) => s.name) : [sheetName],
      warnings,
      meta: {
        shared_strings: sharedStrings.length,
        cells,
        truncated,
        date_candidates,
      },
    };
  } catch (e) {
    const msg = e && e.message ? e.message : "esec necunoscut";
    // mesajele ZIP64/ZIP_INVALID trec ca atare; restul primesc prefix
    const error = /^(ZIP|XLSX)/.test(msg) || msg === "ZIP64 nesuportat" ? msg : `XLSX_PARSE_ERROR: ${msg}`;
    return { ok: false, error };
  }
}
