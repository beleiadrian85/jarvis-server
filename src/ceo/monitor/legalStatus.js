// LEGISLATIVE INTELLIGENCE — modeleaza EXPLICIT stadiul unui act (nu confunda
// adoptarea cu aplicabilitatea) si ierarhia surselor (nu declara "lege aplicabila"
// dintr-o stire). PUR + determinist.

// Stadiile legislative (din directiva) — de la zvon la efectiv functional.
export const LEGAL_STAGES = [
  "RUMOUR_OR_DISCUSSION", "PUBLIC_CONSULTATION", "DRAFT", "REGISTERED_IN_PARLIAMENT",
  "COMMITTEE_STAGE", "ADOPTED_BY_ONE_CHAMBER", "ADOPTED_BY_PARLIAMENT",
  "SENT_FOR_PROMULGATION", "PROMULGATED", "PUBLISHED", "IN_FORCE",
  "SUSPENDED", "AMENDED", "REPEALED", "IMPLEMENTING_RULES_PENDING", "TECHNICALLY_OPERATIONAL",
];

// Ierarhia surselor (TIER 1 oficial primar … TIER 4 indicii).
export const SOURCE_TIERS = {
  1: { name: "sursa oficiala primara", examples: ["Monitorul Oficial", "Portal Legislativ", "gov.ro", "cdep.ro", "senat.ro", "EUR-Lex", "ANAF", "ANCPI", "autoritate emitenta"] },
  2: { name: "sursa institutionala secundara", examples: ["comunicat oficial", "ghid", "FAQ", "calendar implementare", "documentatie tehnica oficiala"] },
  3: { name: "sursa jurnalistica reputabila", examples: ["ZF", "Agerpres", "Profit.ro", "HotNews"] },
  4: { name: "alte surse (doar indicii)", examples: [] },
};

const T1 = /(monitorul oficial|monitoruloficial|legislatie\.just\.ro|portal legislativ|cdep\.ro|senat\.ro|gov\.ro|guvern|anaf\.ro|ancpi|eur-lex|europa\.eu|\.gov)/i;
const T2 = /(comunicat oficial|ghid oficial|calendar de implementare|documentatie oficiala|faq oficial)/i;
const T3 = /(zf\.ro|ziarul financiar|agerpres|profit\.ro|hotnews|economica\.net|mediafax)/i;

/** Tier-ul unei surse dupa URL/nume. */
export function sourceTier(sourceOrUrl) {
  const s = String(sourceOrUrl || "").toLowerCase();
  if (T1.test(s)) return 1;
  if (T2.test(s)) return 2;
  if (T3.test(s)) return 3;
  return 4;
}

/** True daca un act e EFECTIV aplicabil (nu doar adoptat/publicat). */
export function isApplicable(stage, { effective_date = null, implementing_rules = "unknown", nowMs = Date.now() } = {}) {
  const st = String(stage || "").toUpperCase();
  if (["IN_FORCE", "TECHNICALLY_OPERATIONAL"].includes(st)) {
    if (implementing_rules === "pending") return false; // legal creat, nu functional
    if (effective_date && Date.parse(effective_date) > nowMs) return false; // publicat, nu intrat in vigoare
    return true;
  }
  return false;
}

/**
 * Poate emite o alerta "lege aplicabila"? DOAR cu sursa oficiala + stadiu aplicabil.
 * O stire jurnalistica (tier 3-4) NU confirma aplicabilitatea.
 * @returns { canAssertApplicable, reason }
 */
export function canAssertApplicable({ stage, source, effective_date = null, implementing_rules = "unknown", confirmations = 1 } = {}) {
  const tier = sourceTier(source);
  if (tier >= 3) return { canAssertApplicable: false, reason: "sursa jurnalistica/indicii — nu confirma aplicabilitatea; necesar tier 1-2 oficial" };
  if (!isApplicable(stage, { effective_date, implementing_rules })) return { canAssertApplicable: false, reason: `stadiu '${stage}' nu e aplicabil (adoptat/publicat ≠ in vigoare/functional)` };
  return { canAssertApplicable: true, reason: "sursa oficiala + stadiu aplicabil" };
}

/** Descriere onesta a stadiului pentru alerta. */
export function stageSummary({ stage, effective_date = null, implementing_rules = "unknown", source = null } = {}) {
  const applicable = isApplicable(stage, { effective_date, implementing_rules });
  return {
    stage, applicable, source_tier: sourceTier(source),
    note: applicable ? "efectiv aplicabil" :
      /ADOPTED|PROMULGATED|PUBLISHED/.test(String(stage)) ? "adoptat/publicat, dar NU inca in vigoare/functional" :
      /DRAFT|CONSULTATION|RUMOUR|REGISTERED|COMMITTEE/.test(String(stage)) ? "in proces legislativ — inca proiect, nu lege" :
      implementing_rules === "pending" ? "legal creat, dar normele de implementare lipsesc (nefunctional)" : "stadiu incert",
  };
}
