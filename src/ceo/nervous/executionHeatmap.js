// NERVOUS SYSTEM V1 §20 — EXECUTION HEATMAP (harta de caldura a executiei).
// O privire de sus: pe fiecare domeniu al firmei (cash, vanzari, proiecte,
// oameni, decizii) — ce se MISCA, ce ASTEAPTA, ce e BLOCAT, ce a STAGNAT,
// ce s-a INCHIS. Se deriva din task-urile CEO (registry) + task-urile
// Operational + nevoile deschise. Fiecare stare vine cu evidence concrete si
// un count; niciodata inventata. Cash e UNKNOWN cat timp nu avem sold valid
// (missing != zero: lipsa datelor nu inseamna zero lei). Modul PUR:
// determinist, ZERO IO, fara nume de oameni/companie.
import { mapOperationalStatus, OPERATIONAL_CLOSED_STATUSES, daysBetween } from "./contract.js";

// ── STARILE CANONICE ALE UNUI DOMENIU ────────────────────────────────────
export const HEATMAP_STATES = ["MOVING", "WAITING", "BLOCKED", "STALE", "COMPLETED", "UNKNOWN"];

// Domeniile urmarite (chei stabile pentru UI).
export const HEATMAP_DOMAINS = ["cash", "sales", "projects", "people", "decisions"];

// Precedenta la agregare: cand un domeniu are semnale multiple, starea afisata
// e cea mai demna de atentie (blocajul bate miscarea, staza bate asteptarea).
const STATE_PRECEDENCE = ["BLOCKED", "STALE", "WAITING", "MOVING", "COMPLETED", "UNKNOWN"];

// Prag (zile) peste care o intrare deschisa fara miscare devine STALE.
const STALE_DAYS = 5;
// Prag (zile) sub care o miscare e considerata "recenta" (avanseaza acum).
const RECENT_DAYS = 2;

const LEGEND = {
  MOVING: "avanseaza acum (task-uri in lucru sau abia asignate)",
  WAITING: "cereri deschise fara raspuns inca",
  BLOCKED: "blocat (lifecycle BLOCKED sau status blocat)",
  STALE: "deschis si vechi, fara miscare recenta",
  COMPLETED: "inchis cu succes",
  UNKNOWN: "fara date suficiente pentru a evalua",
};

// ── NORMALIZARE DOMENIU (variante RO/EN/plural → cheie canonica). ─────────
function domainKey(d) {
  const s = String(d || "").toLowerCase().trim();
  if (/cash|sold|bani|trezor|lichidit/.test(s)) return "cash";
  if (/sales|vanz|vinz|lead|client|oferta/.test(s)) return "sales";
  if (/project|proiect|santier|lucrare|constr/.test(s)) return "projects";
  if (/people|oameni|persoan|echipa|hr|resurs/.test(s)) return "people";
  if (/decis|decizie|approv|aproba|founder|fondator|board/.test(s)) return "decisions";
  return null; // domeniu nerecunoscut → nu il fortam intr-un bucket gresit
}

/** Lifecycle-ul unei intrari CEO din registry (declarat sau derivat din status). */
function lifecycleOf(entry) {
  const lc = entry?.lifecycle || entry?.internal?.lifecycle;
  if (lc) return String(lc).toUpperCase();
  const st = entry?.status || entry?.internal?.status || entry?.opsStatus;
  return st ? mapOperationalStatus(st) : null;
}

/** Data ultimei miscari a unei intrari (updatedAt/updated_at/ts). */
function lastMoveISO(entry) {
  return entry?.updatedAt || entry?.updated_at || entry?.internal?.updatedAt || entry?.ts || entry?.createdAt || entry?.created_at || null;
}

/** Titlu scurt pentru evidence — din date, niciodata inventat. */
function titleOf(entry) {
  return entry?.internal?.task_title || entry?.human?.title || entry?.title || entry?.summary || entry?.need_id || entry?.id || "intrare fara titlu";
}

/** Clasifica o intrare individuala intr-o stare heatmap, cu asOf pentru varsta. */
function classifyEntry({ lifecycle, status, lastMove, asOf, open }) {
  const st = String(status || "").toLowerCase().trim();
  // Inchis in Operational SAU lifecycle inchis cu succes → COMPLETED.
  if (OPERATIONAL_CLOSED_STATUSES.includes(st) && st !== "oprit") return "COMPLETED";
  if (lifecycle === "COMPLETED") return "COMPLETED";
  // Blocat explicit.
  if (lifecycle === "BLOCKED" || st === "blocat") return "BLOCKED";
  // Deschis: distingem miscare recenta vs. staza vs. asteptare.
  if (open) {
    const age = (lastMove && asOf) ? daysBetween(lastMove, asOf) : null;
    if (lifecycle === "IN_PROGRESS" || lifecycle === "ASSIGNED" || st === "in_lucru" || st === "rezolvat_partial") {
      if (age != null && age > STALE_DAYS) return "STALE"; // asignat/in lucru dar impotmolit
      if (age == null || age <= RECENT_DAYS) return "MOVING";
      return "MOVING"; // deschis si in lucru, dar nu foarte vechi → tot se misca
    }
    // Cerere deschisa fara semnal de progres.
    if (age != null && age > STALE_DAYS) return "STALE";
    return "WAITING";
  }
  return "UNKNOWN";
}

/** Alege starea agregata a unui domeniu dupa precedenta canonica. */
function aggregateState(counts) {
  for (const s of STATE_PRECEDENCE) {
    if (counts[s] > 0) return s;
  }
  return "UNKNOWN";
}

