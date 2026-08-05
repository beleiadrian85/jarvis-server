// SOURCE TRUTH REGISTRY (§1, §2, §19) — ce poate JARVIS REALMENTE citi/scrie,
// derivat din config + probe reale, NU din presupuneri. Fundatia anti-halucinatie:
// "NEVER CLAIM MORE THAN YOU CAN PROVE". Chat-ul consuma aceasta harta ca sa NU
// pretinda acces la SmartBill/banca/Gmail cand nu exista, si sa spuna UNKNOWN
// unde datele lipsesc. Reutilizeaza connectivitatea deja calculata (config,
// smartbillConfigured, getSourcesHealth) — zero sistem paralel.
import { config, hasOperational, hasDb } from "../config.js";
import { OPS_DOMAINS } from "../connectors/opsDomains.js";

// §1 — CONTRACTUL DE EVIDENTA: cum se clasifica orice afirmatie operationala.
export const EVIDENCE_CLASS = [
  "FACT_VERIFIED",   // citit din sursa conectata, proaspat
  "FACT_STALE",      // citit dar vechi
  "INFERENCE",       // dedus din date, nu citit direct
  "ASSUMPTION",      // presupunere fara dovada — de evitat
  "UNKNOWN",         // nu am date / sursa lipsa
  "ACTION_PLANNED",  // intentie, NEexecutata
  "ACTION_EXECUTED", // scriere reala confirmata (task/observatie)
  "ACTION_FAILED",   // incercata, esuata
];

/** Verbe pe care JARVIS NU are voie sa le foloseasca fara capability+evidence. */
export const FORBIDDEN_UNLESS_PROVEN = [
  "am verificat", "monitorizez", "am cerut", "voi extrage", "voi lua", "iau eu din sistem",
  "voi contacta", "am contactat", "am trimis", "extrag din", "ma conectez la",
];

/**
 * Registrul canonic al surselor. async — probeaza sanatatea live best-effort.
 * Fiecare sursa: { source, status, read, write, data_domains, freshness,
 * confidence, limitations, evidence }. Determinist peste config + probe.
 */
