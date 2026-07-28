// JARVIS INTELLIGENCE FEED — cronologie controlata a evenimentelor importante:
// email, Operational, documente, legislatie, monitorizare, executii JARVIS,
// Action Cards, notificari, health. NU brut — Management by Exception + relevanta.
// Read-only: agrega din stratele existente (notificari + taskintel + audit). PUR-ish.
import { getState } from "../state.js";

const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * Construieste feed-ul din notificari (sursa principala) + evenimente taskintel.
 * Filtreaza: doar materiale/decizii/executii — nu articole brute. Cronologic.
 * @returns { items:[{at, kind, title, summary, severity, requires_action, refs}] }
 */
export async function buildFeed({ store = null, limit = 30 } = {}) {
  const S = store || { get: getState };
  const items = [];

  // 1. Notificari (deja trecute prin politica imediat/digest).
  const notif = (await S.get("ceo:notifications", { items: {} }).catch(() => null)) || { items: {} };
  for (const n of Object.values(notif.items)) {
    if (["DISMISSED", "EXPIRED", "SUPERSEDED"].includes(n.status)) continue;
    if (n.severity === "INFORMATIONAL" && !n.requires_action && !arr(n.receipt_ids).length) continue; // exception, nu brut
    items.push({ at: n.created_at, kind: n.category || "notification", title: n.title, summary: n.summary,
      severity: n.severity, requires_action: !!n.requires_action, requires_founder: !!n.requires_founder,
      refs: { notification_id: n.id, action_card_ids: arr(n.action_card_ids), source: n.source_reference } });
  }

  // 2. Executii JARVIS recente (din experienta taskintel — pattern-uri noi).
  const exp = (await S.get("ceo:taskintel:experience", { experiences: [] }).catch(() => null)) || { experiences: [] };
  const patterns = arr(exp.experiences).filter((e) => e.is_pattern).slice(0, 3);
  if (patterns.length && exp.at) items.push({ at: exp.at, kind: "learning", title: "JARVIS a actualizat experiența",
    summary: patterns.map((p) => `${p.problem_type}: ${p.typical_owner}`).join(", "), severity: "INFORMATIONAL", requires_action: false, refs: {} });

  // Cronologic (cel mai nou primul), management by exception (max limit).
  return { items: items.sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, limit), generated_at: new Date().toISOString() };
}
