// ═══ DATE DEMO — DOAR PENTRU DEZVOLTARE/PREZENTARE (?demo=1) ═══
// Acestea NU sunt datele companiei. Bannerul „DATE DEMO" ramane vizibil
// permanent cat timp modul e activ, iar orice actiune de scriere e blocata.
// Formele imita exact contractele API-urilor reale (vezi src/ceo/api.js).

const NOW = () => new Date().toISOString();
const D = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

export const fixtures = {
  "/api/status": { ok: true, sources: { operational: true, memory: true } },

  "/api/ceo/manifest": {
    company: { id: "demo-company", name: "COMPANIA DEMO", brand: "Demo Residence", timezone: "Europe/Bucharest" },
    roles: [
      { id: "founder", name: "Fondator Demo", role: "fondator" },
      { id: "fin", name: "F. Financiar", role: "financiar" },
      { id: "ops", name: "O. Execuție", role: "execuție" },
    ],
    can_observe: ["CASH", "SALES", "PROJECTS", "PEOPLE", "TASKS"],
    can_propose: ["information_request", "task_proposal", "system_improvement", "decision_analysis"],
    can_execute: [],
    requires_approval: ["orice trimitere de cerere/task", "orice actiune cu efect"],
  },

  "/api/ceo/today": () => ({
    company: "COMPANIA DEMO",
    generated_at: NOW(),
    data_health: { score: 68, not_connected: ["EMAIL", "LEGAL"] },
    system_health: { score: 92, failing: [] },
    cash: {
      minim: { available_now: 412000, minimum_cash: 61000, minimum_cash_date: D(24), first_deficit_date: "UNKNOWN" },
      ce_nu_stim: ["Încasările probabile peste 30 de zile nu au termene ferme"],
      incredere: 74,
    },
    receivables: { statement: "Încasări confirmate 30z: 180.000 lei (2 antecontracte); probabile: 240.000 lei fără termene ferme.", totals: { confirmedRON: 180000, overdueRON: 32000, probableRON: 240000, collected_count: 4 }, gaps: [] },
    priorities: [
      { rank: 1, title: "Presiune de lichiditate în fereastra 21–35 de zile", score: 74, why: "Ieșiri concentrate (rate + furnizori) înaintea încasărilor din antecontracte", evidence: "[cashIntelligence] orizont 30z", confidence: 74, impact: "punct minim 61.000 lei la " + D(24) },
      { rank: 2, title: "Variație de execuție la proiectul C3", score: 55, why: "Jurnalele de șantier arată 9 zile fără progres pe fațadă", evidence: "[projects] jurnal șantier", confidence: 60, impact: "risc de decalare a predărilor din T4" },
      { rank: 3, title: "Situația încasărilor la zi lipsește", score: 48, why: "Registrul de încasări nu a fost actualizat de 6 zile", evidence: "[data-map] RECEIVABLES", confidence: 80 },
    ],
    who: {
      ADRIAN: ["Decide: plafonul avansului pentru negocierea blocului C3"],
      DANA: ["Situația clienți – încasări la zi (formular JARVIS)", "Confirmă soldurile bancare de azi"],
      NELU: ["Confirmă stadiul fațadei C3 cu poze în jurnal"],
      SYSTEM: ["Conector SmartBill: reîmprospătare programată"],
    },
    forward30: {
      risks: [
        { text: "Ieșiri certe de 654.000 lei în 30 de zile cu acoperire parțial confirmată", evidence: "[cashIntelligence] orizont 30z", confidence: 90 },
        { text: "Rezervările fără avans se pot anula fără cost", evidence: "[sales] rezervări", confidence: 70 },
      ],
      lost_opportunities: [], decisions_becoming_urgent: [],
    },
    needs_decision: [{
      proposal_id: "prop:demo:cash",
      problem: "Soldul bancar la zi lipsește pentru forecastul net",
      evidence: ["[data-map] CASH", "Fără sold nu există necesar NET de cash"],
      recommendation: "Cere: introducerea soldurilor zilnice în Command Center",
      task_proposal: { assignee: "fin", deadline: "zilnic 09:00" },
      state: "proposed",
      readiness: "READY_FOR_FIRST_CONTROLLED_EXECUTION",
      what_it_unlocks: "Lichiditate netă, punctul minim de cash, ziua deficitului — instant.",
      risk_if_nothing: "654.000 lei ieșiri/30z fără vizibilitate pe acoperire.",
    }],
    gaps: [
      "Sold bancar actual (CASH) — necesar pentru forecast REAL",
      "Registru lead-uri (LEADS) — conversia amonte invizibilă",
    ],
  }),

  "/api/ceo/organism": () => ({
    enabled: true, mode: "shadow", autonomous_info_tasks: false, kill_switch: false,
    at: new Date(Date.now() - 14 * 60000).toISOString(), kind: "midday",
    ceo_status: "SHADOW — ciclu midday rulat; 2 nevoi reale, 1 dublură prevenită, 0 acțiuni neautorizate",
    what_i_see: { data_health: 68, observations: 7, open_tasks: 12, stale_sources: ["receivables"] },
    what_i_need: [
      { type: "INFORMATION", title: "Situația încasărilor la zi", owner_hint: "fin" },
      { type: "INFORMATION", title: "Stadiul real al fațadei C3", owner_hint: "ops" },
    ],
    what_i_asked: [
      { title: "Situația clienți – încasări la zi", owner: "fin", state: "PROPOSED", shadow: true },
    ],
    waiting: ["Aprobarea cererii de solduri bancare (Inbox)"],
    blocked: [],
    resolved: ["Reconcilierea facturilor din iunie — verificată"],
    needs_founder: [],
    founder_label: "Fondator",
    system_health: { status: "OK", score: 92, detections: [] },
    people_load: [],
    selfeval: { needs_detected: 2, duplicates_prevented: 1, loops_closed_7d: 3, escalations: 0 },
    verdict: "Organismul funcționează în parametri; aștept date pentru cash.",
    results: { would_create: [{ title: "Situația clienți – încasări la zi", owner: "fin", deadline: D(1), why: "Cash forecast" }], proposed: [], created: [], duplicates: [], unknown_owner: [] },
  }),

  "/api/ceo/activity-stream": () => ({
    entries: [
      { at: new Date(Date.now() - 15 * 60000).toISOString(), event: "cycle_start", detail: "midday" },
      { at: new Date(Date.now() - 15 * 60000).toISOString(), event: "need_detected", detail: "INFORMATION: Situația încasărilor la zi" },
      { at: new Date(Date.now() - 14 * 60000).toISOString(), event: "owner_identified", detail: "Situația încasărilor la zi → fin" },
      { at: new Date(Date.now() - 14 * 60000).toISOString(), event: "task_would_create", detail: "SHADOW: aș fi creat task „Situația clienți – încasări la zi” pentru fin" },
      { at: new Date(Date.now() - 14 * 60000).toISOString(), event: "duplicate_prevented", detail: "Sold bancar: cerere deja în Inbox" },
      { at: new Date(Date.now() - 13 * 60000).toISOString(), event: "cycle_end", detail: "midday: 2 nevoi, 1 shadow, 0 create" },
    ],
    text: "15:02 cycle_start midday\n15:02 need_detected INFORMATION: Situația încasărilor la zi\n15:03 owner_identified → fin\n15:03 task_would_create SHADOW\n15:03 duplicate_prevented sold bancar\n15:04 cycle_end 2 nevoi / 1 shadow",
  }),

  "/api/ceo/queue": {
    NEEDS_ADRIAN: [{ id: "prop:demo:cash", problem: "Soldul bancar la zi lipsește", assignee: "fin", state: "proposed" }],
    WAITING_FOR_APPROVAL: [],
    WAITING_FOR_DATA: [{ id: "prop:demo:recv", problem: "Situația încasărilor la zi", assignee: "fin", delivery: "AWAITING_RESPONSE" }],
    IN_PROGRESS: [],
    COMPLETED: [{ id: "prop:demo:rec", problem: "Reconcilierea facturilor din iunie", state: "verified" }],
    BLOCKED: [],
  },

  "/api/ceo/data-health": {
    healthScore: 68, connected: 12, total: 21,
    notConnected: ["EMAIL", "CALENDAR", "LEGAL"],
    partial: ["CASH", "BANK", "LEADS", "MARKETING", "FINANCING"],
    domains: [
      { domain: "CASH", connected: "PARTIAL", owner: "fin", business_impact: "Fără sold nu există necesar NET de cash", how_to_fix: "Formular zilnic → conector bancar" },
      { domain: "BANK", connected: "PARTIAL", owner: "fin", business_impact: "Rulaje fără sold", how_to_fix: "PSD2 / export zilnic" },
      { domain: "ACCOUNTING", connected: "CONNECTED", owner: "fin" },
      { domain: "PAYABLES", connected: "CONNECTED", owner: "fin" },
      { domain: "RECEIVABLES", connected: "CONNECTED", owner: "fin" },
      { domain: "SALES", connected: "CONNECTED", owner: "founder" },
      { domain: "LEADS", connected: "PARTIAL", owner: "founder", business_impact: "Conversia amonte invizibilă", how_to_fix: "Registru lead-uri" },
      { domain: "BELL_INVENTORY", connected: "CONNECTED", owner: "founder" },
      { domain: "PROJECTS", connected: "CONNECTED", owner: "ops" },
      { domain: "CONSTRUCTION", connected: "PARTIAL", owner: "ops", business_impact: "Progres fizic nemăsurabil", how_to_fix: "% progres pe faze" },
      { domain: "SUPPLIERS", connected: "CONNECTED", owner: "ops" },
      { domain: "PEOPLE", connected: "CONNECTED", owner: "founder" },
      { domain: "TASKS", connected: "CONNECTED", owner: "founder" },
      { domain: "WEBSITE_TRAFFIC", connected: "CONNECTED", owner: "founder" },
      { domain: "MARKETING", connected: "PARTIAL", owner: "founder", business_impact: "Cost/lead invizibil", how_to_fix: "Conector Ads API" },
      { domain: "EMAIL", connected: "NOT_CONNECTED", owner: "founder", how_to_fix: "OAuth Google" },
      { domain: "CALENDAR", connected: "NOT_CONNECTED", owner: "founder", how_to_fix: "OAuth Google" },
      { domain: "LEGAL", connected: "NOT_CONNECTED", owner: "founder", how_to_fix: "Registru termene juridice" },
      { domain: "FINANCING", connected: "PARTIAL", owner: "fin", business_impact: "Costul capitalului incomplet", how_to_fix: "Registru finanțări" },
      { domain: "DECISIONS", connected: "CONNECTED", owner: "founder" },
      { domain: "ASSETS", connected: "PARTIAL", owner: "fin", how_to_fix: "Registru active" },
    ],
  },

  "/api/ceo/gaps": {
    gaps: [
      { data_gap: "Sold bancar actual (toate conturile)", domain: "CASH", severity: "major",
        why: "Necesar pentru forecast de cash REAL (necesar NET, ziua deficitului).",
        information_request: { to: "fin", ask: "Introdu soldurile în formular până la 09:00.", cadence: "zilnic 09:00" } },
      { data_gap: "Încasări de primit cu termene", domain: "RECEIVABLES", severity: "major",
        why: "Partea de INTRĂRI a lichidității; fără ea forecastul e doar ieșiri.",
        information_request: { to: "fin", ask: "Completează încasările estimate pe 30/60/90 zile.", cadence: "săptămânal" } },
      { data_gap: "Registru lead-uri (sursă, stadiu, agent)", domain: "LEADS", severity: "minor",
        why: "Funnelul începe abia la rezervare — conversia amonte e invizibilă." },
    ],
  },

  "/api/ceo/cash": () => ({
    confidence: 74,
    data_gaps: ["Încasările probabile nu au termene ferme"],
    horizons: {
      7:  { inflows: { confirmed: 60000 },  outflows: { total_known: 118000 }, net: 354000 },
      14: { inflows: { confirmed: 120000 }, outflows: { total_known: 231000 }, net: 301000 },
      21: { inflows: { confirmed: 120000 }, outflows: { total_known: 388000 }, net: 144000 },
      30: { inflows: { confirmed: 180000 }, outflows: { total_known: 531000 }, net: 61000 },
      60: { inflows: { confirmed: 420000 }, outflows: { total_known: 812000 }, net: 20000 },
      90: { inflows: { confirmed: 660000 }, outflows: { total_known: 1104000 }, net: -32000 },
    },
    balances: { accounts: [{ bank: "ING", account: "4821", currency: "RON", available: 412000, age_hours: 3, enteredBy: "fin" }], totalRON: 412000, freshness: "FRESH", expired: false },
  }),

  "/api/ceo/bank-balance": {
    accounts: [{ bank: "ING", account: "4821", currency: "RON", available: 412000, age_hours: 3, enteredBy: "fin" }],
    totalRON: 412000, freshness: "FRESH", expired: false,
  },

  "/api/ceo/bank-intel": () => ({
    period: { from: D(-30), to: D(0) },
    totals: { inRON: 486000, outRON: 519000 },
    daily_avg: { outRON: 17300 },
    burn_rate_note: "Ieșirile depășesc intrările cu ~33.000 lei pe fereastra analizată.",
    recurring_out: [{ key: "rate leasing", avgRON: 21400 }, { key: "salarii", avgRON: 86000 }, { key: "chirie birou", avgRON: 4800 }],
  }),

  "/api/ceo/attribution": {
    chain: {
      traffic: { status: "CONNECTED", last7_avg: 84 },
      leads: { status: "ATTRIBUTION_GAP", count: 6 },
      reservations: { status: "CONNECTED", count: 3 },
      sales: { status: "CONNECTED", count: 1 },
      cash: { status: "CONNECTED" },
    },
    findings: [{ finding: "Traficul crește, dar lead-urile nu au sursă atribuită (UTM incomplet)." }],
  },

  "/api/ceo/financing": {
    entries: [
      { creditor: "Credit investiții C3", type: "credit", installmentRON: 38500, next_due: D(9), known_installments: 18, committed_90d: 115500, outstanding_balance: "UNKNOWN", status: "activ (dedus din scadențar)" },
      { creditor: "Leasing utilaje", type: "leasing", installmentRON: 21400, next_due: D(4), known_installments: 24, committed_90d: 64200, outstanding_balance: "UNKNOWN", status: "activ (dedus din scadențar)" },
    ],
    total_monthly_service: 59900,
    data_gaps: ["sold rămas per finanțare", "dobânda/DAE", "garanții și covenants", "maturitate finală"],
    information_request_hint: "Financiar: completează pentru fiecare finanțare soldul rămas, dobânda și maturitatea.",
  },

  "/api/ceo/system-health": { score: 92, failing: [] },
  "/api/ceo/source-health": { sources: { operational: { status: "OK", as_of: NOW() }, smartbill: { status: "OK", as_of: NOW() }, google: { status: "NOT_CONFIGURED" } } },
  "/api/ceo/reconciliation": { status: "NOT_CONNECTED" },
  "/api/ceo/identity-candidates": { candidates: {}, mapped: { fin: "12345" } },
  "/api/ceo/nervous-health": {
    health: { status: "OK", score: 92, detections: [] },
    selfeval: { needs_detected: 2, duplicates_prevented: 1, loops_closed_7d: 3 },
    memory: { summary: "3 bucle închise în ultimele 7 zile; owner corect în 100% din cazuri." },
  },
  "/api/ceo/proposals": {
    proposals: {},
    improvements: {
      "imp:receivables": { problem: "Situația încasărilor se cere manual", proposed_change: "Importer XLSX/API pentru încasări (capability nouă)", value: "Cash forecast zilnic fără muncă umană", risk: "Scăzut — read-only, validare la import" },
      "imp:leads": { problem: "Lead-urile nu au registru", proposed_change: "Modul lead-uri în Operational cu stadii", value: "Funnel complet trafic → contract", risk: "Mediu — schimbă procesul agenților" },
    },
  },
  "/api/ceo/decisions": {
    proposals: {}, decision_memory: [
      { decision: "Aprobat: cerere solduri zilnice", decided_at: D(-6), outcome: "date primite 5/6 zile", lesson: "cadența de dimineață funcționează" },
    ], loop: {},
  },
  "/api/ceo/overview": { funnel_connected: ["reservations", "sales"], funnel_missing: ["leads sursă"] },
  "/api/history": { messages: [] },
};
