// WORKLOAD REVIEW (§2) — analiza READ-ONLY a incarcarii unei persoane cand
// devine bottleneck. Clasifica task-urile deschise in KEEP_NOW (max 3),
// DEFER, REASSIGN_CANDIDATES, CANCEL_CANDIDATES — RECOMANDARI, nu modificari.
// Task-urile create de om → doar propunere (nu schimbare unilaterala daca
// politica nu permite); task-urile create de JARVIS pot fi reprioritizate unde
// e autorizat. Determinist, pur; missing != zero (fara semnal → necunoscut).
import { OPERATIONAL_CLOSED_STATUSES, daysBetween } from "./contract.js";

const PRIO_RANK = { critic: 4, ridicat: 3, normal: 2, scazut: 1 };

/** Scor de retinere (cat de mult merita tinut sus in atentie). PUR. */
function retentionScore(t, asOf) {
  const prio = PRIO_RANK[String(t?.priority || "").toLowerCase()] ?? 2;
  const overdue = t?.deadline && asOf ? (daysBetween(t.deadline, asOf) ?? 0) : 0;
  const urgency = overdue > 0 ? 3 : (t?.deadline && daysBetween(t.deadline, asOf) != null && daysBetween(asOf, t.deadline) <= 3 ? 2 : 1);
  const blocked = String(t?.status || "").toLowerCase() === "blocat" ? 1 : 0;
  return prio * 3 + urgency * 2 + blocked;
}

/**
 * Review-ul incarcarii unei persoane. PUR.
 * @param {object} p
 * @param {string} p.person_id
 * @param {Array} p.opsTasks  task-urile Operational (collectState) — cu assignee, status, priority, deadline, creator, id, title, updatedAt
 * @param {string} p.asOf
 * @param {number} p.maxPriorities  (default 3)
 * @returns {{person_id, total_open, overdue, buckets:{KEEP_NOW, DEFER, REASSIGN_CANDIDATES, CANCEL_CANDIDATES}, note}}
 */
export function reviewWorkload({ person_id, opsTasks = [], asOf = null, maxPriorities = 3 } = {}) {
  const mine = (opsTasks || []).filter(
    (t) => (t?.assignee === person_id || t?.assigneeName === person_id) &&
      !OPERATIONAL_CLOSED_STATUSES.includes(String(t?.status || "").toLowerCase())
  );
  const overdue = mine.filter((t) => t?.deadline && asOf && (daysBetween(t.deadline, asOf) ?? 0) > 0);

  // Sortare pe scor de retinere descrescator (cele mai importante/urgente sus).
  const ranked = [...mine].sort((a, b) => retentionScore(b, asOf) - retentionScore(a, asOf));

  const keep = ranked.slice(0, maxPriorities).map((t) => label(t, asOf));
  const rest = ranked.slice(maxPriorities);

  const buckets = { KEEP_NOW: keep, DEFER: [], REASSIGN_CANDIDATES: [], CANCEL_CANDIDATES: [] };
  for (const t of rest) {
    const od = t?.deadline && asOf ? (daysBetween(t.deadline, asOf) ?? 0) : 0;
    const prio = PRIO_RANK[String(t?.priority || "").toLowerCase()] ?? 2;
    // CANCEL doar task-urile PROPRII ale lui JARVIS de prioritate mica
    // (conservator §2 — niciodata task-uri ale oamenilor, niciodata prioritate mare).
    if (t?.creator === "CEO_AI" && prio <= 1) {
      buckets.CANCEL_CANDIDATES.push({ ...label(t, asOf), why: "creat de JARVIS, prioritate mica — candidat de anulare (propunere, nu stergere)" });
    } else if (od <= 0 && prio <= 2) {
      // valid dar neurgent → DEFER (nu se atinge task-ul, doar iese din atentie)
      buckets.DEFER.push({ ...label(t, asOf), why: "valid dar neurgent — iese din prioritatile active" });
    } else {
      // ramane in atentie dar peste cele 3; nu se reasigneaza fara owner legitim
      buckets.DEFER.push({ ...label(t, asOf), why: "peste cele 3 prioritati active — urmareste, nu adauga presiune" });
    }
  }

  // §2 — reassign DOAR daca exista owner legitim (nu avem harta de substituire
  // sigura per subiect aici) → lista ramane goala cu nota onesta.
  const note = mine.length > maxPriorities
    ? `${person_id} are ${mine.length} task-uri deschise (${overdue.length} restante). Max 3 prioritati active recomandate; restul DEFER. Reasignarea cere un owner legitim per subiect — NU se ghiceste. Task-urile create de oameni raman recomandari, nu schimbari unilaterale.`
    : `${person_id} are ${mine.length} task-uri deschise — sub prag, fara presiune de reechilibrare.`;

  return { person_id, total_open: mine.length, overdue: overdue.length, buckets, note };
}

function label(t, asOf) {
  const od = t?.deadline && asOf ? (daysBetween(t.deadline, asOf) ?? 0) : 0;
  return {
    id: t?.id ?? null,
    title: (t?.title || "").slice(0, 60),
    priority: t?.priority ?? null,
    status: t?.status ?? null,
    deadline: t?.deadline ?? null,
    overdue_days: od > 0 ? od : 0,
    created_by_jarvis: t?.creator === "CEO_AI",
  };
}
