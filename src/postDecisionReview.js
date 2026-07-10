/**
 * Post-Decision Review (PUR). Verifica coerenta raspunsului compus fata de brief
 * DUPA compunere: riscurile 🔴 apar in raspuns? contradictiile sunt semnalate?
 * Nu modifica nimic; doar raporteaza {consistent, issues, notes}. Zero egress.
 */
const obj = (v) => (v != null && typeof v === "object" && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v == null ? "" : String(v));

export function reviewDecision(arg) {
  const a = obj(arg);
  const b = obj(a.brief), r = obj(a.response), t = obj(a.trace);
  const issues = [];
  const notes = [];

  const redRisks = arr(b.criticalRisks).filter((x) => obj(x).level === "🔴").map((x) => str(obj(x).descriere)).filter(Boolean);
  const respText = JSON.stringify(arr(r.sections));
  for (const rr of redRisks) if (!respText.includes(rr)) issues.push(`risc 🔴 absent din raspuns: ${rr}`);

  if (arr(b.contradictions).length && !arr(r.warnings).length)
    issues.push("brief are contradictii, dar raspunsul nu le semnaleaza");

  if (r.needsApproval === true && t.active === true)
    notes.push("actiune ceruta pe cale de strategie — execuția trece obligatoriu prin approvalGate");

  if (typeof r.confidence === "number" && r.confidence < 0.4)
    notes.push(`incredere scazuta (${r.confidence}) — raspunsul e informativ, nu concluziv`);

  return { consistent: issues.length === 0, issues, notes, reviewedAt: null };
}