/** Soldul e valid (nu null / nu expirat)? — cash e UNKNOWN altfel. */
function balancesValid(balances, asOf) {
  if (!balances || typeof balances !== "object") return false;
  if (balances.expired === true || balances.stale === true) return false;
  // Daca poarta o data proprie si un ttl in zile, verificam prospetimea.
  const asOfDate = balances.asOf || balances.date || balances.updatedAt || null;
  const ttl = Number(balances.ttl_days);
  if (asOfDate && asOf && Number.isFinite(ttl)) {
    const age = daysBetween(asOfDate, asOf);
    if (age != null && age > ttl) return false;
  }
  // Are cel putin o valoare numerica de sold?
  const vals = Array.isArray(balances.accounts) ? balances.accounts : (Array.isArray(balances) ? balances : null);
  if (vals) return vals.some((a) => Number.isFinite(Number(a?.amount ?? a?.balance ?? a)));
  return Number.isFinite(Number(balances.total ?? balances.amount ?? balances.balance));
}

/**
 * Construieste harta de caldura a executiei pe cele 5 domenii (§20).
 * @param {object} p
 * @param {object} p.registry   registrul task-urilor CEO ({id: entry} sau array)
 * @param {Array} p.opsTasks    task-urile Operational citite (status/project/deadline/updatedAt)
 * @param {object|null} p.balances  soldurile bancare (pt. domeniul cash) sau null
 * @param {Array} p.needs       nevoile deschise (Need Engine) — cereri fara task inca
 * @param {string|null} p.asOf  data curenta ISO (pt. varsta/staza)
 * @param {number|null} p.nowMs momentul curent ms (rezerva, daca asOf lipseste)
 * @returns {{domains: object, legend: object}}
 */
export function buildExecutionHeatmap({ registry = {}, opsTasks = [], balances = null, needs = [], asOf = null, nowMs = null } = {}) {
  // asOf efectiv: preferam ISO-ul injectat; altfel derivam din nowMs; altfel null.
  const asOfISO = asOf || (Number.isFinite(Number(nowMs)) ? new Date(Number(nowMs)).toISOString() : null);

  // Buckets per domeniu: numaram starile si colectam evidence.
  const buckets = {};
  for (const d of HEATMAP_DOMAINS) {
    buckets[d] = { counts: { MOVING: 0, WAITING: 0, BLOCKED: 0, STALE: 0, COMPLETED: 0, UNKNOWN: 0 }, evidence: [] };
  }

  const push = (domain, state, label) => {
    const b = buckets[domain];
    if (!b) return;
    b.counts[state]++;
    if (b.evidence.length < 6) b.evidence.push({ state, ref: label });
  };

  // ── 1) Task-urile CEO din registry. ──────────────────────────────────────
  const registryEntries = Array.isArray(registry) ? registry : Object.values(registry || {});
  for (const entry of registryEntries) {
    if (!entry || typeof entry !== "object") continue;
    const dom = domainKey(entry.internal?.domain ?? entry.domain);
    if (!dom) continue;
    const lifecycle = lifecycleOf(entry);
    const status = entry.status || entry.internal?.status || entry.opsStatus || null;
    const open = !(lifecycle === "COMPLETED" || lifecycle === "FAILED" || lifecycle === "EXPIRED" || lifecycle === "NO_LONGER_NEEDED");
    const state = classifyEntry({ lifecycle, status, lastMove: lastMoveISO(entry), asOf: asOfISO, open });
    push(dom, state, titleOf(entry));
  }

  // ── 2) Task-urile Operational (ancorate pe domeniu prin camp explicit sau
  //       proiect; fara maparea unui domeniu clar, nu le fortam). ───────────
  for (const t of Array.isArray(opsTasks) ? opsTasks : []) {
    if (!t || typeof t !== "object") continue;
    const dom = domainKey(t.domain ?? t.ceo_domain ?? t.project);
    if (!dom) continue;
    const status = t.status || null;
    const lifecycle = status ? mapOperationalStatus(status) : null;
    const st = String(status || "").toLowerCase().trim();
    const open = !OPERATIONAL_CLOSED_STATUSES.includes(st);
    const state = classifyEntry({ lifecycle, status, lastMove: lastMoveISO(t) || t.deadline, asOf: asOfISO, open });
    push(dom, state, t.title || t.id || "task Operational");
  }

  // ── 3) Nevoile deschise = cereri fara raspuns inca → WAITING. ─────────────
  for (const n of Array.isArray(needs) ? needs : []) {
    if (!n || typeof n !== "object") continue;
    const dom = domainKey(n.domain);
    if (!dom) continue;
    push(dom, "WAITING", n.title || n.summary || n.need_id || "nevoie deschisa");
  }

  // ── 4) Agregare + regula speciala pentru cash (sold necesar). ─────────────
  const cashOk = balancesValid(balances, asOfISO);
  const domains = {};
  for (const d of HEATMAP_DOMAINS) {
    const b = buckets[d];
    const total = Object.values(b.counts).reduce((a, c) => a + c, 0);
    let state = total ? aggregateState(b.counts) : "UNKNOWN";

    if (d === "cash" && !cashOk) {
      // Fara sold valid, cash e UNKNOWN indiferent de task-uri — nu pretindem
      // ca stim starea banilor (missing != zero).
      state = "UNKNOWN";
      if (!b.evidence.some((e) => e.ref === "sold bancar indisponibil/expirat")) {
        b.evidence.unshift({ state: "UNKNOWN", ref: "sold bancar indisponibil/expirat" });
      }
    }

    domains[d] = {
      state,
      count: b.counts[state] ?? total,
      totals: b.counts,
      evidence: b.evidence.slice(0, 6),
    };
  }

  return { domains, legend: LEGEND };
}
