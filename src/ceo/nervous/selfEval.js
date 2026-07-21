// NERVOUS SYSTEM V1 §22 — AUTO-EVALUAREA CEO AI (motor PUR).
// Deriva DETERMINIST metricile de performanta ale sistemului nervos din:
//  - registry: registrul task-urilor originate de CEO (lifecycle/outcome),
//  - stream: activity stream-ul auditabil (§26) cu evenimente gen
//    "task_proposed" / "task_created" / "duplicate_prevented" / "escalated",
//  - auditOnly: observatiile consemnate FARA task (sub TASK_VALUE_THRESHOLD).
// Valorile fara date = 0, iar mediile necalculabile = "UNKNOWN" — nimic
// inventat (zero != nu am date; utilitatea nu se presupune, se confirma).
// Verdictul urmeaza principiul §35: "mai putine task-uri, dar mai utile" —
// bazat pe raportul useful/created si pe duplicatele prevenite.
import { CEO_TASK_LIFECYCLE, mapOperationalStatus, daysBetween } from "./contract.js";

// ── HELPERI INTERNI (puri) ──────────────────────────────────────────────

function fold(s) { return String(s == null ? "" : s).toLowerCase().trim(); }
function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }

// Fazele care inseamna "task-ul a existat in Operational" (a fost creat).
const CREATED_PHASES = new Set([
  "CREATED", "ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS",
  "RESULT_SUBMITTED", "VERIFICATION", "COMPLETED", "BLOCKED",
]);

/** Faza din ciclul CEO pentru o intrare de registru — fara sa inventam:
 *  lifecycle explicit > status Operational mapat > operational_id (=CREATED)
 *  > prezenta in registru (= macar PROPOSED). */
function lifecycleOf(entry = {}) {
  const lc = String(entry.lifecycle || entry.phase || "").toUpperCase();
  if (CEO_TASK_LIFECYCLE.includes(lc)) return lc;
  if (entry.status) return mapOperationalStatus(entry.status);
  if (entry.operational_id) return "CREATED";
  return "PROPOSED";
}

/** Numele normalizat al unui eveniment de stream (event/type/key). */
function eventName(ev) { return fold(ev && (ev.event || ev.type || ev.key)); }

/** Cate evenimente din stream au unul din numele date. */
function countEvents(events, ...names) {
  const set = new Set(names);
  return events.filter((ev) => set.has(eventName(ev))).length;
}

/** Durata de rezolvare in zile pentru o intrare finalizata, sau null. */
function resolutionDays(e = {}) {
  if (typeof e.resolution_days === "number" && Number.isFinite(e.resolution_days)) return e.resolution_days;
  const from = e.created_at || e.proposed_at || e.at || null;
  const to = e.completed_at || e.resolved_at || e.closed_at || null;
  if (!from || !to) return null;
  return daysBetween(from, to);
}

/** Task/propunere indreptata catre fondator — DOAR pe flaguri generice
 *  (to_founder/founder_gate/owner_role) — niciun nume in nucleu. */
function isFounderDirected(e = {}) {
  return e.to_founder === true || e.founder_gate === true || fold(e.owner_role) === "founder";
}

/** Verdict §35: o fraza, "mai putine task-uri, dar mai utile". */
function buildVerdict({ created, useful, dup, auditOnlyCount }) {
  const dupNote = dup > 0 ? ` si ${dup} duplicate prevenite` : "";
  if (created === 0) {
    return auditOnlyCount > 0
      ? `Zero task-uri create, ${auditOnlyCount} observatii consemnate fara task${dupNote} — abtinerea sub prag e exact principiul "mai putine task-uri, dar mai utile".`
      : `Zero task-uri create si zero observatii consemnate${dupNote} — nimic de evaluat in aceasta perioada.`;
  }
  if (useful === 0) {
    return `0/${created} task-uri cu utilitate confirmata${dupNote} — lipsesc confirmarile (zero nu inseamna inutil); cere feedback de utilitate inainte de concluzii.`;
  }
  const rate = useful / created;
  if (rate >= 0.7) return `${useful}/${created} task-uri confirmate utile${dupNote} — putine si utile, directia corecta.`;
  if (rate >= 0.4) return `${useful}/${created} task-uri confirmate utile${dupNote} — acceptabil, dar filtrul de valoare trebuie strans inainte de a crea mai multe.`;
  return `${useful}/${created} task-uri confirmate utile${dupNote} — prea multe task-uri fara utilitate confirmata; ridica pragul de valoare, nu volumul.`;
}

// ── MOTORUL PRINCIPAL (§22) ─────────────────────────────────────────────

