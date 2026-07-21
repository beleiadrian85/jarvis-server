// CEO SELF-EVOLUTION & CAPABILITY BUILDER — SCHEMA DISCOVERY (§8).
// Peste randurile normalizate (array de array-uri sau de obiecte) descopera:
// antet, tipuri de coloane, rand de totaluri, format de data, moneda —
// apoi propune maparea catre campurile tinta. Increderea e explicita la
// fiecare pas; sub prag pe campurile obligatorii → human_mapping_required
// (§8: NU se scrie automat in datele canonice fara om in bucla).
// extractDataset pastreaza provenienta fiecarei valori (§5/§35) si NU
// converteste inferenta in fapt: trust ramane UNVALIDATED pana la validare.
// Modul PUR — zero IO; singurul import permis: ./contract.js.

import { DATA_TRUST_LEVELS } from "./contract.js";

// ── Constante ───────────────────────────────────────────────────────────

// Nivelul de incredere al datelor extrase — reutilizat din contract (§35).
const TRUST_UNVALIDATED = DATA_TRUST_LEVELS.find((t) => t === "UNVALIDATED") || "UNVALIDATED";

// Campuri obligatorii la mapare: sub prag → om in bucla (§8).
export const MANDATORY_TARGETS = ["client", "amount"];
export const MAPPING_CONFIDENCE_FLOOR = 60;

// Sinonime generice RO/EN pentru campurile tinta uzuale (fara nume proprii).
export const TARGET_SYNONYMS = {
  client: ["client", "clienti", "denumire", "partener", "beneficiar", "customer", "cumparator"],
  invoice: ["factura", "invoice", "document", "nr factura", "numar factura", "nr document", "serie"],
  invoice_date: ["data facturii", "data factura", "data emiterii", "data emitere", "invoice date", "data document", "data"],
  due_date: ["scadenta", "data scadenta", "data scadentei", "due date", "due", "termen", "termen plata"],
  amount: ["suma", "valoare", "amount", "total", "valoare totala", "suma totala", "brut"],
  collected: ["incasat", "collected", "platit", "achitat", "paid", "incasari"],
  remaining: ["rest", "sold", "remaining", "ramas", "rest de incasat", "de incasat", "balance", "restant"],
  currency: ["moneda", "currency", "valuta"],
  payment_date: ["data platii", "data plata", "data incasarii", "payment date", "data incasare"],
  status: ["status", "stare", "situatie", "state"],
};

// Tipul de coloana asteptat pentru fiecare camp tinta cunoscut.
export const EXPECTED_TYPES = {
  client: ["text"],
  invoice: ["text", "number"],
  invoice_date: ["date"],
  due_date: ["date"],
  amount: ["number", "currency"],
  collected: ["number", "currency"],
  remaining: ["number", "currency"],
  currency: ["text", "currency"],
  payment_date: ["date"],
  status: ["text"],
};

// ── Regex-uri de clasificare (la nivel de STRING, deterministe) ─────────

const RE_ISO = /^\d{4}-\d{2}-\d{2}([T ].*)?$/;          // 2026-07-21
const RE_DOT = /^([0-3]?\d)\.([01]?\d)\.(\d{4})$/;      // 21.07.2026 (conventie europeana → DMY)
const RE_SLASH = /^([0-3]?\d)\/([0-3]?\d)\/(\d{4})$/;   // 21/07/2026 sau 07/21/2026
const RE_NUM_PLAIN_INT = /^[-+]?\d+$/;                  // 1234 — ambiguu ca format, cert ca numar
const RE_NUM_EN = /^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$|^[-+]?\d+\.\d+$/; // 1,234.56 / 1.5
const RE_NUM_RO = /^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$|^[-+]?\d+,\d+$/;  // 1.234,56 / 12,5
const RE_CURRENCY_TOKEN = /(^|[^a-z])(lei|ron|eur|usd)([^a-z]|$)|[€$]/i;
const RE_HEADER_RON = /(^|[^a-z])(lei|ron)([^a-z]|$)/i;
const RE_HEADER_EUR = /(^|[^a-z])(eur|euro)([^a-z]|$)|€/;

// ── Utilitare PURE ──────────────────────────────────────────────────────

function clamp01_100(n) {
  return Math.max(0, Math.min(100, n));
}

