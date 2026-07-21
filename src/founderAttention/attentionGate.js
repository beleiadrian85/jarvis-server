// FOUNDER ATTENTION GATE — nivelul de atentie al unui episod. PUR, determinist,
// zero LLM, zero IO. Decide CE merita atentia lui Adrian si CAND — timpul
// fondatorului e resursa cea mai scumpa (F07): intreruperea se justifica DOAR
// prin costul real al intarzierii.

export const ATTENTION_LEVELS = [
  "IGNORE", "AUDIT_ONLY", "DAILY_DIGEST",
  "INTERRUPTIVE_ALERT", "FOUNDER_DECISION_REQUIRED", "DATA_REQUIRED_BEFORE_DECISION",
];

const SEV_RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

/** Risc confirmat determinist: probabilitate certa pe date complete. */
export function hasConfirmedRisk(episode) {
  return (episode._members || []).some(
    (m) => m.data_quality === "complete" && (m._factors?.probability ?? 0) >= 0.9
  );
}

/**
 * Gate-ul determinist. → { level, reasons[], interruptive_blocked }
 * @param episode  episod executiv (cu _members, _minUrgencyDays, _decisions etc.)
 */
export function gateEpisode(episode) {
  const reasons = [];
  const sev = episode.combined_severity;
  const rank = SEV_RANK[sev] ?? 0;
  const members = episode._members || [];
  const f = (k) => members.some((m) => m._factors?.[k]);
  const urgent = episode._minUrgencyDays != null && episode._minUrgencyDays <= 3;
  const worsening = episode.status === "worsening";
  const dataPoor = members.length > 0 && members.every((m) => m.data_quality === "poor");
  const cashSevere = members.some((m) => m._threatensCore === "cash") && rank >= 3;
  const legalRepMajor = (f("legalRisk") || f("reputationalRisk")) && rank >= 3;
  const irreversibleImminent = f("irreversible") && urgent;

  // 1) Zgomot → IGNORE / AUDIT_ONLY.
  if (rank === 0 && episode.status !== "resolved") return { level: "IGNORE", reasons: ["semnal informativ"], interruptive_blocked: null };

  // 2) Decizia fondatorului — DOAR pe decizie reala, cu date suficiente.
  const options = String(episode._decisions || "").split("/").map((s) => s.trim()).filter(Boolean);
  const realDecision = episode.requires_board_review && options.length >= 2 &&
    episode.status !== "resolved" && (urgent || worsening || rank >= 4);
  if (realDecision) {
    // Orice data esentiala DECLARATA lipsa (unknowns) blocheaza decizia finala:
    // intai datele, apoi decizia — indiferent de confidence (ex. sold bancar).
    const essentialMissing = dataPoor || episode.unknowns.length > 0;
    if (essentialMissing) {
      reasons.push("decizie reala, dar lipsesc date esentiale — intai datele");
      return { level: "DATA_REQUIRED_BEFORE_DECISION", reasons, interruptive_blocked: null };
    }
    reasons.push(`decizie reala cu ${options.length} optiuni; amanarea are cost (${urgent ? "termen apropiat" : worsening ? "in agravare" : "severitate maxima"})`);
    return { level: "FOUNDER_DECISION_REQUIRED", reasons, interruptive_blocked: null };
  }

  // 3) Alerta interruptiva — conditii stricte.
  let interruptive = null;
  if (sev === "critical") interruptive = "severitate critical";
  else if (rank >= 3 && urgent) interruptive = "high cu termen apropiat";
  else if (rank >= 3 && worsening) interruptive = "high in agravare";
  else if (cashSevere) interruptive = "risc sever de cash";
  else if (legalRepMajor) interruptive = "risc juridic/reputational major";
  else if (irreversibleImminent) interruptive = "decizie ireversibila iminenta";

  if (interruptive) {
    // Date slabe blocheaza intreruperea — exceptie: risc confirmat determinist.
    if (dataPoor && !hasConfirmedRisk(episode)) {
      reasons.push(`alerta blocata: date slabe fara risc confirmat determinist (motiv initial: ${interruptive})`);
      return { level: "DAILY_DIGEST", reasons, interruptive_blocked: interruptive };
    }
    reasons.push(interruptive);
    return { level: "INTERRUPTIVE_ALERT", reasons, interruptive_blocked: null };
  }

  // 4) Digest zilnic: medium; high fara urgenta; repetat/trend; dependenta fondator.
  if (rank === 2 || rank === 3 ||
      episode.status === "worsening" || episode.status === "improving" || episode.status === "resolved" ||
      members.some((m) => m._factors?.persistence === "repeated") ||
      f("founderDependency") || episode.requires_founder_attention) {
    reasons.push(rank >= 2 ? `severitate ${sev} fara urgenta imediata` : "relevant pentru digest (trend/repetitie/dependenta)");
    return { level: "DAILY_DIGEST", reasons, interruptive_blocked: null };
  }

  // 5) Restul ramane in audit.
  reasons.push("severitate scazuta — ramane in audit");
  return { level: "AUDIT_ONLY", reasons, interruptive_blocked: null };
}
