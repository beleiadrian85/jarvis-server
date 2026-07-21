// SELF-EVOLUTION V1 §30-31 — CAPABILITY MEMORY (motor PUR, imutabil).
// §30 — invatarea din esecuri de build: fiecare esec se consemneaza cu
// lectia si abordarea urmatoare; dupa maxRetries incercari, sistemul NU mai
// insista singur — HUMAN_REVIEW_REQUIRED (bucla de retry are om la capat).
// §31 — memoria capabilitatilor livrate: de ce a fost construita, cat a
// costat, cat se foloseste; review-ul periodic PROPUNE deprecierea celor
// nefolosite (propunere, nu stergere — decizia ramane la om).
// Toate functiile intorc memorie NOUA — inputul nu se muta niciodata.
// ZERO IO — importa DOAR din ./contract.js.
import { DEFAULT_BUILD_LIMITS } from "./contract.js";

// Cate esecuri se pastreaza per capabilitate (cele mai recente).
const MAX_FAILURES_PER_CR = 10;

// Praguri IMPROVE (§31): esecuri multe in valoare absoluta sau ca rata.
const IMPROVE_FAILURES_MIN = 3;
const IMPROVE_FAILURE_RATE = 0.2;

// ── HELPERI INTERNI (puri) ──────────────────────────────────────────────

