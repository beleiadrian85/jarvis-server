// RESOLVER SOURCES — checkere REALE pentru JarvisInformationResolver: Operational
// (opsdb read-only), Email (adapter read-only), Web (search). JARVIS investigheaza
// SINGUR in toate sursele relevante inainte de UNKNOWN. Gasit ≠ confirmat. Read-only.
import { getState, setState } from "../state.js";

const arr = (v) => (Array.isArray(v) ? v : []);
const STOP = new Set(["avem", "este", "sunt", "care", "unde", "cand", "cum", "pentru", "despre", "daca", "mai", "sau", "din", "cu", "la", "pe", "si", "un", "o", "de", "ce", "ai", "am", "la", "zi", "sa", "in", "ce", "fost", "vezi", "gaseste", "cauta", "verifica"]);

/** Extrage termeni relevanti dintr-o intrebare (fara stopwords). */
export function extractTerms(text) {
  return String(text || "").toLowerCase()
    .replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t")
    .split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w)).slice(0, 6);
}

/** Detecteaza numele de persoane din echipa in text → pt. mapare from:email. */
const PERSON_EMAIL_KEY = "ceo:person-emails";
export async function getPersonEmails({ store = null } = {}) {
  const S = store || { get: getState, set: setState };
  return (await S.get(PERSON_EMAIL_KEY, {}).catch(() => ({}))) || {};
}
export async function setPersonEmail(name, email, { store = null } = {}) {
  const S = store || { get: getState, set: setState };
  const m = await getPersonEmails({ store: S });
  m[String(name).toLowerCase()] = email;
  await S.set(PERSON_EMAIL_KEY, m).catch(() => {});
  return m;
}
function personsInText(text) {
  const n = String(text || "").toLowerCase();
  return ["dana", "nelu", "mihaela", "adrian"].filter((p) => n.includes(p));
}

/** CHECKER Operational (read-only): cauta task-uri/facturi/extrase relevante. */
export async function operationalChecker({ question }) {
  const out = [];
  const n = String(question || "").toLowerCase();
  try {
    const ops = await import("../connectors/opsdata.js");
    // Extrase bancare / sold.
    if (/extras|cont|sold|banc/.test(n)) {
      const bs = await ops.getBankStatementsSummary?.().catch(() => null);
      if (bs) out.push({ field: "bank_statement", claim: "extras_ultim", value: bs.original_name || bs.latest?.original_name || "necunoscut", observed_at: bs.created_at || bs.latest?.created_at || null, note: "ultimul extras in Operational", evidence_class: "OBSERVED_IN_OPERATIONAL" });
    }
    // Facturi.
    if (/factur|smartbill|incasar/.test(n)) {
      const inv = await ops.getIncomeInvoices?.().catch(() => null);
      if (arr(inv).length) out.push({ field: "invoices", claim: "facturi", value: `${inv.length} facturi`, note: "facturi in Operational", evidence_class: "OBSERVED_IN_OPERATIONAL" });
    }
  } catch { /* best-effort */ }
  // Task-uri relevante (colector read-only).
  try {
    const { collectState } = await import("../supervisor/collector.js");
    const st = await collectState();
    const terms = extractTerms(question);
    const hits = arr(st?.tasks).filter((t) => terms.some((w) => String(t.title || "").toLowerCase().includes(w))).slice(0, 3);
    for (const t of hits) out.push({ field: "task", claim: t.title, value: t.status, who: t.assigneeName || t.assignee, observed_at: t.updatedAt, note: `task: ${t.title}`, evidence_class: "OBSERVED_IN_OPERATIONAL" });
  } catch { /* best-effort */ }
  return out;
}

/** CHECKER Email (read-only): cauta emailuri relevante (persoana→from daca stim). */
export async function emailChecker({ question }, { store = null } = {}) {
  try {
    const { googleConnected } = await import("../google.js");
    if (!(await googleConnected())) return [];
    const { searchEmail, buildSearchPlan } = await import("./email/adapter.js");
    const people = personsInText(question);
    const emails = await getPersonEmails({ store });
    const fromAddrs = people.map((p) => emails[p]).filter(Boolean);
    const terms = extractTerms(question);
    const plan = buildSearchPlan({ intent: "INVESTIGATE", relevant_people: fromAddrs.length ? fromAddrs.map((a) => `from:${a}`) : people, terms, has_attachment: /extras|factur|document|atas|contract/.test(String(question).toLowerCase()) || null });
    const r = await searchEmail(plan, { ctx: {} });
    return arr(r.results).slice(0, 5).map((m) => ({ field: "email", claim: m.subject || "email", value: m.sender, observed_at: m.timestamp, attachments: m.has_attachment, note: `email: ${m.subject} (${m.sender})`, evidence_class: "FOUND_IN_EMAIL" }));
  } catch { return []; }
}

/** CHECKER Web (surse oficiale/externe) — doar pentru intrebari legale/externe. */
export async function webChecker({ question }, { llm = null } = {}) {
  try {
    const call = llm || (await import("../claude.js")).callClaudeWithMCP;
    const raw = await call({ system: "Cauta pe web surse OFICIALE recente. JSON: {items:[{title,url,source,summary}]}. Doar JSON.", messages: [{ role: "user", content: String(question).slice(0, 300) }], webSearch: true, maxTokens: 800 });
    const m = String(raw || "").match(/\{[\s\S]*\}/);
    const items = m ? arr(JSON.parse(m[0]).items) : [];
    return items.slice(0, 3).map((i) => ({ field: "web", claim: i.title, value: i.source, note: `${i.title} (${i.source})`, url: i.url, evidence_class: "EXTERNAL_SIGNAL" }));
  } catch { return []; }
}

/** Set complet de checkere reale (mapeaza pe sursele din planSources). */
export function defaultCheckers({ store = null, llm = null } = {}) {
  return {
    operational: operationalChecker,
    email: (a) => emailChecker(a, { store }),
    email_attachments: (a) => emailChecker(a, { store }), // atasamentele apar in emailChecker
    authorized_drive: async () => [],
    official_primary: (a) => webChecker(a, { llm }),
    official_secondary: (a) => webChecker(a, { llm }),
    journalistic_context: async () => [],
    company_sites: async () => [],
    registries: async () => [],
    credible_publications: async () => [],
  };
}

/** ORCHESTRATOR: investigheaza o intrebare in toate sursele reale. */
export async function investigate(question, { intent = "GENERIC", evidence_requirements = [], store = null, llm = null } = {}) {
  const { resolve, investigationSummary } = await import("./infoResolver.js");
  const inv = await resolve({ question, intent, evidence_requirements, checkers: defaultCheckers({ store, llm }) });
  return { ...inv, summary: investigationSummary(inv) };
}

/** Detecteaza intrebari de tip INVESTIGATIE (merita cautare multi-sursa). */
export function needsInvestigation(text) {
  const n = String(text || "").toLowerCase();
  return /(avem .* (la zi|actualiz)|verifica daca|ce (a|mi-a) (raspuns|trimis|zis)|gaseste|cauta (peste tot|in toate)|unde (e|este|am)|avem .* de la|am primit|s-a primit|exista .* (de la|despre)|ce stim despre|cine (mi-a|a) trimis)/.test(n);
}
