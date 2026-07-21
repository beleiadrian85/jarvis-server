// NERVOUS SYSTEM — EXTENSIE: SUPERVIZAREA OPERATIONALA A OAMENILOR (§6-12, §17-20).
// Profilul operational al fiecarei persoane, scorecard-ul pe dimensiuni
// SEPARATE, tiparele de management si supervizarea respectuoasa a fondatorului.
//
// PRINCIPII:
//  - FACTS FIRST (§7): toate notele sunt numere + tipare derivate din date;
//    ZERO judecati de caracter — nicio formulare despre "cum e" omul;
//  - §11: omul NU se reduce la un numar — scorecard-ul are dimensiuni
//    separate, FARA total agregat;
//  - §10: esec repetat = aceeasi cauza + aceeasi responsabilitate; cauze
//    diferite NU fac un tipar;
//  - date lipsa = null/UNKNOWN explicit, niciodata inventate.
//
// Modul PUR: functii deterministe peste argumente, ZERO IO, zero nume de
// oameni sau companii (persoanele vin ca argumente, din config).
import { CLOSED_LIFECYCLES, OPERATIONAL_CLOSED_STATUSES, daysBetween } from "./contract.js";
import { delegationConfidence } from "./orgMemory.js";

// ── CONSTANTE DETERMINISTE ──────────────────────────────────────────────
const MAX_PRIORITIES = 3;          // §6: maxim 3 prioritati active afisate
const MAX_DEADLINES = 5;           // cate termene apropiate listam
const EVIDENCE_MAX = 3;            // cate titluri citam ca dovada
const REPEATED_CAUSE_MIN = 2;      // aceeasi cauza de >= atatea ori = repetata
const PATTERN_MIN = 2;             // un tipar de management cere >= 2 aparitii
const LEARNING_HISTORY_MIN = 3;    // sub atatea task-uri nu evaluam invatarea
const HIGH_PRIORITIES = new Set(["critic", "ridicat"]);
const PRIORITY_ORDER = { critic: 0, ridicat: 1, normal: 2, scazut: 3 };
const RESPONSE_LIFECYCLES = new Set(["RESULT_SUBMITTED", "VERIFICATION", "COMPLETED"]);
// Starile de propunere care inca asteapta o decizie (proposalEngine).
const PENDING_PROPOSAL_STATES = new Set(["draft", "proposed"]);

// ── HELPERI INTERNI (puri) ──────────────────────────────────────────────

/** Normalizare text: lowercase + pliere diacritice ro. */
function fold(s) {
  return String(s == null ? "" : s).toLowerCase().trim()
    .replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t");
}

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
function pct(ratio) { return clamp(Math.round(ratio * 100), 0, 100); }

// Getteri toleranti la denumirile de camp din Operational.
function taskAssignee(t) { return (t && (t.assignee || t.responsabil || t.owner)) || ""; }
function taskStatus(t) { return fold(t && t.status); }
function taskPriority(t) { return fold(t && (t.priority || t.prioritate)); }
function taskDeadline(t) { return (t && (t.deadline || t.termen || t.due_date)) || null; }
function blockText(t) { return (t && (t.blocked_reason || t.motiv_blocaj)) || ""; }

/** Eticheta scurta de task pentru evidence — niciodata inventata. */
function taskLabel(t) {
  const title = t && (t.title || t.task_title || t.name);
  if (title) return String(title);
  return t && t.id != null ? `task #${t.id}` : "task fara titlu";
}
function labelList(ts) { return ts.slice(0, EVIDENCE_MAX).map(taskLabel); }

/** Deschis = orice status care NU e explicit inchis. */
function isOpen(t) { return !OPERATIONAL_CLOSED_STATUSES.includes(taskStatus(t)); }

/** Overdue = deadline valid strict inainte de asOf. Fara deadline => nu e overdue. */
function isOverdue(t, asOf) {
  const d = taskDeadline(t);
  if (!d || !asOf) return false;
  const days = daysBetween(d, asOf);
  return days != null && days > 0;
}

