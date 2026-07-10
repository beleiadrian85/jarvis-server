/**
 * Token Budget (PUR). Estimare tokeni (~4 caractere/token) + incadrare in buget.
 * Zero importuri/IO/fetch/egress. Determinist.
 */
const n = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : null);

export function estimateTokens(text) {
  return Math.max(0, Math.ceil(String(text ?? "").length / 4));
}

export function fitsBudget(text, maxTokens) {
  const est = estimateTokens(text);
  const budget = n(maxTokens);
  return { estimated: est, budget, withinBudget: budget == null ? true : est <= budget };
}

export function enforceBudget(text, maxTokens) {
  const t = String(text ?? "");
  const budget = n(maxTokens);
  const est = estimateTokens(t);
  if (budget == null || est <= budget) return { text: t, estimated: est, budget, action: "ok", truncated: false };
  const maxChars = Math.max(0, budget * 4 - 1);
  const cut = t.slice(0, maxChars).trimEnd() + "…";
  return { text: cut, estimated: estimateTokens(cut), budget, action: "truncate", truncated: true };
}
