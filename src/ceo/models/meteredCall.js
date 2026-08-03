// METERED CALL (§21) — apel catre un provider care trece OBLIGATORIU prin Cost Guard
// (fail-closed la plafon) + audit + inregistrare cheltuiala. Folosit de reviewer/arbiter
// (si disponibil oriunde e nevoie), ca NICIUN apel platit sa nu ocoleasca bugetul.
import { estimateCost } from "./registry.js";
import { callProvider } from "./providers.js";
import { wouldExceed, recordSpend } from "./costGuard.js";
import { auditModelCall } from "./audit.js";

/**
 * @returns { ok, text, usage, cost } sau { ok:false, blocked, reason }
 */
export async function meteredCall(providerId, { system, messages, maxTokens = 400, purpose = "reviewer", store, nowISO } = {}) {
  const inTokens = Math.ceil((String(system || "").length + JSON.stringify(messages || []).length) / 4);
  const est = estimateCost(providerId, { inTokens, outTokens: maxTokens });
  const guard = await wouldExceed(est, { store, nowISO });
  if (guard.blocked) {
    await auditModelCall({ provider: providerId, purpose, result_status: "blocked_cost", blocked_reason: guard.reason }, { store }).catch(() => {});
    return { ok: false, blocked: true, reason: `Cost Guard: ${guard.reason}` };
  }
  let call;
  try { call = await callProvider(providerId, { system, messages, maxTokens }); }
  catch (e) { await auditModelCall({ provider: providerId, purpose, result_status: "error", blocked_reason: e.message }, { store }).catch(() => {}); return { ok: false, reason: e.message }; }
  const cost = estimateCost(providerId, call.usage || {});
  await recordSpend(cost, { store, nowISO }).catch(() => {});
  await auditModelCall({ provider: providerId, purpose, result_status: "ok", usage: call.usage, cost }, { store }).catch(() => {});
  return { ok: true, text: call.text, usage: call.usage, cost };
}