/** Cheile de identitate ale persoanei (id + nume + aliasuri, pliate). */
function personKeys(person = {}) {
  const raw = [person.id, person.name, ...(Array.isArray(person.aliases) ? person.aliases : [])];
  return new Set(raw.map(fold).filter(Boolean));
}

/** Follow-up-urile unei intrari de registru, ca lista sigura. */
function followupsOf(rec) { return Array.isArray(rec?.followups) ? rec.followups : []; }
function remindersOf(rec) {
  return followupsOf(rec).filter((f) => String(f?.action || "").toUpperCase() === "REMINDER").length;
}
function hasResponse(rec) {
  return RESPONSE_LIFECYCLES.has(rec?.lifecycle) || rec?.outcome != null;
}
function recTitle(rec) { return rec?.human?.title || rec?.internal?.task_title || "cerere fara titlu"; }

/** Sortare deschise: prioritate (critic intai), apoi termen apropiat, apoi titlu. */
function byPriorityThenDeadline(a, b) {
  const pa = PRIORITY_ORDER[taskPriority(a)] ?? 4;
  const pb = PRIORITY_ORDER[taskPriority(b)] ?? 4;
  if (pa !== pb) return pa - pb;
  const da = taskDeadline(a) || "9999-12-31";
  const db = taskDeadline(b) || "9999-12-31";
  return String(da).localeCompare(String(db)) || taskLabel(a).localeCompare(taskLabel(b));
}

// ── PROFILUL OPERATIONAL (§6-7) ─────────────────────────────────────────

/**
 * PEOPLE_OPERATIONAL_PROFILE (§6): tot ce stie organismul despre activitatea
 * unei persoane IN SISTEMUL DE TASK-URI. FACTS FIRST (§7): numere + tipare,
 * zero judecati de caracter. Zero task-uri in sistem NU inseamna inactivitate
 * — persoana poate lucra in afara sistemului; notam onest.
 * @param {object} args.person    {id, name, aliases, responsibilities} din config
 * @param {object} args.registry  registrul CEO (memoria cererilor)
 * @param {Array}  args.opsTasks  task-urile Operational (orice status)
 * @param {object} args.loads     incarcarea persoanei din buildPeopleLoad (sau null)
 * @param {object} args.memory    memoria organizationala (§21)
 * @param {string} args.asOf      data ISO de referinta; null => overdue null (gap)
 * @returns {object} profilul operational, doar fapte
 */