/**
 * Construieste raportul de auto-evaluare al CEO AI. PUR si determinist.
 * @param {object} args
 * @param {object|Array} args.registry  registrul task-urilor CEO (obiect pe chei sau lista)
 * @param {Array}  args.stream          evenimente de activity stream (§26)
 * @param {Array}  args.auditOnly       observatii consemnate fara task (sub prag)
 * @param {string} args.date            data raportului (ISO); null daca lipseste
 * @returns {{ date: string|null, metrics: object, verdict: string }}
 */
export function buildSelfEval({ registry = {}, stream = [], auditOnly = [], date = null } = {}) {
  const entries = (Array.isArray(registry) ? registry : Object.values(registry || {})).filter(Boolean);
  const events = (Array.isArray(stream) ? stream : []).filter(Boolean);
  const audits = Array.isArray(auditOnly) ? auditOnly : [];

  const withLc = entries.map((e) => ({ e, lc: lifecycleOf(e) }));
  const completed = withLc.filter(({ lc }) => lc === "COMPLETED");

  // Numaratori din registru; stream-ul e fallback cand registrul tace
  // (doua surse pentru acelasi fapt => nu le adunam, ca sa nu numaram dublu).
  const proposedReg = withLc.length; // prezenta in registru = macar propus
  const createdReg = withLc.filter(({ e, lc }) => !!e.operational_id || CREATED_PHASES.has(lc)).length;
  const rejectedReg = withLc.filter(({ e, lc }) => e.rejected === true || lc === "FAILED").length;
  // Utilitatea DOAR pe semnal explicit — nu se presupune din "completed".
  const usefulReg = entries.filter((e) => e.useful === true || fold(e.outcome) === "useful").length;

  const TASKS_PROPOSED = proposedReg || countEvents(events, "task_proposed", "proposed");
  const TASKS_CREATED = createdReg || countEvents(events, "task_created", "created");
  const TASKS_USEFUL = usefulReg;
  const TASKS_REJECTED = rejectedReg || countEvents(events, "task_rejected", "rejected");
  const TASKS_DUPLICATE_PREVENTED = countEvents(events, "duplicate_prevented");
  const WRONG_OWNER =
    entries.filter((e) => e.owner_correct === false).length || countEvents(events, "wrong_owner");
  const WRONG_PRIORITY =
    entries.filter((e) => e.priority_correct === false).length || countEvents(events, "wrong_priority");
  const UNNECESSARY_ESCALATIONS =
    (entries.filter((e) => e.unnecessary_escalation === true).length ||
      countEvents(events, "unnecessary_escalation")) +
    events.filter((ev) => eventName(ev) === "escalated" && ev.unnecessary === true).length;

  // Media doar peste duratele REAL calculabile; fara nicio durata = UNKNOWN.
  const durations = completed
    .map(({ e }) => resolutionDays(e))
    .filter((d) => typeof d === "number" && Number.isFinite(d) && d >= 0);
  const AVERAGE_RESOLUTION_TIME = durations.length
    ? round1(durations.reduce((a, b) => a + b, 0) / durations.length)
    : "UNKNOWN";

  // Nevoi inchise: semnal explicit daca exista, altfel proxy determinist
  // (task acceptat = nevoia din spatele lui inchisa).
  const explicitNeeds = entries.filter((e) => e.need_resolved === true).length;
  const NEEDS_RESOLVED = explicitNeeds || completed.length;

  // Cat de des a fost intrerupt fondatorul raportat la tot ce s-a propus.
  const founderDirected = withLc.filter(({ e }) => isFounderDirected(e)).length;
  const FOUNDER_INTERRUPTION_RATE = TASKS_PROPOSED > 0
    ? round2(Math.min(founderDirected / TASKS_PROPOSED, 1))
    : 0;

  // Imbunatatiri de stare a companiei: completed cu verificare STATE_CHANGE
  // sau flag explicit; fallback evenimente dedicate.
  const stateImproved = completed.filter(({ e }) =>
    e.state_improved === true || String(e.verification_method || "").toUpperCase() === "STATE_CHANGE").length;
  const COMPANY_STATE_IMPROVEMENTS = stateImproved || countEvents(events, "state_improvement");

  return {
    date: date || null,
    metrics: {
      TASKS_PROPOSED,
      TASKS_CREATED,
      TASKS_USEFUL,
      TASKS_REJECTED,
      TASKS_DUPLICATE_PREVENTED,
      WRONG_OWNER,
      WRONG_PRIORITY,
      UNNECESSARY_ESCALATIONS,
      AVERAGE_RESOLUTION_TIME,
      NEEDS_RESOLVED,
      FOUNDER_INTERRUPTION_RATE,
      COMPANY_STATE_IMPROVEMENTS,
    },
    verdict: buildVerdict({
      created: TASKS_CREATED,
      useful: TASKS_USEFUL,
      dup: TASKS_DUPLICATE_PREVENTED,
      auditOnlyCount: audits.length,
    }),
  };
}
