// EXECUTIVE BOARD (CODEX Faza 3) — API-ul public al modulului.
// GATED: EXECUTIVE_BOARD_ENABLED implicit OFF; EXECUTIVE_BOARD_SHADOW_MODE
// implicit OFF. Cu ambele OFF, nimic din acest folder nu ruleaza.
// Boardul e CONSULTATIV: nu decide (decide Adrian), nu executa (approvalGate
// ramane singura poarta pentru efecte), nu atinge platile (Nivel 4 exclus).
import { config } from "../config.js";
import { audit } from "../audit.js";
import { runBoardMeeting } from "./boardSession.js";
import { applyFounderOverride } from "./boardSynthesis.js";
import { ROLES } from "./boardRoles.js";

export { runBoardMeeting, applyFounderOverride };
export { classifyDecision, selectDirectors } from "./boardRouter.js";

/** Starea Boardului: "active" | "shadow" | "off" (declarata si in capabilities). */
export function boardMode() {
  if (config.executiveBoard) return "active";
  if (config.executiveBoardShadow) return "shadow";
  return "off";
}

const POS_ICON = { approve: "🟢", approve_with_conditions: "🟡", reject: "🔴", insufficient_data: "⚪" };
const POS_RO = {
  approve: "pentru", approve_with_conditions: "pentru, cu conditii",
  reject: "impotriva", insufficient_data: "date insuficiente",
};

/** Raportul text al unei sedinte (pentru Telegram/HUD), cu [VOCE]. */
export function formatBoardReport(m) {
  const L = [`🏛️ EXECUTIVE BOARD — ${m.type} · ${m.asOf}`];
  L.push(`Problema: ${m.problem}`);
  if (m.data_missing.length) L.push(`Date lipsa: ${m.data_missing.join("; ")}`);
  L.push("");
  L.push("POZITIILE DIRECTORILOR:");
  for (const p of m.perspectives) {
    const title = ROLES[p.role]?.title || p.role;
    L.push(`${POS_ICON[p.position] || "•"} ${title} — ${POS_RO[p.position] || p.position} (${p.confidence}%)`);
    if (p.arguments?.[0]) L.push(`   ${p.arguments[0]}`);
  }
  if (m.missing_perspectives.length) L.push(`⚪ Perspective lipsa: ${m.missing_perspectives.join(", ")}`);
  L.push("");

  if (!m.recommendation) {
    L.push(`⛔ RECOMANDARE NEEMISA — blocata de ${m.blocked?.by || "validator"}:`);
    for (const i of (m.blocked?.issues || []).slice(0, 4)) L.push(`   - ${i}`);
    L.push("");
    L.push("[VOCE] Boardul nu a emis o recomandare: structura incompleta sau neconforma CODEX. Vezi detaliile in raport.");
    return L.join("\n");
  }

  const r = m.recommendation;
  L.push(`RECOMANDARE: ${r.recommendation} · consens ${r.consensus_level}% · incredere ${r.confidence}% · date ${r.data_quality}`);
  if (r.major_disagreements.length) {
    L.push("Dezacorduri majore (nefalsificate):");
    for (const d of r.major_disagreements) L.push(`   ${d.role} (${POS_RO[d.position] || d.position}): ${d.reason}`);
  }
  if (r.conditions.length) L.push("Conditii: " + r.conditions.slice(0, 5).join(" · "));
  if (r.risk_limits.length) L.push("Limite de risc: " + r.risk_limits.slice(0, 3).join(" · "));
  if (r.stop_conditions.length) L.push("Criterii de oprire: " + r.stop_conditions.slice(0, 3).join(" · "));
  if (r.contradicts_prior) L.push(`⚠️ Contrazice decizia anterioara „${r.contradicts_prior.ref}”: ${r.contradicts_prior.explanation}`);
  if (!r.codex_compliance.compliant) L.push("⚠️ CODEX: " + r.codex_compliance.issues.join("; "));
  L.push("");
  L.push("Decizia finala iti apartine. (Boardul recomanda, nu decide.)");
  const voice = `Board ${m.type}: recomandare ${r.recommendation}, consens ${r.consensus_level} la suta` +
    (r.major_disagreements.length ? `, cu ${r.major_disagreements.length} dezacorduri majore` : "") +
    `. Decizia finala e a ta.`;
  L.push("[VOCE] " + voice.slice(0, 300));
  return L.join("\n");
}

/**
 * SHADOW MODE: analizeaza in fundal si scrie DOAR in audit_log. Nu schimba
 * raspunsul, nu notifica, nu executa. No-op complet cand shadow e OFF sau
 * Boardul e deja ACTIVE. Fire-and-forget — erorile nu ating fluxul principal.
 */
export function maybeShadowBoard(question) {
  if (boardMode() !== "shadow") return;
  runBoardMeeting(question, { shadow: true })
    .then((m) => console.log(`[board:shadow] ${m.type} rec=${m.recommendation?.recommendation || "BLOCATA"}`))
    .catch((e) => {
      console.error("[board:shadow]", e.message);
      audit("board_shadow_error", String(e.message).slice(0, 200)).catch(() => {});
    });
}
