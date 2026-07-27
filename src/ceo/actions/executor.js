// ACTION EXECUTOR — la apasarea unui buton: (1) verifica tokenul; (2) verifica sa
// nu fi fost deja executat; (3) reciteste starea Operational; (4) reverifica
// permisiunile; (5) verifica daca datele s-au schimbat; (6) executa prin TASKS
// (CommandBus); (7) receipt; (8) actualizeaza cardul; (9) inlocuieste butoanele.
// Idempotent: apasarea repetata NU creeaza duplicate. Scrierea = DOAR operationalWrite.
import { verifyActionToken } from "./actionToken.js";
import { getCard, transitionCard } from "./actionStore.js";
import { NEVER_AUTONOMOUS } from "./actionCard.js";

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

/**
 * Executa un card in urma unei alegeri/aprobari. @param p {
 *   token, card_id, action_id, user_id, conversation_id, choice_label,
 *   revalidate (async fn → {changed, snapshot}), commandBus (opsWrite),
 *   store, nowISO }
 * @returns { ok, status, receipt?, card?, reason?, buttons_replaced_with }
 */
export async function executeAction(p = {}) {
  const { token, card_id, action_id, user_id, conversation_id, choice_label = null,
    revalidate = null, commandBus = null, store = null, nowISO = null } = isObj(p) ? p : {};

  const card = await getCard(card_id, { store });
  if (!card) return { ok: false, reason: "card inexistent" };

  // (2) Idempotenta: deja executat / terminal.
  if (["EXECUTED", "EXECUTING"].includes(card.status)) return { ok: true, idempotent: true, status: card.status, card, receipt: card.receipt || null, buttons_replaced_with: "rezultat" };
  if (["REJECTED", "EXPIRED", "CANCELLED", "SUPERSEDED"].includes(card.status)) return { ok: false, reason: `card ${card.status} — nu se mai executa`, status: card.status };

  // (1) Verifica tokenul (semnatura + expirare + legatura card/action/user/payload/versiune).
  const v = verifyActionToken(token, { card_id, action_id, user_id, conversation_id, payload: card.execution_payload, version: card.version }, { nowMs: nowISO ? Date.parse(nowISO) : undefined });
  if (!v.valid) return { ok: false, reason: `token respins: ${v.reason}` };

  // (4) Reverifica permisiunile — FORBIDDEN / never-autonomous nu se auto-executa.
  if (card.action_type === "FORBIDDEN") return { ok: false, reason: "actiune interzisa (permisiuni/Constitutie)" };
  if (NEVER_AUTONOMOUS.includes(String(card.action_kind || "")) && card.action_type !== "APPROVAL_REQUIRED" && card.action_type !== "CHOICE_REQUIRED")
    return { ok: false, reason: "actiune din lista never-autonomous — cere aprobare explicita" };

  // (3)+(5) Reciteste starea + verifica daca datele relevante s-au schimbat.
  if (typeof revalidate === "function") {
    try {
      const rv = await revalidate(card);
      if (rv && rv.changed) {
        await transitionCard(card_id, "SUPERSEDED", { supersede_reason: rv.reason || "stare schimbata" }, { store, nowISO });
        return { ok: false, reason: "starea s-a schimbat de la propunere — cardul e depasit (SUPERSEDED); regenerez propunerea", status: "SUPERSEDED" };
      }
    } catch { /* revalidare best-effort */ }
  }

  // Marcheaza EXECUTING (idempotenta: al doilea apel vede EXECUTING si nu re-scrie).
  const enter = await transitionCard(card_id, "EXECUTING", {}, { store, nowISO });
  if (!enter.ok && !enter.idempotent) return { ok: false, reason: enter.reason, status: card.status };

  // (6) Executa — DOAR prin CommandBus (TASKS-only). Payload-ul cardului = payload-ul MCP.
  let receipt = null;
  try {
    if (card.action_type === "INFORMATION_REQUIRED" || card.action_kind === "collect_info") {
      // Nu scrie nimic — inregistreaza informatia aleasa (choice_label).
      receipt = { kind: "info_recorded", value: choice_label, at: nowISO || new Date().toISOString() };
    } else {
      const bus = commandBus || (await import("../nervous/operationalWrite.js")).opsWrite;
      const payload = { ...(card.execution_payload || {}), source: `action_card:${user_id}` };
      const r = await bus("task", payload, { idempotency_key: `card:${card_id}`, origin: "action_card", requested_by: user_id, at: nowISO });
      if (r?.ok === false) throw new Error(r.reason || r.error || "executie esuata");
      receipt = { kind: "task", operational_id: r?.operational_id || null, note: r?.note || "", at: nowISO || new Date().toISOString(), deduped: !!r?.deduped };
    }
  } catch (e) {
    await transitionCard(card_id, "FAILED", { fail_reason: e.message }, { store, nowISO });
    return { ok: false, reason: e.message, status: "FAILED" };
  }

  // (7)+(8) Receipt + actualizare card → EXECUTED.
  const done = await transitionCard(card_id, "EXECUTED", { receipt, selected_action: choice_label || action_id }, { store, nowISO });
  return { ok: true, status: "EXECUTED", receipt, card: done.card, buttons_replaced_with: "rezultat" };
}

/** Rezultatul afisat DUPA executie (inlocuieste butoanele). PUR. */
export function renderExecuted(card) {
  const r = card?.receipt;
  if (!r) return "Executat.";
  if (r.kind === "info_recorded") return `Notat: ${r.value}.`;
  return `Executat.\n\nTask creat${card.owner ? ` pentru ${card.owner}` : ""}: „${card.execution_payload?.title || card.title}”.\nReceipt: ${r.operational_id || "inregistrat"}${r.deduped ? " (deja exista — nu s-a duplicat)" : ""}.`;
}
