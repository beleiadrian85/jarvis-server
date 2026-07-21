// NERVOUS SYSTEM V1 §20 — PEOPLE & LOAD INTELLIGENCE (motor PUR).
// Deriva starea de incarcare per persoana (LOAD_STATES din contract) plus
// detectii auditabile, exclusiv din argumentele primite (people + tasks).
// Nucleul e GENERIC: zero nume hardcodate, zero IO — o companie noua
// inseamna alte argumente, nu alt cod.
//
// PRINCIPII (§20 + Founder DNA + §27 PEOPLE):
//  - performanta NU se masoara doar in numar de task-uri: complexity_note
//    descrie mixul critic/ridicat vs normal, nu doar cantitatea;
//  - date lipsa = null/gap explicit (asOf lipsa => overdue null; zero != nu
//    am date), nimic inventat;
//  - zero task-uri deschise NU inseamna inactivitate — persoana poate lucra
//    in afara sistemului de task-uri; notam onest in evidence;
//  - multe overdue NU produce "munceste mai bine", ci "analizeaza cauzele
//    inainte de orice task nou" (§27);
//  - WRONG_OWNER NU se detecteaza aici — potrivirea om-task e treaba
//    delegationEngine; aici masuram DOAR sarcina.
import { LOAD_STATES, OPERATIONAL_CLOSED_STATUSES, daysBetween } from "./contract.js";

// ── PRAGURI DETERMINISTE ────────────────────────────────────────────────
const OVERDUE_CLUSTER_MIN = 3;      // de la cate overdue vorbim de "cluster"
const OPEN_LARGE_MIN = 3;           // "open mare" din regula OVERLOADED
const UNDERUTILIZED_PEER_MIN = 3;   // un coleg are >= atat ca sa conteze contrastul
const FOUNDER_SHARE = 0.3;          // fondatorul tine >= 30% din open-ul echipei
const DEPENDENCY_MENTIONS_MIN = 2;  // cate task-uri ale altora pomenesc persoana
const EVIDENCE_TASKS_MAX = 3;       // cate titluri de task citam ca dovada
const HIGH_PRIORITIES = new Set(["critic", "ridicat"]);

// ── HELPERI INTERNI (puri) ──────────────────────────────────────────────

/** Normalizare text: lowercase + pliere diacritice ro. */
function fold(s) {
  return String(s == null ? "" : s).toLowerCase().trim()
    .replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t");
}

/** Persoana normalizata: accepta string sau obiect {id, name, aliases}. */
function normPerson(p) {
  if (typeof p === "string") return { id: fold(p), name: p, aliases: [] };
  const o = p || {};
  return {
    id: fold(o.id || o.name || ""),
    name: String(o.name || o.id || ""),
    aliases: Array.isArray(o.aliases) ? o.aliases : [],
  };
}

// Getteri toleranti la denumirile de camp din Operational (assignee/responsabil...).
function taskAssignee(t) { return (t && (t.assignee || t.responsabil || t.owner)) || ""; }
function taskStatus(t) { return (t && t.status) || ""; }
function taskPriority(t) { return (t && (t.priority || t.prioritate)) || ""; }
function taskDeadline(t) { return (t && (t.deadline || t.termen || t.due_date)) || null; }
function blockText(t) { return (t && (t.blocked_reason || t.motiv_blocaj)) || ""; }
function obsText(t) { return (t && (t.observations || t.observatii)) || ""; }

/** Eticheta scurta de task pentru evidence — niciodata inventata. */
function taskLabel(t) {
  const title = t && (t.title || t.task_title || t.name);
  if (title) return String(title);
  return t && t.id != null ? `task #${t.id}` : "task fara titlu";
}

/** Primele N etichete, ca lista de dovezi. */
function labelList(ts) { return ts.slice(0, EVIDENCE_TASKS_MAX).map(taskLabel); }

/** Deschis = orice status care NU e explicit inchis (lipsa status = activ necunoscut, tratat deschis). */
function isOpen(t) { return !OPERATIONAL_CLOSED_STATUSES.includes(fold(taskStatus(t))); }

/** Overdue = deadline valid strict inainte de asOf. Fara deadline => nu e overdue. */
function isOverdue(t, asOf) {
  const d = taskDeadline(t);
  if (!d) return false;
  const days = daysBetween(d, asOf);
  return days != null && days > 0;
}

