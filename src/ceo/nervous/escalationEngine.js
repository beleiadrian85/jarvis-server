// NERVOUS SYSTEM V1 §17 — ESCALATION ENGINE.
// Fondatorul e resursa RARA (§9): escaladarea urca treapta cu treapta —
// 1) reminder catre owner; 2) intreaba motivul/blocajul; 3) poate SYSTEM
// obtine informatia altfel?; 4) alt owner cu reliability similara din harta;
// 5) manager; 6) DOAR apoi fondatorul, si doar daca task-ul e MATERIAL.
// Fiecare treapta are un COST (0-100) — costul masoara cat de scumpa e
// atentia consumata, iar planul alege mereu cel mai ieftin pas neincercat.
// Modul PUR: functii deterministe peste argumente, ZERO IO, zero nume
// hardcodate — oamenii vin prin map/founderId din exterior.
import { priorityToOperational } from "./contract.js";

// ── CONSTANTE ───────────────────────────────────────────────────────────

/** Costurile canonice de atentie (0-100). UNKNOWN = tinta nedeterminata —
 *  prudent, mai scump decat un executant cunoscut. */
export const ESCALATION_COSTS = { SYSTEM: 5, EXECUTOR: 20, MANAGER: 45, FOUNDER: 90, BOARD: 95, UNKNOWN: 50 };

/** Ordinea canonica a treptelor de escaladare (§17). */
export const ESCALATION_STEPS = ["REMINDER_OWNER", "ASK_REASON", "SYSTEM_ALTERNATIVE", "ALTERNATE_OWNER", "MANAGER", "FOUNDER"];

// Alias-uri acceptate in `attempts` → treapta canonica.
const STEP_ALIASES = {
  REMINDER: "REMINDER_OWNER", REMINDER_OWNER: "REMINDER_OWNER",
  ASK: "ASK_REASON", ASK_REASON: "ASK_REASON", REASON: "ASK_REASON", WHY: "ASK_REASON", BLOCKER: "ASK_REASON",
  SYSTEM: "SYSTEM_ALTERNATIVE", SYSTEM_ALTERNATIVE: "SYSTEM_ALTERNATIVE", ALT_SOURCE: "SYSTEM_ALTERNATIVE",
  ALTERNATE_OWNER: "ALTERNATE_OWNER", ALT_OWNER: "ALTERNATE_OWNER", OTHER_OWNER: "ALTERNATE_OWNER", REASSIGN: "ALTERNATE_OWNER",
  MANAGER: "MANAGER", ESCALATE_MANAGER: "MANAGER",
  FOUNDER: "FOUNDER", ESCALATE_FOUNDER: "FOUNDER",
};

// Clasificarea rolurilor pe cuvinte generice de rol (nu nume de oameni).
const FOUNDER_ROLE_RE = /fondator|founder|owner|ceo|patron/i;
const MANAGER_ROLE_RE = /manager|director|sef|lead|coordonator/i;

// ── HELPERI INTERNI: OAMENI SI ROLURI ───────────────────────────────────

function norm(s) {
  return String(s ?? "").toLowerCase().trim();
}

/** Lista de persoane dintr-o harta flexibila: array, {people:[...]} sau
 *  obiect {id: {..}}. Harta lipsa → lista goala (gap, nu inventie). */
function personsOf(map) {
  if (!map) return [];
  if (Array.isArray(map)) return map.filter((p) => p && typeof p === "object");
  if (Array.isArray(map.people)) return map.people.filter((p) => p && typeof p === "object");
  if (typeof map === "object") {
    return Object.entries(map)
      .filter(([, v]) => v && typeof v === "object")
      .map(([k, v]) => ({ id: v.id || k, ...v }));
  }
  return [];
}

/** Persoana din harta dupa id/nume/alias. Negasita → null. */
function resolvePerson(map, idOrName) {
  const n = norm(idOrName);
  if (!n) return null;
  return personsOf(map).find(
    (p) => norm(p.id) === n || norm(p.name) === n || (Array.isArray(p.aliases) && p.aliases.some((a) => norm(a) === n))
  ) || null;
}

/** Clasa de rol a unei persoane: FOUNDER / MANAGER / EXECUTOR / UNKNOWN. */
function roleClassOf(p) {
  if (!p) return "UNKNOWN";
  const role = String(p.role || "");
  if (FOUNDER_ROLE_RE.test(role)) return "FOUNDER";
  if (MANAGER_ROLE_RE.test(role)) return "MANAGER";
  return "EXECUTOR";
}

