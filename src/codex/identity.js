// ASK CODEX — IDENTITY & NEED-TO-KNOW (§2). CODEX stie CINE intreaba si limiteaza
// contextul la ce e RELEVANT + PERMIS pentru acel rol. Nelu NU primeste automat
// date financiare/confidentiale; Dana NU primeste strategia privata a fondatorului;
// Adrian = context CEO complet (politica existenta). PUR + determinist.
// REGULA: need-to-know. Fara relevanta SAU fara drept → domeniul e exclus.

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

// Domenii de context. Fiecare rol vede un subset. `own_tasks` = mereu permis.
export const CONTEXT_DOMAINS = [
  "own_tasks", "execution", "site", "materials", "operational_suppliers", "project_execution",
  "finance", "accounting", "cash", "receivables", "financial_suppliers", "financial_documents",
  "founder_strategy", "capital", "negotiation", "legal", "sales_strategy", "hr",
];

// Matrice de permisiuni per persoana (need-to-know). Sursa: companyConfig roles.
const ACCESS = {
  adrian: { // fondator — context CEO complet
    allow: "ALL",
    deny: [],
    label: "Adrian (fondator) — context CEO complet conform politicii",
  },
  dana: { // financiar/contabilitate
    allow: ["own_tasks", "finance", "accounting", "cash", "receivables", "financial_suppliers", "financial_documents"],
    deny: ["founder_strategy", "capital", "negotiation", "legal", "sales_strategy", "hr", "execution", "site", "materials"],
    label: "Dana (financiar) — finante/contabilitate/cash/creante/furnizori financiari/documente; FARA strategie fondator",
  },
  nelu: { // executie/santier
    allow: ["own_tasks", "execution", "site", "materials", "operational_suppliers", "project_execution"],
    deny: ["finance", "accounting", "cash", "receivables", "financial_documents", "founder_strategy", "capital", "negotiation", "legal", "sales_strategy", "hr"],
    label: "Nelu (executie) — santier/materiale/furnizori operationali/executie proiect; FARA date financiare/confidentiale",
  },
  mihaela: { // administrativ
    allow: ["own_tasks"],
    deny: ["finance", "cash", "founder_strategy", "capital", "negotiation", "legal"],
    label: "Mihaela (administrativ) — task-uri proprii + administrativ; FARA finante/strategie",
  },
};

/** Rezolva identitatea unui user_id la profilul de acces. Necunoscut = minim. */
export function resolveIdentity(userId) {
  const id = String(userId || "").toLowerCase().trim();
  const acc = ACCESS[id];
  if (!acc) return { user_id: id || "unknown", known: false, allow: ["own_tasks"], deny: CONTEXT_DOMAINS.filter((d) => d !== "own_tasks"), label: "utilizator necunoscut — acces minim (doar task-uri proprii)" };
  const allow = acc.allow === "ALL" ? [...CONTEXT_DOMAINS] : acc.allow;
  return { user_id: id, known: true, is_founder: id === "adrian", allow, deny: acc.deny, label: acc.label };
}

/** Poate userul sa vada acest domeniu de context? (need-to-know) */
export function canSee(userId, domain) {
  const idn = resolveIdentity(userId);
  if (idn.allow.includes(domain)) return true;
  return false;
}

/**
 * Filtreaza o harta de context { domain: data } la ce POATE vedea userul.
 * Ce e blocat NU apare deloc (nu "redacted" cu urme) — need-to-know curat.
 * @returns { visible: {domain:data}, blocked: [domain], identity }
 */
export function scopeContext(userId, contextMap = {}) {
  const idn = resolveIdentity(userId);
  const visible = {}, blocked = [];
  for (const [domain, data] of Object.entries(isObj(contextMap) ? contextMap : {})) {
    if (idn.allow.includes(domain)) visible[domain] = data;
    else blocked.push(domain);
  }
  return { visible, blocked, identity: idn };
}

/**
 * Instructiune de context pentru promptul CODEX — declara EXPLICIT ce e permis,
 * ca modelul sa nu scurga date in afara rolului chiar daca "stie".
 */
export function identityForPrompt(userId) {
  const idn = resolveIdentity(userId);
  if (idn.is_founder) return `UTILIZATOR: Adrian (fondator). Context CEO COMPLET permis conform politicii.`;
  return (
    `UTILIZATOR: ${idn.user_id} — ${idn.label}\n` +
    `REGULA NEED-TO-KNOW: raspunde DOAR pe domeniile permise (${idn.allow.join(", ")}). ` +
    `NU dezvalui date din domeniile interzise (${idn.deny.join(", ")}) chiar daca sunt in context sau sunt cerute. ` +
    `Daca intrebarea cere date in afara rolului, spune politicos ca nu tii de acea zona si indruma spre Adrian.`
  );
}

/** True daca o intrebare vizeaza un domeniu peste rolul userului (leakage gate). */
export function requestsOutOfScope(userId, domainsAsked = []) {
  const idn = resolveIdentity(userId);
  if (idn.is_founder) return { out: false, domains: [] };
  const out = (domainsAsked || []).filter((d) => !idn.allow.includes(d));
  return { out: out.length > 0, domains: out };
}
