// RECEIVABLES IMPORTER — prima capabilitate reala din backlogul self-evolution.
// Transforma un document "Situatie Clienti / Incasari" (deja extras in records)
// intr-un dataset canonic de creante, consumabil de receivablesEngine ca
// `incomeInvoices`. STAGING JARVIS ONLY — zero write in Operational/SmartBill/
// contabilitate; modulul doar CITESTE si NORMALIZEAZA.
//
// Principii (§5/§8/§35): missing != zero (camp lipsa → null, NU 0); inferenta
// nu devine fapt (fara reconciliere trust ramane cel mult VALIDATED);
// divergentele NU se corecteaza automat — se grupeaza intr-un singur
// reconciliation_need. Roluri GENERICE, zero nume de companie/oameni (§32).
//
// Modul PUR — importa DOAR ./contract.js, ./documentTypeRegistry.js si
// ../receivablesEngine.js (module pure). Zero IO: fara state/audit/opsdb/config.

import { DATA_TRUST_LEVELS, DECISION_GRADE_TRUST } from "./contract.js";
import { validateDataset } from "./documentTypeRegistry.js";
import { buildReceivablesRegister, confirmedForCash } from "../receivablesEngine.js";

// ── Constante de incredere (reutilizate din contract, §35) ──────────────
const TRUST_UNVALIDATED = DATA_TRUST_LEVELS.find((t) => t === "UNVALIDATED") || "UNVALIDATED";
const TRUST_VALIDATED = DATA_TRUST_LEVELS.find((t) => t === "VALIDATED") || "VALIDATED";
const TRUST_RECONCILED = "RECONCILED";

// Toleranta la compararea sumelor comune (reconciliere): ±1%.
const AMOUNT_TOLERANCE_RATIO = 0.01;

// ── Numere: parsare RO "1.234,56" / EN "1,234.56" determinista ──────────
// Regex-uri identice cu schemaDiscovery pentru consistenta pe tot organismul.
const RE_NUM_PLAIN_INT = /^[-+]?\d+$/;
const RE_NUM_EN = /^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$|^[-+]?\d+\.\d+$/; // 1,234.56 / 1.5
const RE_NUM_RO = /^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$|^[-+]?\d+,\d+$/;  // 1.234,56 / 12,5

/** Curata o valoare bruta de moneda/spatii inainte de parsare. PUR. */
function cleanNum(raw) {
  return String(raw).trim().replace(/(lei|ron|eur|usd)/gi, "").replace(/[€$\s]/g, "");
}

function finite(n) {
  return Number.isFinite(n) ? n : null;
}

/** Formatul numeric dominant din esantion: "RO" | "EN" | "UNKNOWN".
 *  Voteaza DOAR valorile neambigue; egalitate/zero voturi → UNKNOWN. PUR. */
function detectAmountFormat(values) {
  let ro = 0;
  let en = 0;
  for (const v of values) {
    if (v == null || typeof v === "number") continue;
    const s = cleanNum(v);
    if (!s) continue;
    const isRO = RE_NUM_RO.test(s);
    const isEN = RE_NUM_EN.test(s);
    if (isRO && !isEN) ro++;
    else if (isEN && !isRO) en++;
  }
  if (ro > en) return "RO";
  if (en > ro) return "EN";
  return "UNKNOWN";
}

/** Parseaza o valoare numerica dupa formatul dominant; ambiguu fara format
 *  → null (gap explicit, nu valoare ghicita — missing != zero). PUR. */
function parseAmount(raw, format = "UNKNOWN") {
  if (raw == null) return null;
  if (typeof raw === "number") return finite(raw);
  const s = cleanNum(raw);
  if (!s) return null;
  if (RE_NUM_PLAIN_INT.test(s)) return finite(parseInt(s, 10));
  const isRO = RE_NUM_RO.test(s);
  const isEN = RE_NUM_EN.test(s);
  const asRO = () => Number(s.replace(/\./g, "").replace(",", "."));
  const asEN = () => Number(s.replace(/,/g, ""));
  if (isRO && !isEN) return finite(asRO());
  if (isEN && !isRO) return finite(asEN());
  if (isRO && isEN) {
    if (format === "RO") return finite(asRO());
    if (format === "EN") return finite(asEN());
    return null; // ambiguu fara format dominant → gap explicit
  }
  return null;
}

// ── Date: ISO / DD.MM.YYYY / DD/MM/YYYY (conventie europeana DMY) ────────
const RE_DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})([T ].*)?$/;
const RE_DATE_DOT = /^([0-3]?\d)\.([01]?\d)\.(\d{4})$/;
const RE_DATE_SLASH = /^([0-3]?\d)\/([01]?\d)\/(\d{4})$/;

