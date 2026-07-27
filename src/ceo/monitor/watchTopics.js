// WATCH TOPICS — registru de subiecte monitorizate + profil de impact al companiilor
// lui Adrian. Monitorizarea evalueaza impactul RAPORTAT LA PROFIL, nu doar keywords.
// OCPI = configurabil (NEEDS_DEFINITION), NU interpretat arbitrar. jarvis_state.
import { getState, setState } from "../../state.js";

const KEY = "ceo:watch-topics";
const PROFILE_KEY = "ceo:impact-profile";
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

export const CHECK_FREQUENCIES = {
  BREAKING_OR_CRITICAL: "hourly", LEGISLATION_HIGH_PRIORITY: "every_3h_workdays",
  OFFICIAL_INSTITUTIONS: "every_6h", GENERAL_INDUSTRY_NEWS: "twice_daily",
  LOW_PRIORITY_TOPICS: "daily", WEEKLY_REVIEW: "weekly",
};

/** Subiecte initiale (enabled=false implicit — Adrian activeaza ce e relevant). */
export function defaultTopics() {
  const t = (id, title, freq = "LOW_PRIORITY_TOPICS", extra = {}) => ({
    id, title, description: null, entities: [], keywords: [], semantic_queries: [`${title} Romania`],
    exclusions: [], geographic_scope: "Romania", industries: [], official_sources: [], secondary_sources: [],
    relevance_rules: [], impact_dimensions: ["fiscal", "operational", "compliance"], notification_threshold: "MEDIUM",
    digest_policy: "digest", check_frequency: freq, owner: "adrian", enabled: false, created_by: "system",
    last_checked_at: null, last_material_change_at: null, ...extra,
  });
  return [
    // OCPI — NECESITA DEFINIRE (nu interpretat arbitrar).
    { ...t("ocpi", "OCPI", "OFFICIAL_INSTITUTIONS"), status: "NEEDS_DEFINITION", operational_definition: null,
      activation_criteria: ["anunt oficial de lansare", "acces public disponibil", "documentatie publicata", "serviciul accepta cereri", "disponibil in judetele relevante", "norme de implementare in vigoare", "endpoint/portal functional", "confirmare din doua surse oficiale"],
      aliases: [], official_entities: [], official_sources: [] },
    t("fiscal_ro", "Legislatie fiscala Romania", "LEGISLATION_HIGH_PRIORITY"),
    t("tva", "TVA", "LEGISLATION_HIGH_PRIORITY"), t("impozitare", "Impozitare", "LEGISLATION_HIGH_PRIORITY"),
    t("efactura", "e-Factura", "LEGISLATION_HIGH_PRIORITY"), t("etransport", "e-Transport", "LEGISLATION_HIGH_PRIORITY"),
    t("saft", "SAF-T", "LEGISLATION_HIGH_PRIORITY"), t("legislatia_muncii", "Legislatia muncii", "OFFICIAL_INSTITUTIONS"),
    t("salarii_contributii", "Salarii si contributii", "OFFICIAL_INSTITUTIONS"), t("constructii", "Constructii / autorizatii / urbanism", "OFFICIAL_INSTITUTIONS"),
    t("cadastru", "Cadastru si publicitate imobiliara", "OFFICIAL_INSTITUTIONS"), t("mediu", "Mediu"), t("energie", "Energie"),
    t("achizitii", "Achizitii publice"), t("finantari", "Fonduri si programe de finantare"), t("insolventa", "Insolventa"),
    t("plati_comerciale", "Plati si termene comerciale"), t("reguli_bancare", "Reguli bancare pentru companii"),
    t("reglementari_ue", "Reglementari europene aplicabile"), t("furnizori_clienti", "Schimbari la furnizori/clienti monitorizati"),
    t("risc_geopolitic", "Riscuri geopolitice si economice relevante"),
  ];
}

export async function getTopics({ store = null } = {}) {
  const S = store || { get: getState, set: setState };
  const st = await S.get(KEY, null).catch(() => null);
  if (st && arr(st.topics).length) return st.topics;
  const defaults = defaultTopics();
  await S.set(KEY, { topics: defaults }).catch(() => {});
  return defaults;
}

export async function upsertTopic(topic, { store = null } = {}) {
  const S = store || { get: getState, set: setState };
  const topics = await getTopics({ store: S });
  const i = topics.findIndex((t) => t.id === topic.id);
  if (i >= 0) topics[i] = { ...topics[i], ...topic }; else topics.push(topic);
  await S.set(KEY, { topics }).catch(() => {});
  return topics.find((t) => t.id === topic.id);
}

/** OCPI poate declara "functional" DOAR daca e definit si criteriile sunt indeplinite. */
export function ocpiCanAssertOperational(ocpiTopic, evidence = {}) {
  if (!ocpiTopic || ocpiTopic.status === "NEEDS_DEFINITION" || !ocpiTopic.operational_definition)
    return { canAssert: false, reason: "OCPI nu e definit inca — nu pot declara 'functional' fara criterii verificabile" };
  const met = arr(ocpiTopic.activation_criteria).filter((c) => arr(evidence.criteria_met).includes(c));
  const twoSources = arr(evidence.official_sources).length >= 2;
  if (met.length && twoSources) return { canAssert: true, reason: `criterii indeplinite (${met.length}) + confirmare din 2 surse oficiale` };
  return { canAssert: false, reason: "criteriile de functionare nu sunt indeplinite/confirmate din surse oficiale" };
}

/** Profilul de impact al companiilor lui Adrian (configurabil). */
export function defaultImpactProfile() {
  return {
    industries: ["dezvoltare imobiliara", "constructii"], caen_codes: [], counties: ["Sibiu"],
    project_types: ["rezidential"], employees: null, fiscal_regime: null, contract_types: [], exposures: [],
    relevant_authorities: ["ANAF", "ANCPI", "primaria Sibiu", "ISC"], critical_suppliers: [], critical_clients: [],
    investments: [], assets: [], strategic_objectives: [], accepted_risks: [], approved_thresholds: {},
    status: "PARTIAL", note: "de completat de Adrian in CEO Home",
  };
}
export async function getImpactProfile({ store = null } = {}) {
  const S = store || { get: getState, set: setState };
  return (await S.get(PROFILE_KEY, null).catch(() => null)) || defaultImpactProfile();
}
export async function setImpactProfile(profile, { store = null } = {}) {
  const S = store || { get: getState, set: setState };
  const merged = { ...defaultImpactProfile(), ...(isObj(profile) ? profile : {}), status: "SET" };
  await S.set(PROFILE_KEY, merged).catch(() => {});
  return merged;
}