export async function buildSourceTruth({ nowMs = Date.now() } = {}) {
  const sources = [];

  // ── OPERATIONAL (MCP write TASKS-ONLY + opsdb read complet) ──
  let sourcesHealth = {};
  try { sourcesHealth = (await import("../connectors/opsdata.js")).getSourcesHealth() || {}; } catch { /* */ }
  const opsReadOk = hasDb || hasOperational;
  sources.push({
    source: "Operational",
    status: opsReadOk ? "CONNECTED" : "NOT_CONNECTED",
    // FULL READ pe TOATE domeniile Operational (107 tabele, ~14 functii). Scrierea ramane TASKS-ONLY.
    read: hasDb ? `FULL (opsdb read-only, TOATE functiile: ${OPS_DOMAINS.map((d) => d.label).join("; ")})` : (hasOperational ? "PARTIAL (doar prin MCP list_tasks etc.)" : "NONE"),
    write: hasOperational ? "TASKS ONLY (create_task/update_task/add_observation) — granita structurala" : "NONE",
    data_domains: OPS_DOMAINS.map((d) => d.key),
    freshness: "live la citire",
    confidence: opsReadOk ? "high" : "none",
    limitations: ["scriere DOAR task-uri (nu obligatii/vanzari/cash/facturi/marketing/oferte)", "soldul bancar NU e in rulaje — necesita input manual"],
    evidence: `OPERATIONAL_DATABASE_URL ${hasDb ? "set" : "lipsa"}; OPERATIONAL_MCP_URL ${hasOperational ? "set" : "lipsa"}`,
  });

  // ── SMARTBILL (API oficial, dar LIMITAT) ──
  let sbConfigured = false, sbHealth = null;
  try { const sb = await import("../connectors/smartbill.js"); sbConfigured = typeof sb.smartbillConfigured === "function" ? sb.smartbillConfigured() : false; sbHealth = typeof sb.smartbillHealth === "function" ? sb.smartbillHealth() : null; } catch { /* */ }
  sources.push({
    source: "SmartBill",
    status: sbConfigured ? "CONNECTED_PARTIAL" : "NOT_CONNECTED",
    read: sbConfigured ? "PARTIAL (serii facturi, status plata per factura pe numar cunoscut)" : "NONE",
    write: "NONE (read-only, fara scriere)",
    data_domains: ["invoice_series", "invoice_payment_status"],
    freshness: sbConfigured ? "live" : "-",
    confidence: sbConfigured ? "medium" : "none",
    limitations: ["NU exista listare bulk de facturi/clienti prin API — NU pot trage 'situatia clientilor' automat", "reconcilierea completa cere documentul de la finante"],
    evidence: `SMARTBILL_EMAIL/TOKEN/CIF ${sbConfigured ? "set" : "lipsa"}`,
  });

  // ── BANK (ING/BT/CEC) — FARA API ──
  sources.push({
    source: "Bank (ING/BT/CEC)",
    status: "NOT_CONNECTED",
    read: "NONE (nu exista API bancar)",
    write: "NONE",
    data_domains: ["bank_balance", "transactions"],
    freshness: "-",
    confidence: "none",
    limitations: ["NU am acces la sold bancar in timp real", "soldul vine DOAR prin input manual (formular Command Center) sau extras atasat de finante"],
    evidence: "niciun connector bancar in cod",
  });

  // ── GMAIL / CALENDAR (Google OAuth) — conectarea reala din env SAU state ──
  let googleOk = !!(config.google?.clientId && config.google?.refreshToken);
  try { googleOk = await (await import("../google.js")).googleConnected(); } catch { /* fallback pe env */ }
  for (const [name, domains] of [["Gmail", ["emails", "email_drafts"]], ["Google Calendar", ["events", "meetings"]]]) {
    sources.push({
      source: name,
      status: googleOk ? "CONNECTED" : "NOT_CONNECTED",
      read: googleOk ? "da (read-only)" : "NONE (OAuth Google neconectat)",
      write: googleOk ? "draft only (send OFF)" : "NONE",
      data_domains: domains,
      freshness: googleOk ? "live" : "-",
      confidence: googleOk ? "medium" : "none",
      limitations: googleOk ? [] : ["Google OAuth NU e conectat — NU pot citi email/calendar; necesita wizard-ul de conectare"],
      evidence: `GOOGLE_REFRESH_TOKEN ${config.google?.refreshToken ? "set" : "lipsa"}`,
    });
  }

  // ── SITE / SPION (trafic din opsdb) ──
  const spionOk = hasDb;
  sources.push({
    source: "Site / Spion (trafic)",
    status: spionOk ? "CONNECTED" : "NOT_CONNECTED",
    read: spionOk ? "vizite/hits agregate (site_visits) — fara IP brut (GDPR)" : "NONE",
    write: "NONE",
    data_domains: ["site_visits", "traffic"],
    freshness: spionOk ? "live" : "-",
    confidence: spionOk ? "medium" : "none",
    limitations: ["contorul SUBNUMARA traficul real (audit)", "GA4 exista pe site dar JARVIS NU-l citeste direct inca"],
    evidence: "opsdb site_visits",
  });

  return { at: new Date(nowMs).toISOString(), sources, health: sourcesHealth };
}

/** Rezumat compact pentru injectare in system-prompt-ul chat-ului. */
export function sourceTruthForPrompt(registry) {
  const lines = (registry?.sources || []).map((s) => {
    const lim = s.limitations?.length ? ` [limite: ${s.limitations[0]}]` : "";
    return `- ${s.source}: ${s.status} · citesc: ${s.read} · scriu: ${s.write}${lim}`;
  });
  return (
    "SURSE REALE (ce POT si ce NU pot accesa — NU pretinde acces peste asta):\n" +
    lines.join("\n") +
    "\nREGULA: daca o intrebare cere date dintr-o sursa NOT_CONNECTED (ex. sold bancar, SmartBill bulk, email), " +
    "spui exact ca NU esti conectat la ea si ca acea informatie e UNKNOWN sau vine prin om — NU inventa ca 'iei tu din sistem'."
  );
}
