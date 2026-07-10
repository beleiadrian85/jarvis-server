/**
 * C9 — Executive Brief Builder (INERT, COMPLET PUR).
 *
 * buildExecutiveBrief(state) — transforma state-ul DEJA COLECTAT intr-un Executive
 * Brief standardizat. Nu colecteaza, nu calculeaza nimic dependent de timp, nu
 * inventeaza. Ce lipseste → marcat explicit.
 *
 * GARANTII: fara importuri, config, DB, IO, fetch, node:*, efecte secundare.
 * Pur si determinist (generatedAt = null → aceeasi intrare, aceeasi iesire).
 * Zero posibilitate de egress.
 */

const IMPACT = { cash: 0, sales: 1, executie: 2, juridic: 3, altele: 4 };
const LEVEL_RANK = { "🔴": 0, "🟠": 1, "🟡": 2 };
const MONTHS = "ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie";
const SOURCES = ["financial", "operational", "sales", "projects", "risks", "memory"];

export function buildExecutiveBrief(state) {
  const norm = normalizeState(state);

  const topPriorities = extractPriorities(norm);
  const criticalRisks = extractRisks(norm);
  const contradictions = extractContradictions(norm);
  const missingInformation = extractMissingInformation(norm);
  const confidence = calculateConfidence(norm);
  const summary = buildSummary(norm, criticalRisks, missingInformation);

  return {
    summary,
    topPriorities,
    criticalRisks,
    financialSnapshot: norm.financialSnapshot,
    operationalSnapshot: norm.operationalSnapshot,
    salesSnapshot: norm.salesSnapshot,
    projectSnapshot: norm.projectSnapshot,
    contradictions,
    missingInformation,
    recommendedDecision: null, // C9 nu decide inca — mereu null
    confidence,
    metadata: {
      generatedAt: null,       // deterministic (fara timestamp)
      version: 1,
      sourcesUsed: norm.sourcesUsed,
      missingSources: norm.missingSources,
    },
  };
}

// ── helpers pure ──
const num = (v) =>
  typeof v === "number" && isFinite(v) ? v
  : typeof v === "string" && v.trim() !== "" && isFinite(Number(v)) ? Number(v)
  : null;
const str = (v) => (v == null ? "" : String(v));
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const count = (v) => (Array.isArray(v) ? v.length : num(v) != null ? num(v) : isObj(v) ? Object.keys(v).length : 0);

/** Copiaza doar sub-campurile PREZENTE (nu completeaza inexistente). */
function pick(obj, fields) {
  const out = {};
  if (!isObj(obj)) return out;
  for (const f of fields) {
    const v = obj[f];
    if (v != null && v !== "") out[f] = v;
  }
  return out;
}

// ── 1) normalizeState: intrare bruta → reprezentare interna sigura ──
function normalizeState(state) {
  const s = isObj(state) ? state : {};

  const financialSnapshot = pick(s.financial, ["cash", "obligations", "alerts"]);
  const operationalSnapshot = pick(s.operational, ["overdueTasks", "todayTasks", "blockedTasks"]);
  const salesSnapshot = pick(s.sales, ["pipeline", "reservations", "contracts", "leads"]);
  const projectSnapshot = normalizeProjects(s.projects);

  const has = {
    financial: !!Object.keys(financialSnapshot).length,
    operational: !!Object.keys(operationalSnapshot).length,
    sales: !!Object.keys(salesSnapshot).length,
    projects: !!Object.keys(projectSnapshot).length,
    risks: !!arr(s.risks).length,
    memory: !!arr(s.memory).length,
  };
  const sourcesUsed = SOURCES.filter((k) => has[k]);
  const missingSources = SOURCES.filter((k) => !has[k]);

  return {
    financialSnapshot, operationalSnapshot, salesSnapshot, projectSnapshot,
    rawRisks: arr(s.risks),
    memory: arr(s.memory),
    rawContradictions: arr(s.contradictions),
    financialRaw: isObj(s.financial) ? s.financial : {},
    sourcesUsed, missingSources,
  };
}

function normalizeProjects(p) {
  if (isObj(p)) return pick(p, ["active", "blocked", "critical"]);
  const list = arr(p);
  if (!list.length) return {};
  const st = (x) => str(x && x.status).toLowerCase();
  return {
    active: list.filter((x) => !["blocat", "acceptat", "oprit", "inchis"].includes(st(x))),
    blocked: list.filter((x) => st(x) === "blocat"),
    critical: list.filter((x) => str(x && x.priority).toLowerCase() === "critic" || x && x.critical === true),
  };
}

// ── 2) extractPriorities: derivate din snapshot-uri, sortate pe impact ──
function extractPriorities(norm) {
  const { financialSnapshot: f, operationalSnapshot: o, salesSnapshot: sa } = norm;
  const P = [];
  const alerts = count(f.alerts);
  if (alerts > 0) P.push({ impact: "cash", text: `Tratează ${alerts} alerte financiare.` });
  const rez = count(sa.reservations), contr = count(sa.contracts);
  if (rez > 0 && contr === 0) P.push({ impact: "sales", text: `Convertește ${rez} rezervări în contracte.` });
  const blocked = count(o.blockedTasks);
  if (blocked > 0) P.push({ impact: "executie", text: `Deblochează ${blocked} task-uri oprite.` });
  const overdue = count(o.overdueTasks);
  if (overdue > 0) P.push({ impact: "executie", text: `Recuperează ${overdue} task-uri întârziate.` });
  return dedup(P).sort((a, b) => (IMPACT[a.impact] ?? 9) - (IMPACT[b.impact] ?? 9)).slice(0, 5);
}

