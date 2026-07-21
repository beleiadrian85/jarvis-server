// NERVOUS SYSTEM V1 §7/§8 — RESPONSIBILITY MAP (harta responsabilitatilor).
// Construieste, PUR si determinist, profilul de responsabilitate al fiecarei
// persoane: rolul declarat de companie, rolul din Operational, domeniile
// detinute (owner in Company Data Map), tipurile de task facute ISTORIC
// (observate din date, niciodata inventate), fiabilitatea pe fiecare tip si
// managerul de escaladare. Domeniile fara owner mapabil raman EXPLICIT
// necunoscute (unknown_domains) — nu ghicim (§8). Zero IO, zero nume
// hardcodate: toate datele vin prin argumente; nucleul e generic (§29-30).

import { OPERATIONAL_CLOSED_STATUSES, daysBetween } from "./contract.js";

// ── NORMALIZARE ─────────────────────────────────────────────────────────

/** Normalizare text pentru potriviri nume/alias/status (diacritice ro → ascii). PUR. */
export function normText(s) {
  return String(s == null ? "" : s).toLowerCase()
    .replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t")
    .trim();
}

// Statusuri Operational care conteaza ca "facut" pentru fiabilitate (§7).
const DONE_STATUSES = new Set(["acceptat", "rezolvat"]);

// ── CLASIFICARE TITLURI (keyword-uri generice, fara nume proprii) ───────

/**
 * Clasifica un titlu de task intr-un tip generic din TASK_TYPES (§7):
 * solduri/plati/incasari → CASH_DATA; facturi → INVOICE_CLARIFICATION;
 * santier/lucrare/material → PROGRESS_UPDATE; furnizor → SUPPLIER_STATUS;
 * altfel MISSING_INFO. PUR si determinist (ordinea regulilor e fixa).
 */
export function classifyTaskTitle(title = "") {
  const t = normText(title);
  if (!t) return "MISSING_INFO";
  if (/(sold|plat[ai]|incasar|\bcash\b)/.test(t)) return "CASH_DATA";
  if (/factur/.test(t)) return "INVOICE_CLARIFICATION";
  if (/(santier|lucrar|material)/.test(t)) return "PROGRESS_UPDATE";
  if (/furnizor/.test(t)) return "SUPPLIER_STATUS";
  return "MISSING_INFO";
}

// ── POTRIVIRE PERSOANA <-> USER / TASK ──────────────────────────────────

// Setul de chei normalizate sub care o persoana poate aparea in date
// (id, nume, aliasuri + id/nume din randul Operational potrivit).
function buildKeys(person, user) {
  const keys = new Set();
  const add = (v) => { const k = normText(v); if (k) keys.add(k); };
  if (person) { add(person.id); add(person.name); for (const a of person.aliases || []) add(a); }
  if (user) { add(user.id); add(user.name); }
  return keys;
}

// Gaseste randul Operational al unei persoane declarate (nume/alias/id).
// usedIdx previne ca acelasi user sa fie atribuit la doua persoane.
function matchUser(person, users, usedIdx) {
  const keys = buildKeys(person, null);
  for (let i = 0; i < users.length; i++) {
    if (usedIdx.has(i)) continue;
    const u = users[i];
    if (keys.has(normText(u?.name)) || keys.has(normText(u?.id))) { usedIdx.add(i); return u; }
  }
  return null;
}

// ── MEMORIE ORGANIZATIONALA (§21) ───────────────────────────────────────

// Intrarea de memorie pentru un profil, cautata defensiv dupa id apoi nume.
// Forme acceptate: { people: { <id>: {...} } } sau direct { <id>: {...} }.
// Orice alta forma e ignorata (memoria poate fi null — gap explicit).
function memoryEntryFor(memory, profile) {
  if (!memory || typeof memory !== "object") return null;
  const bag = memory.people && typeof memory.people === "object" ? memory.people : memory;
  if (typeof bag !== "object") return null;
  return bag[profile.id] || (profile.name ? bag[profile.name] : null) || null;
}

