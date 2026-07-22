// NERVOUS SYSTEM V1 §3-§4 — NEED ENGINE: metabolismul CEO AI.
// Rol: transforma semnalele brute ale unui ciclu (lacune de date, observatii,
// detectii de funnel, probleme de incasare, reconciliere, task-uri restante,
// surse invechite) in NEVOI in forma canonica din contract.js. Fiecare nevoie
// primeste TASK_VALUE_SCORE (§4: un task exista DOAR daca NO ACTION duce la
// MATERIAL CONSEQUENCE) si rationamentul pe cele 15 intrebari-cheie (§3).
// PUR si determinist: zero IO, zero nume de oameni/companie in cod — tot ce
// e specific instantei vine prin argumente (domainOwners etc.).
// Reguli respectate aici: date lipsa = "UNKNOWN"/null (niciodata inventate);
// ZERO != NU AM DATE; observatie != task; nevoie != actiune. Acest modul
// DOAR clasifica — nu creeaza task-uri si nu are efecte laterale.

import {
  TASK_TYPES, TASK_VALUE_FIELDS, TASK_VALUE_THRESHOLD,
  OPERATIONAL_CLOSED_STATUSES, taskClassFor, slug, daysBetween,
} from "./contract.js";

// ── HELPERI INTERNI (puri) ──────────────────────────────────────────────

/** Clamp + rotunjire in intervalul 0-100. */
const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

/** Lista sigura dintr-un input posibil lipsa. */
const arr = (x) => (Array.isArray(x) ? x : []);

/** Valori unice, fara goluri. */
const uniq = (xs) => [...new Set(xs.filter(Boolean))];

/** Severitatea normalizata a unei observatii. */
const sevOf = (o) => String(o?.severity || "").toLowerCase();

/** Titlul scurt al unui semnal — strict din datele lui, nu inventat. */
const titleOf = (x) => String(x?.title || x?.summary || x?.kind || x?.type || "semnal fara titlu").slice(0, 120);

/** Numele afisabil al unei surse invechite. */
const staleName = (s) => String(s?.domain || s?.source || s?.name || "sursa necunoscuta");

/** Domeniu normalizat pentru need_id (majuscule, fara spatii). */
const normDomain = (d) => String(d || "GENERAL").toUpperCase().replace(/[^A-Z0-9_]+/g, "_") || "GENERAL";

/** Domeniul derivat generic din tipul unei observatii (cuvinte de domeniu). */
function domainFromObservationType(t) {
  const s = String(t || "").toLowerCase();
  if (!s) return null;
  if (/restant|plat|obligat/.test(s)) return "PAYABLES";
  if (/cash|sold|lichid/.test(s)) return "CASH";
  if (/trafic|site|web/.test(s)) return "WEBSITE_TRAFFIC";
  if (/vanzar|sales|rezervar/.test(s)) return "SALES";
  if (/lead/.test(s)) return "LEADS";
  if (/santier|lucrar|construct|proiect/.test(s)) return "CONSTRUCTION";
  if (/task/.test(s)) return "TASKS";
  if (/factur|incasar/.test(s)) return "RECEIVABLES";
  return null;
}

/** Task deschis conform statusurilor reale Operational (contract). */
const isOpenTask = (t) => !OPERATIONAL_CLOSED_STATUSES.includes(String(t?.status || "").toLowerCase());

/** Cererea de informatie a unei lacune, daca exista in date. */
const gapRequest = (g) => g?.information_request || g?.request || null;

/** Consecinta materiala a unui semnal — doar din campurile lui. */
const consequenceOf = (x) => x?.material_consequence || x?.consequence || x?.impact || null;

/** Incredere derivata din numarul de dovezi (nu din intuitie). */
const confFromEvidence = (n, base = 35, step = 15, cap = 90) =>
  clamp100(Math.min(cap, base + step * (Number(n) || 0)));

/** Task-uri restante: deadline strict inainte de asOf si status deschis. */
function overdueTasks(opsTasks, asOf) {
  if (!asOf) return [];
  return arr(opsTasks).filter((t) => {
    if (!isOpenTask(t) || !t?.deadline) return false;
    const d = daysBetween(t.deadline, asOf);
    return d != null && d > 0;
  });
}

