/**
 * C10 — Response Composer (INERT, COMPLET PUR).
 *
 * composeResponse(input) — ORGANIZEAZA informatia deja produsa (executiveBrief,
 * strategyResult, operationalData, approval) intr-un raspuns standardizat pentru
 * utilizator. NU genereaza text creativ, NU interpreteaza, NU decide — doar
 * aseaza in sectiuni deterministe. JARVIS produce interfata, nu modelul.
 *
 * GARANTII: zero importuri, dependente, IO, fetch, node:*, DB, config, efecte.
 * Pur si determinist. Zero posibilitate de egress.
 */

const VOICE_MAX = 300;

// Ordinea determinista a sectiunilor.
const SECTION_ORDER = [
  { type: "critical", title: "🔴 CE ARDE", priority: 1 },
  { type: "important", title: "🟡 CE ESTE IMPORTANT", priority: 2 },
  { type: "risk", title: "⚠️ RISCURI", priority: 3 },
  { type: "action", title: "👉 ACȚIUNI", priority: 4 },
  { type: "approval", title: "⏳ DECIZII ÎN AȘTEPTARE", priority: 5 },
  { type: "question", title: "❓ ÎNTREBĂRI", priority: 6 },
];

const TITLES = {
  strategy: "Analiză strategică", council: "Consiliu", report: "Raport",
  operational_read: "Operațional", operationalFastPath: "Operațional",
  simple: "JARVIS", clarify: "JARVIS", draft: "Draft email",
};

// ── helpers pure ──
const str = (v) => (v == null ? "" : String(v));
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

export function composeResponse(input) {
  const inp = isObj(input) ? input : {};
  const route = str(inp.route);
  const eb = isObj(inp.executiveBrief) ? inp.executiveBrief : {};
  const sr = isObj(inp.strategyResult) ? inp.strategyResult : {};
  const op = isObj(inp.operationalData) ? inp.operationalData : {};
  const approval = isObj(inp.approval) ? inp.approval : {};

  const critical = extractCritical(eb);
  const important = extractImportant(eb);
  const risks = extractRisks(eb);
  const actions = extractActions(eb, sr, op);
  const needsApproval = approval.needed === true || approval.needsApproval === true;
  const approvalPreview = str(approval.preview || approval.approvalPreview) || null;
  const nextQuestions = extractQuestions(eb, sr);
  const warnings = dedup([...arr(eb.contradictions), ...arr(sr.warnings), ...arr(op.warnings)].map(str).filter(Boolean));

  const bucket = {
    critical, important, risk: risks, action: actions,
    approval: needsApproval && approvalPreview ? [approvalPreview] : [],
    question: nextQuestions,
  };

  // Sectiuni in ordine determinista, dedup, fara sectiuni goale.
  const sections = SECTION_ORDER
    .map((s) => ({ type: s.type, title: s.title, priority: s.priority, items: dedup(bucket[s.type]) }))
    .filter((s) => s.items.length > 0);

  return {
    title: TITLES[route] || "Briefing JARVIS",
    summary: str(eb.summary),
    sections,
    actions,
    warnings,
    voiceSummary: buildVoice(critical, risks, actions),
    confidence: num(eb.confidence) != null ? num(eb.confidence) : 0,
    needsApproval,
    approvalPreview,
    nextQuestions,
    metadata: { version: 1, composer: "jarvis", route },
  };
}

// 🔴 CE ARDE = prioritati de cash + riscuri 🔴.
function extractCritical(eb) {
  const cash = arr(eb.topPriorities).filter((p) => isObj(p) && p.impact === "cash").map((p) => str(p.text));
  const red = arr(eb.criticalRisks).filter((r) => isObj(r) && r.level === "🔴").map((r) => str(r.descriere));
  return [...cash, ...red].filter(Boolean);
}

// 🟡 CE ESTE IMPORTANT = prioritati non-cash.
function extractImportant(eb) {
  return arr(eb.topPriorities).filter((p) => isObj(p) && p.impact !== "cash").map((p) => str(p.text)).filter(Boolean);
}

// ⚠️ RISCURI = riscuri non-🔴 (cele 🔴 sunt deja la CE ARDE).
function extractRisks(eb) {
  return arr(eb.criticalRisks).filter((r) => isObj(r) && r.level !== "🔴").map((r) => str(r.descriere)).filter(Boolean);
}

// 👉 ACTIUNI = actiuni din strategyResult + operationalData + prioritatile ca actiuni.
function extractActions(eb, sr, op) {
  const fromStrategy = arr(sr.actions).map(str);
  const fromOp = arr(op.actions).map(str);
  const fromPriorities = arr(eb.topPriorities).map((p) => str(isObj(p) ? p.text : p));
  return [...fromStrategy, ...fromOp, ...fromPriorities].filter(Boolean);
}

// ❓ INTREBARI = intrebari din strategie + informatii lipsa.
function extractQuestions(eb, sr) {
  const fromStrategy = arr(sr.questions).map(str);
  const fromBrief = arr(eb.missingInformation).map((m) => `Lipsește: ${str(m)}`);
  return [...fromStrategy, ...fromBrief].filter(Boolean);
}

// 🎤 VOCE ≤ 300 caractere, deterministic.
function buildVoice(critical, risks, actions) {
  const parts = [];
  if (critical.length) parts.push("Arde: " + critical[0]);
  else if (risks.length) parts.push("Risc: " + risks[0]);
  if (actions.length) parts.push("De făcut: " + actions[0]);
  let v = parts.join(". ") || "Nimic urgent.";
  if (v.length > VOICE_MAX) v = v.slice(0, VOICE_MAX - 1).trimEnd() + "…";
  return v;
}

// Dedup stabil pentru string-uri.
function dedup(list) {
  const seen = new Set(); const out = [];
  for (const it of arr(list)) {
    const key = str(it);
    if (key && !seen.has(key)) { seen.add(key); out.push(it); }
  }
  return out;
}