/** Persoana e fondatorul? — dupa rol sau dupa founderId injectat. */
function isFounder(p, founderId) {
  if (roleClassOf(p) === "FOUNDER") return true;
  const f = norm(founderId);
  return !!f && (norm(p?.id) === f || norm(p?.name) === f);
}

/** Reliability numerica din harta (score 0-100) sau null daca lipseste. */
function reliabilityOf(p) {
  const n = Number(p?.reliability ?? p?.reliability_score);
  return Number.isFinite(n) ? n : null;
}

/** Persoana e OVERLOADED conform loads ({id: {states:[...]}} sau {id: [...]}) */
function isOverloaded(loads, p) {
  const entry = loads?.[p?.id] ?? loads?.[norm(p?.name)] ?? null;
  const states = Array.isArray(entry) ? entry : entry?.states;
  return Array.isArray(states) && states.includes("OVERLOADED");
}

/** Numele afisabil al unei persoane (nume > id). */
function displayName(p) {
  return p?.name || p?.id || null;
}

// ── HELPERI INTERNI: ALEGEREA TINTELOR ──────────────────────────────────

/** Owner alternativ: executant din harta (nu ownerul, nu fondatorul, nu un
 *  manager), preferabil ne-supraincarcat, cu reliability cat mai apropiata
 *  de a ownerului curent. Fara candidat → null (gap explicit). */
function pickAlternateOwner({ map, owner, loads, founderId }) {
  const people = personsOf(map);
  if (!people.length) return null;
  const ownRel = reliabilityOf(resolvePerson(map, owner));
  const own = norm(owner);
  const cands = people.filter((p) => {
    if (own && (norm(p.id) === own || norm(p.name) === own)) return false;
    if (isFounder(p, founderId)) return false;
    if (roleClassOf(p) === "MANAGER") return false;
    return true;
  });
  const free = cands.filter((p) => !isOverloaded(loads, p));
  const pool = free.length ? free : cands;
  if (!pool.length) return null;
  // Cheie deterministica: cel mai apropiat de reliability-ul ownerului;
  // fara referinta → cel mai fiabil; fara date deloc → ultimul.
  const key = (p) => {
    const r = reliabilityOf(p);
    if (r == null) return 10_000;
    if (ownRel == null) return 1_000 - r;
    return Math.abs(r - ownRel);
  };
  return [...pool].sort((a, b) => key(a) - key(b))[0];
}

/** Primul manager din harta (rol de tip manager, nu fondator) sau null. */
function pickManager({ map, founderId }) {
  return personsOf(map).find((p) => roleClassOf(p) === "MANAGER" && !isFounder(p, founderId)) || null;
}

/** Normalizeaza o intrare din attempts la treapta canonica (string, numar
 *  1-6 sau obiect {step|name|action}); necunoscut → null. */
function normStep(x) {
  if (x == null) return null;
  if (typeof x === "number") return ESCALATION_STEPS[x - 1] || null;
  if (typeof x === "object") return normStep(x.step ?? x.name ?? x.action ?? null);
  const s = String(x).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return STEP_ALIASES[s] || null;
}

/** Ownerul task-ului CEO din datele lui (niciodata ghicit). */
function ownerOf(task) {
  return task?.internal?.owner || task?.operational_payload?.assignee || task?.owner || null;
}

// ── EXPORTURI ───────────────────────────────────────────────────────────

/**
 * Task-ul e MATERIAL (merita, la limita, atentia fondatorului)? Doar din
 * semnale explicite: flag material, prioritate critic/ridicat sau scoruri
 * care mapate prin priorityToOperational dau critic/ridicat (>= 55).
 * @param {object} task
 * @returns {boolean}
 */
export function isMaterialTask(task = {}) {
  const it = task.internal || {};
  if (it.material === true) return true;
  const p = norm(it.priority);
  if (p === "critic" || p === "ridicat") return true;
  for (const raw of [it.severity, it.value_total, it.task_value]) {
    const n = Number(raw);
    if (Number.isFinite(n) && ["critic", "ridicat"].includes(priorityToOperational(n))) return true;
  }
  return false;
}

/**
 * Costul de atentie al unei tinte de escaladare (0-100, §9/§17).
 * SYSTEM=5, executant=20, manager=45, founder=90, BOARD=95; tinta
 * nedeterminata → 50 (prudent).
 * @param {object} p
 * @param {string|null} p.target     tinta ("SYSTEM"/"BOARD"/nume/id)
 * @param {string|null} p.person_id  alternativ la target: id-ul persoanei
 * @param {object|null} p.map        harta de oameni (roluri, reliability)
 * @param {string|null} p.founderId  id-ul fondatorului (injectat, nu hardcodat)
 * @returns {number}
 */
