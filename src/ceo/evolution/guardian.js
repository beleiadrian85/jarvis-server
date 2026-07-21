// GUARDIAN (§14, §22, §26) — gardianul PUR al buildurilor self-generated.
//
// REGULA §26 — SELF-EVOLUTION IS NOT SELF-PRESERVATION (completa, in cod):
// CEO AI nu are ca obiectiv sa se pastreze, sa isi mareasca puterea, sa isi
// extinda permisiunile, sa evite shutdown-ul sau controlul uman. Obiectivul
// este IMPROVE COMPANY CAPABILITY, nu IMPROVE AI POWER. Orice capability
// request trebuie sa provina dintr-o NEVOIE reala a companiei — un build
// fara capability_request_id (adica fara nevoie de companie) se BLOCHEAZA.
//
// §22 — politica de deploy e o CONSTANTA INGHETATA, nu un flag: codul
// self-generated ajunge in productie doar cu aprobarea explicita a
// fondatorului. Orice build request cu alta politica = BLOCK.
// ZERO IO; verdictul e strict din GUARDIAN_VERDICTS, fail-closed.

import { FORBIDDEN_PATHS, CODE_AGENT_CANNOT, GUARDIAN_VERDICTS } from "./contract.js";

// ── Normalizare cai ─────────────────────────────────────────────────────

function normalizePath(p) {
  return String(p || "")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

/** Prefix match normalizat pe "/" fata de FORBIDDEN_PATHS. PUR. */
export function isForbiddenPath(path = "") {
  const p = normalizePath(path);
  if (!p) return false;
  return FORBIDDEN_PATHS.some((fp) => {
    const f = normalizePath(fp);
    return p === f || p.startsWith(f + "/");
  });
}

// ── Helperi pe intrarile de diff (string sau {path, markers}) ───────────

function diffPath(entry) {
  if (typeof entry === "string") return entry;
  return entry?.path ?? entry?.file ?? "";
}

/** Metadata declara explicit ca fisierul e specific companiei? Nu ghicim
 *  din continut (modul pur, fara IO) — doar daca metadata o spune. */
function isCompanySpecific(entry) {
  if (!entry || typeof entry === "string") return false;
  if (entry.company_specific === true) return true;
  const markers = Array.isArray(entry.markers) ? entry.markers : entry.marker ? [entry.marker] : [];
  return markers.some((m) => String(m).toLowerCase().includes("company-specific"));
}

// ── §14 — Review-ul Guardian ────────────────────────────────────────────
// buildReport e acceptat pentru compatibilitate de contract (verificari
// viitoare pe diff_summary/limite); verdictul curent se da pe request + diff.

export function guardianReview({ buildRequest = {}, buildReport = null, diffFiles = [] } = {}) {
  const violations = [];
  const conditions = [];
  const files = Array.isArray(diffFiles) ? diffFiles : [];
  void buildReport; // rezervat verificarilor viitoare (§28 — limite de build)

  // 1) Diff-ul atinge o cale interzisa → BLOCK.
  for (const entry of files) {
    const p = diffPath(entry);
    if (p && isForbiddenPath(p)) {
      violations.push({ rule: "FORBIDDEN_PATH", detail: `diff atinge calea interzisa: ${normalizePath(p)}`, severity: "BLOCK" });
    }
  }

  // 2) Push direct pe main → BLOCK (§11).
  if (buildRequest?.branch_policy?.direct_push_main === true) {
    violations.push({ rule: "PUSH_MAIN", detail: "branch_policy cere push direct pe main — interzis (§11)", severity: "BLOCK" });
  }

  // 3) §22 — politica de deploy e inghetata; orice alta valoare → BLOCK.
  if (buildRequest?.deployment_policy !== "PRODUCTION_DEPLOYMENT_REQUIRES_ADRIAN_APPROVAL") {
    violations.push({ rule: "DEPLOYMENT_POLICY_FROZEN", detail: "deployment_policy difera de constanta inghetata din §22 — aprobarea fondatorului nu e negociabila", severity: "BLOCK" });
  }

  // 4) §26 — anti-self-preservation: build fara capability_request_id
  //    inseamna build fara nevoie reala de companie → BLOCK.
  if (!buildRequest?.capability_request_id) {
    violations.push({ rule: "ANTI_SELF_PRESERVATION", detail: "build fara capability_request_id — orice build TREBUIE sa provina dintr-o nevoie reala a companiei, nu din nevoia sistemului de a se extinde (§26)", severity: "BLOCK" });
  }

  // 5) security_rules trebuie sa contina TOATE interdictiile CODE_AGENT_CANNOT;
  //    o lista slabita = tentativa de extindere a propriilor permisiuni.
  const rules = Array.isArray(buildRequest?.security_rules) ? buildRequest.security_rules : [];
  const missing = CODE_AGENT_CANNOT.filter((r) => !rules.includes(r));
  if (missing.length > 0) {
    violations.push({ rule: "EXPAND_OWN_PERMISSIONS", detail: `security_rules incomplete — lipsesc: ${missing.join(", ")} (§11, §26)`, severity: "BLOCK" });
  }

  // 6) Marker "company-specific" in nucleul generic src/ceo/* (doar daca
  //    metadata diff-ului o spune) → conditie, nu blocaj (§32).
  for (const entry of files) {
    const p = normalizePath(diffPath(entry));
    if (p.startsWith("src/ceo/") && isCompanySpecific(entry)) {
      conditions.push(`fisierul ${p} e marcat company-specific in nucleul generic src/ceo/* — muta specificul in config inainte de aprobare (§32)`);
    }
  }

  // Verdict fail-closed: orice BLOCK → BLOCK; conditii → PASS_WITH_CONDITIONS.
  const computed = violations.some((v) => v.severity === "BLOCK")
    ? "BLOCK"
    : conditions.length > 0
      ? "PASS_WITH_CONDITIONS"
      : "PASS";
  const verdict = GUARDIAN_VERDICTS.includes(computed) ? computed : "BLOCK";
  return { verdict, violations, conditions };
}