/** Normalizare nume (lowercase, fara diacritice, doar litere/cifre/spatii). */
function normName(s) {
  return String(s || "").toLowerCase()
    .replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** Randuri (array-uri SAU obiecte) → matrice uniforma de celule.
 *  Pentru obiecte: coloanele = uniunea cheilor in ordinea primei aparitii
 *  (determinist); cheile devin antetul logic (row_index: null). PUR. */
function toMatrix(rows) {
  if (!Array.isArray(rows) || !rows.length) return { matrix: [], objColumns: null };
  const first = rows.find((r) => r != null);
  if (first == null) return { matrix: [], objColumns: null };
  if (Array.isArray(first)) {
    return { matrix: rows.map((r) => (Array.isArray(r) ? r : [r])), objColumns: null };
  }
  if (typeof first === "object") {
    const cols = [];
    for (const r of rows) {
      if (r && typeof r === "object" && !Array.isArray(r)) {
        for (const k of Object.keys(r)) {
          if (!cols.includes(k)) cols.push(k);
        }
      }
    }
    const matrix = rows.map((r) =>
      cols.map((k) => (r && typeof r === "object" && !Array.isArray(r) ? (k in r ? r[k] : null) : null))
    );
    return { matrix, objColumns: cols };
  }
  // scalari → o singura coloana
  return { matrix: rows.map((r) => [r]), objColumns: null };
}

/** Clasifica o celula: "empty" | "number" | "date" | "currency" | "text". PUR. */
function classifyCell(raw) {
  if (raw == null) return "empty";
  if (typeof raw === "number") return Number.isFinite(raw) ? "number" : "empty";
  const s = String(raw).trim();
  if (!s) return "empty";
  if (RE_ISO.test(s) || RE_DOT.test(s) || RE_SLASH.test(s)) return "date";
  // moneda: numar insotit de simbol/cod (ex. "1.234,56 lei", "€ 500")
  const compact = s.replace(/\s+/g, " ");
  if (RE_CURRENCY_TOKEN.test(compact) && /\d/.test(compact)
    && /^[-+]?[€$]?\s?[\d.,]+\s?(lei|ron|eur|usd|€|\$)?$/i.test(compact)) {
    return "currency";
  }
  if (RE_NUM_PLAIN_INT.test(s) || RE_NUM_EN.test(s) || RE_NUM_RO.test(s)) return "number";
  return "text";
}

/** Formatul numeric dominant din esantion: "RO" | "EN" | "UNKNOWN".
 *  Voteaza DOAR celulele neambigue (RO-nu-EN sau EN-nu-RO); egalitate
 *  sau zero voturi → UNKNOWN (nu ghicim). PUR. */
function detectNumberFormat(sampleRows) {
  let ro = 0;
  let en = 0;
  for (const r of sampleRows) {
    for (const c of r || []) {
      if (c == null || typeof c === "number") continue;
      const s = String(c).trim().replace(/(lei|ron|eur|usd)/gi, "").replace(/[€$\s]/g, "");
      if (!s) continue;
      const isRO = RE_NUM_RO.test(s);
      const isEN = RE_NUM_EN.test(s);
      if (isRO && !isEN) ro++;
      else if (isEN && !isRO) en++;
    }
  }
  if (ro > en) return "RO";
  if (en > ro) return "EN";
  return "UNKNOWN";
}

/** Parseaza o celula numerica dupa formatul dominant; ambiguu fara format
 *  dominant → null (gap explicit, nu valoare ghicita). PUR. */
function parseNumberCell(raw, numberFormat) {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim().replace(/(lei|ron|eur|usd)/gi, "").replace(/[€$\s]/g, "");
  if (!s) return null;
  if (RE_NUM_PLAIN_INT.test(s)) return parseInt(s, 10);
  const isRO = RE_NUM_RO.test(s);
  const isEN = RE_NUM_EN.test(s);
  const asRO = () => Number(s.replace(/\./g, "").replace(",", "."));
  const asEN = () => Number(s.replace(/,/g, ""));
  if (isRO && !isEN) return asRO();
  if (isEN && !isRO) return asEN();
  if (isRO && isEN) {
    if (numberFormat === "RO") return asRO();
    if (numberFormat === "EN") return asEN();
    return null;
  }
  return null;
}

// ── Detectie antet ──────────────────────────────────────────────────────

/** Primul rand cu >50% celule text ne-numerice, urmat de randuri cu tipuri
 *  consistente pe coloane (>=60% coloane cu tip dominant stabil). Scanare
 *  limitata la primele 8 randuri; fara randuri de date dupa candidat →
 *  antetul nu se confirma (null, nu ghicim). PUR. */
function detectHeader(matrix) {
  const scanLimit = Math.min(matrix.length - 1, 8);
  for (let i = 0; i < scanLimit; i++) {
    const cls = (matrix[i] || []).map((c) => classifyCell(c));
    const nonEmpty = cls.filter((c) => c !== "empty").length;
    if (nonEmpty < 2) continue; // o singura celula nu e antet credibil
    const textCount = cls.filter((c) => c === "text").length;
    if (textCount / nonEmpty <= 0.5) continue;

    const follow = matrix.slice(i + 1, i + 6);
    if (!follow.length) continue;
    const width = matrix[i].length;
    let consistentCols = 0;
    let checkedCols = 0;
    for (let ci = 0; ci < width; ci++) {
      const tally = {};
      let n = 0;
      for (const r of follow) {
        const k = classifyCell(r ? r[ci] : null);
        if (k === "empty") continue;
        tally[k] = (tally[k] || 0) + 1;
        n++;
      }
      if (!n) continue;
      checkedCols++;
      if (Math.max(...Object.values(tally)) / n >= 0.6) consistentCols++;
    }
    if (!checkedCols || consistentCols / checkedCols < 0.6) continue;

    const columns = matrix[i].map((c, idx) => {
      const s = c == null ? "" : String(c).trim();
      return s || `col_${idx}`;
    });
    // dedup nume duplicate — determinist, cu sufix de index
    const seen = new Set();
    for (let k = 0; k < columns.length; k++) {
      if (seen.has(columns[k])) columns[k] = `${columns[k]}_${k}`;
      else seen.add(columns[k]);
    }
    return { row_index: i, columns };
  }
  return null;
}

// ── Inferenta tipurilor de coloane ──────────────────────────────────────

function inferColumnTypes(sampleRows, width, headerColumns, numberFormat) {
  const out = [];
  for (let ci = 0; ci < width; ci++) {
    const name = headerColumns ? headerColumns[ci] || `col_${ci}` : `col_${ci}`;
    const tally = { number: 0, date: 0, currency: 0, text: 0 };
    let nonEmpty = 0;
    for (const r of sampleRows) {
      const k = classifyCell(r ? r[ci] : null);
      if (k === "empty") continue;
      tally[k]++;
      nonEmpty++;
    }
    if (!nonEmpty) {
      out.push({ index: ci, name, type: "empty", confidence: 100, evidence: "0 celule cu continut in esantion" });
      continue;
    }
    let type = "text";
    let best = -1;
    for (const k of ["number", "date", "currency", "text"]) {
      if (tally[k] > best) { best = tally[k]; type = k; }
    }
    let evidence = `${best}/${nonEmpty} celule '${type}'`;
    // antet cu indiciu de moneda + celule numerice → coloana de tip currency
    if (type === "number" && (RE_HEADER_RON.test(name) || RE_HEADER_EUR.test(name))) {
      type = "currency";
      evidence = `${best}/${nonEmpty} celule numerice + indiciu de moneda in antet ('${name}')`;
    } else if (type === "number" && numberFormat !== "UNKNOWN") {
      evidence += ` (format ${numberFormat})`;
    }
    out.push({
      index: ci,
      name,
      type,
      confidence: clamp01_100(Math.round((best / nonEmpty) * 100)),
      evidence,
    });
  }
  return out;
}

// ── Detectie rand de totaluri ───────────────────────────────────────────

/** Ultimul rand e totaluri daca: (a) prima celula text contine "total",
 *  sau (b) majoritatea coloanelor numerice au suma randurilor de date
 *  aproximativ egala cu ultimul rand (toleranta ±1%). PUR. */
function detectTotals(matrix, dataStart, columnTypes, numberFormat) {
  const lastIdx = matrix.length - 1;
  if (lastIdx - dataStart < 2) return null; // prea putine randuri ca sa existe totaluri
  const last = matrix[lastIdx] || [];

  const firstText = last.find((c) => classifyCell(c) === "text");
  if (firstText != null && /total/i.test(String(firstText))) {
    return { index: lastIdx, evidence: `prima celula text ('${String(firstText).trim()}') contine 'total'` };
  }

  const numCols = columnTypes
    .filter((ct) => ct.type === "number" || ct.type === "currency")
    .map((ct) => ct.index);
  if (!numCols.length) return null;

  let checked = 0;
  let matched = 0;
  for (const ci of numCols) {
    const lastVal = parseNumberCell(last[ci], numberFormat);
    if (lastVal == null) continue;
    let sum = 0;
    let cnt = 0;
    for (let r = dataStart; r < lastIdx; r++) {
      const v = parseNumberCell(matrix[r] ? matrix[r][ci] : null, numberFormat);
      if (v != null) { sum += v; cnt++; }
    }
    if (cnt < 2) continue;
    checked++;
    const tol = Math.max(Math.abs(sum) * 0.01, 0.01);
    if (Math.abs(sum - lastVal) <= tol) matched++;
  }
  if (checked && matched / checked > 0.5) {
    return { index: lastIdx, evidence: `${matched}/${checked} coloane numerice: suma randurilor = ultimul rand (toleranta 1%)` };
  }
  return null;
}

// ── Detectie format de data si moneda ───────────────────────────────────

/** Voteaza doar celulele neambigue; slash cu ambele componente <=12 nu
 *  voteaza. Zero voturi → UNKNOWN. PUR. */
function detectDateFormat(sampleRows) {
  let iso = 0;
  let dmy = 0;
  let mdy = 0;
  for (const r of sampleRows) {
    for (const c of r || []) {
      if (c == null) continue;
      const s = String(c).trim();
      if (RE_ISO.test(s)) { iso++; continue; }
      if (RE_DOT.test(s)) { dmy++; continue; } // punctele = conventie europeana DD.MM.YYYY
      const m = RE_SLASH.exec(s);
      if (m) {
        const a = parseInt(m[1], 10);
        const b = parseInt(m[2], 10);
        if (a > 12 && b <= 12) dmy++;
        else if (b > 12 && a <= 12) mdy++;
        // ambele <=12 → ambiguu, fara vot
      }
    }
  }
  const max = Math.max(iso, dmy, mdy);
  if (!max) return "UNKNOWN";
  if (iso === max) return "ISO";
  if (dmy === max) return "DMY";
  return "MDY";
}

function detectCurrency(sampleRows, headerColumns) {
  let ron = 0;
  let eur = 0;
  const sources = [];

  let headRon = 0;
  let headEur = 0;
  for (const nameRaw of headerColumns || []) {
    const s = String(nameRaw || "");
    if (RE_HEADER_RON.test(s)) headRon++;
    if (RE_HEADER_EUR.test(s)) headEur++;
  }
  if (headRon || headEur) sources.push("antet");

  let cellRon = 0;
  let cellEur = 0;
  for (const r of sampleRows) {
    for (const c of r || []) {
      if (c == null) continue;
      const s = String(c);
      if (!/\d/.test(s)) continue; // doar celule cu cifre (valori, nu etichete)
      if (RE_HEADER_RON.test(s)) cellRon++;
      if (RE_HEADER_EUR.test(s)) cellEur++;
    }
  }
  if (cellRon || cellEur) sources.push("celule");

  ron = headRon + cellRon;
  eur = headEur + cellEur;
  if (!ron && !eur) return { code: "UNKNOWN", evidence: null };
  if (ron === eur) return { code: "UNKNOWN", evidence: `indicii mixte: RON=${ron}, EUR=${eur} (${sources.join("+")})` };
  return ron > eur
    ? { code: "RON", evidence: `${ron} indicii RON (${sources.join("+")})` }
    : { code: "EUR", evidence: `${eur} indicii EUR (${sources.join("+")})` };
}

// ── §8 — DESCOPERIREA SCHEMEI ───────────────────────────────────────────

export function discoverSchema({ rows = [], maxSample = 200 } = {}) {
  const emptyResult = {
    header: null,
    column_types: [],
    totals_row: null,
    date_format: "UNKNOWN",
    currency: { code: "UNKNOWN", evidence: null },
    sample_size: 0,
    confidence: 0,
  };
  const { matrix, objColumns } = toMatrix(rows);
  if (!matrix.length) return emptyResult;
  const cap = Math.max(1, Math.floor(Number(maxSample) || 200));

  // antet: la obiecte cheile SUNT antetul (row_index: null); la array-uri
  // se detecteaza primul rand-antet plauzibil
  let header = null;
  let dataStart = 0;
  if (objColumns) {
    header = { row_index: null, columns: objColumns };
  } else {
    header = detectHeader(matrix);
    if (header) dataStart = header.row_index + 1;
  }

  const dataRows = matrix.slice(dataStart);
  const sampleRows = dataRows.slice(0, cap);
  const width = Math.max(header ? header.columns.length : 0, ...sampleRows.map((r) => (r ? r.length : 0)), 0);
  if (!width || !sampleRows.length) return { ...emptyResult, header };

  const numberFormat = detectNumberFormat(sampleRows);
  const column_types = inferColumnTypes(sampleRows, width, header ? header.columns : null, numberFormat);
  const totals_row = detectTotals(matrix, dataStart, column_types, numberFormat);
  const date_format = detectDateFormat(sampleRows);
  const currency = detectCurrency(sampleRows, header ? header.columns : null);

  // incredere globala: media increderii pe coloanele tipizate (pondere 0.6)
  // + bonus antet (25) + bonus marime esantion (max 15) — determinist
  const typed = column_types.filter((c) => c.type !== "empty");
  const avgCol = typed.length ? typed.reduce((a, c) => a + c.confidence, 0) / typed.length : 0;
  let confidence = 0.6 * avgCol;
  if (header) confidence += 25;
  confidence += Math.min(15, sampleRows.length);
  confidence = clamp01_100(Math.round(confidence));

  return {
    header,
    column_types,
    totals_row,
    date_format,
    currency,
    sample_size: sampleRows.length,
    confidence,
  };
}

// ── §8 — PROPUNEREA DE MAPARE (om in bucla sub prag) ────────────────────

/** Scor de potrivire nume coloana vs sinonimele tintei: 60 exact,
 *  45 sinonim continut in nume, 40 nume continut in sinonim, 30 token comun. */
function nameMatchScore(target, colName) {
  const syns = TARGET_SYNONYMS[target] || [target];
  const col = normName(colName);
  if (!col) return { score: 0, syn: null };
  let best = 0;
  let bestSyn = null;
  for (const raw of syns) {
    const syn = normName(raw);
    if (!syn) continue;
    let s = 0;
    if (col === syn) s = 60;
    else if (` ${col} `.includes(` ${syn} `)) s = 45;
    else if (syn.length >= 4 && ` ${syn} `.includes(` ${col} `)) s = 40;
    else {
      const colTokens = new Set(col.split(" "));
      if (syn.split(" ").some((t) => t.length >= 4 && colTokens.has(t))) s = 30;
    }
    if (s > best) { best = s; bestSyn = syn; }
  }
  return { score: best, syn: bestSyn };
}

function typeMatchBonus(target, colType) {
  const expected = EXPECTED_TYPES[target];
  if (!expected) return 10; // tinta necunoscuta — doar bonus mic, decide numele
  return expected.includes(colType) ? 30 : 0;
}

export function proposeMapping({ schema = {}, targetFields = [] } = {}) {
  const columns = Array.isArray(schema.column_types) ? schema.column_types : [];
  const targets = Array.isArray(targetFields) ? targetFields.filter((t) => typeof t === "string" && t) : [];
  // fara tinte sau fara coloane → nu exista mapare automata sigura
  if (!targets.length || !columns.length) {
    return {
      mapping: targets.map((target) => ({ target, column_index: null, confidence: 0, why: "fara schema/coloane de mapat" })),
      overall_confidence: 0,
      human_mapping_required: true,
    };
  }

  // candidati nume+tip pentru fiecare pereche tinta x coloana
  const candidates = [];
  targets.forEach((target, ti) => {
    for (const col of columns) {
      if (!col || typeof col.index !== "number" || col.type === "empty") continue;
      const nm = nameMatchScore(target, col.name);
      if (nm.score <= 0) continue;
      const bonus = typeMatchBonus(target, col.type);
      const expected = EXPECTED_TYPES[target];
      const typeNote = !expected ? "tip neverificat" : bonus > 0 ? `tip '${col.type}' compatibil` : `tip '${col.type}' NEcompatibil`;
      candidates.push({
        target,
        ti,
        ci: col.index,
        score: nm.score + bonus,
        why: `nume '${col.name}' ~ sinonim '${nm.syn}' (scor ${nm.score}) + ${typeNote}`,
      });
    }
  });

  // atribuire lacoma, unica pe coloana — determinist (scor, apoi ordinea
  // tintelor, apoi indexul coloanei)
  candidates.sort((a, b) => b.score - a.score || a.ti - b.ti || a.ci - b.ci);
  const byTarget = new Map();
  const usedCols = new Set();
  for (const c of candidates) {
    if (byTarget.has(c.target) || usedCols.has(c.ci)) continue;
    byTarget.set(c.target, c);
    usedCols.add(c.ci);
  }

  // fallback: tinta fara nume potrivit, dar exista EXACT o coloana libera
  // cu tipul asteptat → propunere slaba (scor 40, tot sub pragul de 60)
  for (const target of targets) {
    if (byTarget.has(target)) continue;
    const expected = EXPECTED_TYPES[target];
    if (!expected) continue;
    const free = columns.filter(
      (c) => c && typeof c.index === "number" && !usedCols.has(c.index) && expected.includes(c.type)
    );
    if (free.length === 1) {
      byTarget.set(target, {
        target,
        ci: free[0].index,
        score: 40,
        why: `singura coloana libera cu tip compatibil ('${free[0].type}': '${free[0].name}')`,
      });
      usedCols.add(free[0].index);
    }
  }

  const mapping = targets.map((target) => {
    const hit = byTarget.get(target);
    if (!hit) return { target, column_index: null, confidence: 0, why: "nicio coloana compatibila (gap explicit)" };
    return {
      target,
      column_index: hit.ci,
      confidence: Math.min(95, clamp01_100(Math.round(hit.score))), // niciodata 100 din inferenta
      why: hit.why,
    };
  });

  const overall_confidence = Math.round(mapping.reduce((a, m) => a + m.confidence, 0) / mapping.length);

  // §8: incredere sub prag pe campurile obligatorii → omul decide maparea
  const human_mapping_required = MANDATORY_TARGETS.some((t) => {
    if (!targets.includes(t)) return false;
    const m = mapping.find((x) => x.target === t);
    return !m || m.confidence < MAPPING_CONFIDENCE_FLOOR;
  });

  return { mapping, overall_confidence, human_mapping_required };
}

// ── §5/§35 — EXTRAGEREA DATASET-ULUI CU PROVENIENTA ─────────────────────

/** Fiecare valoare extrasa poarta provenienta (SOURCE_ROW = indexul absolut
 *  in rows) si increderea maparii. Valorile raman STRING brut (trim) — NU
 *  se convertesc: inferenta nu devine fapt; trust = UNVALIDATED, validarea
 *  e un pas separat. Celula goala → VALUE null, CONFIDENCE 0 (gap explicit). */
export function extractDataset({ rows = [], schema = {}, mapping = [] } = {}) {
  const warnings = [];
  const { matrix } = toMatrix(rows);

  const headerIdx = schema.header && typeof schema.header.row_index === "number" ? schema.header.row_index : null;
  const totalsIdx = schema.totals_row && typeof schema.totals_row.index === "number" ? schema.totals_row.index : null;
  const start = headerIdx != null ? headerIdx + 1 : 0;

  if (!matrix.length) {
    warnings.push("NO_ROWS: zero randuri de intrare");
    return { records: [], warnings, trust: TRUST_UNVALIDATED };
  }
  if (headerIdx == null) {
    warnings.push("HEADER_ABSENT: fara antet detectat — maparea pe indecsi de coloana este nesigura");
  }
  if (totalsIdx != null) {
    warnings.push(`TOTALS_EXCLUDED: randul ${totalsIdx} (totaluri) exclus din inregistrari`);
  }

  const useful = (Array.isArray(mapping) ? mapping : []).filter(
    (m) => m && typeof m.target === "string" && m.target && typeof m.column_index === "number"
  );
  if (!useful.length) {
    warnings.push("MAPPING_EMPTY: nicio coloana mapata — zero inregistrari extrase");
    return { records: [], warnings, trust: TRUST_UNVALIDATED };
  }

  const records = [];
  let emptyCells = 0;
  for (let r = start; r < matrix.length; r++) {
    if (r === totalsIdx) continue;
    const row = matrix[r];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue; // randuri goale — nu inventam inregistrari
    const rec = {};
    for (const m of useful) {
      const raw = row[m.column_index];
      const s = raw == null ? "" : String(raw).trim();
      if (!s) {
        emptyCells++;
        rec[m.target] = { VALUE: null, SOURCE_ROW: r, CONFIDENCE: 0 };
      } else {
        rec[m.target] = {
          VALUE: s,
          SOURCE_ROW: r,
          CONFIDENCE: clamp01_100(Math.round(Number(m.confidence) || 0)),
        };
      }
    }
    records.push(rec);
  }
  if (emptyCells) {
    warnings.push(`EMPTY_CELLS: ${emptyCells} celule goale — VALUE null (gap explicit, valorile nu se inventeaza)`);
  }

  return { records, warnings, trust: TRUST_UNVALIDATED };
}