/** Data bruta → {ms, iso} sau null. Slash-ul = conventie europeana. PUR. */
function parseDate(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  let m = RE_DATE_ISO.exec(s);
  if (m) {
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return Number.isFinite(t) ? { ms: t, iso: `${m[1]}-${m[2]}-${m[3]}` } : null;
  }
  m = RE_DATE_DOT.exec(s) || RE_DATE_SLASH.exec(s);
  if (m) {
    const d = +m[1];
    const mo = +m[2];
    const y = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const t = Date.UTC(y, mo - 1, d);
    if (!Number.isFinite(t)) return null;
    const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return { ms: t, iso };
  }
  return null;
}

// ── Provenienta: suporta forma {VALUE,SOURCE_ROW,CONFIDENCE} SI plata ────

/** Extrage {value, source_row, confidence} dintr-un camp cu sau fara
 *  provenienta. Gol/lipsa → value null (missing != zero). PUR. */
function unwrap(v) {
  if (v != null && typeof v === "object" && !Array.isArray(v) && "VALUE" in v) {
    const val = v.VALUE == null || String(v.VALUE).trim() === "" ? null : v.VALUE;
    return {
      value: val,
      source_row: v.SOURCE_ROW ?? null,
      confidence: typeof v.CONFIDENCE === "number" ? v.CONFIDENCE : null,
    };
  }
  const val = v == null || String(v).trim() === "" ? null : v;
  return { value: val, source_row: null, confidence: null };
}

/** Primul camp prezent dintr-o lista de nume alternativi. PUR. */
function pick(rec, names) {
  for (const n of names) {
    if (rec && typeof rec === "object" && n in rec && rec[n] != null) {
      const u = unwrap(rec[n]);
      if (u.value != null) return u;
    }
  }
  return { value: null, source_row: null, confidence: null };
}

// Aliasuri acceptate pentru fiecare camp tinta (records din extractDataset
// folosesc target-urile; records plate pot folosi camelCase).
const FIELD_ALIASES = {
  client: ["client", "clienti", "denumire", "partener"],
  invoice: ["invoice", "ref", "factura", "nr_factura"],
  amount: ["amount", "amountRON", "suma", "valoare", "total"],
  collected: ["collected", "collectedRON", "incasat", "platit", "achitat"],
  remaining: ["remaining", "remainingRON", "rest", "sold", "restant"],
  due: ["due_date", "dueDate", "due", "scadenta", "termen"],
  currency: ["currency", "moneda", "valuta"],
  status: ["status", "stare", "situatie"],
};