/** Id-ul persoanei din roster care corespunde unui assignee (id/nume/alias). */
function matchPersonId(assignee, roster) {
  const a = fold(assignee);
  if (!a) return null;
  for (const p of roster) {
    if (p.id === a || fold(p.name) === a) return p.id;
    if (p.aliases.some((al) => fold(al) === a)) return p.id;
  }
  return null;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** Textul (pliat) pomeneste persoana ca token intreg (nume/id/alias >= 3 litere). */
function mentionsPerson(text, person) {
  const hay = fold(text);
  if (!hay) return false;
  const keys = [...new Set([person.name, person.id, ...person.aliases].map(fold).filter((k) => k.length >= 3))];
  return keys.some((k) => new RegExp(`(^|[^a-z0-9])${escapeRe(k)}([^a-z0-9]|$)`).test(hay));
}

function round1(n) { return Math.round(n * 10) / 10; }

// ── MOTORUL PRINCIPAL ───────────────────────────────────────────────────

/**
 * Construieste harta de incarcare a oamenilor (§20). PUR si determinist.
 * @param {object} args
 * @param {Array}  args.people    roster: [{id, name, aliases}] sau nume simple
 * @param {Array}  args.tasks     task-uri Operational (orice status)
 * @param {string} args.asOf      data ISO de referinta; null => overdue null (gap explicit)
 * @param {string} args.founderId id-ul/numele fondatorului (pt. FOUNDER_BOTTLENECK)
 * @returns {{ per_person: object, detections: Array }}
 */
export function buildPeopleLoad({ people = [], tasks = [], asOf = null, founderId = null } = {}) {
  const roster = (Array.isArray(people) ? people : []).map(normPerson).filter((p) => p.id);
  const list = Array.isArray(tasks) ? tasks : [];
  const per_person = {};
  const detections = [];
  if (!roster.length) return { per_person, detections };

  // Bucket task-urile pe persoane; ce nu se potriveste ramane in afara hartii.
  const buckets = new Map(roster.map((p) => [p.id, []]));
  for (const t of list) {
    const pid = matchPersonId(taskAssignee(t), roster);
    if (pid) buckets.get(pid).push(t);
  }

  // Metrici de baza per persoana (o singura trecere, refolosite de reguli).
  const base = new Map();
  let teamOpen = 0;
  for (const p of roster) {
    const mine = buckets.get(p.id);
    const open = mine.filter(isOpen);
    const overdue = asOf == null ? null : open.filter((t) => isOverdue(t, asOf));
    const high = open.filter((t) => HIGH_PRIORITIES.has(fold(taskPriority(t))));
    base.set(p.id, { mine, open, overdue, high });
    teamOpen += open.length;
  }
  const avgOpen = teamOpen / roster.length;
  const founderPid = matchPersonId(founderId, roster);
  // DEPENDENCY_BOTTLENECK se evalueaza DOAR daca datele exista in genere.
  const dependencyDataExists = list.some((t) => blockText(t) || obsText(t));

  for (const p of roster) {
    const { mine, open, overdue, high } = base.get(p.id);
    const states = [];
    const evidence = [];

    // Mixul de complexitate — volumul singur nu masoara performanta (§20).
    const complexity_note = open.length === 0
      ? "fara task-uri deschise in sistemul de task-uri"
      : `${high.length} critic/ridicat + ${open.length - high.length} normal/scazut din ${open.length} deschise — volumul singur nu masoara performanta`;

    // OVERLOADED: open >= 2x media echipei (media >= 2) SAU cluster de overdue cu open mare.
    const byAvg = avgOpen >= 2 && open.length >= 2 * avgOpen;
    const byOverdue = overdue != null && overdue.length >= OVERDUE_CLUSTER_MIN && open.length >= OPEN_LARGE_MIN;
    if (byAvg || byOverdue) {
      states.push("OVERLOADED");
      if (byAvg) evidence.push(`${open.length} task-uri deschise vs media echipei ${round1(avgOpen)}`);
      if (byOverdue) evidence.push(`${overdue.length} overdue la ${open.length} deschise`);
    }

    // UNDERUTILIZED: 0 deschise cand un coleg are >= prag. Onest: poate lucra
    // in afara sistemului de task-uri — zero in sistem nu e dovada de inactivitate.
    const peerBusy = roster.some((q) => q.id !== p.id && base.get(q.id).open.length >= UNDERUTILIZED_PEER_MIN);
    if (open.length === 0 && peerBusy) {
      states.push("UNDERUTILIZED");
      evidence.push(`0 task-uri deschise in sistem in timp ce un coleg are >= ${UNDERUTILIZED_PEER_MIN} — posibil lucreaza in afara sistemului de task-uri (nu e dovada de inactivitate)`);
    }

    // BLOCKED: are task-uri cu status blocat.
    const blocked = open.filter((t) => fold(taskStatus(t)) === "blocat");
    if (blocked.length) {
      states.push("BLOCKED");
      evidence.push(`${blocked.length} task-uri cu status blocat: ${labelList(blocked).join("; ")}`);
    }

    // FOUNDER_BOTTLENECK: fondatorul tine >= 30% din open-ul echipei.
    if (founderPid && p.id === founderPid && teamOpen > 0 && open.length > 0 && open.length >= FOUNDER_SHARE * teamOpen) {
      const pct = Math.round((open.length / teamOpen) * 100);
      states.push("FOUNDER_BOTTLENECK");
      evidence.push(`fondatorul tine ${open.length}/${teamOpen} (${pct}%) din task-urile deschise ale echipei — candidat la delegare`);
    }

    // DEPENDENCY_BOTTLENECK: >= 2 task-uri deschise ale ALTORA pomenesc persoana
    // in blocked_reason/observations. Doar daca astfel de date exista in genere.
    let waiting = [];
    if (dependencyDataExists) {
      waiting = list.filter((t) =>
        isOpen(t) &&
        matchPersonId(taskAssignee(t), roster) !== p.id &&
        mentionsPerson(`${blockText(t)} ${obsText(t)}`, p)
      );
      if (waiting.length >= DEPENDENCY_MENTIONS_MIN) {
        states.push("DEPENDENCY_BOTTLENECK");
        evidence.push(`${waiting.length} task-uri ale altora pomenesc persoana in blocaj/observatii: ${labelList(waiting).join("; ")}`);
      }
    }

    if (!states.length) states.push("BALANCED");

    per_person[p.id] = {
      task_count: mine.length,
      open: open.length,
      overdue: overdue == null ? null : overdue.length, // null = asOf lipsa, gap explicit
      high_priority: high.length,
      complexity_note,
      states: states.filter((s) => LOAD_STATES.includes(s)),
      evidence,
    };

    // ── DETECTII (observatie != task — consumatorul decide ce face) ──
    // §27: cluster de overdue => analizeaza cauzele, nu "munceste mai bine".
    if (overdue != null && overdue.length >= OVERDUE_CLUSTER_MIN) {
      detections.push({
        key: "overdue_cluster",
        person_id: p.id,
        finding: `${overdue.length} task-uri overdue — analizeaza cauzele/blocajele inainte de orice task nou`,
        evidence: labelList(overdue),
      });
    }
    if (states.includes("OVERLOADED")) {
      detections.push({
        key: "overloaded",
        person_id: p.id,
        finding: `${open.length} task-uri deschise vs media echipei ${round1(avgOpen)} — nu adauga task-uri noi fara realocare`,
        evidence: labelList(open),
      });
    }
    if (states.includes("UNDERUTILIZED")) {
      detections.push({
        key: "underutilized",
        person_id: p.id,
        finding: "0 task-uri deschise in sistem — verifica intai daca lucreaza in afara sistemului de task-uri",
        evidence: ["zero task-uri deschise in sistemul de task-uri; absenta datelor nu e dovada de inactivitate"],
      });
    }
    if (states.includes("BLOCKED")) {
      detections.push({
        key: "blocked",
        person_id: p.id,
        finding: `${blocked.length} task-uri blocate — deblocarea e prioritara fata de task-uri noi`,
        evidence: labelList(blocked),
      });
    }
    if (states.includes("FOUNDER_BOTTLENECK")) {
      detections.push({
        key: "founder_bottleneck",
        person_id: p.id,
        finding: `fondatorul tine ${Math.round((open.length / teamOpen) * 100)}% din task-urile deschise — candidat la delegare (§19)`,
        evidence: labelList(open),
      });
    }
    if (states.includes("DEPENDENCY_BOTTLENECK")) {
      detections.push({
        key: "dependency_bottleneck",
        person_id: p.id,
        finding: `${waiting.length} task-uri ale altora asteapta dupa aceasta persoana — deblocheaza dependenta inainte de orice alt task`,
        evidence: labelList(waiting),
      });
    }
  }

  return { per_person, detections };
}
