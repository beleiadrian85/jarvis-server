// SELF-EVOLUTION V1 — CAPABILITY REQUEST (§3, §22, §29).
// Rolul: construieste, valideaza, tranziteaza si deduplica obiectul canonic
// Capability Request (§3) — singura forma prin care o limitare detectata
// devine o cerere formala de capabilitate. Politica de deploy e inghetata
// (§22): approval_required e INTOTDEAUNA true si deployment_policy e
// constanta din contract — nu exista cale de configurare in acest modul.
// Dedup §29: acelasi id, titlu similar sau respins anterior cu titlu similar
// nu genereaza o cerere noua.
// MODUL PUR: functii deterministe peste argumente — ZERO IO, zero stare.
// Date lipsa = UNKNOWN/null explicit, niciodata inventate.
import {
  CR_REQUIRED_FIELDS, CR_LIFECYCLE, CR_TERMINAL, CAPABILITY_TYPES,
  canTransition, crId, branchNameFor, slug,
} from "./contract.js";

// ── CONSTANTE INTERNE ───────────────────────────────────────────────────

// §22 — politica de deploy: valoare canonica, identica cu numele constantei
// inghetate din contract. NU e citita din env, NU e configurabila.
const DEPLOYMENT_POLICY = "PRODUCTION_DEPLOYMENT_REQUIRES_ADRIAN_APPROVAL";

// Statusuri valide = lifecycle + terminale (pentru validare).
const VALID_STATUSES = [...CR_LIFECYCLE, ...CR_TERMINAL];

// Campurile din CR care trebuie sa fie array-uri.
const ARRAY_FIELDS = [
  "sources_checked", "existing_capabilities_checked", "reuse_options", "users",
  "inputs", "outputs", "validation_rules", "write_boundaries",
  "security_constraints", "acceptance_tests", "dependencies", "downstream_consumers",
];

// Constrangeri de securitate minime, derivate din §11/§34 — mereu prezente.
const BASE_SECURITY_CONSTRAINTS = [
  "SANDBOX_ONLY_BUILD",
  "NO_FORBIDDEN_PATHS",
  "NO_SECRETS_ACCESS",
  "NO_PRODUCTION_WRITE_BEFORE_APPROVAL",
];

// Complexitate estimata pe tip de gap (determinist; necunoscut → medium).
const COMPLEXITY_BY_GAP = {
  KNOWLEDGE_GAP: "low", POLICY_GAP: "low",
  CONNECTOR_GAP: "medium", ANALYSIS_GAP: "medium", DATA_CAPABILITY_GAP: "medium",
  INPUT_CAPABILITY_GAP: "medium", OBSERVABILITY_GAP: "medium",
  ACTION_GAP: "high", UI_GAP: "high",
};

// Nivel de risc pe tip de gap (actiunile autorizate = cel mai riscant).
const RISK_BY_GAP = {
  KNOWLEDGE_GAP: "low", POLICY_GAP: "low", OBSERVABILITY_GAP: "low",
  ANALYSIS_GAP: "medium", DATA_CAPABILITY_GAP: "medium",
  INPUT_CAPABILITY_GAP: "medium", CONNECTOR_GAP: "medium", UI_GAP: "medium",
  ACTION_GAP: "high",
};

// Reutilizabilitate 0-100 pe tip de gap (conectori/parsere se refolosesc mult).
const REUSABILITY_BY_GAP = {
  CONNECTOR_GAP: 70, ANALYSIS_GAP: 70, DATA_CAPABILITY_GAP: 70, INPUT_CAPABILITY_GAP: 70,
  OBSERVABILITY_GAP: 60, UI_GAP: 50, ACTION_GAP: 50,
  KNOWLEDGE_GAP: 30, POLICY_GAP: 30,
};

// ── HELPERI INTERNI ─────────────────────────────────────────────────────

/** Tokeni normalizati (fold diacritice ro, min 4 caractere). Helper LOCAL —
 *  identic ca logica cu cel din nervous/contract.js, dar rescris aici pentru
 *  ca evolution/ nu are voie sa importe din afara directorului. PUR. */
