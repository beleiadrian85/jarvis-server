// SELF-EVOLUTION V1 §28 — COST CONTROL (motor PUR, determinist).
// Limitele de cost si de ritm ale build-urilor self-generated: cate pe zi,
// cate concurente, cat de scump, cat de mare diff-ul, cat dureaza. Orice
// depasire → allowed:false cu motiv explicit; APELANTUL decide ce face
// (de regula: CR-ul trece in WAITING_APPROVAL — omul aproba exceptia,
// sistemul nu si-o acorda singur).
// ZERO IO — importa DOAR din ./contract.js.
import { DEFAULT_BUILD_LIMITS } from "./contract.js";

// ── HELPERI INTERNI (puri) ──────────────────────────────────────────────

/** Numar finit strict pozitiv sau null (accepta si string numeric din env). */
function posNum(v) {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Numar finit >= 0 sau null — valorile lipsa NU se inventeaza. */
function nonNegNum(v) {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Cheia de zi pentru contoare (YYYY-MM-DD); lipsa datei = gap explicit. */
function dayKey(date) {
  const s = String(date || "").slice(0, 10);
  return s || "unknown-date";
}

// ── §28 — LIMITELE ACTIVE ───────────────────────────────────────────────

/**
 * Limitele active de build: DEFAULT_BUILD_LIMITS suprascrise de cfg doar
 * unde cfg are valori strict pozitive (evolutionMaxBuildsPerDay /
 * evolutionMaxConcurrent / evolutionMaxCostUsd). PUR — cfg vine gata citit
 * de apelant; aici nu se atinge env-ul.
 */
export function activeBuildLimits(cfg = {}) {
  const limits = { ...DEFAULT_BUILD_LIMITS };
  const perDay = posNum(cfg.evolutionMaxBuildsPerDay);
  const concurrent = posNum(cfg.evolutionMaxConcurrent);
  const costUsd = posNum(cfg.evolutionMaxCostUsd);
  if (perDay != null) limits.max_builds_per_day = perDay;
  if (concurrent != null) limits.max_concurrent_builds = concurrent;
  if (costUsd != null) limits.max_estimated_cost_usd = costUsd;
  return limits;
}

// ── §28 — POARTA DE BUILD ───────────────────────────────────────────────

/**
 * Verifica daca un build nou e permis sub limitele active. PUR si imutabil.
 *  - counters: dict { "YYYY-MM-DD": numar de build-uri pornite in acea zi }
 *  - date:     ziua curenta (ISO sau YYYY-MM-DD)
 *  - concurrent: cate build-uri ruleaza ACUM
 *  - estimate: { cost_usd, files_changed, diff_kb, runtime_minutes } —
 *    campurile lipsa nu pot dovedi o depasire, deci nu blocheaza; apelantul
 *    e responsabil sa ceara estimari complete inainte de build.
 * Permis → { allowed:true, next: contoarele incrementate (copie noua) }.
 * Respins → { allowed:false, reason } — apelantul seteaza WAITING_APPROVAL.
 */
export function checkBuildAllowed({ counters = {}, date = "", concurrent = 0, estimate = {}, limits = DEFAULT_BUILD_LIMITS } = {}) {
  const key = dayKey(date);
  const today = nonNegNum(counters[key]) ?? 0;

  // 1) Ritm zilnic.
  if (today >= limits.max_builds_per_day) {
    return { allowed: false, reason: `limita zilnica de build-uri atinsa (${today}/${limits.max_builds_per_day} in ${key}) — urmatorul build necesita aprobare umana sau ziua urmatoare.` };
  }

  // 2) Concurenta.
  const running = nonNegNum(concurrent) ?? 0;
  if (running >= limits.max_concurrent_builds) {
    return { allowed: false, reason: `limita de build-uri concurente atinsa (${running}/${limits.max_concurrent_builds}) — se asteapta terminarea build-ului curent.` };
  }

  // 3) Cost estimat.
  const costUsd = nonNegNum(estimate.cost_usd ?? estimate.estimated_cost_usd);
  if (costUsd != null && costUsd > limits.max_estimated_cost_usd) {
    return { allowed: false, reason: `cost estimat ${costUsd} USD > limita ${limits.max_estimated_cost_usd} USD — necesita aprobare umana.` };
  }

  // 4) Anvergura: fisiere atinse.
  const files = nonNegNum(estimate.files_changed);
  if (files != null && files > limits.max_files_changed) {
    return { allowed: false, reason: `${files} fisiere estimate > limita ${limits.max_files_changed} — build prea mare pentru autonomie, necesita aprobare umana.` };
  }

  // 5) Anvergura: marimea diff-ului.
  const diffKb = nonNegNum(estimate.diff_kb);
  if (diffKb != null && diffKb > limits.max_diff_kb) {
    return { allowed: false, reason: `diff estimat ${diffKb} KB > limita ${limits.max_diff_kb} KB — build prea mare pentru autonomie, necesita aprobare umana.` };
  }

  // 6) Durata.
  const runtime = nonNegNum(estimate.runtime_minutes ?? estimate.estimated_runtime_minutes);
  if (runtime != null && runtime > limits.max_runtime_minutes) {
    return { allowed: false, reason: `durata estimata ${runtime} min > limita ${limits.max_runtime_minutes} min — necesita aprobare umana.` };
  }

  // Permis — contoarele incrementate, fara mutatie pe input.
  return { allowed: true, next: { ...counters, [key]: today + 1 } };
}