// ── 3) extractRisks: normalizat, dedup, sortat pe severitate ──
function extractRisks(norm) {
  const list = norm.rawRisks.map((x) => {
    if (typeof x === "string") return { level: "🟠", descriere: x, recomandare: "", impact: impactOf(x) };
    const d = str(x && (x.descriere || x.desc));
    return {
      level: LEVEL_RANK[x && x.level] != null ? x.level : "🟠",
      descriere: d,
      recomandare: str(x && x.recomandare),
      impact: impactOf(d),
    };
  }).filter((x) => x.descriere);
  return dedup(list).sort(byLevel);
}

function impactOf(text) {
  const n = str(text).toLowerCase();
  if (/lichidit|cash|deficit|plat|rest[ao]nt|banc/.test(n)) return "cash";
  if (/vanz|rezerv|avans|client|vandut|contract/.test(n)) return "sales";
  if (/task|termen|intarzi|blocat|santier|executie/.test(n)) return "executie";
  if (/juridic|notar|instant|avocat/.test(n)) return "juridic";
  return "altele";
}

function byLevel(a, b) {
  const la = LEVEL_RANK[a.level] ?? 9, lb = LEVEL_RANK[b.level] ?? 9;
  if (la !== lb) return la - lb;
  return (IMPACT[a.impact] ?? 9) - (IMPACT[b.impact] ?? 9);
}

// ── 4) extractContradictions: explicite + luni de lansare divergente ──
function extractContradictions(norm) {
  const out = norm.rawContradictions.map(str).filter(Boolean);
  const facts = norm.memory.map((m) => (typeof m === "string" ? m : str(m && m.fact))).filter(Boolean);
  const months = new Set();
  for (const fct of facts) {
    if (/lans(are|eaza|eza|am)/i.test(fct)) {
      const m = fct.match(new RegExp(`\\b(${MONTHS})\\b`, "i"));
      if (m) months.add(m[1].toLowerCase());
    }
  }
  if (months.size >= 2) out.push(`Lansare cu date contradictorii în memorie: ${[...months].sort().join(" vs ")}.`);
  return dedup(out);
}

// ── 5) extractMissingInformation: marcheaza explicit ce lipseste ──
function extractMissingInformation(norm) {
  const miss = [];
  if (norm.missingSources.includes("financial")) miss.push("date financiare (cash-flow)");
  else if (!("cash" in norm.financialRaw) && Object.keys(norm.financialSnapshot).length && !("openingBalance" in norm.financialRaw))
    miss.push("soldul bancar curent");
  if (norm.missingSources.includes("operational")) miss.push("date operaționale (task-uri)");
  if (norm.missingSources.includes("sales")) miss.push("date vânzări");
  if (norm.missingSources.includes("projects")) miss.push("date proiecte");
  return dedup(miss);
}

// ── 6) calculateConfidence: DOAR din completitudinea contextului ──
function calculateConfidence(norm) {
  const snaps = [norm.financialSnapshot, norm.operationalSnapshot, norm.salesSnapshot, norm.projectSnapshot];
  const present = snaps.filter((x) => Object.keys(x).length).length;
  return Math.round((present / snaps.length) * 100) / 100; // 0..1
}

// ── 7) buildSummary: text determinist din ce exista ──
function buildSummary(norm, risks, missing) {
  const { financialSnapshot: f, operationalSnapshot: o, salesSnapshot: sa } = norm;
  const bits = [];
  if (count(f.alerts) || "cash" in f) bits.push(`financiar: ${count(f.alerts)} alerte`);
  if ("reservations" in sa || "contracts" in sa) bits.push(`vânzări: ${count(sa.reservations)} rezervări / ${count(sa.contracts)} contracte`);
  if ("overdueTasks" in o || "blockedTasks" in o) bits.push(`task-uri: ${count(o.overdueTasks)} întârziate, ${count(o.blockedTasks)} blocate`);
  if (risks.length) bits.push(`${risks.length} riscuri prioritizate`);
  if (!bits.length) return "Date insuficiente pentru un rezumat." + (missing.length ? ` Lipsesc: ${missing.join(", ")}.` : "");
  return bits.join(" · ") + ".";
}

// ── dedup stabil ──
function dedup(list) {
  const seen = new Set(); const out = [];
  for (const it of arr(list)) {
    const key = typeof it === "string" ? it
      : it && (it.descriere || it.text) ? (it.descriere || it.text)
      : safeKey(it);
    if (!seen.has(key)) { seen.add(key); out.push(it); }
  }
  return out;
}
function safeKey(o) { try { return JSON.stringify(o); } catch { return String(o); } }
