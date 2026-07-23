// OPERATIONAL → JARVIS DATA CONTRACT (Faza 35). Operational e reparat in
// PARALEL; nu duplicam acea munca. Aici declaram EXPLICIT ce CONSUMA JARVIS:
// per domeniu — sursa, campuri, semantica, prospetime, transformari, ipoteze si
// CONCLUZIILE FALSE POSIBILE daca semantica se schimba. Contract-testele
// (test/dataContract.test.mjs) verifica structura; un consumator care se leaga
// de un camp nedeclarat = drift detectabil. PUR: doar declaratii.

export const DATA_CONTRACT = {
  obligations: {
    source: "operational_db.payment_obligations", consumer: "cashIntelligence, receivablesEngine",
    fields: ["id", "supplier", "amount", "currency", "due_date", "status", "paid"],
    semantics: "obligatii de plata catre furnizori; status ∈ {open, paid, overdue}",
    freshness: "la fiecare colectare (poll/reactive)", transformations: ["suma pe scadente <30 zile → cash outflow"],
    assumptions: ["amount e in currency declarata", "due_date completat"],
    possible_false_conclusions: ["daca 'paid' lipseste → tratat ca neplatit → outflow supraestimat", "currency implicita RON gresit pt. facturi EUR"],
  },
  suppliers: {
    source: "operational_db.suppliers", consumer: "cashIntelligence",
    fields: ["id", "name", "category"],
    semantics: "master furnizori; NU se scrie autonom (interzis)",
    freshness: "rar", transformations: [], assumptions: ["nume unic"],
    possible_false_conclusions: ["dublura furnizor → obligatii numarate de doua ori"],
  },
  income_invoices: {
    source: "operational_db.income_invoices", consumer: "receivablesEngine, salesIntelligence",
    fields: ["id", "client", "amount", "currency", "issued_at", "paid", "paid_at"],
    semantics: "facturi emise; paid=true → incasat",
    freshness: "la colectare", transformations: ["neincasate → receivables"],
    assumptions: ["paid reflecta incasarea reala"],
    possible_false_conclusions: ["paid neactualizat → receivable fantoma", "factura storno numarata ca venit"],
  },
  bank_statement_lines: {
    source: "operational_db.bank_statement_lines", consumer: "cashIntelligence (reconciliere)",
    fields: ["id", "date", "amount", "description", "direction"],
    semantics: "rulaje bancare; NU e soldul (soldul e manual/necunoscut)",
    freshness: "manual/import", transformations: ["reconciliere cu obligatii/facturi"],
    assumptions: ["direction ∈ {in,out}"],
    possible_false_conclusions: ["a confunda suma rulajelor cu soldul curent (GRESIT — sold = UNKNOWN fara extras)"],
  },
  sales_units: {
    source: "operational_db.sales_units", consumer: "salesIntelligence",
    fields: ["id", "unit", "stage", "price", "currency", "client"],
    semantics: "unitati Bell si stadiul in funnel; stage ∈ {liber, rezervat, avans, vandut}",
    freshness: "la colectare", transformations: ["numarare pe stagii"],
    assumptions: ["stage reflecta realitatea contractuala"],
    possible_false_conclusions: ["stage nesetat → unitate 'libera' cand e rezervata → stoc supraestimat"],
  },
  tasks: {
    source: "operational_db.tasks", consumer: "nervousSystem, peopleSupervision",
    fields: ["id", "title", "assignee", "status", "report", "due_date", "updatedAt"],
    semantics: "task-uri; SINGURA suprafata de scriere JARVIS (create/observation/reminder)",
    freshness: "reactive (poll ~7min)", transformations: ["status → open loop / closed loop", "assignee → people load"],
    assumptions: ["assignee = numele real al persoanei"],
    possible_false_conclusions: ["report gol interpretat ca 'fara raspuns' cand e doar necompletat"],
  },
  leads: {
    source: "operational_db.leads / spion", consumer: "salesIntelligence, attribution",
    fields: ["id", "source", "stage", "owner", "created_at"],
    semantics: "lead-uri de vanzari; volum mic cunoscut",
    freshness: "la colectare", transformations: ["atributie trafic→lead"],
    assumptions: ["source completat"],
    possible_false_conclusions: ["absenta lead-uri = 'zero cerere' (GRESIT — poate fi formular neplasat)"],
  },
  site_visits: {
    source: "spion (Vercel+Railway)", consumer: "attribution, salesIntelligence",
    fields: ["day", "visits", "device"],
    semantics: "trafic pe bellresidence.ro; contorul SUBNUMARA traficul real",
    freshness: "zilnic", transformations: ["medie 7 zile"],
    assumptions: ["GDPR: fara IP brut"],
    possible_false_conclusions: ["cifra tratata ca trafic complet (e subnumarata — declara-o ca minim)"],
  },
};

export const CONTRACT_DOMAINS = Object.keys(DATA_CONTRACT);
const REQUIRED_KEYS = ["source", "consumer", "fields", "semantics", "freshness", "transformations", "assumptions", "possible_false_conclusions"];

/** Valideaza structura contractului. @returns {ok, errors[]} */
export function validateContract(contract = DATA_CONTRACT) {
  const errors = [];
  for (const [domain, spec] of Object.entries(contract)) {
    for (const k of REQUIRED_KEYS) {
      if (!(k in spec)) errors.push(`${domain}: lipseste '${k}'`);
    }
    if (!Array.isArray(spec.fields) || !spec.fields.length) errors.push(`${domain}: 'fields' gol`);
    if (!Array.isArray(spec.possible_false_conclusions) || !spec.possible_false_conclusions.length) errors.push(`${domain}: fara concluzii false declarate (obligatoriu — forteaza gandirea la drift)`);
  }
  return { ok: errors.length === 0, errors };
}

/** Verifica daca un consumator citeste doar campuri DECLARATE (drift check). */
export function checkFields(domain, fieldsUsed = []) {
  const spec = DATA_CONTRACT[domain];
  if (!spec) return { ok: false, undeclared: fieldsUsed, reason: "domeniu inexistent in contract" };
  const declared = new Set(spec.fields);
  const undeclared = fieldsUsed.filter((f) => !declared.has(f));
  return { ok: undeclared.length === 0, undeclared };
}