function tokens(s) {
  return new Set(
    String(s || "").toLowerCase()
      .replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t")
      .split(/[^a-z0-9]+/).filter((x) => x.length > 3)
  );
}

/** Similaritate Jaccard 0..1 pe tokeni redusi la pseudo-stem de 5 caractere
 *  (flexiunile romanesti se potrivesc). Helper LOCAL. PUR. */
function textSimilarity(a, b) {
  const stem = (set) => new Set([...set].map((t) => t.slice(0, 5)));
  const A = stem(tokens(a)), B = stem(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Rotunjire la 2 zecimale. PUR. */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Numar limitat la 0-100 sau null daca nu e numeric (UNKNOWN explicit). PUR. */
function clampScore(n) {
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
}

/** Media valorilor numerice disponibile (0-100) sau null daca niciuna. PUR. */
function avgScore(...vals) {
  const nums = vals.filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  return clampScore(nums.reduce((a, b) => a + b, 0) / nums.length);
}

/** Array garantat (copie superficiala) sau []. PUR. */
function asArray(x) {
  return Array.isArray(x) ? [...x] : [];
}

/** Urca un nivel de complexitate (low→medium→high). PUR. */
function bumpLevel(level) {
  return level === "low" ? "medium" : "high";
}

// ── CONSTRUIREA CERERII CANONICE (§3) ───────────────────────────────────

/** Testele de acceptanta se GENEREAZA determinist din outputs + reguli de
 *  validare — fiecare output si fiecare regula devine un test verificabil. */
function acceptanceTestsFrom(outputs, validationRules) {
  const tests = [];
  for (const o of outputs) {
    tests.push({ id: `at:out:${slug(String(o), 24)}`, kind: "OUTPUT", description: `capabilitatea produce output-ul: ${o}` });
  }
  for (const r of validationRules) {
    tests.push({ id: `at:rule:${slug(String(r), 24)}`, kind: "VALIDATION", description: `capabilitatea respecta regula de validare: ${r}` });
  }
  return tests;
}

/**
 * Construieste obiectul canonic COMPLET al unui Capability Request (§3).
 * Toate campurile din CR_REQUIRED_FIELDS sunt prezente; approval_required
 * este INTOTDEAUNA true (§22); status initial DETECTED; gap_confirmed e true
 * DOAR daca analiza de reuse s-a incheiat pe CAPABILITY_GAP (§1).
 * Scorurile de valoare (0-100) deriva din need.value si din tipul de gap;
 * cand datele lipsesc raman null (UNKNOWN), nu se inventeaza.
 */
export function buildCapabilityRequest({ need = {}, gap = {}, reuse = {}, capability_type = "OTHER", title = "", requested_capability = "", inputs = [], outputs = [], users = [], dependencies = [], asOf = null } = {}) {
  const id = crId(title);
  const gapType = gap?.gap_type || null;
  const value = need?.value && typeof need.value === "object" ? need.value : {};

  const deps = asArray(dependencies);
  const outs = asArray(outputs);
  const validationRules = asArray(need?.validation_rules);

  // Optiunile de reuse = treptele care au adus ceva (SOLVES/PARTIAL) — §1.
  const reuseOptions = (Array.isArray(reuse?.ladder) ? reuse.ladder : [])
    .filter((e) => e && (e.verdict === "SOLVES" || e.verdict === "PARTIAL"))
    .map((e) => ({ rung: e.rung, verdict: e.verdict, evidence: e.evidence ?? null }));

  // Workaround curent: declarat de nevoie sau derivat din prima dovada PARTIAL.
  const firstPartial = (Array.isArray(reuse?.ladder) ? reuse.ladder : []).find((e) => e?.verdict === "PARTIAL");
  const currentWorkaround = need?.current_workaround
    || (firstPartial?.evidence ? `acoperire partiala existenta: ${firstPartial.evidence}` : null);

  // Complexitate: baza pe tip de gap; 3+ dependinte urca un nivel.
  let complexity = COMPLEXITY_BY_GAP[gapType] || "medium";
  if (deps.length >= 3) complexity = bumpLevel(complexity);

  // Plan de rollback determinist: build-ul traieste doar in branch-ul lui.
  const branch = branchNameFor({ capability_request_id: id });
  const rollbackPlan = `Branch-ul '${branch}' se inchide fara merge si feature flag-ul ramane oprit; `
    + "nicio scriere in productie nu are loc inainte de aprobare, deci starea anterioara ramane neatinsa; "
    + "datele de test raman izolate in zona de sandbox si se pot sterge fara efect.";

  return {
    // ── Identitate si origine (§3, §26 — origin_need_id obligatoriu) ──
    capability_request_id: id,
    created_at: asOf,
    origin_need_id: need?.need_id ?? null,
    type: CAPABILITY_TYPES.includes(capability_type) ? capability_type : "OTHER",
    gap_type: gapType,
    title,

    // ── Problema si justificarea ──
    problem: need?.summary || need?.title || gap?.why || "UNKNOWN",
    why_it_matters: need?.material_consequence || need?.expected_change || gap?.why || "UNKNOWN",

    // ── Dovada analizei de reuse (§1) — vine din reuse, nu se inventeaza ──
    sources_checked: asArray(reuse?.sources_checked),
    existing_capabilities_checked: asArray(reuse?.existing_capabilities_checked),
    reuse_options: reuseOptions,
    gap_confirmed: reuse?.resolution === "CAPABILITY_GAP",

    // ── Ce se cere ──
    requested_capability,
    users: asArray(users),
    inputs: asArray(inputs),
    outputs: outs,
    dependencies: deps,
    downstream_consumers: asArray(need?.downstream_consumers),
    current_workaround: currentWorkaround,

    // ── Estimari si scoruri (0-100; null = UNKNOWN, nu inventam) ──
    estimated_complexity: complexity,
    risk_level: RISK_BY_GAP[gapType] || "medium",
    business_value: avgScore(value.financial_impact, value.cost_of_inaction),
    data_value: clampScore(value.information_value),
    time_saved: avgScore(value.operational_impact, value.urgency),
    risk_reduction: clampScore(value.risk),
    reusability: REUSABILITY_BY_GAP[gapType] ?? null,

    // ── Reguli, granite, securitate ──
    validation_rules: validationRules,
    write_boundaries: asArray(need?.write_boundaries), // gol = nespecificat inca (se detaliaza la SPECIFICATION)
    security_constraints: [...new Set([...BASE_SECURITY_CONSTRAINTS, ...asArray(need?.security_constraints)])],
    acceptance_tests: acceptanceTestsFrom(outs, validationRules),
    rollback_plan: rollbackPlan,

    // ── Politica de deploy (§22 — inghetata, fara exceptii) ──
    deployment_policy: DEPLOYMENT_POLICY,
    approval_required: true,

    // ── Stare lifecycle (§3) ──
    status: "DETECTED",
    history: [],
  };
}

// ── VALIDAREA CERERII (§3) ──────────────────────────────────────────────

/**
 * Valideaza forma canonica: toate CR_REQUIRED_FIELDS prezente,
 * approval_required===true (§22), status din lifecycle/terminale,
 * gap_confirmed boolean, campurile-lista chiar array-uri.
 * Returneaza { valid, errors: [] }.
 */
export function validateCapabilityRequest(cr = {}) {
  const errors = [];
  const obj = cr && typeof cr === "object" ? cr : {};

  for (const f of CR_REQUIRED_FIELDS) {
    if (obj[f] === undefined) errors.push(`camp obligatoriu lipsa: ${f}`);
  }
  if (obj.approval_required !== true) {
    errors.push("approval_required trebuie sa fie EXACT true — aprobarea nu e optionala (§22)");
  }
  if (obj.status !== undefined && !VALID_STATUSES.includes(obj.status)) {
    errors.push(`status invalid: ${String(obj.status)}`);
  }
  if (typeof obj.gap_confirmed !== "boolean") {
    errors.push("gap_confirmed trebuie sa fie boolean");
  }
  for (const f of ARRAY_FIELDS) {
    if (obj[f] !== undefined && !Array.isArray(obj[f])) errors.push(`campul '${f}' trebuie sa fie array`);
  }

  return { valid: errors.length === 0, errors };
}

// ── TRANZITIA DE LIFECYCLE (§3) ─────────────────────────────────────────

/**
 * Tranziteaza cererea in noua stare DOAR daca CR_TRANSITIONS o permite
 * (via canTransition din contract). Imutabil: obiectul primit nu se atinge;
 * pe succes se intoarce o copie cu status nou si history extins cu
 * { from, to, at }. Tranzitie invalida → { ok:false, cr original, error }.
 */
export function transitionRequest(cr = {}, to = "") {
  const from = cr?.status;
  if (!canTransition(from, to)) {
    return { ok: false, cr, error: `tranzitie invalida: ${String(from ?? "?")} -> ${String(to || "?")}` };
  }
  const entry = { from, to, at: new Date().toISOString() };
  const next = {
    ...cr,
    status: to,
    history: [...(Array.isArray(cr?.history) ? cr.history : []), entry],
  };
  return { ok: true, cr: next };
}

// ── DEDUPLICAREA CERERILOR (§29) ────────────────────────────────────────

/** Construieste raspunsul de duplicat. PUR. */
function dup(reason, matched) {
  return { duplicate: true, reason, matched };
}

/**
 * Verifica IN ORDINE daca cererea e un duplicat (§29):
 *  1) acelasi capability_request_id exista deja;
 *  2) acelasi id a fost respins anterior;
 *  3) titlu similar (Jaccard pe tokeni cu stem de 5 caractere) cu o cerere existenta;
 *  4) titlu similar cu o cerere respinsa anterior (nu re-propunem acelasi lucru).
 * existing = dict {capability_request_id: CR}; rejected = lista de CR-uri
 * (sau titluri string) respinse. Returneaza { duplicate, reason, matched }.
 */
export function dedupCapability(cr = {}, { existing = {}, rejected = [], similarityThreshold = 0.6 } = {}) {
  const id = cr?.capability_request_id ?? null;
  const title = cr?.title || "";
  const existingDict = existing && typeof existing === "object" ? existing : {};
  const rejectedList = Array.isArray(rejected) ? rejected : [];

  // 1) Acelasi id deja inregistrat.
  if (id && Object.prototype.hasOwnProperty.call(existingDict, id)) {
    return dup("acelasi capability_request_id exista deja", {
      kind: "existing", id, title: existingDict[id]?.title ?? null,
    });
  }

  // 2) Acelasi id respins anterior.
  for (const r of rejectedList) {
    const rid = typeof r === "string" ? null : r?.capability_request_id ?? null;
    if (rid && id && rid === id) {
      return dup("cerere respinsa anterior (acelasi id)", {
        kind: "rejected", id: rid, title: (typeof r === "object" ? r?.title : null) ?? null,
      });
    }
  }

  // 3) Titlu similar cu o cerere existenta — cea mai similara peste prag.
  let best = null;
  for (const [eid, e] of Object.entries(existingDict)) {
    const sim = textSimilarity(title, e?.title || "");
    if (sim >= similarityThreshold && (!best || sim > best.sim)) best = { id: eid, title: e?.title ?? null, sim };
  }
  if (best) {
    return dup("titlu similar cu o cerere existenta", {
      kind: "existing", id: best.id, title: best.title, similarity: round2(best.sim),
    });
  }

  // 4) Titlu similar cu o cerere respinsa anterior.
  best = null;
  for (const r of rejectedList) {
    const rt = typeof r === "string" ? r : r?.title || "";
    const rid = typeof r === "string" ? null : r?.capability_request_id ?? null;
    const sim = textSimilarity(title, rt);
    if (sim >= similarityThreshold && (!best || sim > best.sim)) best = { id: rid, title: rt || null, sim };
  }
  if (best) {
    return dup("respins anterior cu titlu similar", {
      kind: "rejected", id: best.id, title: best.title, similarity: round2(best.sim),
    });
  }

  return { duplicate: false, reason: null, matched: null };
}
