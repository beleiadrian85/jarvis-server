// DATASET / DOCUMENT TYPE REGISTRY (PARTEA IV) — registrul canonic al
// tipurilor de documente pe care organismul stie sa le primeasca.
// Rol: clasificare (ce ESTE documentul), validare determinista (poate fi
// folosit in decizii?), prospetime (§9: un document vechi NU se confunda cu
// situatia actuala) si detectie de contradictii fata de datele existente
// (contradictia devine reconciliation issue — NU suprascrie nimic).
// Principii: missing != zero; sub prag NU se ghiceste — se cere om in bucla.
// Rolurile responsabile sunt GENERICE (finance/operations/sales/management)
// — zero nume de oameni sau companii (§32).
// Modul PUR — zero IO; singurul import permis: ./contract.js.

import { DATA_TRUST_LEVELS } from "./contract.js";

// ── Constante ───────────────────────────────────────────────────────────

const TRUST_VALIDATED = DATA_TRUST_LEVELS.find((t) => t === "VALIDATED") || "VALIDATED";
const TRUST_UNVALIDATED = DATA_TRUST_LEVELS.find((t) => t === "UNVALIDATED") || "UNVALIDATED";

// Sub acest prag clasificarea NU se declara — omul decide.
export const CLASSIFY_CONFIDENCE_FLOOR = 50;
// Pragul de acoperire a campurilor obligatorii in inregistrari (validare).
export const REQUIRED_COVERAGE_FLOOR = 0.8;
// Toleranta la compararea sumelor (totaluri + contradictii): ±1%.
export const AMOUNT_TOLERANCE_RATIO = 0.01;

// Motivul onest pentru clasificare sub prag.
const WHY_UNSURE = "clasificare nesigura — mapare umana necesara";

// ── §35/PARTEA IV — REGISTRUL TIPURILOR DE DOCUMENTE ────────────────────
// Fiecare tip: expected_columns (sinonime RO/EN per camp tinta),
// required/optional_fields, validation_rules (verificabile determinist),
// freshness_policy, responsible_role (rol GENERIC), consumer_modules
// (module reale din organism), verification_method.