// Merge aditiv al contorilor istorici din memorie (doar numere valide;
// nimic inventat — memoria e tot istoric observat, doar persistat).
function mergeMemory(profile, entry) {
  if (!entry || typeof entry !== "object") return;
  const hist = entry.historical_task_types;
  if (hist && typeof hist === "object") {
    for (const [t, c] of Object.entries(hist)) {
      const n = Number(c);
      if (Number.isFinite(n) && n > 0) {
        profile.historical_task_types[t] = (profile.historical_task_types[t] || 0) + n;
      }
    }
  }
  const rel = entry.reliability;
  if (rel && typeof rel === "object") {
    for (const [t, r] of Object.entries(rel)) {
      const doneN = Number(r?.done), totalN = Number(r?.total);
      if (!Number.isFinite(totalN) || totalN <= 0 || !Number.isFinite(doneN)) continue;
      const cur = profile.reliability[t] || (profile.reliability[t] = { done: 0, total: 0, rate: 0 });
      cur.done += Math.max(0, doneN);
      cur.total += totalN;
    }
  }
}

// ── AUTORITATE DE DECIZIE (§7) ──────────────────────────────────────────

// Rolul Operational → nivel de autoritate: Supervizor → founder,
// Administrator → manager, orice altceva (inclusiv necunoscut) → executant.
function authorityFor(roleOperational) {
  const r = normText(roleOperational);
  if (r.includes("supervizor")) return "founder";
  if (r.includes("administrator")) return "manager";
  return "executant";
}

// ── CONSTRUCTIA HARTII ──────────────────────────────────────────────────

/**
 * Construieste harta de responsabilitati (§7/§8) din datele primite:
 * people (COMPANY.people-like), users (randuri Operational), tasks (istoric
 * parse-uit), domains (COMPANY.domains-like), memory (organizationala, poate
 * fi null), asOf (ISO pentru calcul overdue; null = overdue necunoscut).
 * Returneaza { people: [profil], unknown_domains: [] }. PUR.
 */
