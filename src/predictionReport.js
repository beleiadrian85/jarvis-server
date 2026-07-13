// ─────────────────────────────────────────────────────────────────────────
//  P2 — PREDICTION REPORT (formatter determinist)
//  formatPredictionReport(result, options) → string.
//  ZERO LLM. Maxim 3 predictii in sumar, ordonate dupa score. Sectiuni
//  CONFIRMAT / IPOTEZE / DATE LIPSA. probability si confidence afisate SEPARAT.
//  [VOCE] maxim 300 caractere.
// ─────────────────────────────────────────────────────────────────────────

const sevIcon = (s) => (s === "critical" ? "🔴" : s === "high" ? "🟠" : s === "medium" ? "🟡" : "🟢");
const pct = (x) => Math.round((x || 0) * 100);
// o predictie e "ipoteza" daca `why` semnaleaza date lipsa/estimare
const isHypothesis = (p) => /necunoscut|estimare|f[aă]r[aă] istoric|neconfirmat/i.test(p.why || "");

export function formatPredictionReport(result, options = {}) {
  const { predictions = [], confidence = 0, assumptions = [] } = result || {};
  const maxN = options.max || 3;

  if (!predictions.length) {
    return `🔮 PREDICȚII — nimic notabil sau date insuficiente (confidence ${pct(confidence)}%).\n\n[VOCE] Nu am predicții relevante momentan.`;
  }

  const top = [...predictions].sort((a, b) => b.score - a.score).slice(0, maxN);
  const confirmate = top.filter((p) => !isHypothesis(p));
  const ipoteze = top.filter(isHypothesis);
  const dateLipsa = assumptions
    .filter((a) => /^Date lips[aă]/i.test(a))
    .map((a) => a.replace(/^Date lips[aă]:\s*/i, "").replace(/\.$/, ""));

  const fmtP = (p) =>
    `  [${p.score}] ${sevIcon(p.severity)} ${p.title} — probabilitate ${pct(p.probability)}%` +
    (p.daysUntilProblem != null ? `, în ${p.daysUntilProblem}z` : "") +
    `\n     → ${p.recommendation}` +
    `\n     de ce: ${p.why}`;

  const L = [];
  L.push(`🔮 PREDICȚII — confidence ${pct(confidence)}% · top ${top.length} din ${predictions.length}`);

  if (confirmate.length) { L.push("", "CONFIRMAT (pe date reale):"); confirmate.forEach((p) => L.push(fmtP(p))); }
  if (ipoteze.length) { L.push("", "IPOTEZE (date parțiale):"); ipoteze.forEach((p) => L.push(fmtP(p))); }
  L.push("", "DATE LIPSĂ:");
  L.push(dateLipsa.length ? "  - " + dateLipsa.join("\n  - ") : "  - (niciuna)");

  // [VOCE] — maxim 300 caractere
  const t = top[0];
  let voce =
    `${top.length} predicții. Cea mai importantă: ${t.title}, probabilitate ${pct(t.probability)}%` +
    (t.daysUntilProblem != null ? `, în ${t.daysUntilProblem} zile` : "") +
    `. Încredere ${pct(confidence)}%.`;
  if (voce.length > 300) voce = voce.slice(0, 297) + "…";
  L.push("", "[VOCE] " + voce);

  return L.join("\n");
}