export const DOCUMENT_TYPES = {
  CUSTOMER_RECEIVABLES: {
    label: "Situatie clienti / incasari",
    expected_columns: {
      client: ["client", "clienti", "denumire", "partener", "beneficiar", "customer", "cumparator"],
      invoice: ["factura", "invoice", "nr factura", "numar factura", "nr document", "serie"],
      invoice_date: ["data facturii", "data factura", "data emiterii", "data emitere", "invoice date", "data document"],
      due_date: ["scadenta", "data scadenta", "data scadentei", "due date", "termen", "termen plata"],
      amount: ["suma", "valoare", "amount", "total", "valoare totala", "suma totala", "brut"],
      collected: ["incasat", "collected", "platit", "achitat", "paid", "incasari"],
      remaining: ["rest", "sold", "remaining", "ramas", "rest de incasat", "de incasat", "balance", "restant"],
      currency: ["moneda", "currency", "valuta"],
      payment_date: ["data platii", "data plata", "data incasarii", "payment date", "data incasare"],
      status: ["status", "stare", "situatie plata", "state"],
    },
    required_fields: ["client", "amount"],
    optional_fields: ["invoice", "invoice_date", "due_date", "collected", "remaining", "currency", "payment_date", "status"],
    validation_rules: [
      "required_fields_present: client si amount prezente pe >80% din inregistrari",
      "amounts_numeric: sumele (amount/collected/remaining) sunt numere finite",
      "no_duplicate_invoices: fara facturi duplicate (aceeasi factura de doua ori)",
      "dates_valid: datele (emitere/scadenta/plata) sunt parseabile",
      "totals_match: suma inregistrarilor ≈ randul de totaluri (±1%)",
      "currency_known: moneda identificabila (altfel avertisment, nu blocaj)",
    ],
    freshness_policy: { max_age_days: 7 },
    responsible_role: "finance",
    consumer_modules: ["receivablesEngine", "cashIntelligence"],
    verification_method: "reconciliere cu facturile de venit existente (nervousSystem.reconciliation) + verificare totaluri",
  },

  BANK_BALANCE: {
    label: "Solduri bancare",
    expected_columns: {
      account: ["cont", "iban", "banca", "bank", "account", "cont bancar"],
      balance: ["sold", "balanta", "balance", "disponibil", "sold curent"],
      currency: ["moneda", "currency", "valuta"],
      balance_date: ["data sold", "data", "as of", "la data"],
    },
    required_fields: ["account", "balance"],
    optional_fields: ["currency", "balance_date"],
    validation_rules: [
      "required_fields_present: cont si sold prezente pe >80% din inregistrari",
      "amounts_numeric: soldurile sunt numere finite",
      "currency_known: moneda identificabila per cont",
      "dates_valid: data soldului parseabila (daca exista)",
    ],
    freshness_policy: { max_age_days: 3 },
    responsible_role: "finance",
    consumer_modules: ["balanceStore", "cashIntelligence"],
    verification_method: "comparare cu ultimul sold cunoscut per cont (variatie explicabila prin extrase)",
  },

  BANK_STATEMENT: {
    label: "Extras de cont",
    expected_columns: {
      date: ["data", "data operatiunii", "data tranzactiei", "date"],
      description: ["descriere", "detalii", "explicatii", "description", "detalii tranzactie"],
      amount: ["suma", "valoare", "amount"],
      debit: ["debit", "iesiri", "plati"],
      credit: ["credit", "intrari", "incasari"],
      balance: ["sold", "balance", "sold curent"],
      counterparty: ["beneficiar", "ordonator", "partener", "counterparty"],
    },
    required_fields: ["date", "amount"],
    optional_fields: ["description", "debit", "credit", "balance", "counterparty"],
    validation_rules: [
      "required_fields_present: data si suma prezente pe >80% din inregistrari",
      "amounts_numeric: sumele/debit/credit sunt numere finite",
      "dates_valid: datele tranzactiilor sunt parseabile",
      "totals_match: rulajul ≈ randul de totaluri (±1%) daca exista",
    ],
    freshness_policy: { max_age_days: 7 },
    responsible_role: "finance",
    consumer_modules: ["cashIntelligence", "nervousSystem.reconciliation"],
    verification_method: "reconciliere tranzactii cu incasarile/platile inregistrate",
  },

  SALES_STATUS: {
    label: "Situatie vanzari (unitati)",
    expected_columns: {
      unit: ["apartament", "unitate", "ap", "unit", "nr apartament", "lot"],
      client: ["client", "cumparator", "customer", "denumire"],
      status: ["status", "stare", "situatie", "vandut", "rezervat"],
      price: ["pret", "valoare", "price", "pret vanzare"],
      contract_date: ["data contract", "data semnarii", "contract date"],
      advance: ["avans", "advance", "avans incasat"],
    },
    required_fields: ["unit", "status"],
    optional_fields: ["client", "price", "contract_date", "advance"],
    validation_rules: [
      "required_fields_present: unitate si status prezente pe >80% din inregistrari",
      "amounts_numeric: preturile/avansurile sunt numere finite (daca exista)",
      "dates_valid: datele de contract parseabile (daca exista)",
      "no_duplicate_invoices: fara unitati duplicate cu statusuri contradictorii",
    ],
    freshness_policy: { max_age_days: 7 },
    responsible_role: "sales",
    consumer_modules: ["salesIntelligence", "cashIntelligence"],
    verification_method: "comparare cu registrul de vanzari existent (unitate cu unitate)",
  },

  CONSTRUCTION_PROGRESS: {
    label: "Progres lucrari / santier",
    expected_columns: {
      work_item: ["lucrare", "activitate", "faza", "stadiu fizic", "categorie lucrari", "work item"],
      progress: ["progres", "procent", "stadiu", "realizat", "progress", "executat"],
      deadline: ["termen", "deadline", "data finalizare", "scadenta"],
      contractor: ["executant", "echipa", "contractor", "subantreprenor"],
    },
    required_fields: ["work_item", "progress"],
    optional_fields: ["deadline", "contractor"],
    validation_rules: [
      "required_fields_present: lucrare si progres prezente pe >80% din inregistrari",
      "amounts_numeric: procentele de progres sunt numere finite",
      "dates_valid: termenele parseabile (daca exista)",
    ],
    freshness_policy: { max_age_days: 14 },
    responsible_role: "operations",
    consumer_modules: ["managementView", "cashIntelligence"],
    verification_method: "comparare cu raportul de progres anterior (progresul nu scade fara explicatie)",
  },

  SUPPLIER_STATUS: {
    label: "Situatie furnizori",
    expected_columns: {
      supplier: ["furnizor", "supplier", "denumire", "partener"],
      amount: ["suma", "valoare", "amount", "total"],
      paid: ["platit", "achitat", "paid"],
      remaining: ["rest", "rest de plata", "sold", "remaining", "de plata"],
      due_date: ["scadenta", "termen plata", "due date"],
    },
    required_fields: ["supplier", "amount"],
    optional_fields: ["paid", "remaining", "due_date"],
    validation_rules: [
      "required_fields_present: furnizor si suma prezente pe >80% din inregistrari",
      "amounts_numeric: sumele sunt numere finite",
      "dates_valid: scadentele parseabile (daca exista)",
      "totals_match: suma inregistrarilor ≈ randul de totaluri (±1%)",
    ],
    freshness_policy: { max_age_days: 7 },
    responsible_role: "finance",
    consumer_modules: ["cashIntelligence"],
    verification_method: "reconciliere cu facturile de cost inregistrate",
  },

  PAYABLES: {
    label: "Plati de facut / datorii",
    expected_columns: {
      supplier: ["furnizor", "supplier", "beneficiar", "denumire"],
      invoice: ["factura", "invoice", "nr factura", "nr document"],
      amount: ["suma", "valoare", "amount", "total", "de plata"],
      due_date: ["scadenta", "termen", "due date", "termen plata"],
      paid: ["platit", "achitat", "paid"],
      remaining: ["rest", "rest de plata", "remaining", "sold"],
    },
    required_fields: ["supplier", "amount"],
    optional_fields: ["invoice", "due_date", "paid", "remaining"],
    validation_rules: [
      "required_fields_present: furnizor si suma prezente pe >80% din inregistrari",
      "amounts_numeric: sumele sunt numere finite",
      "no_duplicate_invoices: fara facturi de plata duplicate",
      "dates_valid: scadentele parseabile",
      "totals_match: suma inregistrarilor ≈ randul de totaluri (±1%)",
    ],
    freshness_policy: { max_age_days: 7 },
    responsible_role: "finance",
    consumer_modules: ["cashIntelligence", "nervousSystem.reconciliation"],
    verification_method: "reconciliere cu obligatiile de plata cunoscute + extras de cont",
  },

  FINANCING_STATUS: {
    label: "Situatie finantare / credite",
    expected_columns: {
      facility: ["credit", "linie", "facilitate", "imprumut", "loan", "facility"],
      lender: ["banca", "finantator", "lender", "creditor"],
      amount: ["suma", "valoare", "amount", "plafon", "total"],
      drawn: ["utilizat", "tras", "drawn", "consumat"],
      available: ["disponibil", "available", "ramas"],
      maturity: ["scadenta", "maturitate", "maturity", "termen"],
      rate: ["dobanda", "rata", "rate", "interest"],
    },
    required_fields: ["facility", "amount"],
    optional_fields: ["lender", "drawn", "available", "maturity", "rate"],
    validation_rules: [
      "required_fields_present: facilitate si suma prezente pe >80% din inregistrari",
      "amounts_numeric: sumele/plafoanele sunt numere finite",
      "dates_valid: maturitatile parseabile (daca exista)",
      "currency_known: moneda facilitatii identificabila",
    ],
    freshness_policy: { max_age_days: 30 },
    responsible_role: "finance",
    consumer_modules: ["financingRegister", "cashIntelligence"],
    verification_method: "comparare cu registrul de finantare existent (plafon/utilizat/disponibil)",
  },

  CONTRACT_REGISTER: {
    label: "Registru contracte",
    expected_columns: {
      contract: ["contract", "nr contract", "numar contract", "contract no"],
      party: ["parte", "client", "partener", "beneficiar", "party"],
      value: ["valoare", "suma", "value", "amount"],
      sign_date: ["data semnarii", "data contract", "sign date", "data"],
      status: ["status", "stare", "situatie"],
    },
    required_fields: ["contract", "party"],
    optional_fields: ["value", "sign_date", "status"],
    validation_rules: [
      "required_fields_present: contract si parte prezente pe >80% din inregistrari",
      "no_duplicate_invoices: fara numere de contract duplicate",
      "amounts_numeric: valorile contractelor sunt numere finite (daca exista)",
      "dates_valid: datele de semnare parseabile (daca exista)",
    ],
    freshness_policy: { max_age_days: 30 },
    responsible_role: "management",
    consumer_modules: ["salesIntelligence", "nervousSystem.reconciliation"],
    verification_method: "comparare cu contractele cunoscute (numar + parte + valoare)",
  },

  LEADS_EXPORT: {
    label: "Export leads",
    expected_columns: {
      lead: ["lead", "nume", "contact", "prospect", "name"],
      phone: ["telefon", "phone", "mobil"],
      email: ["email", "e-mail", "mail"],
      source: ["sursa", "canal", "source", "campanie"],
      date: ["data", "date", "data contact"],
      status: ["status", "stare", "stadiu"],
    },
    required_fields: ["lead"],
    optional_fields: ["phone", "email", "source", "date", "status"],
    validation_rules: [
      "required_fields_present: lead prezent pe >80% din inregistrari",
      "dates_valid: datele de contact parseabile (daca exista)",
      "no_duplicate_invoices: fara lead-uri duplicate pe acelasi contact",
    ],
    freshness_policy: { max_age_days: 7 },
    responsible_role: "sales",
    consumer_modules: ["salesIntelligence"],
    verification_method: "comparare cu lead-urile deja inregistrate (dedup pe contact)",
  },

  MARKETING_REPORT: {
    label: "Raport marketing / campanii",
    expected_columns: {
      campaign: ["campanie", "campaign", "ad", "anunt"],
      spend: ["cost", "cheltuit", "buget", "spend", "suma"],
      impressions: ["afisari", "impressions", "afisaje"],
      clicks: ["clickuri", "clicks", "click"],
      leads: ["leads", "lead", "conversii", "conversions"],
      period: ["perioada", "period", "luna", "saptamana", "data"],
    },
    required_fields: ["campaign", "spend"],
    optional_fields: ["impressions", "clicks", "leads", "period"],
    validation_rules: [
      "required_fields_present: campanie si cost prezente pe >80% din inregistrari",
      "amounts_numeric: costurile/metricile sunt numere finite",
      "currency_known: moneda costurilor identificabila",
    ],
    freshness_policy: { max_age_days: 7 },
    responsible_role: "sales",
    consumer_modules: ["salesIntelligence"],
    verification_method: "comparare cu bugetele aprobate si cu lead-urile inregistrate",
  },

  UNKNOWN_DOCUMENT: {
    label: "Document neclasificat",
    expected_columns: {},
    required_fields: [],
    optional_fields: [],
    validation_rules: [],
    // 0 = nimic nu se presupune proaspat la un document neclasificat.
    freshness_policy: { max_age_days: 0 },
    responsible_role: "management",
    consumer_modules: [],
    verification_method: "mapare umana necesara — tipul nu a putut fi determinat automat",
  },
};