function nonNegNum(v) {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Zile intregi intre doua date ISO, sau null daca vreo data e invalida. */
function daysBetweenISO(fromISO, toISO) {
  const a = new Date(fromISO), b = new Date(toISO);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Cel mai mare numar de incercare consemnat intr-o lista de esecuri. */
function maxAttemptIn(list) {
  let max = 0;
  for (const f of list) {
    const n = nonNegNum(f && f.attempt);
    if (n != null && n > max) max = n;
  }
  return max;
}

// ── §30 — INVATAREA DIN ESECURI DE BUILD ────────────────────────────────

/**
 * Consemneaza un esec de build pentru un CR. PUR si imutabil — intoarce
 * memorie NOUA. Pastreaza ultimele MAX_FAILURES_PER_CR esecuri per CR.
 * Cand numarul de incercari atinge maxRetries → human_review_required[cr_id]
 * = true: sistemul se opreste din reincercat si cere om (§30).
 */
export function recordBuildFailure(memory = {}, { cr_id, attempt, why, lesson, next_approach, at = null } = {}, maxRetries = DEFAULT_BUILD_LIMITS.max_retries_per_capability) {
  if (!cr_id) return memory; // fara id nu exista ce invata — nimic de scris

  const prev = (memory.failures && Array.isArray(memory.failures[cr_id])) ? memory.failures[cr_id] : [];
  const entry = {
    attempt: nonNegNum(attempt) ?? prev.length + 1,
    why: why ?? null,
    lesson: lesson ?? null,
    next_approach: next_approach ?? null,
    at,
  };
  const list = [...prev, entry].slice(-MAX_FAILURES_PER_CR);

  const attempts = Math.max(list.length, maxAttemptIn(list));
  const review = { ...(memory.human_review_required || {}) };
  if (attempts >= maxRetries) review[cr_id] = true;

  return {
    ...memory,
    failures: { ...(memory.failures || {}), [cr_id]: list },
    human_review_required: review,
  };
}

/**
 * Un CR a epuizat incercarile automate si are nevoie de om? PUR.
 * Adevarat daca flag-ul e setat sau daca esecurile consemnate ating
 * maxRetries (dupa numarul de intrari sau dupa cel mai mare attempt).
 */
export function needsHumanReview(memory = {}, cr_id, maxRetries = 2) {
  if (!cr_id) return false;
  if (memory.human_review_required && memory.human_review_required[cr_id] === true) return true;
  const list = (memory.failures && Array.isArray(memory.failures[cr_id])) ? memory.failures[cr_id] : [];
  return Math.max(list.length, maxAttemptIn(list)) >= maxRetries;
}

// ── §31 — MEMORIA CAPABILITATILOR LIVRATE ───────────────────────────────

/**
 * Consemneaza/actualizeaza memoria unei capabilitati livrate. PUR si
 * imutabil — intoarce memorie NOUA cu capabilities[cr_id] imbinat.
 * Reguli de merge (datele lipsa nu sterg cunoastere existenta):
 *  - campurile cu valoare null NU suprascriu o valoare existenta;
 *  - contoarele (usage_count/failures) cu valoarea implicita 0 NU reseteaza
 *    un contor existent — doar valori explicite > 0 il misca.
 */
export function recordCapabilityOutcome(memory = {}, { cr_id, why_built, cost, expected_value, actual_value = null, usage_count = 0, failures = 0, maintenance_cost = null, time_saved = null, business_impact = null, at = null } = {}) {
  if (!cr_id) return memory;

  const prev = (memory.capabilities && memory.capabilities[cr_id] && typeof memory.capabilities[cr_id] === "object")
    ? memory.capabilities[cr_id]
    : {};

  // null nu clobbereste o valoare existenta; lipsa totala se scrie ca null
  // (gap explicit, nu camp absent).
  const keepOrSet = (key, value) => (value != null ? value : (prev[key] != null ? prev[key] : null));
  // Contor: 0 implicit nu reseteaza un contor existent.
  const counter = (key, value) => {
    const n = nonNegNum(value) ?? 0;
    if (n > 0) return n;
    return nonNegNum(prev[key]) ?? 0;
  };

  const record = {
    ...prev,
    cr_id,
    why_built: keepOrSet("why_built", why_built ?? null),
    cost: keepOrSet("cost", cost ?? null),
    expected_value: keepOrSet("expected_value", expected_value ?? null),
    actual_value: keepOrSet("actual_value", actual_value),
    usage_count: counter("usage_count", usage_count),
    failures: counter("failures", failures),
    maintenance_cost: keepOrSet("maintenance_cost", maintenance_cost),
    time_saved: keepOrSet("time_saved", time_saved),
    business_impact: keepOrSet("business_impact", business_impact),
    at: keepOrSet("at", at),
  };

  return {
    ...memory,
    capabilities: { ...(memory.capabilities || {}), [cr_id]: record },
  };
}

// ── §31 — REVIEW-UL PERIODIC DE UTILIZARE ───────────────────────────────

/**
 * Trece prin capabilitatile din memorie si emite verdicte:
 *  - DEPRECATE_PROPOSED: nefolosita (usage_count 0) si mai veche de
 *    minAgeDays — PROPUNERE de retragere, niciodata stergere automata;
 *  - IMPROVE: folosita, dar cu esecuri multe (>= 3 sau rata >= 20%);
 *  - KEEP: restul — inclusiv nefolosite dar prea noi sau cu varsta
 *    necunoscuta (fara date nu se propune retragere).
 * PUR si determinist; rezultatul e sortat dupa cr_id.
 */
export function reviewCapabilityUsage(memory = {}, { nowISO = null, minAgeDays = 90 } = {}) {
  const caps = (memory.capabilities && typeof memory.capabilities === "object") ? memory.capabilities : {};
  const out = [];

  for (const cr_id of Object.keys(caps).sort()) {
    const rec = caps[cr_id] || {};
    const usage = nonNegNum(rec.usage_count) ?? 0;
    const fails = nonNegNum(rec.failures) ?? 0;
    const age = (nowISO && rec.at) ? daysBetweenISO(rec.at, nowISO) : null;

    if (usage === 0) {
      if (age != null && age >= minAgeDays) {
        out.push({ cr_id, verdict: "DEPRECATE_PROPOSED", why: `nefolosita (usage_count 0) de ${age} zile (>= ${minAgeDays}) — propunere de retragere; decizia si stergerea raman la om (§31).` });
      } else if (age == null) {
        out.push({ cr_id, verdict: "KEEP", why: "nefolosita, dar varsta necunoscuta (lipseste at sau nowISO) — fara date nu se propune retragerea." });
      } else {
        out.push({ cr_id, verdict: "KEEP", why: `nefolosita, dar prea noua (${age} < ${minAgeDays} zile) — se mai asteapta inainte de orice propunere.` });
      }
      continue;
    }

    if (fails >= IMPROVE_FAILURES_MIN || fails / usage >= IMPROVE_FAILURE_RATE) {
      out.push({ cr_id, verdict: "IMPROVE", why: `folosita (${usage} utilizari) dar cu ${fails} esecuri — rata de esec prea mare, capabilitatea trebuie imbunatatita.` });
      continue;
    }

    out.push({ cr_id, verdict: "KEEP", why: `folosita (${usage} utilizari, ${fails} esecuri) — isi face treaba, se pastreaza.` });
  }

  return out;
}