export function buildOperationalProfile({ person = {}, registry = {}, opsTasks = [], loads = null, memory = {}, asOf = null } = {}) {
  const keys = personKeys(person);
  const pid = fold(person.id || person.name || "");
  const list = Array.isArray(opsTasks) ? opsTasks : [];

  const mine = list.filter((t) => keys.has(fold(taskAssignee(t))));
  const open = mine.filter(isOpen);
  const openSorted = [...open].sort(byPriorityThenDeadline);
  const high = open.filter((t) => HIGH_PRIORITIES.has(taskPriority(t)));
  const highTotal = mine.filter((t) => HIGH_PRIORITIES.has(taskPriority(t)));
  const accepted = mine.filter((t) => taskStatus(t) === "acceptat");
  const overdueList = asOf == null ? null : open.filter((t) => isOverdue(t, asOf));

  // Cererile CEO catre aceasta persoana — registrul e memoria cererilor.
  const ceoRecs = Object.values(registry || {}).filter((r) => keys.has(fold(r?.owner || "")));
  const answered = ceoRecs.filter(hasResponse);
  const answeredNoFu = answered.filter((r) => followupsOf(r).length === 0);
  const answeredAfterFu = answered.filter((r) => followupsOf(r).length > 0);
  const unansweredOpen = ceoRecs.filter((r) => !hasResponse(r) && !CLOSED_LIFECYCLES.includes(r?.lifecycle));
  const verifiedOk = ceoRecs.filter((r) => r?.verification?.verified === true).length;
  const verifiedFail = ceoRecs.filter((r) => r?.verification?.verified === false).length;
  const followupsTotal = ceoRecs.reduce((s, r) => s + followupsOf(r).length, 0);
  const escalations = ceoRecs.filter((r) =>
    (Array.isArray(r?.escalation_steps) && r.escalation_steps.length > 0) ||
    followupsOf(r).some((f) => String(f?.action || "").toUpperCase() === "ESCALATE")
  ).length;

  // Blocaje repetate: aceeasi cauza notata pe >= 2 task-uri — tipar de proces.
  const causeCounts = new Map();
  for (const t of mine) {
    const c = fold(blockText(t));
    if (c) causeCounts.set(c, (causeCounts.get(c) || 0) + 1);
  }
  const repeated_blockers = [...causeCounts.entries()]
    .filter(([, c]) => c >= REPEATED_CAUSE_MIN)
    .map(([cause, count]) => ({ cause, count }))
    .sort((a, b) => b.count - a.count || a.cause.localeCompare(b.cause));

  // Fiabilitate pe TIP de task, din memoria organizationala (§21): scor
  // operational per pereche om+tip, NU eticheta pe persoana.
  const reliability_by_task_type = Object.entries((memory && memory.by_pair) || {})
    .filter(([key]) => key.startsWith(`${pid}|`))
    .map(([key, p]) => {
      const task_type = key.slice(key.indexOf("|") + 1);
      return {
        task_type,
        total: (p && p.total) || 0,
        done: (p && p.done) || 0,
        failed: (p && p.failed) || 0,
        avg_duration_days: p && p.avg_duration_days != null ? p.avg_duration_days : null,
        confidence: delegationConfidence(memory, pid, task_type),
      };
    })
    .sort((a, b) => a.task_type.localeCompare(b.task_type));

  // Note = numere + tipare (§7). Nicio formulare despre caracter.
  const complexity_note = open.length === 0
    ? "fara task-uri deschise in sistemul de task-uri — nu e dovada de inactivitate (poate lucra in afara sistemului)"
    : `${high.length} critic/ridicat + ${open.length - high.length} normal/scazut din ${open.length} deschise — volumul singur nu masoara performanta`;
  const response_time_note = ceoRecs.length === 0
    ? "nicio cerere CEO in registru — fara date de raspuns"
    : `${answeredNoFu.length} raspunsuri fara follow-up, ${answeredAfterFu.length} dupa follow-up, ${unansweredOpen.length} inca fara raspuns, din ${ceoRecs.length} cereri`;

  return {
    person_id: person.id || null,
    as_of: asOf,
    responsibilities: Array.isArray(person.responsibilities) ? person.responsibilities : [],
    active_tasks: { count: open.length, high_priority: high.length, sample: labelList(openSorted) },
    priorities: openSorted.slice(0, MAX_PRIORITIES).map(taskLabel),
    deadlines: open
      .filter((t) => taskDeadline(t))
      .sort((a, b) => String(taskDeadline(a)).localeCompare(String(taskDeadline(b))) || taskLabel(a).localeCompare(taskLabel(b)))
      .slice(0, MAX_DEADLINES)
      .map((t) => ({ task: taskLabel(t), deadline: taskDeadline(t) })),
    overdue: overdueList == null ? null : { count: overdueList.length, sample: labelList(overdueList) }, // null = asOf lipsa, gap explicit
    results: {
      delivered_accepted: accepted.length,
      high_priority_total: highTotal.length,
      total_tasks_seen: mine.length,
    },
    complexity_note,
    ceo_requested: {
      total: ceoRecs.length,
      open: ceoRecs.filter((r) => !CLOSED_LIFECYCLES.includes(r?.lifecycle)).length,
      answered_without_followup: answeredNoFu.length,
      answered_after_followup: answeredAfterFu.length,
      unanswered: unansweredOpen.length,
    },
    response_time_note,
    verification_success: { verified: verifiedOk, not_demonstrated: verifiedFail, checked: verifiedOk + verifiedFail },
    repeated_blockers,
    reliability_by_task_type,
    workload: loads || null, // incarcarea din buildPeopleLoad (§20), pasata ca fapt
    followups_required: followupsTotal,
    escalations_required: escalations,
  };
}