// ── Indicii de clasificare pe NUMELE fisierului (deterministe) ──────────
// Fiecare tip: lista de {re, score, why}. Scorul pe fisier = maximul
// indiciilor potrivite (cap 55). Cuvintele DISTINCTIVE (extras, sold,
// furnizor, leads, incasari...) trec singure pragul de 50; cuvintele
// ambigue (client, data...) raman sub prag si au nevoie de coloane.

const FILENAME_HINTS = {
  CUSTOMER_RECEIVABLES: [
    { re: /incasar/, score: 55, why: "numele contine 'incasari'" },
    { re: /situatie.*client|client.*situatie/, score: 55, why: "numele contine 'situatie' + 'clienti'" },
    { re: /client/, score: 25, why: "numele contine 'clienti'" },
    { re: /receivable/, score: 55, why: "numele contine 'receivables'" },
  ],
  BANK_BALANCE: [
    { re: /sold/, score: 50, why: "numele contine 'sold'" },
    { re: /balanta|balance/, score: 50, why: "numele contine 'balanta'" },
  ],
  BANK_STATEMENT: [
    { re: /extras/, score: 55, why: "numele contine 'extras'" },
    { re: /statement/, score: 50, why: "numele contine 'statement'" },
  ],
  SALES_STATUS: [
    { re: /vanzar|sales/, score: 50, why: "numele contine 'vanzari'" },
    { re: /apartament|unitat/, score: 30, why: "numele contine 'apartamente/unitati'" },
  ],
  CONSTRUCTION_PROGRESS: [
    { re: /lucrar|progres|santier/, score: 50, why: "numele contine 'lucrari/progres/santier'" },
    { re: /stadiu/, score: 40, why: "numele contine 'stadiu'" },
  ],
  SUPPLIER_STATUS: [
    { re: /furnizor|supplier/, score: 55, why: "numele contine 'furnizori'" },
  ],
  PAYABLES: [
    { re: /de plata|datorii|payable/, score: 50, why: "numele contine 'plati/datorii'" },
    { re: /plati/, score: 40, why: "numele contine 'plati'" },
  ],
  FINANCING_STATUS: [
    { re: /finantar|imprumut|loan/, score: 50, why: "numele contine 'finantare/imprumut'" },
    { re: /credit/, score: 40, why: "numele contine 'credit'" },
  ],
  CONTRACT_REGISTER: [
    { re: /contract/, score: 50, why: "numele contine 'contracte'" },
  ],
  LEADS_EXPORT: [
    { re: /lead/, score: 55, why: "numele contine 'leads'" },
  ],
  MARKETING_REPORT: [
    { re: /marketing|campani/, score: 50, why: "numele contine 'marketing/campanii'" },
    { re: /ads/, score: 40, why: "numele contine 'ads'" },
  ],
};