export function buildResponsibilityMap({ people = [], users = [], tasks = [], domains = {}, memory = null, asOf = null } = {}) {
  const safePeople = Array.isArray(people) ? people : [];
  const safeUsers = Array.isArray(users) ? users : [];
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safeDomains = domains && typeof domains === "object" ? domains : {};

  const rows = []; // { profile, keys }
  const usedIdx = new Set();

  const newProfile = ({ id, name, roleDeclared, user }) => ({
    id: String(id),
    name: name == null ? null : String(name),
    role_declared: roleDeclared == null ? null : roleDeclared,
    role_operational: user ? (user.role == null ? null : user.role) : null,
    blocked: user ? !!user.blocked : null, // fara rand Operational → necunoscut, nu inventam
    known_responsibilities: [],
    observed_responsibilities: [],
    data_ownership: [],
    decision_authority: "executant",
    historical_task_types: {},
    reliability: {},
    task_stats: { total: 0, open: 0, overdue: asOf ? 0 : null },
    escalation_manager: null,
  });

  // 1) baza: persoanele declarate de companie, legate de randul lor Operational
  for (const person of safePeople) {
    if (!person || person.id == null) continue;
    const user = matchUser(person, safeUsers, usedIdx);
    const profile = newProfile({ id: person.id, name: person.name, roleDeclared: person.role ?? null, user });
    rows.push({ profile, keys: buildKeys(person, user) });
  }

  // 2) utilizatori Operational fara persoana declarata — date reale, nu-i pierdem
  for (let i = 0; i < safeUsers.length; i++) {
    if (usedIdx.has(i)) continue;
    const u = safeUsers[i];
    if (!u || (u.id == null && u.name == null)) continue;
    const profile = newProfile({ id: u.id ?? u.name, name: u.name, roleDeclared: null, user: u });
    rows.push({ profile, keys: buildKeys(null, u) });
  }

  // 3) domenii: owner mapabil → known_responsibilities + data_ownership;
  //    owner nemapabil sau lipsa → unknown_domains (gap explicit, nu ghicim)
  const unknown_domains = [];
  for (const [dom, meta] of Object.entries(safeDomains)) {
    const ownerKey = normText(meta?.owner);
    const row = ownerKey ? rows.find((r) => r.keys.has(ownerKey)) : null;
    if (row) {
      row.profile.known_responsibilities.push(dom);
      row.profile.data_ownership.push(dom);
    } else {
      unknown_domains.push(dom);
    }
  }

  // 4) istoric: fiecare task se clasifica si se atribuie persoanei potrivite;
  //    task fara asignat mapabil nu produce nimic (observat ≠ inventat)
  for (const task of safeTasks) {
    if (!task) continue;
    const row = rows.find((r) => r.keys.has(normText(task.assignee)) || r.keys.has(normText(task.assigneeName)));
    if (!row) continue;
    const p = row.profile;
    const type = classifyTaskTitle(task.title);
    p.historical_task_types[type] = (p.historical_task_types[type] || 0) + 1;
    const rel = p.reliability[type] || (p.reliability[type] = { done: 0, total: 0, rate: 0 });
    rel.total += 1;
    const status = normText(task.status);
    if (DONE_STATUSES.has(status)) rel.done += 1;
    p.task_stats.total += 1;
    if (!OPERATIONAL_CLOSED_STATUSES.includes(status)) {
      p.task_stats.open += 1;
      if (asOf && task.deadline) {
        const d = daysBetween(task.deadline, asOf);
        if (d != null && d > 0) p.task_stats.overdue += 1;
      }
    }
  }

  // 5) memoria organizationala (daca exista) + finalizare per profil
  for (const { profile } of rows) {
    mergeMemory(profile, memoryEntryFor(memory, profile));
    for (const rel of Object.values(profile.reliability)) {
      rel.done = Math.min(rel.done, rel.total);
      rel.rate = rel.total > 0 ? Math.round((rel.done / rel.total) * 100) / 100 : 0;
    }
    profile.observed_responsibilities = Object.keys(profile.historical_task_types).sort();
    profile.decision_authority = authorityFor(profile.role_operational);
  }

  // 6) escaladare: primul manager din harta, altfel primul founder; fara self
  const profiles = rows.map((r) => r.profile);
  const firstManagerId = profiles.find((p) => p.decision_authority === "manager")?.id ?? null;
  const firstFounderId = profiles.find((p) => p.decision_authority === "founder")?.id ?? null;
  for (const p of profiles) {
    p.escalation_manager =
      [firstManagerId, firstFounderId].find((id) => id != null && id !== p.id) ?? null;
  }

  return { people: profiles, unknown_domains };
}

// ── INTEROGARE ──────────────────────────────────────────────────────────

/**
 * Id-ul persoanei care detine un domeniu in harta (known_responsibilities),
 * sau null daca domeniul nu are owner mapat. PUR.
 */
export function ownerForDomain(domain, map) {
  const d = String(domain == null ? "" : domain).trim().toUpperCase();
  if (!d || !map || !Array.isArray(map.people)) return null;
  const p = map.people.find((x) => (x.known_responsibilities || []).some((k) => String(k).toUpperCase() === d));
  return p ? p.id : null;
}

/**
 * Profilul unei persoane din harta, dupa id sau nume (normalizat), sau null.
 * Helper pur partajat cu delegationEngine. PUR.
 */
export function personInMap(map, ref) {
  if (!map || !Array.isArray(map.people) || ref == null) return null;
  const key = normText(ref);
  if (!key) return null;
  return map.people.find((p) => normText(p.id) === key || normText(p.name) === key) || null;
}