// ── SCORECARD (§11) ─────────────────────────────────────────────────────

/**
 * Scorecard pe dimensiuni SEPARATE (§11): fiecare cu valoare 0-100 sau
 * UNKNOWN + dovada. FARA total agregat — omul nu se reduce la un numar.
 * Fiecare valoare masoara istoricul IN SISTEMUL DE TASK-URI, nu persoana.
 * @param {object} profile  iesirea din buildOperationalProfile
 * @returns {object} { delivery_reliability, quality, timeliness, autonomy,
 *                     learning, communication, problem_solving,
 *                     business_impact, complexity_handled }
 */
export function buildScorecard(profile = {}) {
  const dim = (value, evidence) => ({ value, evidence });
  const unknown = (why) => ({ value: "UNKNOWN", evidence: why });
  const cr = profile.ceo_requested || {};
  const vs = profile.verification_success || {};
  const res = profile.results || {};
  const at = profile.active_tasks || {};
  const answeredTotal = (cr.answered_without_followup || 0) + (cr.answered_after_followup || 0);

  // Fiabilitatea livrarii: cereri cu raspuns / cereri totale.
  const delivery_reliability = cr.total > 0
    ? dim(pct(answeredTotal / cr.total), `${answeredTotal}/${cr.total} cereri au primit raspuns`)
    : unknown("nicio cerere CEO inregistrata — fara istoric de livrare");

  // Calitatea: rezultate DEMONSTRATE la verificare (§14: bifat != rezolvat).
  const quality = vs.checked > 0
    ? dim(pct(vs.verified / vs.checked), `${vs.verified}/${vs.checked} rezultate demonstrate la verificare`)
    : unknown("niciun rezultat nu a trecut inca prin verificare");

  // Punctualitatea: deschise care NU sunt peste termen.
  const od = profile.overdue;
  const timeliness = od == null
    ? unknown("asOf lipsa — intarzierea nu se poate masura (gap de date)")
    : (at.count || 0) > 0
      ? dim(pct(1 - od.count / at.count), `${od.count} peste termen din ${at.count} deschise`)
      : unknown("zero task-uri deschise — punctualitatea nu are pe ce se masura acum");

  // Autonomia: raspunsuri venite FARA niciun follow-up.
  const autonomy = answeredTotal > 0
    ? dim(pct((cr.answered_without_followup || 0) / answeredTotal), `${cr.answered_without_followup || 0}/${answeredTotal} raspunsuri fara vreun follow-up`)
    : unknown("fara raspunsuri inregistrate — autonomia nu se poate masura");

  // Invatarea: aceeasi cauza de blocaj repetata trage in jos; lipsa ei, cu
  // istoric suficient, e semn ca lectiile se aplica.
  const rb = profile.repeated_blockers || [];
  const seen = res.total_tasks_seen || 0;
  const learning = seen >= LEARNING_HISTORY_MIN
    ? (rb.length === 0
      ? dim(75, `nicio cauza de blocaj repetata in ${seen} task-uri vazute`)
      : dim(clamp(60 - rb.reduce((s, x) => s + x.count, 0) * 10, 0, 100),
        `cauze de blocaj repetate: ${rb.map((x) => `"${x.cause}" x${x.count}`).join("; ")}`))
    : unknown(`istoric prea mic (${seen} task-uri, sub ${LEARNING_HISTORY_MIN}) pentru un tipar de invatare`);

  // Comunicarea: cereri care nu raman in tacere (raspuns sau blocaj semnalat).
  const communication = cr.total > 0
    ? dim(pct(1 - (cr.unanswered || 0) / cr.total), `${cr.unanswered || 0} cereri fara niciun raspuns din ${cr.total}`)
    : unknown("nicio cerere de evaluat — comunicarea nu se poate masura din date");

  // Rezolvarea problemelor: done/total din memoria organizationala (§21).
  const rel = profile.reliability_by_task_type || [];
  const relTotal = rel.reduce((s, x) => s + (x.total || 0), 0);
  const relDone = rel.reduce((s, x) => s + (x.done || 0), 0);
  const problem_solving = relTotal > 0
    ? dim(pct(relDone / relTotal), `${relDone}/${relTotal} task-uri duse la capat in memoria organizationala`)
    : unknown("fara istoric in memoria organizationala pe aceasta persoana");

  // Impactul de business: expunerea la task-uri critic/ridicat ACUM —
  // masoara miza incredintata, nu valoarea persoanei.
  const business_impact = (at.count || 0) > 0
    ? dim(pct((at.high_priority || 0) / at.count), `${at.high_priority || 0}/${at.count} task-uri deschise sunt critic/ridicat — expunere la miza, nu valoare personala`)
    : unknown("fara task-uri deschise — expunerea la miza nu se poate masura acum");

  // Complexitatea gestionata: ponderea critic/ridicat in tot istoricul vazut.
  const complexity_handled = seen > 0
    ? dim(pct((res.high_priority_total || 0) / seen), `${res.high_priority_total || 0}/${seen} din task-urile vazute sunt critic/ridicat`)
    : unknown("fara task-uri in sistem pentru aceasta persoana");

  return {
    delivery_reliability, quality, timeliness, autonomy, learning,
    communication, problem_solving, business_impact, complexity_handled,
  };
}