// ── Utilitare PURE ──────────────────────────────────────────────────────

function clamp01_100(n) {
  return Math.max(0, Math.min(100, n));
}

/** Normalizare text (lowercase, fara diacritice, doar litere/cifre/spatii). */
function normText(s) {
  return String(s || "").toLowerCase()
    .replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** Valoarea unui camp dintr-o inregistrare: suporta atat forma cu
 *  provenienta ({VALUE, SOURCE_ROW, CONFIDENCE} din extractDataset) cat si
 *  valori plate. Lipsa/gol → null (missing != zero). PUR. */
function fieldValue(rec, field) {
  if (!rec || typeof rec !== "object") return null;
  const v = rec[field];
  if (v == null) return null;
  if (typeof v === "object" && !Array.isArray(v) && "VALUE" in v) {
    return v.VALUE == null || String(v.VALUE).trim() === "" ? null : v.VALUE;
  }
  return String(v).trim() === "" ? null : v;
}

const RE_NUM_PLAIN = /^[-+]?\d+(\.\d+)?$/;
const RE_NUM_EN = /^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/;
const RE_NUM_RO = /^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$|^[-+]?\d+,\d+$/;

/** Parseaza o valoare numerica (numar sau string RO/EN cu moneda);
 *  neparseabil → null, NU 0 (missing != zero). PUR. */
function toNumber(raw) {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim().replace(/(lei|ron|eur|usd|%)/gi, "").replace(/[€$\s]/g, "");
  if (!s) return null;
  if (RE_NUM_PLAIN.test(s)) return Number(s);
  if (RE_NUM_EN.test(s)) return Number(s.replace(/,/g, ""));
  if (RE_NUM_RO.test(s)) return Number(s.replace(/\./g, "").replace(",", "."));
  return null;
}

const RE_DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})([T ].*)?$/;
const RE_DATE_DOT = /^([0-3]?\d)\.([01]?\d)\.(\d{4})$/;
const RE_DATE_SLASH = /^([0-3]?\d)\/([01]?\d)\/(\d{4})$/;