/** Numarul de divergente dintr-o reconciliere (accepta numar sau lista). */
function divergenceCount(recon) {
  if (!recon) return 0;
  if (Array.isArray(recon.divergences)) return recon.divergences.length;
  const n = Number(recon.divergences);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Cadenta unei cereri → urgenta in zile (doar forme cunoscute; altfel null). */
function cadenceToDays(cadence) {
  const c = String(cadence || "").toLowerCase();
  if (c.startsWith("zilnic")) return 1;
  if (c.startsWith("saptamanal")) return 7;
  if (c.startsWith("lunar")) return 30;
  return null;
}

/** Scala saturanta 0-100: value == half → 50; creste spre 100 fara a exploda. */
function saturating(value, half) {
  const v = Number(value) || 0;
  if (v <= 0) return 0;
  return clamp100((100 * v) / (v + half));
}

/** Urgenta 0-100 din zile ramase; necunoscut != urgent (scor moderat-jos). */
function urgencyScore(days) {
  if (days == null || !Number.isFinite(Number(days))) return 20;
  const d = Number(days);
  if (d <= 0) return 100;
  if (d <= 1) return 90;
  if (d <= 3) return 75;
  if (d <= 7) return 55;
  if (d <= 14) return 40;
  if (d <= 30) return 25;
  return 10;
}

// ── TASK_VALUE_SCORE (§4) ───────────────────────────────────────────────

// Riscul de baza pe severitate; severitate necunoscuta = risc jos (nu inventam).
const SEVERITY_RISK = { critical: 90, high: 70, medium: 45, low: 20 };

// Ponderile dimensiunilor din TASK_VALUE_FIELDS (suma = 1.00).
const VALUE_WEIGHTS = {
  financial_impact: 0.18, risk: 0.14, urgency: 0.14, dependencies: 0.10,
  information_value: 0.12, operational_impact: 0.12, reversibility: 0.06,
  cost_of_inaction: 0.14,
};

/**
 * Scorul de valoare al unei nevoi (§4): fiecare dimensiune 0-100, total 0-100
 * ponderat si rotunjit. Determinist: derivat EXCLUSIV din campurile nevoii
 * (cash_impactRON, urgency_days, severity, blocking, evidence.length,
 * prezenta material_consequence / expected_change) — fara aleator, fara IO.
 * @param {object} need nevoie (partiala sau canonica)
 * @returns {{financial_impact:number,risk:number,urgency:number,dependencies:number,information_value:number,operational_impact:number,reversibility:number,cost_of_inaction:number,total:number}}
 */
export function scoreTaskValue(need = {}) {
  const evCount = arr(need.evidence).length;
  const hasCons = !!need.material_consequence;
  const hasChange = !!need.expected_change;
  const sev = String(need.severity || "").toLowerCase();
  const blocking = need.blocking === true;
  const cls = need.task_type ? taskClassFor(need.task_type) : null;
  const isInfo = need.type === "INFORMATION_NEED" || cls === "INFORMATION_TASK";

  // financial_impact: scala saturanta — 50.000 RON = 50 puncte; lipsa datei = 0.
  const financial_impact = saturating(need.cash_impactRON, 50_000);
  // risk: severitatea semnalului + bonus daca blocheaza altceva.
  const risk = clamp100((SEVERITY_RISK[sev] ?? 10) + (blocking ? 10 : 0));
  // urgency: din zilele ramase; null = necunoscut, NU urgent.
  const urgency = urgencyScore(need.urgency_days);
  // dependencies: blocheaza alte lucruri → scor mare.
  const dependencies = blocking ? 80 : 10;
  // information_value: cat de mult reduce incertitudinea raspunsul.
  const information_value = clamp100((isInfo ? 65 : 25) + Math.min(20, evCount * 5) + (hasChange ? 10 : 0));
  // operational_impact: consecinta materiala + blocaj + severitate ridicata.
  const operational_impact = clamp100(
    (hasCons ? 55 : 10) + (blocking ? 25 : 0) + (sev === "high" || sev === "critical" ? 15 : 0)
  );
  // reversibility: a cere o informatie e complet reversibil; deciziile nu.
  const reversibility = cls === "INFORMATION_TASK" ? 90 : cls === "DECISION_TASK" ? 30 : cls === "ACTION_TASK" ? 50 : 70;
  // cost_of_inaction: ce se strica daca NU facem nimic (§4).
  const cost_of_inaction = clamp100(
    (hasCons ? 45 : 10) + Math.round(urgency * 0.3) + Math.round(financial_impact * 0.25)
  );

  const scores = {
    financial_impact, risk, urgency, dependencies,
    information_value, operational_impact, reversibility, cost_of_inaction,
  };
  let total = 0;
  for (const f of TASK_VALUE_FIELDS) total += (scores[f] ?? 0) * (VALUE_WEIGHTS[f] ?? 0);
  return { ...scores, total: clamp100(total) };
}

// ── CELE 15 INTREBARI-CHEIE (§3) ────────────────────────────────────────

/**
 * Raspunde deterministic la cele 15 intrebari ale metabolismului, DOAR din
 * inputs (dataGaps, observations, balances, opsTasks, staleSources, plus
 * optional reconciliation/domain/domainOwners/asOf). Ce nu stim = "UNKNOWN"
 * sau false — niciodata inventat.
 * @param {object} inputs subsetul de semnale relevant pentru o nevoie
 * @returns {object} { q1_what_i_know ... q15_worth_a_task } (string scurt sau boolean)
 */
export function answerFifteen(inputs = {}) {
  const gaps = arr(inputs.dataGaps);
  const obs = arr(inputs.observations);
  const tasks = arr(inputs.opsTasks);
  const stale = arr(inputs.staleSources);
  const balances = inputs.balances || null;
  const recon = inputs.reconciliation || null;
  const owners = inputs.domainOwners || {};
  const domain = inputs.domain || null;
  const asOf = inputs.asOf || null;

  const gapsWithReq = gaps.filter((g) => gapRequest(g));
  const severe = obs.filter((o) => sevOf(o) === "high" || sevOf(o) === "critical");
  const medium = obs.filter((o) => sevOf(o) === "medium");
  const opportunities = obs.filter((o) => o?.opportunity === true || o?.kind === "opportunity");
  const decisions = obs.filter((o) => o?.requires_decision === true);
  const blocked = tasks.filter((t) => String(t?.status || "").toLowerCase() === "blocat");
  const overdue = overdueTasks(tasks, asOf);
  const divCount = divergenceCount(recon);
  const firstReq = gapsWithReq.length ? gapRequest(gapsWithReq[0]) : null;

  // q1: ce STIM — strict inventarul semnalelor primite.
  const know = [];
  if (obs.length) know.push(`${obs.length} observatii`);
  if (tasks.length) know.push(`${tasks.length} task-uri vizibile`);
  if (balances) know.push(`solduri prezente (${balances.freshness || "UNKNOWN"})`);
  if (recon) know.push("reconciliere disponibila");
  if (stale.length) know.push(`${stale.length} surse invechite`);

  const missing = uniq(gaps.map((g) => g?.domain || g?.what || null));
  const shouldKnow = uniq(gapsWithReq.map((g) => g?.what || g?.domain || null));

  // q14: cea mai mica actiune care schimba starea (nu cea mai spectaculoasa).
  let smallest = "monitorizeaza semnalul";
  if (firstReq) smallest = `cere informatia: ${gapsWithReq[0]?.what || gapsWithReq[0]?.domain || "?"}`;
  else if (severe.length) smallest = `verifica: ${titleOf(severe[0])}`;
  else if (divCount > 0) smallest = "clarifica divergentele intre surse";
  else if (blocked.length || overdue.length) smallest = "urmareste task-urile blocate/restante";
  else if (stale.length) smallest = "reimprospateaza sursa de date";

  // q15: merita task DOAR cu dovezi + consecinta / cerere concreta (§4).
  const worth =
    gapsWithReq.length > 0 ||
    divCount > 0 ||
    severe.some((o) => arr(o?.evidence).length > 0 && !!consequenceOf(o));

  return {
    q1_what_i_know: know.length ? know.join("; ") : "UNKNOWN",
    q2_what_i_dont_know: missing.length ? `lipsesc: ${missing.join(", ")}` : "nicio lacuna in subsetul analizat",
    q3_should_know: shouldKnow.length ? `de aflat: ${shouldKnow.join(", ")}` : false,
    q4_stale: stale.length ? `surse invechite: ${uniq(stale.map(staleName)).join(", ")}` : false,
    q5_contradictory: divCount > 0 ? `${divCount} divergente intre surse` : false,
    q6_problem_now: severe.length ? titleOf(severe[0]) : false,
    q7_problem_likely: medium.length ? titleOf(medium[0]) : false,
    q8_opportunity_at_risk: opportunities.length ? titleOf(opportunities[0]) : false,
    q9_decision_blocked: decisions.length ? titleOf(decisions[0]) : false,
    q10_task_blocked: blocked.length || overdue.length ? `${blocked.length} blocate, ${overdue.length} restante` : false,
    q11_person_must_act: firstReq?.to || (domain && owners[domain]) || false,
    q12_can_system_solve: stale.length > 0 || gaps.some((g) => !gapRequest(g)),
    q13_natural_owner: (domain && owners[domain]) || firstReq?.to || "UNKNOWN",
    q14_smallest_action: smallest,
    q15_worth_a_task: worth,
  };
}

// ── ASAMBLAREA UNEI NEVOI CANONICE ──────────────────────────────────────

/** Construieste o nevoie in forma canonica din contract + scorul ei. Intern. */
function makeNeed(fields) {
  const domain = normDomain(fields.domain);
  const need = {
    // need_id STABIL cand e furnizat explicit (ex. pe ID-ul task-ului original)
    // — dedup real, imun la schimbari de titlu.
    need_id: fields.need_id_override || `need:${domain}:${slug(fields.title || fields.summary || "", 40)}`,
    type: fields.type,
    title: fields.title || "",
    summary: fields.summary || "",
    domain,
    task_type: fields.task_type ?? null,
    evidence: arr(fields.evidence),
    material_consequence: fields.material_consequence ?? null,
    expected_change: fields.expected_change ?? null,
    suggested_owner_hint: fields.suggested_owner_hint ?? null,
    urgency_days: fields.urgency_days ?? null,
    confidence: clamp100(fields.confidence ?? 50),
    // campuri de scor — raman pe nevoie pentru audit si re-scor determinist
    severity: fields.severity ?? null,
    blocking: fields.blocking === true,
    cash_impactRON: fields.cash_impactRON ?? null,
    reasoning: fields.reasoning || {},
    // §11 — context concret pentru ca task-ul uman sa fie auto-suficient
    // (referinta la sursa/task-ul original), fara sa devina eseu.
    context: fields.context ?? null,
    project_hint: fields.project_hint ?? null,
    // REGULA "un task = o responsabilitate": clarificarea unui restant se pune
    // ca OBSERVATIE pe task-ul original, nu ca task nou.
    deliver_as: fields.deliver_as ?? null,
    original_task_id: fields.original_task_id ?? null,
    observation_text: fields.observation_text ?? null,
  };
  need.value = scoreTaskValue(need);
  return need;
}

// ── NEED ENGINE (§3): CLASIFICAREA SEMNALELOR IN NEVOI ──────────────────

/**
 * Transforma semnalele unui ciclu in nevoi canonice. PUR: fara task-uri,
 * fara side-effects — doar clasificare + anti-spam (§4).
 * @returns {{needs:Array, audit_only:Array, no_action:Array<{reason:string,signal:string}>}}
 */
export function buildNeeds({
  asOf,
  dataGaps = [],
  observations = [],
  funnelDetections = [],
  receivableIssues = [],
  reconciliation = null,
  opsTasks = [],
  balances = null,
  episodes = [],
  staleSources = [],
  domainOwners = {},
} = {}) {
  const candidates = [];
  const no_action = [];
  // episodes: acceptat pentru compatibilitatea semnaturii de ciclu; memoria
  // episodica e treaba altor motoare (dedup/cooldown §12) — aici nu clasifica.
  void episodes;

  // (a) LACUNE DE DATE → INFORMATION_NEED (doar cele cu cerere de informatie).
  for (const g of arr(dataGaps)) {
    const req = gapRequest(g);
    const domain = normDomain(g?.domain);
    if (!req) {
      no_action.push({
        reason: "lacuna structurala fara cerere de informatie — rezolvarea e un conector de sistem, nu o intrebare catre o persoana",
        signal: `dataGap:${domain}`,
      });
      continue;
    }
    // I din §28: daca datele de cash EXISTA deja si sunt proaspete, nu cerem din nou.
    if (domain === "CASH" && balances && String(balances.freshness || "").toUpperCase() === "FRESH") {
      no_action.push({
        reason: "datele de cash exista deja si sunt proaspete — nu se cere aceeasi informatie din nou",
        signal: "dataGap:CASH",
      });
      continue;
    }
    const evidence = [
      `lacuna identificata in harta de date: ${domain}`,
      ...(g.best_source ? [`sursa recomandata: ${g.best_source}`] : []),
      ...(g.temporary ? [`solutie temporara: ${g.temporary}`] : []),
    ];
    candidates.push(makeNeed({
      domain,
      type: "INFORMATION_NEED",
      task_type: domain === "CASH" ? "CASH_DATA" : "MISSING_INFO",
      title: `Informatie lipsa: ${g.what || domain}`,
      summary: g.why || `Lipseste: ${g.what || domain}`,
      evidence,
      material_consequence: consequenceOf(g) || g.why || null,
      expected_change: g.what ? `informatia "${g.what}" devine disponibila pentru decizii` : "lacuna de date se inchide",
      suggested_owner_hint: domainOwners[domain] || req.to || null,
      urgency_days: g.urgency_days ?? cadenceToDays(req.cadence),
      confidence: 90, // lacuna e constatata structural, nu intuita
      reasoning: answerFifteen({ dataGaps: [g], balances, domain, domainOwners, asOf }),
    }));
  }

  // (b) OBSERVATII → ACTION_NEED (doar severe, cu dovezi + consecinta) sau
  //     OBSERVATION (medium cu dovezi); semnal slab → no_action (§4-h).
  for (const o of arr(observations)) {
    const sev = sevOf(o);
    // Observatiile reale (Observation Engine) nu au camp domain — il derivam
    // generic din o.type (cuvinte de domeniu, nu nume de oameni/companii).
    const domain = o?.domain ? normDomain(o.domain) : (domainFromObservationType(o?.type) || "OPERATIONS");
    const evidence = arr(o?.evidence);
    // Consecinta materiala: explicita, sau derivata DOAR din semnale tari
    // (blocking / impact cash declarat) — nu inventam gravitate.
    const cons = consequenceOf(o) || (o?.blocking === true && o?.title ? `${o.title} — blocheaza activitate curenta` : null) ||
      (Number.isFinite(Number(o?.cash_impactRON)) && Number(o.cash_impactRON) > 0 ? `impact cash estimat: ${o.cash_impactRON} RON` : null);
    const base = {
      domain,
      title: titleOf(o),
      summary: o?.summary || o?.title || "",
      evidence,
      severity: sev || null,
      blocking: o?.blocking === true,
      cash_impactRON: o?.cash_impactRON ?? null,
      urgency_days: o?.urgency_days ?? null,
      suggested_owner_hint: domainOwners[domain] || null,
      reasoning: answerFifteen({ observations: [o], domain, domainOwners, asOf }),
    };
    if (sev === "high" || sev === "critical") {
      if (evidence.length && cons) {
        candidates.push(makeNeed({
          ...base,
          type: "ACTION_NEED",
          task_type: o?.task_type && TASK_TYPES[o.task_type] ? o.task_type : "OPERATIONAL_FIX",
          material_consequence: cons,
          expected_change: o?.expected_change ?? null,
          confidence: confFromEvidence(evidence.length, 40),
        }));
      } else {
        // severa dar fara dovezi/consecinta clara → ramane observatie, nu actiune
        candidates.push(makeNeed({
          ...base,
          type: "OBSERVATION",
          task_type: null,
          material_consequence: cons,
          confidence: confFromEvidence(evidence.length, 30),
        }));
      }
    } else if (sev === "medium") {
      if (evidence.length >= 2) {
        candidates.push(makeNeed({
          ...base,
          type: "OBSERVATION",
          task_type: null,
          material_consequence: cons,
          confidence: confFromEvidence(evidence.length, 30),
        }));
      } else {
        no_action.push({
          reason: "semnal slab: un singur punct de date / dovezi insuficiente",
          signal: titleOf(o),
        });
      }
    } else {
      no_action.push({
        reason: `severitate sub prag (${sev || "necunoscuta"})`,
        signal: titleOf(o),
      });
    }
  }

  // (c) DETECTII DE FUNNEL (ex. rezervari fara avans) → INFORMATION_NEED.
  for (const d of arr(funnelDetections)) {
    // Forma reala din salesIntelligence.buildFunnel: { key, severity, finding,
    // evidence[] } — key-urile info (ex. fara_baseline) sunt zgomot, nu nevoie.
    const kind = d?.key || d?.kind || d?.type || "detectie_funnel";
    if (sevOf(d) === "info" || String(d?.severity || "") === "info") {
      no_action.push({ reason: `detectie funnel informativa (${kind}) — se acumuleaza date, nicio actiune`, signal: `funnel:${kind}` });
      continue;
    }
    const count = d?.count ?? (arr(d?.units).length || arr(d?.items).length || null);
    const evidence = arr(d?.evidence).length
      ? arr(d.evidence)
      : arr(d?.units).length
        ? d.units.map((u) => `unitate: ${typeof u === "string" ? u : u?.id || u?.name || "?"}`)
        : [`detectie funnel: ${kind}${count != null ? ` (${count} cazuri)` : ""}`];
    candidates.push(makeNeed({
      domain: "SALES",
      type: "INFORMATION_NEED",
      task_type: "MISSING_INFO",
      title: d?.title || d?.finding || `Stadiu incert in funnel: ${kind}`,
      summary: d?.summary || d?.detail || d?.finding || `Detectie ${kind}${count != null ? ` pe ${count} pozitii` : ""}`,
      evidence,
      material_consequence: consequenceOf(d) || d?.why || d?.finding ||
        (count != null ? `${count} pozitii cu stadiu incert in funnel — incasarile planificate sunt nesigure` : null),
      expected_change: d?.expected_change || "stadiul real al pozitiilor din funnel devine cunoscut",
      suggested_owner_hint: domainOwners.SALES || null,
      urgency_days: d?.urgency_days ?? null,
      severity: sevOf(d) || "medium",
      cash_impactRON: d?.cash_impactRON ?? d?.amountRON ?? null,
      confidence: confFromEvidence(evidence.length, 40),
      reasoning: answerFifteen({ observations: [d], domain: "SALES", domainOwners, asOf }),
    }));
  }

  // (d) PROBLEME DE INCASARE (facturi neincasate) → INFORMATION_NEED.
  // Forma reala din nervousSystem.detectReceivableIssues: { key, finding,
  // evidence (STRING, nu array) } — acceptam ambele forme.
  for (const r of arr(receivableIssues)) {
    const kind = r?.key || r?.kind || r?.type || "factura_neincasata";
    const ref = r?.invoice || r?.number || r?.id || null;
    const amount = r?.amountRON ?? r?.amount ?? null;
    const evidence = arr(r?.evidence).length ? arr(r.evidence)
      : (typeof r?.evidence === "string" && r.evidence ? [r.evidence] : [
        `problema incasare: ${kind}${ref ? ` (${ref})` : ""}`,
        ...(amount != null ? [`suma: ${amount} RON`] : []),
        ...(r?.overdue_days != null ? [`intarziere: ${r.overdue_days} zile`] : []),
      ]);
    candidates.push(makeNeed({
      domain: "RECEIVABLES",
      type: "INFORMATION_NEED",
      task_type: "INVOICE_CLARIFICATION",
      title: r?.title || r?.finding || `Clarificare incasare${ref ? `: ${ref}` : ""}`,
      summary: r?.summary || r?.finding || `Incasare neconfirmata${ref ? ` pentru ${ref}` : ""}${amount != null ? ` (${amount} RON)` : ""}`,
      evidence,
      material_consequence: consequenceOf(r) || r?.finding ||
        (amount != null ? `incasare de ${amount} RON incerta — lichiditatea planificata nu e reala` : (ref ? `incasare incerta pentru ${ref}` : null)),
      expected_change: r?.expected_change || "statusul incasarii devine cunoscut (incasata / termen / actiune necesara)",
      suggested_owner_hint: domainOwners.RECEIVABLES || null,
      urgency_days: r?.urgency_days ?? (r?.overdue_days != null ? 0 : null),
      severity: sevOf(r) || null,
      cash_impactRON: amount,
      confidence: confFromEvidence(evidence.length, 45),
      reasoning: answerFifteen({ observations: [r], domain: "RECEIVABLES", domainOwners, asOf }),
    }));
  }

  // (e) RECONCILIERE cu divergente → UN SINGUR INFORMATION_NEED grupat.
  const divCount = divergenceCount(reconciliation);
  if (divCount > 0) {
    const divList = Array.isArray(reconciliation?.divergences) ? reconciliation.divergences : [];
    const evidence = divList.length
      ? divList.slice(0, 10).map((x) => (typeof x === "string" ? x : titleOf(x)))
      : [`reconciliere: ${divCount} divergente intre surse`];
    candidates.push(makeNeed({
      domain: "ACCOUNTING",
      type: "INFORMATION_NEED",
      task_type: "INVOICE_CLARIFICATION",
      title: `Reconciliere facturi: ${divCount} divergente intre surse`,
      summary: `Sursele de facturare nu spun aceeasi poveste pe ${divCount} pozitii — clarificare grupata, nu un task per factura.`,
      evidence,
      material_consequence: "cifre financiare contradictorii intre surse — deciziile de cash se iau pe date incerte",
      expected_change: "sursele de facturare ajung la aceleasi cifre pe pozitiile divergente",
      suggested_owner_hint: domainOwners.ACCOUNTING || null,
      urgency_days: reconciliation?.urgency_days ?? null,
      severity: "medium", // date contradictorii = semnal mediu constatat, nu presupus
      cash_impactRON: reconciliation?.amountRON ?? reconciliation?.total_amountRON ?? null,
      confidence: 85,
      reasoning: answerFifteen({ reconciliation, domain: "ACCOUNTING", domainOwners, asOf }),
    }));
  }

  // (f) TASK-URI RESTANTE → O SINGURA OBSERVATIE cu task_blocked in reasoning.
  //     Follow-up-ul il decide alt motor (§16) — NU cream ACTION_NEED nou
  //     pentru un task care exista deja.
  const overdue = overdueTasks(opsTasks, asOf);
  if (overdue.length) {
    candidates.push(makeNeed({
      domain: "TASKS",
      type: "OBSERVATION",
      task_type: null,
      title: `${overdue.length} task-uri operationale restante`,
      summary: "Task-uri deschise cu deadline depasit — candidate de follow-up, nu de task nou.",
      evidence: overdue.slice(0, 20).map((t) =>
        `task${t?.id != null ? ` #${t.id}` : ""}: ${titleOf(t)} (deadline ${t?.deadline || "UNKNOWN"}, status ${t?.status || "UNKNOWN"})`),
      material_consequence: null,
      expected_change: null,
      suggested_owner_hint: null, // ownerii sunt deja pe task-urile existente
      urgency_days: 0,
      confidence: 95, // deadline depasit e un fapt, nu o interpretare
      reasoning: answerFifteen({ opsTasks: overdue, asOf, domain: "TASKS", domainOwners }),
    }));
    // REGULA "UN TASK = O RESPONSABILITATE" (fondator): NU cream "task despre
    // task". Clarificarea unui restant se pune ca OBSERVATIE pe task-ul ORIGINAL
    // (deliver_as: observation_on_original), nu ca task nou. Dedup pe ID-ul
    // task-ului original (nu pe titlu) → doua formulari nu mai produc dubluri.
    const worst = [...overdue]
      .sort((a, b) => (daysBetween(b.deadline, asOf) ?? 0) - (daysBetween(a.deadline, asOf) ?? 0))
      .slice(0, 3);
    for (const t of worst) {
      const days = daysBetween(t.deadline, asOf) ?? 0;
      if (days < 2) continue; // prima intarziere = doar overdue (§16), nu task
      const origTitle = titleOf(t);
      const origId = t?.id || "?";
      candidates.push(makeNeed({
        domain: "TASKS",
        type: "ACTION_NEED",
        task_type: String(t?.status || "").toLowerCase() === "blocat" ? "BLOCKER_CLARIFY" : "DEADLINE_CONFIRM",
        // need_id STABIL pe ID-ul task-ului original (nu pe titlu) — dedup real.
        need_id_override: `need:clarify:${origId}`,
        // Livrare ca OBSERVATIE pe task-ul original — zero task nou.
        deliver_as: "observation_on_original",
        original_task_id: origId,
        title: `Clarificare pe task-ul restant #${origId}: ${origTitle}`.slice(0, 90),
        summary: `Task-ul "${origTitle}" (#${origId}) e restant de ${days} zile (termen ${t?.deadline}, status ${t?.status}). Cer clarificare DIRECT pe task, nu prin task nou.`,
        evidence: [`[operational] task #${origId}: ${origTitle} — deadline ${t?.deadline}, status ${t?.status}, owner ${t?.assigneeName || t?.assignee || "?"}`],
        material_consequence: `task-ul "${origTitle}" restant de ${days} zile fara clarificare — planificarea si dependentele raman incerte`,
        expected_change: "termen real asumat sau blocaj identificat si adresat",
        // Mesajul care se pune ca observatie pe task-ul original.
        observation_text: `JARVIS: "${origTitle}" e restant de ${days} zile (termen ${t?.deadline}). Te rog actualizeaza direct aici: FINALIZAT / BLOCAT + motiv / TERMEN NOU. Daca ai un document, ataseaza-l — il procesez eu.`,
        project_hint: t?.project || null,
        suggested_owner_hint: t?.assignee || null, // ownerul REAL al task-ului
        urgency_days: 0,
        confidence: 95,
        reasoning: answerFifteen({ opsTasks: [t], asOf, domain: "TASKS", domainOwners }),
      }));
    }
  }

  // (g) SURSE INVECHITE → SYSTEM_NEED (imbunatatire de sistem, nu task uman).
  for (const s of arr(staleSources)) {
    const name = staleName(s);
    const domain = normDomain(s?.domain || "SYSTEM");
    candidates.push(makeNeed({
      domain,
      type: "SYSTEM_NEED",
      task_type: "SYSTEM_IMPROVEMENT",
      title: `Sursa de date invechita: ${name}`,
      summary: s?.summary || `Sursa "${name}" nu s-a mai actualizat in fereastra asteptata.`,
      evidence: [
        `ultima actualizare: ${s?.last_updated || s?.asOf || s?.updated_at || "UNKNOWN"}`,
        `vechime: ${s?.age_days != null ? `${s.age_days} zile` : "UNKNOWN"}`,
      ],
      material_consequence: consequenceOf(s) || "deciziile din acest domeniu se iau pe date neactualizate",
      expected_change: "sursa redevine proaspata si de incredere",
      suggested_owner_hint: domainOwners[domain] || domainOwners.SYSTEM || null,
      urgency_days: s?.urgency_days ?? null,
      confidence: 85, // vechimea e masurata, nu presupusa
      reasoning: answerFifteen({ staleSources: [s], domain, domainOwners, asOf }),
    }));
  }

  // ── ANTI-SPAM (§4): fara consecinta materiala sau sub prag → AUDIT_ONLY ──
  const needs = [];
  const audit_only = [];
  const seen = new Set();
  for (const n of candidates) {
    if (seen.has(n.need_id)) continue; // acelasi need_id = aceeasi nevoie
    seen.add(n.need_id);
    const isTaskCandidate = !!n.task_type;
    if (isTaskCandidate && (!n.material_consequence || n.value.total < TASK_VALUE_THRESHOLD)) {
      audit_only.push(n);
    } else {
      needs.push(n);
    }
  }

  return { needs, audit_only, no_action };
}
