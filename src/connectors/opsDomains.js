// OPERATIONAL DOMAINS — harta COMPLETA a functiilor Operational catre JARVIS. Grupeaza
// cele ~107 tabele in domenii functionale si produce un overview live (nr. randuri +
// ultima activitate per domeniu). Astfel JARVIS e constient de TOATE functiile
// (nu doar taskuri): marketing, ofertare/produse, mentenanta, mementos etc.
// READ-ONLY (opsQuery ruleaza pe pool read-only). Best-effort per tabel.
import { opsQuery, hasOpsDb } from "../supervisor/opsdb.js";
import { getState, setState } from "../state.js";

const CACHE_KEY = "ops:overview:cache";

// Domeniu → { label, tables[], latest? (coloana de timp pentru "ultima activitate") }.
export const OPS_DOMAINS = [
  { key: "tasks", label: "Taskuri & disciplina", tables: ["tasks", "task_history", "operational_events"], latest: "created_at" },
  { key: "people", label: "Utilizatori/echipa", tables: ["users"], latest: null },
  { key: "cash", label: "Cash & obligatii de plata", tables: ["payment_obligations", "recurring_payment_obligations", "supplier_due_items", "income_invoices", "estimated_cash_inflows"], latest: "created_at" },
  { key: "bank", label: "Extrase bancare", tables: ["bank_statements", "bank_statement_lines", "cf_extracts"], latest: "created_at" },
  { key: "sales", label: "Vanzari & unitati", tables: ["sales_units", "sales_actions", "sales_change_requests", "leads"], latest: "created_at" },
  { key: "marketing", label: "Marketing (campanii/leaduri/KPI/SEO)", tables: ["mkt_campaigns", "mkt_leads", "mkt_kpi_snapshots", "mkt_costs", "mkt_revenue", "mkt_recommendations", "mkt_seo_issues", "mkt_reports", "mkt_search_queries", "mkt_landing_pages"], latest: "created_at" },
  { key: "offers", label: "Ofertare, produse & materiale", tables: ["ofp_oferte", "ofp_oferta_pozitii", "ofp_produse", "ofp_necesar", "ofp_categorii", "ofp_note_comanda"], latest: "created_at" },
  { key: "maintenance", label: "Mentenanta", tables: ["maintenance", "maintenance_history"], latest: "created_at" },
  { key: "documents", label: "Documente & atasamente", tables: ["attachments", "file_blobs", "doc_extractions", "finance_docs", "income_uploads", "jarvis_document_analyses", "cladire_docs"], latest: "created_at" },
  { key: "site", label: "Site & trafic", tables: ["site_visits", "site_events", "site_marketing_reports", "site_photos"], latest: "created_at" },
  { key: "mementos", label: "Mementos & note", tables: ["mementos", "memento_log", "memento_notes"], latest: "created_at" },
  { key: "notifications", label: "Notificari", tables: ["notifications", "notification_state"], latest: "created_at" },
  { key: "decisions", label: "Decizii & analize", tables: ["decisions", "analysis_action_decisions", "bank_reconciliation_decisions", "monthly_validation"], latest: "created_at" },
  { key: "settings", label: "Setari", tables: ["settings"], latest: null },
];

async function tableCount(t) { try { return (await opsQuery(`SELECT count(*)::int c FROM "${t}"`))[0].c; } catch { return null; } }
async function tableLatest(t, col) {
  if (!col) return null;
  try { const r = await opsQuery(`SELECT max("${col}") AS m FROM "${t}"`); return r[0]?.m || null; }
  catch { return null; }
}

/**
 * Overview LIVE al tuturor domeniilor Operational: per domeniu, nr. total randuri +
 * ultima activitate + tabelele care au date. @returns { connected, domains[], generated_at }
 */
export async function getOperationalOverview({ nowISO = null } = {}) {
  if (!hasOpsDb) return { connected: false, domains: [], reason: "OPERATIONAL_DATABASE_URL nesetat" };
  const domains = [];
  for (const d of OPS_DOMAINS) {
    let total = 0, any = false, latest = null;
    const withData = [];
    for (const t of d.tables) {
      const c = await tableCount(t);
      if (c == null) continue; // tabel inexistent/fara acces
      any = true; total += c;
      if (c > 0) withData.push(`${t}(${c})`);
      const l = await tableLatest(t, d.latest);
      if (l && (!latest || new Date(l) > new Date(latest))) latest = l;
    }
    domains.push({ key: d.key, label: d.label, rows: total, has_data: total > 0, present: any, tables_with_data: withData, last_activity: latest });
  }
  return { connected: true, generated_at: nowISO || new Date().toISOString(), domain_count: domains.length, domains };
}

/** REFRESH: recalculeaza overview-ul si il salveaza in cache (jarvis_state). Chemat de
 *  jobul din 10 in 10 min + on-demand. Returneaza overview-ul proaspat. */
export async function refreshOverview({ nowISO = null } = {}) {
  const ov = await getOperationalOverview({ nowISO });
  if (ov.connected) { try { await setState(CACHE_KEY, { ...ov, cached_at: ov.generated_at }); } catch { /* best-effort */ } }
  return ov;
}

/** Overview din cache (ieftin, pentru raspunsuri/UI). Null daca nu a rulat inca. */
export async function getCachedOverview() {
  try { return await getState(CACHE_KEY, null); } catch { return null; }
}

/** Lista domeniilor cu date (pentru sourceTruth.data_domains). */
export async function activeDomainKeys() {
  const ov = await getOperationalOverview();
  return ov.connected ? ov.domains.filter((d) => d.has_data).map((d) => d.key) : [];
}

/** Linie compacta pentru prompt: ce functii Operational vede JARVIS + volumul. */
export function overviewForPrompt(ov) {
  if (!ov?.connected) return "OPERATIONAL: neconectat.";
  const parts = ov.domains.filter((d) => d.present).map((d) => `${d.label}${d.rows ? ` (${d.rows})` : " (0)"}`);
  return "OPERATIONAL — functii sincronizate (toate domeniile, read-only):\n- " + parts.join("\n- ") +
    "\nOrice cifra vine din Operational (sursa oficiala). Domeniile fara date = 0, nu necunoscut.";
}