/** Parseaza o data (ISO / DD.MM.YYYY / DD/MM/YYYY) → timestamp UTC sau
 *  null. Slash-ul se citeste conventie europeana (DMY) — determinist. PUR. */
function toDateMs(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  let m = RE_DATE_ISO.exec(s);
  if (m) {
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return Number.isFinite(t) ? t : null;
  }
  m = RE_DATE_DOT.exec(s) || RE_DATE_SLASH.exec(s);
  if (m) {
    const d = +m[1]; const mo = +m[2]; const y = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const t = Date.UTC(y, mo - 1, d);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/** Potriveste un nume de coloana cu sinonimele unui camp tinta. PUR. */
function columnMatchesField(colName, synonyms) {
  const col = normText(colName);
  if (!col) return false;
  for (const raw of synonyms || []) {
    const syn = normText(raw);
    if (!syn) continue;
    if (col === syn) return true;
    if (` ${col} `.includes(` ${syn} `)) return true;
    if (syn.length >= 4 && ` ${syn} `.includes(` ${col} `)) return true;
  }
  return false;
}

// ── CLASIFICAREA DOCUMENTULUI ───────────────────────────────────────────

/** Scorul unui tip pe coloanele descoperite: acoperirea campurilor
 *  obligatorii (0-40) + acoperirea celor optionale (0-15). PUR. */
function schemaScoreFor(typeDef, columns) {
  const req = typeDef.required_fields || [];
  const opt = typeDef.optional_fields || [];
  let reqHit = 0;
  let optHit = 0;
  const matchedFields = [];
  for (const f of req) {
    if (columns.some((c) => columnMatchesField(c, typeDef.expected_columns[f]))) {
      reqHit++;
      matchedFields.push(f);
    }
  }
  for (const f of opt) {
    if (columns.some((c) => columnMatchesField(c, typeDef.expected_columns[f]))) {
      optHit++;
      matchedFields.push(f);
    }
  }
  const reqScore = req.length ? Math.round((reqHit / req.length) * 40) : 0;
  const optScore = opt.length ? Math.round((optHit / opt.length) * 15) : 0;
  return { score: reqScore + optScore, reqHit, reqTotal: req.length, matchedFields };
}

/** Calitatea maparii propuse fata de campurile obligatorii ale tipului:
 *  GOOD (toate mapate cu incredere >=60), PARTIAL, POOR, UNKNOWN. PUR. */
function mappingQualityFor(typeDef, mapping) {
  const entries = Array.isArray(mapping?.mapping) ? mapping.mapping : Array.isArray(mapping) ? mapping : null;
  if (!entries || !typeDef) return "UNKNOWN";
  const req = typeDef.required_fields || [];
  if (!req.length) return "UNKNOWN";
  let good = 0;
  let mapped = 0;
  for (const f of req) {
    const m = entries.find((x) => x && x.target === f);
    if (m && typeof m.column_index === "number") {
      mapped++;
      if ((Number(m.confidence) || 0) >= 60) good++;
    }
  }
  if (good === req.length) return "GOOD";
  if (mapped > 0) return "PARTIAL";
  return "POOR";
}

/** Clasifica documentul dupa numele fisierului + coloanele descoperite.
 *  Sub CLASSIFY_CONFIDENCE_FLOOR → UNKNOWN_DOCUMENT cu motiv onest —
 *  NU se ghiceste. PUR. */
export function classifyDocument({ filename = "", schema = null, mapping = null } = {}) {
  const name = normText(filename);
  const columns = Array.isArray(schema?.header?.columns) ? schema.header.columns : [];

  const candidates = [];
  for (const [type, def] of Object.entries(DOCUMENT_TYPES)) {
    if (type === "UNKNOWN_DOCUMENT") continue;
    const whyParts = [];

    // (a) indicii pe numele fisierului — maximul indiciilor, cap 55
    let fnScore = 0;
    for (const hint of FILENAME_HINTS[type] || []) {
      if (name && hint.re.test(name) && hint.score > fnScore) {
        fnScore = hint.score;
        whyParts[0] = hint.why;
      }
    }
    fnScore = Math.min(55, fnScore);

    // (b) acoperirea campurilor tinta in coloanele descoperite
    const sc = columns.length ? schemaScoreFor(def, columns) : { score: 0, reqHit: 0, reqTotal: (def.required_fields || []).length, matchedFields: [] };
    if (sc.matchedFields.length) {
      whyParts.push(`coloane potrivite: ${sc.matchedFields.join(", ")} (${sc.reqHit}/${sc.reqTotal} obligatorii)`);
    }

    candidates.push({
      type,
      confidence: clamp01_100(fnScore + sc.score),
      why: whyParts.filter(Boolean).join(" + ") || "fara indicii",
    });
  }

  // determinist: scor descrescator, apoi alfabetic pe tip
  candidates.sort((a, b) => b.confidence - a.confidence || (a.type < b.type ? -1 : 1));
  const best = candidates[0] || { type: "UNKNOWN_DOCUMENT", confidence: 0, why: "fara indicii" };

  if (best.confidence < CLASSIFY_CONFIDENCE_FLOOR) {
    return {
      doc_type: "UNKNOWN_DOCUMENT",
      confidence: best.confidence,
      why: best.confidence > 0
        ? `${WHY_UNSURE} (cel mai apropiat candidat: ${best.type}, scor ${best.confidence})`
        : WHY_UNSURE,
      mapping_quality: "UNKNOWN",
    };
  }

  return {
    doc_type: best.type,
    confidence: best.confidence,
    why: best.why,
    mapping_quality: mappingQualityFor(DOCUMENT_TYPES[best.type], mapping),
  };
}

// ── VALIDAREA DATASET-ULUI (determinist, pe regulile tipului) ───────────

// Campuri tratate ca sume (verificate numeric daca exista in inregistrari).
const AMOUNT_FIELDS = ["amount", "balance", "collected", "remaining", "paid", "price", "advance", "value", "spend", "drawn", "available", "progress", "debit", "credit"];
// Campuri tratate ca date calendaristice.
const DATE_FIELDS = ["invoice_date", "due_date", "payment_date", "balance_date", "date", "contract_date", "sign_date", "maturity", "deadline", "period"];
// Campul de identificare pentru dedup (facturi/contracte).
const DEDUP_FIELDS = ["invoice", "contract"];

/** Aplica regulile de validare ale tipului asupra inregistrarilor.
 *  Esec pe reguli critice → trust UNVALIDATED cu issues (NU arunca).
 *  Missing != zero: valorile lipsa se raporteaza, nu se inventeaza. PUR. */
export function validateDataset({ doc_type, records = [], schema = null } = {}) {
  const issues = [];
  const def = DOCUMENT_TYPES[doc_type];
  const recs = Array.isArray(records) ? records.filter((r) => r && typeof r === "object") : [];
  const stats = { records: recs.length, required_coverage: {}, numeric_checked: 0, numeric_bad: 0, dates_checked: 0, dates_bad: 0 };

  if (!def || doc_type === "UNKNOWN_DOCUMENT") {
    issues.push({ rule: "doc_type_known", detail: `tip de document necunoscut ('${doc_type ?? "null"}') — validare imposibila fara registru` });
    return { valid: false, trust: TRUST_UNVALIDATED, issues, stats };
  }
  if (!recs.length) {
    issues.push({ rule: "records_present", detail: "zero inregistrari — nimic de validat (missing != zero)" });
    return { valid: false, trust: TRUST_UNVALIDATED, issues, stats };
  }

  const rules = def.validation_rules.map((r) => String(r).split(":")[0].trim());
  const has = (rule) => rules.includes(rule);

  // 1) required_fields_present — fiecare camp obligatoriu pe >80% din inregistrari
  if (has("required_fields_present")) {
    for (const f of def.required_fields) {
      const present = recs.filter((r) => fieldValue(r, f) != null).length;
      const ratio = present / recs.length;
      stats.required_coverage[f] = Math.round(ratio * 100);
      if (ratio <= REQUIRED_COVERAGE_FLOOR) {
        issues.push({ rule: "required_fields_present", detail: `campul obligatoriu '${f}' prezent doar pe ${present}/${recs.length} inregistrari (<=80%)` });
      }
    }
  }

  // 2) amounts_numeric — sumele existente trebuie sa fie numere finite
  if (has("amounts_numeric")) {
    for (const f of AMOUNT_FIELDS) {
      if (!(f in def.expected_columns)) continue;
      for (const r of recs) {
        const v = fieldValue(r, f);
        if (v == null) continue; // lipsa = gap raportat la required, nu aici
        stats.numeric_checked++;
        if (toNumber(v) == null) {
          stats.numeric_bad++;
          issues.push({ rule: "amounts_numeric", detail: `valoare nenumerica pe '${f}': '${String(v).slice(0, 40)}'` });
        }
      }
    }
  }

  // 3) no_duplicate_invoices — dedup pe factura/contract (daca exista)
  if (has("no_duplicate_invoices")) {
    for (const f of DEDUP_FIELDS) {
      if (!(f in def.expected_columns)) continue;
      const seen = new Map();
      for (const r of recs) {
        const v = fieldValue(r, f);
        if (v == null) continue;
        const key = normText(v);
        if (!key) continue;
        seen.set(key, (seen.get(key) || 0) + 1);
      }
      for (const [key, n] of seen) {
        if (n > 1) issues.push({ rule: "no_duplicate_invoices", detail: `'${f}' duplicat: '${key}' apare de ${n} ori` });
      }
    }
  }

  // 4) dates_valid — datele existente trebuie sa fie parseabile
  if (has("dates_valid")) {
    for (const f of DATE_FIELDS) {
      if (!(f in def.expected_columns)) continue;
      for (const r of recs) {
        const v = fieldValue(r, f);
        if (v == null) continue;
        stats.dates_checked++;
        if (toDateMs(v) == null) {
          stats.dates_bad++;
          issues.push({ rule: "dates_valid", detail: `data neparseabila pe '${f}': '${String(v).slice(0, 40)}'` });
        }
      }
    }
  }

  // 5) totals_match — daca schema are rand de totaluri CU valoare numerica,
  // suma inregistrarilor pe 'amount' trebuie sa fie ≈ total (±1%).
  // Fara valoare de total disponibila → nu se poate verifica (nu ghicim).
  if (has("totals_match") && schema?.totals_row != null) {
    const totalRaw = schema.totals_row.total ?? schema.totals_row.amount ?? schema.totals_row.value ?? null;
    const total = toNumber(totalRaw);
    if (total != null && "amount" in def.expected_columns) {
      let sum = 0;
      let cnt = 0;
      for (const r of recs) {
        const v = toNumber(fieldValue(r, "amount"));
        if (v != null) { sum += v; cnt++; }
      }
      stats.totals = { declared: total, computed: cnt ? sum : null };
      if (cnt) {
        const tol = Math.max(Math.abs(total) * AMOUNT_TOLERANCE_RATIO, 0.01);
        if (Math.abs(sum - total) > tol) {
          issues.push({ rule: "totals_match", detail: `suma inregistrarilor (${sum}) difera de total (${total}) cu peste 1%` });
        }
      }
    } else if (totalRaw == null) {
      stats.totals = { declared: null, computed: null, note: "rand de totaluri detectat fara valoare numerica — verificare imposibila" };
    }
  }

  // 6) currency_known — avertisment, NU regula critica
  if (has("currency_known")) {
    const code = schema?.currency?.code ?? null;
    const hasCurrencyField = recs.some((r) => fieldValue(r, "currency") != null);
    if ((code == null || code === "UNKNOWN") && !hasCurrencyField) {
      issues.push({ rule: "currency_known", detail: "moneda neidentificabila (nici in schema, nici pe inregistrari) — avertisment" });
    }
  }

  // Reguli critice: orice esec → UNVALIDATED. currency_known e doar avertisment.
  const CRITICAL = ["doc_type_known", "records_present", "required_fields_present", "amounts_numeric", "no_duplicate_invoices", "dates_valid", "totals_match"];
  const criticalFail = issues.some((i) => CRITICAL.includes(i.rule));
  return {
    valid: !criticalFail,
    trust: criticalFail ? TRUST_UNVALIDATED : TRUST_VALIDATED,
    issues,
    stats,
  };
}

// ── PROSPETIMEA (§9 — un document vechi NU e situatia actuala) ──────────

/** Verifica varsta documentului fata de politica tipului. document_date
 *  lipsa/neparseabila → "UNKNOWN" explicit (nu presupunem prospetime). PUR. */
export function freshnessCheck({ doc_type, document_date = null, nowISO = null } = {}) {
  const def = DOCUMENT_TYPES[doc_type] || DOCUMENT_TYPES.UNKNOWN_DOCUMENT;
  const policy_days = def.freshness_policy?.max_age_days ?? 0;

  const docMs = toDateMs(document_date);
  if (docMs == null) {
    return {
      fresh: "UNKNOWN",
      age_days: null,
      policy_days,
      note: "AS_OF necunoscut — nu confunda cu situatia actuala",
    };
  }

  const nowMs = toDateMs(nowISO) ?? Date.now();
  const age_days = Math.floor((nowMs - docMs) / 86400000);
  if (age_days < 0) {
    return { fresh: "UNKNOWN", age_days, policy_days, note: "data documentului e in viitor — AS_OF suspect, verificare umana" };
  }
  const fresh = age_days <= policy_days;
  return {
    fresh,
    age_days,
    policy_days,
    note: fresh
      ? `document de ${age_days} zile, in politica de ${policy_days} zile`
      : `document VECHI de ${age_days} zile (politica: ${policy_days}) — nu reflecta situatia actuala`,
  };
}

// ── CONTRADICTIILE FATA DE DATELE EXISTENTE ─────────────────────────────

/** Cheia de identificare a unei inregistrari: client+invoice daca factura
 *  exista, altfel doar client. PUR. */
function recordKey(rec) {
  const client = normText(fieldValue(rec, "client"));
  if (!client) return null;
  const invoice = normText(fieldValue(rec, "invoice"));
  return invoice ? `${client}|${invoice}` : client;
}

/** Compara valorile documentului cu datele existente injectate (ex.
 *  facturile de venit). Diferente >1% pe amount/remaining → contradictie
 *  pentru reconciliation issue. NU suprascrie nimic — doar raporteaza. PUR. */
export function contradictionCheck({ records = [], existing = [] } = {}) {
  const contradictions = [];
  const recs = Array.isArray(records) ? records.filter((r) => r && typeof r === "object") : [];
  const exist = Array.isArray(existing) ? existing.filter((r) => r && typeof r === "object") : [];

  if (!recs.length || !exist.length) {
    return {
      contradictions,
      note: !recs.length
        ? "zero inregistrari in document — nimic de comparat"
        : "zero date existente injectate — comparatia nu s-a putut face (nu inseamna ca nu exista contradictii)",
    };
  }

  // indexul datelor existente pe cheie (prima aparitie castiga — determinist)
  const byKey = new Map();
  for (const e of exist) {
    const key = recordKey(e);
    if (key && !byKey.has(key)) byKey.set(key, e);
  }

  const COMPARE_FIELDS = ["amount", "remaining"];
  let compared = 0;
  for (const r of recs) {
    const key = recordKey(r);
    if (!key || !byKey.has(key)) continue;
    const e = byKey.get(key);
    for (const f of COMPARE_FIELDS) {
      const docV = toNumber(fieldValue(r, f));
      const exV = toNumber(fieldValue(e, f));
      if (docV == null || exV == null) continue; // missing != zero — lipsa nu e contradictie
      compared++;
      const tol = Math.max(Math.abs(exV) * AMOUNT_TOLERANCE_RATIO, 0.01);
      if (Math.abs(docV - exV) > tol) {
        contradictions.push({
          key,
          doc_value: docV,
          existing_value: exV,
          detail: `'${f}' difera cu peste 1%: documentul zice ${docV}, datele existente zic ${exV} — reconciliation issue, datele existente NU se suprascriu`,
        });
      }
    }
  }

  return {
    contradictions,
    note: contradictions.length
      ? `${contradictions.length} contradictii pe ${compared} valori comparate — de rezolvat prin reconciliere, nu prin suprascriere`
      : `${compared} valori comparate, zero contradictii`,
  };
}
