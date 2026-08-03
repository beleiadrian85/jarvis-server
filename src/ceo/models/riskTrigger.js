// RISK TRIGGER (§12) — reviewerul NU se foloseste la fiecare raspuns banal. Se foloseste
// pentru: contracte, legislatie, impact financiar, decizii ireversibile, risc juridic,
// concluzii cu incredere scazuta, contradictii intre surse, rezultate care vor genera
// Action Cards materiale. PUR + determinist.
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const HIGH_RISK = [
  /contract|clauz|semnatur|reziliere/, /lege|legisl|ordonant|hotarare|normativ|ocpi|anaf|fisc/,
  /plat|factur|suma|buget|imprumut|credit|dobanda|penalit|garant/, /ireversibil|definitiv|nu se poate anula/,
  /juridic|litigiu|instanta|amenda|raspundere/,
];

/**
 * Are nevoie de reviewer/arbiter?
 * @param {object} p { text, task, confidence, contradictions (nr), willGenerateActionCard, material }
 * @returns { review, reasons[] }
 */
export function needsReview(p = {}) {
  const reasons = [];
  const t = norm(p.text);
  if (["managerial", "document"].includes(p.task)) reasons.push(`task ${p.task}`);
  if (HIGH_RISK.some((rx) => rx.test(t))) reasons.push("subiect cu risc ridicat (contract/legislatie/financiar/juridic)");
  if (typeof p.confidence === "number" && p.confidence < 0.5) reasons.push("incredere scazuta");
  if ((p.contradictions || 0) > 0) reasons.push("contradictii intre surse");
  if (p.willGenerateActionCard && p.material) reasons.push("va genera Action Card material");
  if (p.forceReview) reasons.push("cerut explicit");
  return { review: reasons.length > 0, reasons };
}