export function escalationCost({ target = null, person_id = null, map = null, founderId = null } = {}) {
  const t = String(target ?? person_id ?? "").trim();
  if (!t || t.toUpperCase() === "RESPONSIBILITY_UNKNOWN" || t.toUpperCase() === "NO_ACTION") return ESCALATION_COSTS.UNKNOWN;
  const up = t.toUpperCase();
  if (up === "SYSTEM") return ESCALATION_COSTS.SYSTEM;
  if (up === "BOARD") return ESCALATION_COSTS.BOARD;
  const f = norm(founderId);
  if (f && norm(t) === f) return ESCALATION_COSTS.FOUNDER;
  const p = resolvePerson(map, t);
  if (p) {
    if (isFounder(p, founderId)) return ESCALATION_COSTS.FOUNDER;
    if (roleClassOf(p) === "MANAGER") return ESCALATION_COSTS.MANAGER;
    return ESCALATION_COSTS.EXECUTOR;
  }
  // Persoana numita dar absenta din harta → presupunerea cea mai ieftina
  // despre ROL (executant), nu despre existenta ei.
  return ESCALATION_COSTS.EXECUTOR;
}

/**
 * Planul de escaladare complet (§17): toate treptele in ordine, cu tinta,
 * cost si nota; `next` = prima treapta neincercata (fondatorul DOAR daca
 * task-ul e material — altfel planul se opreste la manager).
 * @param {object} p
 * @param {object} p.task       task-ul CEO (owner, prioritate/severitate)
 * @param {Array} p.attempts    treptele deja incercate (string/numar/{step})
 * @param {object|null} p.map   harta de oameni
 * @param {object} p.loads      incarcarea per persoana ({id:{states:[...]}})
 * @param {string|null} p.founderId  id-ul fondatorului
 * @returns {{steps: {step:string, target:string|null, cost:number, note:string}[], next: {target:string|null, why:string}|null, founder_is_last: true}}
 */
export function planEscalation({ task = {}, attempts = [], map = null, loads = {}, founderId = null } = {}) {
  const owner = ownerOf(task);
  const ownerCost = owner ? escalationCost({ target: owner, map, founderId }) : ESCALATION_COSTS.UNKNOWN;
  const alt = pickAlternateOwner({ map, owner, loads, founderId });
  const altName = displayName(alt);
  const mgr = pickManager({ map, founderId });
  const mgrName = displayName(mgr);
  const material = isMaterialTask(task);

  const steps = [
    {
      step: "REMINDER_OWNER", target: owner, cost: ownerCost,
      note: owner ? "reminder unic catre ownerul curent (max 1, §16)" : "gap: owner necunoscut — nu stim pe cine sa reamintim",
    },
    {
      step: "ASK_REASON", target: owner, cost: ownerCost,
      note: "intreaba motivul/blocajul — poate problema nu e la owner, ci in amonte",
    },
    {
      step: "SYSTEM_ALTERNATIVE", target: "SYSTEM", cost: ESCALATION_COSTS.SYSTEM,
      note: "poate sistemul obtine informatia din alta sursa, fara sa consume atentia nimanui",
    },
    {
      step: "ALTERNATE_OWNER", target: altName,
      cost: altName ? escalationCost({ target: altName, map, founderId }) : ESCALATION_COSTS.UNKNOWN,
      note: altName ? "owner alternativ cu reliability similara din harta de oameni" : "gap: harta nu ofera un owner alternativ — nu ghicim",
    },
    {
      step: "MANAGER", target: mgrName,
      cost: mgrName ? escalationCost({ target: mgrName, map, founderId }) : ESCALATION_COSTS.MANAGER,
      note: mgrName ? "escaladare la manager — abia dupa ce treptele ieftine au esuat" : "gap: niciun manager identificabil in harta",
    },
    {
      step: "FOUNDER", target: founderId || null, cost: ESCALATION_COSTS.FOUNDER,
      note: material
        ? "ultima treapta — task material, fondatorul poate fi implicat (resursa rara, §9)"
        : "fondatorul NU se atinge — task-ul nu e material (§9: resursa rara)",
    },
  ];

  const tried = new Set((Array.isArray(attempts) ? attempts : []).map(normStep).filter(Boolean));
  let next = null;
  for (const s of steps) {
    if (tried.has(s.step)) continue;
    if (s.step === "FOUNDER" && !material) break; // ne oprim la manager
    next = { target: s.target, why: `${s.step} — primul pas neincercat: ${s.note}` };
    break;
  }

  return { steps, next, founder_is_last: true };
}
