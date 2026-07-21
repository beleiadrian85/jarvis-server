// CEO AI — COMPANY CONFIG (COMPANY INSTANCE #1: Profi Concept / Bell Residence).
// Regula de productizare: nucleul din src/ceo/ este GENERIC — tot ce e specific
// companiei (nume, oameni, praguri, domenii, surse) traieste AICI. O companie
// noua = alt fisier de config (NEW COMPANY ONBOARDING), nu alt cod.
import { config, hasOperational, hasDb, hasCalendar } from "../config.js";

export const COMPANY = {
  id: "profi-concept",
  name: "PROFI CONCEPT",
  brand: "Bell Residence",
  founder: { name: "Adrian Belei", role: "Fondator si decident final" },
  people: [
    { id: "adrian", name: "Adrian", role: "fondator", aliases: ["adi", "adrian belei"] },
    { id: "dana", name: "Dana", role: "financiar/contabilitate", aliases: [] },
    { id: "nelu", name: "Nelu", role: "executie/santier", aliases: [] },
    { id: "mihaela", name: "Mihaela", role: "administrativ", aliases: [] },
  ],
  timezone: "Europe/Bucharest",
  currency: "RON",

  thresholds: {
    cashGapAlertRON: 25_000,       // sub pragul asta nu e observatie de cash
    boardEscalationRON: 100_000,   // impact financiar care cere Board review
    bigPaymentRON: 100_000,
    maxDigestPoints: 7,
  },

  // Maparea domeniilor din Company Data Map pe sursele REALE ale instantei.
  // connected: "CONNECTED" | "PARTIAL" | "NOT_CONNECTED" — starea de proiectare;
  // starea LIVE o masoara companyDataMap.probeDataMap() peste ea.
  domains: {
    CASH:            { source: "solduri manuale (Command Center/balanceStore) + extrase ING in Operational", connected: "PARTIAL", owner: "dana", impact: "Fara sold nu exista necesar NET de cash — doar necesar brut de plati.", fix: "Formular zilnic Dana (temporar) → conector bancar/SmartBill (permanent)." },
    BANK:            { source: "extrase ING incarcate in Operational (bank_statements: rulaje, fara sold)", connected: "PARTIAL", owner: "dana", impact: "Solduri si rulaje invizibile; forecastul ramane brut.", fix: "PSD2/open banking sau export zilnic; intre timp input uman." },
    ACCOUNTING:      { source: "SmartBill Cloud API (connectors/smartbill.js, env pe Railway)", connected: "CONNECTED", owner: "dana", impact: "Facturi/incasari nevizibile serverului.", fix: "Port SmartBill API pe server (exista config local .claude/smartbill-api.json)." },
    PAYABLES:        { source: "Operational: list_payment_obligations", connected: "CONNECTED", owner: "dana", impact: "-", fix: "-" },
    RECEIVABLES:     { source: "Operational: income_invoices + estimated_cash_inflows (mecanism existent)", connected: "CONNECTED", owner: "dana", impact: "Incasarile certe/probabile lipsesc din lichiditate.", fix: "Camp in Operational sau SmartBill (facturi emise neincasate)." },
    SALES:           { source: "Operational: sales_summary + list_sales_units", connected: "CONNECTED", owner: "adrian", impact: "-", fix: "-" },
    LEADS:           { source: "Operational: tabelul leads (formular site, cu UTM)", connected: "PARTIAL", owner: "adrian", impact: "Funnelul incepe abia la rezervare; conversia amonte invizibila.", fix: "Registru lead-uri in Operational sau CRM usor + conector." },
    BELL_INVENTORY:  { source: "Operational: list_sales_units", connected: "CONNECTED", owner: "adrian", impact: "-", fix: "-" },
    PROJECTS:        { source: "Operational: project_costs + task-uri pe proiecte", connected: "CONNECTED", owner: "nelu", impact: "-", fix: "-" },
    CONSTRUCTION:    { source: "jurnale santier (list_journals) — text nestructurat", connected: "PARTIAL", owner: "nelu", impact: "Progres fizic nemasurabil vs plati.", fix: "Câmp % progres pe faze in Operational." },
    SUPPLIERS:       { source: "Operational: supplier_due_items (180 pozitii) + comenzi", connected: "CONNECTED", owner: "nelu", impact: "Risc de blocaj furnizor nevizibil.", fix: "Termene si expunere per furnizor in Operational." },
    CONTRACTS:       { source: "nu exista registru de contracte conectat", connected: "NOT_CONNECTED", owner: "adrian", impact: "Clauze/termene contractuale invizibile.", fix: "Registru contracte (Drive structurat sau Operational)." },
    PEOPLE:          { source: "Operational: task-uri + detectori disciplina D1-D12", connected: "CONNECTED", owner: "adrian", impact: "-", fix: "-" },
    TASKS:           { source: "Operational: list_tasks (28 tool-uri MCP)", connected: "CONNECTED", owner: "adrian", impact: "-", fix: "-" },
    WEBSITE_TRAFFIC: { source: "Operational: site_visits (Spion, live)", connected: "CONNECTED", owner: "adrian", impact: "Trafic si conversie web invizibile motorului.", fix: "Endpoint de citire Spion + GA4 (proprietate exista: 544681576)." },
    MARKETING:       { source: "Operational: schema mkt_* (campanii, costuri, KPI)", connected: "PARTIAL", owner: "adrian", impact: "Cost/lead si ROI campanii invizibile.", fix: "Conector Google Ads API dupa deblocarea verificarii." },
    EMAIL:           { source: "Gmail proficoncept.sb — OAuth NECONFIGURAT (valori goale peste tot)", connected: "NOT_CONNECTED", owner: "adrian", impact: "-", fix: "-" },
    CALENDAR:        { source: "Google Calendar — OAuth NECONFIGURAT", connected: "NOT_CONNECTED", owner: "adrian", impact: "Termene din calendar lipsesc din planificare cand tokenul expira.", fix: "REAUTH: Adrian ruleaza scripts/google-auth.js (login proficoncept.sb, ~5 min) → 3 variabile pe Railway. Deblocheaza: emailuri importante, termene din calendar, drafturi." },
    LEGAL:           { source: "nu exista registru juridic conectat", connected: "NOT_CONNECTED", owner: "adrian", impact: "Termene legale/litigii invizibile.", fix: "Registru termene juridice (reminders există ca baza)." },
    ASSETS:          { source: "nu exista registru de active conectat", connected: "NOT_CONNECTED", owner: "dana", impact: "Valoarea si sarcinile activelor invizibile.", fix: "Registru active (terenuri, apartamente, utilaje)." },
    FINANCING:       { source: "obligatii Credit/Leasing din Operational (serviciul datoriei)", connected: "PARTIAL", owner: "dana", impact: "Costul capitalului si maturitatile complete lipsesc.", fix: "Registru finantari (sold credit, dobanda, maturitate)." },
    DECISIONS:       { source: "registrul de decizii JARVIS (memory.listDecisions)", connected: "CONNECTED", owner: "adrian", impact: "-", fix: "-" },
  },

  // Detaliile lacunelor de date (folosite de dataGapEngine — nucleul e generic).
  gapDetails: {
  CASH: {
    what: "Sold bancar actual (toate conturile)",
    why: "Necesar pentru forecast de cash REAL (necesar NET, ziua deficitului). Fara el, doar necesar brut de plati.",
    best_source: "integrare bancara (PSD2) / SmartBill / import automat / Dana",
    temporary: "Dana introduce soldurile zilnic (formularul Excel exista deja, trimis Danei)",
    permanent: "conector automat bancar sau SmartBill pe server",
    implementation: "Faza 1: camp 'sold zilnic' + formular (Operational sau mesaj catre JARVIS). Faza 2: SmartBill API pe server (config local exista). Faza 3: open banking.",
    request: { to: "dana", ask: "Introdu soldurile conturilor Profi Concept in fiecare dimineata pana la 09:00 (formularul Excel primit).", cadence: "zilnic 09:00" },
  },
  RECEIVABLES: {
    what: "Incasari de primit (certe si probabile), cu termene",
    why: "Partea de INTRARI a lichiditatii; fara ea forecastul e doar iesiri.",
    best_source: "SmartBill (facturi emise neincasate) + antecontracte Bell",
    temporary: "Dana listeaza incasarile asteptate pe 30/60/90 zile (acelasi formular)",
    permanent: "SmartBill API (facturi emise + status incasare)",
    implementation: "Citire facturi emise neincasate din SmartBill; camp separat pt avansuri contractate Bell.",
    request: { to: "dana", ask: "Completeaza incasarile estimate pe 30/60/90 de zile in formularul JARVIS.", cadence: "saptamanal" },
  },
  LEADS: {
    what: "Registru lead-uri (sursa, stadiu, agent, follow-up)",
    why: "Funnelul de vanzari incepe azi abia la rezervare — conversia amonte e invizibila.",
    best_source: "registru in Operational / CRM usor",
    temporary: "lista saptamanala de lead-uri de la agenti (partener tab exista)",
    permanent: "modul lead-uri in Operational cu stadii",
    implementation: "Tabel leads (nume, sursa, stadiu, agent, ultima interactiune) + tool MCP de citire.",
    request: { to: "adrian", ask: "Decide unde tinem lead-urile (Operational vs CRM) ca sa conectam funnelul complet.", cadence: "o data" },
  },
  WEBSITE_TRAFFIC: {
    what: "Trafic bellresidence.ro (Spion/GA4)",
    why: "Cererea din piata si efectul campaniilor sunt invizibile motorului de observatie.",
    best_source: "endpoint de citire Spion + GA4 API (proprietate existenta)",
    temporary: "raport saptamanal manual din GA4",
    permanent: "conector GA4 read-only pe server (service account jarvis-reader exista)",
    implementation: "GA4 Data API cu service account; detectorii de trafic sunt DEJA implementati si tac pana vine sursa.",
    request: null,
  },
  BANK: {
    what: "Rulaje si solduri bancare automate",
    why: "Adevarul final al cash-ului; elimina dependenta de input uman.",
    best_source: "open banking (PSD2) via agregator licentiat",
    temporary: "export CSV saptamanal din BT incarcat de Dana",
    permanent: "agregator PSD2 (ex. Salt Edge/Nordigen) read-only",
    implementation: "Etapa ulterioara — necesita decizie de furnizor si consimtamant bancar (Adrian).",
    request: null,
  },
  ACCOUNTING: {
    what: "Facturi emise/primite + scadente (SmartBill pe server)",
    why: "Payables din Operational sunt intretinute manual; SmartBill e sursa primara.",
    best_source: "SmartBill Cloud API (oficial)",
    temporary: "integrarea locala de pe BIROU (exista) rulata manual",
    permanent: "port pe server cu cheie API in env (Change Control)",
    implementation: "Modul connectors/smartbill.js read-only: facturi, scadente, incasari.",
    request: null,
  },
},
};

/** Persoana din config dupa nume/alias (normalizat). NU hardcoda nume in nucleu. */
export function personFor(name = "") {
  const n = String(name).toLowerCase().trim();
  return COMPANY.people.find((p) => p.name.toLowerCase() === n || p.id === n || p.aliases.includes(n)) || null;
}

/** Starea de conectivitate REALA a instantei (probe minime, fara IO greu). */
export function liveConnectivity() {
  return {
    operational: hasOperational,
    db: hasDb,
    calendar: hasCalendar,
    gmail: !!(config.google.clientId && config.google.refreshToken),
    opsdb: !!config.operationalDbUrl,
  };
}