function normText(s) {
  return String(s || "").toLowerCase()
    .replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// ── 1. IMPORT: records → creante canonice ───────────────────────────────

/**
 * Normalizeaza records (plate SAU cu provenienta) in creante canonice.
 * @returns {{receivables, trust, as_of, warnings, stats, data_quality}}
 */
export function importReceivables({ records = [], docType = "CUSTOMER_RECEIVABLES", documentDate = null, source = null } = {}) {
  const warnings = [];
  const recs = Array.isArray(records) ? records.filter((r) => r && typeof r === "object") : [];
  const asOf = documentDate;
  const asOfDate = parseDate(asOf);
  const asOfMs = asOfDate ? asOfDate.ms : null;
  if (asOf && asOfMs == null) warnings.push("AS_OF_UNPARSEABLE: data documentului neparseabila — statusul OVERDUE nu se poate deriva");

  // Detectie format numeric pe tot esantionul (determinist, o singura data).
  const rawAmounts = [];
  for (const r of recs) {
    for (const key of ["amount", "collected", "remaining"]) {
      rawAmounts.push(pick(r, FIELD_ALIASES[key]).value);
    }
  }
  const numberFormat = detectAmountFormat(rawAmounts);

  const receivables = [];
  const seenRefs = new Map();
  let missing_client = 0;
  let missing_amount = 0;
  let missing_due = 0;

  for (const r of recs) {
    const clientU = pick(r, FIELD_ALIASES.client);
    const invoiceU = pick(r, FIELD_ALIASES.invoice);
    const amountU = pick(r, FIELD_ALIASES.amount);
    const collectedU = pick(r, FIELD_ALIASES.collected);
    const remainingU = pick(r, FIELD_ALIASES.remaining);
    const dueU = pick(r, FIELD_ALIASES.due);
    const currencyU = pick(r, FIELD_ALIASES.currency);
    const statusU = pick(r, FIELD_ALIASES.status);

    const client = clientU.value != null ? String(clientU.value).trim() : null;
    const invoice = invoiceU.value != null ? String(invoiceU.value).trim() : null;
    let amountRON = parseAmount(amountU.value, numberFormat);
    let collectedRON = parseAmount(collectedU.value, numberFormat);
    let remainingRON = parseAmount(remainingU.value, numberFormat);

    // Derivare NON-inventiva: doar daca doua din trei exista (§ missing != zero).
    if (collectedRON == null && amountRON != null && remainingRON != null) {
      collectedRON = amountRON - remainingRON;
    } else if (remainingRON == null && amountRON != null && collectedRON != null) {
      remainingRON = amountRON - collectedRON;
    }
    // remaining implicit = amount cand nu exista incasare cunoscuta ramane
    // NEDERIVAT aici (nu inventam a treia din una) — engine trateaza null.

    const due = parseDate(dueU.value);
    const dueDate = due ? due.iso : null;
    const currency = currencyU.value != null ? String(currencyU.value).trim().toUpperCase() : null;

    // Status derivat — aliniat cu buildReceivablesRegister.
    let status;
    if (remainingRON != null && remainingRON <= 0) status = "COLLECTED";
    else if (due && asOfMs != null && due.ms < asOfMs) status = "OVERDUE";
    else if (dueDate) status = "CONFIRMED";
    else status = "UNKNOWN";
    // Status explicit de "platit/achitat" cand nu avem rest cunoscut → COLLECTED.
    if (status === "UNKNOWN" && statusU.value != null && /platit|achitat|incasat|collected|paid/.test(normText(statusU.value))) {
      status = "COLLECTED";
    }

    if (client == null) missing_client++;
    if (amountRON == null) missing_amount++;
    if (dueDate == null) missing_due++;

    // Confidence agregat = minimul increderilor prezente (cel mai slab camp).
    const confs = [clientU.confidence, amountU.confidence, invoiceU.confidence].filter((c) => typeof c === "number");
    const confidence = confs.length ? Math.min(...confs) : null;
    const source_row = clientU.source_row ?? amountU.source_row ?? invoiceU.source_row ?? null;

    const rec = {
      client,
      invoice,
      ref: invoice, // ref = invoice (compat cu buildReceivablesRegister)
      amountRON,
      remainingRON,
      collectedRON,
      dueDate,
      status,
      currency,
      source_row,
      confidence,
      VALUE_meta: {
        client: { source_row: clientU.source_row, confidence: clientU.confidence },
        amount: { source_row: amountU.source_row, confidence: amountU.confidence },
        due: { source_row: dueU.source_row, confidence: dueU.confidence },
      },
    };
    receivables.push(rec);

    if (invoice) {
      const key = normText(invoice);
      if (key) seenRefs.set(key, (seenRefs.get(key) || 0) + 1);
    }
  }

  let duplicates = 0;
  for (const n of seenRefs.values()) if (n > 1) duplicates += n - 1;
  if (duplicates) warnings.push(`DUPLICATE_INVOICES: ${duplicates} facturi duplicate — de reconciliat, nu se corecteaza automat`);
  if (missing_amount) warnings.push(`MISSING_AMOUNT: ${missing_amount} inregistrari fara suma parseabila (VALUE null, nu 0)`);
  if (missing_client) warnings.push(`MISSING_CLIENT: ${missing_client} inregistrari fara client`);

  // Trust: validare determinista pe regulile tipului. Fara reconciliere ramane
  // cel mult VALIDATED. Esec pe reguli critice → UNVALIDATED.
  let trust = TRUST_UNVALIDATED;
  if (receivables.length) {
    const vr = validateDataset({ doc_type: docType, records: recs, schema: null });
    trust = vr.valid ? TRUST_VALIDATED : TRUST_UNVALIDATED;
    if (!vr.valid) {
      warnings.push(`UNVALIDATED: ${vr.issues.length} probleme la validare — datele nu intra in decizii pana la clarificare`);
    }
  } else {
    warnings.push("NO_RECORDS: zero inregistrari de importat");
  }

  const stats = {
    total: receivables.length,
    with_amount: receivables.filter((r) => r.amountRON != null).length,
    with_due: receivables.filter((r) => r.dueDate != null).length,
    collected_count: receivables.filter((r) => r.status === "COLLECTED").length,
  };

  return {
    receivables,
    trust,
    as_of: asOf,
    warnings,
    stats,
    data_quality: { missing_client, missing_amount, missing_due, duplicates },
    source: source ?? null,
  };
}

// ── 2. FORMA incomeInvoices pentru receivablesEngine ────────────────────

/** Creantele → forma exacta asteptata de buildReceivablesRegister ca
 *  `incomeInvoices`: [{client, ref, amountRON, remainingRON, dueDate, status}]. PUR. */
export function toIncomeInvoicesShape(receivables = []) {
  return (Array.isArray(receivables) ? receivables : []).map((r) => ({
    client: r.client ?? null,
    ref: r.ref ?? r.invoice ?? null,
    amountRON: r.amountRON ?? null,
    remainingRON: r.remainingRON ?? null,
    dueDate: r.dueDate ?? null,
    status: r.status ?? null,
  }));
}

// ── 3. RECONCILIERE cu Operational / SmartBill (fara corectie) ──────────

function normRows(x) {
  if (Array.isArray(x)) return x;
  if (x && typeof x === "object" && Array.isArray(x.receivables)) return x.receivables;
  return [];
}

/** Cheia de potrivire: ref/invoice normalizat daca exista. PUR. */
function refKey(row) {
  const ref = row?.ref ?? row?.invoice ?? null;
  const k = normText(ref);
  return k || null;
}

function amountOf(row) {
  const v = row?.amountRON ?? row?.amount ?? null;
  return typeof v === "number" ? v : parseAmount(v);
}

/** Potriveste o creanta din document cu o sursa. PUR.
 *  Daca documentul ARE nr. factura, potrivirea se face DOAR pe ref: un ref
 *  prezent dar negasit inseamna UNMATCHED (divergenta reala), NU cadem pe
 *  client+suma — altfel o factura diferita cu aceeasi suma ar masca divergenta
 *  (review A/B). Fallback-ul client+suma se aplica DOAR cand documentul nu are
 *  deloc nr. factura si returneaza matchViaFallback ca sa nu conteze la MATCHED. */
function findMatch(docRow, sourceRows, usedIdx) {
  const key = refKey(docRow);
  if (key) {
    for (let i = 0; i < sourceRows.length; i++) {
      if (usedIdx.has(i)) continue;
      if (refKey(sourceRows[i]) === key) return { idx: i, via: "ref" };
    }
    return { idx: -1, via: "ref" }; // ref prezent dar negasit → UNMATCHED
  }
  // documentul NU are ref → fallback client+suma (marcat separat, slab)
  const docClient = normText(docRow?.client);
  const docAmt = amountOf(docRow);
  if (docClient && docAmt != null) {
    for (let i = 0; i < sourceRows.length; i++) {
      if (usedIdx.has(i)) continue;
      const sAmt = amountOf(sourceRows[i]);
      if (normText(sourceRows[i]?.client) === docClient && sAmt != null) {
        const tol = Math.max(Math.abs(docAmt) * AMOUNT_TOLERANCE_RATIO, 0.01);
        if (Math.abs(sAmt - docAmt) <= tol) return { idx: i, via: "fallback" };
      }
    }
  }
  return { idx: -1, via: "none" };
}

function diffOver(a, b) {
  if (a == null || b == null) return false; // missing != zero — lipsa nu e divergenta
  const tol = Math.max(Math.abs(b) * AMOUNT_TOLERANCE_RATIO, 0.01);
  return Math.abs(a - b) > tol;
}

/**
 * Reconciliaza creantele importate cu facturile din Operational + SmartBill.
 * NU corecteaza nimic: divergentele (contradiction+unmatched) → UN SINGUR
 * reconciliation_need grupat. RECONCILED doar daca zero contradictii + >=1 match.
 */
export function reconcileReceivables({ imported = [], operationalInvoices = [], smartbillInvoices = [] } = {}) {
  const docRows = normRows(imported);
  const ops = Array.isArray(operationalInvoices) ? operationalInvoices : [];
  const sb = Array.isArray(smartbillInvoices) ? smartbillInvoices : [];

  const rows = [];
  const summary = { matched: 0, partial: 0, contradictions: 0, unmatched: 0, missing: 0 };
  const usedOps = new Set();
  const usedSb = new Set();
  const divergentRefs = [];

  for (const d of docRows) {
    const om = findMatch(d, ops, usedOps);
    const sm = findMatch(d, sb, usedSb);
    const oi = om.idx, si = sm.idx;
    if (oi >= 0) usedOps.add(oi);
    if (si >= 0) usedSb.add(si);
    const doc_amount = amountOf(d);
    const ops_amount = oi >= 0 ? amountOf(ops[oi]) : null;
    const sb_amount = si >= 0 ? amountOf(sb[si]) : null;
    const ref = d?.ref ?? d?.invoice ?? null;
    const client = d?.client ?? null;
    // Potrivirile ferme (pe nr. factura) sunt singurele care conteaza la
    // MATCHED/RECONCILED; cele prin fallback client+suma raman PARTIAL (slabe).
    const strongOps = oi >= 0 && om.via === "ref";
    const strongSb = si >= 0 && sm.via === "ref";

    let verdict;
    if (oi < 0 && si < 0) {
      verdict = "UNMATCHED"; // in document, dar in nicio sursa (sau ref negasit)
      summary.unmatched++;
      divergentRefs.push(ref || client || "?");
    } else {
      const contradiction = diffOver(ops_amount, doc_amount) || diffOver(sb_amount, doc_amount);
      if (contradiction) {
        verdict = "CONTRADICTION";
        summary.contradictions++;
        divergentRefs.push(ref || client || "?");
      } else if (strongOps && strongSb) {
        verdict = "MATCHED"; // confirmata FERM de ambele surse (pe nr. factura)
        summary.matched++;
      } else {
        verdict = "PARTIAL_MATCH"; // o singura sursa sau potrivire slaba (client+suma)
        summary.partial++;
      }
    }
    rows.push({ ref, client, doc_amount, ops_amount, sb_amount, verdict, match_via: { ops: om.via, sb: sm.via } });
  }

  // Surse care NU apar in document → MISSING (nu se inventeaza in document).
  for (let i = 0; i < ops.length; i++) {
    if (usedOps.has(i)) continue;
    const s = ops[i];
    rows.push({ ref: s?.ref ?? s?.invoice ?? null, client: s?.client ?? null, doc_amount: null, ops_amount: amountOf(s), sb_amount: null, verdict: "MISSING" });
    summary.missing++;
  }
  for (let i = 0; i < sb.length; i++) {
    if (usedSb.has(i)) continue;
    const s = sb[i];
    rows.push({ ref: s?.ref ?? s?.invoice ?? null, client: s?.client ?? null, doc_amount: null, ops_amount: null, sb_amount: amountOf(s), verdict: "MISSING" });
    summary.missing++;
  }

  // UN SINGUR reconciliation_need grupat (nu 20 taskuri separate).
  const divergentCount = summary.contradictions + summary.unmatched;
  const reconciliation_need = divergentCount
    ? {
        severity: summary.contradictions ? "HIGH" : "MEDIUM",
        ask: `Clarifica ${divergentCount} divergente intre situatia importata si sursele interne (${summary.contradictions} contradictii de suma, ${summary.unmatched} facturi negasite in surse): ${divergentRefs.slice(0, 20).join(", ")}. Datele existente NU se suprascriu.`,
        count: divergentCount,
        no_auto_correction: true,
      }
    : null;

  // RECONCILED doar daca zero contradictii SI cel putin o potrivire reala.
  const trust_after = summary.contradictions === 0 && summary.matched > 0 ? TRUST_RECONCILED : null;

  return { rows, summary, reconciliation_need, trust_after };
}

// ── 4. ALIMENTARE Cash Intelligence (doar date decision-grade) ──────────

/**
 * Trece creantele prin buildReceivablesRegister + confirmedForCash pentru
 * Cash Intelligence. Datele intra in cash DOAR daca trust in DECISION_GRADE_TRUST
 * (VALIDATED+); altfel confirmed_inflows gol cu nota explicita.
 */
export function receivablesForCash({ imported = [], asOf = null } = {}) {
  const trust = (imported && typeof imported === "object" && !Array.isArray(imported)) ? imported.trust : undefined;
  const receivables = normRows(imported);
  const register = buildReceivablesRegister({
    asOf,
    incomeInvoices: toIncomeInvoicesShape(receivables),
  });

  // RECONCILED e cea mai INALTA incredere (reconciliat cu sursele fara
  // contradictii) — se califica pentru cash la fel ca DECISION_GRADE (review F).
  const decisionGrade = DECISION_GRADE_TRUST.includes(trust) || trust === TRUST_RECONCILED;
  if (!decisionGrade) {
    return {
      register,
      confirmed_inflows: [],
      totals: register.totals,
      statement: register.statement,
      note: `date sub pragul de incredere pentru decizii (trust=${trust ?? "necunoscut"}) — nu intra in cash pana la validare/reconciliere`,
    };
  }

  const confirmed_inflows = confirmedForCash(register);
  return {
    register,
    confirmed_inflows,
    totals: register.totals,
    statement: register.statement,
    note: null,
  };
}