// ── TIPARE DE MANAGEMENT (§8-9) ─────────────────────────────────────────

/**
 * Tipare de management derivate DOAR din date (§8-9): cum se comporta
 * CERERILE catre o persoana si ce ajustare de proces ar ajuta. Sugestiile
 * privesc formatul cererii/procesul — niciodata caracterul omului.
 * @returns {Array<{pattern: string, evidence: Array, suggestion: string}>}
 */
export function detectManagementPatterns({ registry = {}, person_id = null } = {}) {
  const pid = fold(person_id || "");
  const recs = Object.values(registry || {}).filter((r) => !pid || fold(r?.owner || "") === pid);
  const patterns = [];
  if (!recs.length) return patterns;

  const answered = recs.filter(hasResponse);
  const afterReminder = answered.filter((r) => remindersOf(r) >= 1);
  const cleanAnswers = answered.filter((r) => followupsOf(r).length === 0);

  // 1) Raspunde abia dupa reminder in N/M cereri → cererea are nevoie de
  //    termen explicit + motiv de la inceput, nu de mai multa presiune.
  if (answered.length >= PATTERN_MIN && afterReminder.length >= PATTERN_MIN &&
      afterReminder.length * 2 >= answered.length) {
    patterns.push({
      pattern: `raspunde dupa reminder in ${afterReminder.length}/${answered.length} cereri`,
      evidence: afterReminder.slice(0, EVIDENCE_MAX).map(recTitle),
      suggestion: "include termen explicit + motivul cererii direct in task — reduce nevoia de reminder",
    });
  }

  // 2) Livreaza constant fara follow-up → canal fiabil, se poate delega mai mult.
  if (cleanAnswers.length >= LEARNING_HISTORY_MIN && afterReminder.length === 0) {
    patterns.push({
      pattern: `${cleanAnswers.length}/${answered.length} cereri rezolvate fara niciun follow-up`,
      evidence: cleanAnswers.slice(0, EVIDENCE_MAX).map(recTitle),
      suggestion: "canal fiabil pe aceste tipuri de cereri — se poate delega mai mult din acelasi tip",
    });
  }

  // 3) Blocaje semnalate repetat → task-ul sa spuna de la inceput ce face
  //    ownerul cand se blocheaza (pe cine intreaba, ce alternativa are).
  const blockedRecs = recs.filter((r) => r?.blocked || r?.blocker || r?.lifecycle === "BLOCKED" || r?.ops_status === "blocat");
  if (blockedRecs.length >= PATTERN_MIN) {
    patterns.push({
      pattern: `${blockedRecs.length} cereri au ajuns in blocaj semnalat`,
      evidence: blockedRecs.slice(0, EVIDENCE_MAX).map(recTitle),
      suggestion: "adauga in task, de la inceput, calea de deblocare: pe cine intreaba ownerul si ce alternativa are",
    });
  }

  // 4) Acelasi TIP de task cere follow-up repetat → formatul cererii pe acest
  //    tip e neclar, nu ownerul — reformuleaza cererea standard.
  const delayedByType = new Map();
  for (const r of recs) {
    if (followupsOf(r).length < 1) continue;
    const tt = String(r?.task_type || "UNKNOWN");
    delayedByType.set(tt, (delayedByType.get(tt) || 0) + 1);
  }
  for (const [tt, count] of [...delayedByType.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    if (count < PATTERN_MIN) continue;
    patterns.push({
      pattern: `tipul de task ${tt} a avut nevoie de follow-up in ${count} cereri`,
      evidence: [`${count} cereri de tip ${tt} cu cel putin un follow-up`],
      suggestion: "reformuleaza cererea standard pe acest tip: rezultat asteptat concret + termen + metoda de verificare",
    });
  }

  return patterns;
}

// ── ESEC REPETAT (§10) ──────────────────────────────────────────────────

/**
 * Esec repetat (§10): REPEATED doar daca ACEEASI cauza apare pe ACEEASI
 * responsabilitate (task_type/responsibility) de cel putin 2 ori. Cauze
 * diferite NU fac un tipar — se spune onest, fara verdicte. Un tipar
 * confirmat cere REPEATED_PATTERN_REVIEW: se analizeaza sistemul
 * (proces/unealta/claritate), nu se cauta un vinovat.
 * @param {Array} args.records  inregistrari de esec/blocaj (orice forma)
 * @param {Function} args.causeOf  extrage cauza dintr-o inregistrare
 * @returns {{repeated: boolean, review: "REPEATED_PATTERN_REVIEW"|null, why: string}}
 */
export function detectRepeatedFailure({ records = [], causeOf = (r) => (r && r.blocker) || null } = {}) {
  const list = Array.isArray(records) ? records : [];
  const groups = new Map();      // "cauza|responsabilitate" → numar aparitii
  const causeTotals = new Map(); // cauza → numar total aparitii

  for (const r of list) {
    const cause = fold(causeOf(r));
    if (!cause) continue;
    const resp = fold(r?.task_type || r?.responsibility || r?.owner || "");
    const key = `${cause}|${resp}`;
    groups.set(key, (groups.get(key) || 0) + 1);
    causeTotals.set(cause, (causeTotals.get(cause) || 0) + 1);
  }

  // Grupul cel mai frecvent, tie-break determinist pe cheie alfabetic.
  let best = null;
  for (const [key, count] of groups.entries()) {
    if (count < REPEATED_CAUSE_MIN) continue;
    if (!best || count > best.count || (count === best.count && key < best.key)) best = { key, count };
  }
  if (best) {
    const i = best.key.indexOf("|");
    const cause = best.key.slice(0, i);
    const resp = best.key.slice(i + 1);
    return {
      repeated: true,
      review: "REPEATED_PATTERN_REVIEW",
      why: `aceeasi cauza ("${cause}") pe aceeasi responsabilitate${resp ? ` ("${resp}")` : ""} in ${best.count} cazuri — tipar, nu accident: se analizeaza sistemul (proces/unealta/claritatea cererii), nu se cauta un vinovat`,
    };
  }

  if (causeTotals.size >= 2) {
    const sample = [...causeTotals.keys()].sort().slice(0, EVIDENCE_MAX).join("; ");
    return { repeated: false, review: null, why: `esecuri cu cauze diferite (${sample}) — nu e tipar repetat; fiecare caz se trateaza in contextul lui` };
  }
  if (causeTotals.size === 1) {
    const [cause, total] = [...causeTotals.entries()][0];
    if (total >= REPEATED_CAUSE_MIN) {
      return { repeated: false, review: null, why: `aceeasi cauza ("${cause}") dar pe responsabilitati diferite (${total} cazuri) — criteriul §10 (aceeasi cauza + aceeasi responsabilitate) nu e indeplinit; de urmarit ca posibil semnal de sistem` };
    }
    return { repeated: false, review: null, why: `o singura aparitie a cauzei ("${cause}") — insuficient pentru tipar (pragul e ${REPEATED_CAUSE_MIN} pe aceeasi responsabilitate)` };
  }
  return { repeated: false, review: null, why: "fara cauze identificabile in inregistrari — tiparul nu se poate evalua (gap de date, nu verdict)" };
}

// ── SUPERVIZAREA FONDATORULUI (§20) ─────────────────────────────────────

/**
 * Ce asteapta DUPA fondator (§20): decizii si aprobari care tin lantul pe
 * loc. Formulat respectuos si factual — "decizia X asteapta din D — blocheaza
 * Y" — pentru ca si fondatorul face parte din organism, nu deasupra lui.
 * @param {object} args.registry   registrul CEO
 * @param {object} args.proposals  propunerile (ceo:proposals), cheite pe id
 * @param {string} args.founderId  id-ul fondatorului (din config; null = necunoscut)
 * @param {string} args.asOf       data ISO de referinta (pt. zile de asteptare)
 * @returns {{blockers: Array<{what, waiting_since, note}>, note: string}}
 */
export function founderSupervision({ registry = {}, proposals = {}, founderId = null, asOf = null } = {}) {
  const blockers = [];
  const seenProposalIds = new Set();

  const waitNote = (sinceISO, blocksWhat) => {
    const days = asOf && sinceISO ? daysBetween(String(sinceISO).slice(0, 10), asOf) : null;
    const since = sinceISO ? `din ${String(sinceISO).slice(0, 10)}` : "de la inregistrare";
    const dur = days != null && days > 0 ? ` (${days} zile)` : "";
    return `asteapta o decizie ${since}${dur} — blocheaza ${blocksWhat}`;
  };

  // 1) Propuneri nedecise (draft/proposed) — decizia e la fondator.
  for (const p of Object.values(proposals || {})) {
    if (!p || !PENDING_PROPOSAL_STATES.has(String(p.state || "").toLowerCase())) continue;
    seenProposalIds.add(p.proposal_id);
    const blocksWhat = p.task_proposal?.expected_result
      ? `"${p.task_proposal.expected_result}"`
      : "pasul urmator din lantul propunerii";
    blockers.push({
      what: `decizia pe propunerea: ${p.recommendation || p.problem || p.proposal_id}`,
      waiting_since: p.recorded_at || null,
      note: waitNote(p.recorded_at, blocksWhat),
    });
  }

  for (const rec of Object.values(registry || {})) {
    const title = recTitle(rec);
    const expected = rec?.human?.expected_result || rec?.internal?.expected_result || "rezultatul cerut";
    // 2) Cereri CEO ramase in PROPOSED cu propunere netratata (neacoperite mai sus).
    if (rec?.lifecycle === "PROPOSED" && rec?.proposal_id && !seenProposalIds.has(rec.proposal_id)) {
      blockers.push({
        what: `aprobarea cererii: ${title}`,
        waiting_since: rec?.created_at || null,
        note: waitNote(rec?.created_at, `"${expected}"`),
      });
    }
    // 3) Decizii aflate chiar la fondator (task-uri de decizie deschise).
    if (founderId && fold(rec?.owner || "") === fold(founderId) &&
        !CLOSED_LIFECYCLES.includes(rec?.lifecycle) &&
        (rec?.autonomy_class === "DECISION_TASK" || String(rec?.task_type || "").toUpperCase() === "FOUNDER_DECISION")) {
      blockers.push({
        what: `decizia: ${title}`,
        waiting_since: rec?.created_at || null,
        note: waitNote(rec?.created_at, `"${expected}"`),
      });
    }
  }

  blockers.sort((a, b) =>
    String(a.waiting_since || "9999").localeCompare(String(b.waiting_since || "9999")) ||
    String(a.what).localeCompare(String(b.what)));

  const note = blockers.length
    ? `${blockers.length} punct(e) asteapta o decizie a fondatorului — semnalate factual si cu respect: deblocarea lor deblocheaza restul lantului`
    : "nimic nu asteapta dupa fondator in acest moment";
  return { blockers, note };
}
