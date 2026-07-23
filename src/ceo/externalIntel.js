// EXTERNAL INTELLIGENCE ENGINE (Fazele 23-26) — JARVIS intelege lumea din afara
// companiei si o LEAGA de realitatea Profi Concept / Bell Residence.
// REGULA (I14): informatia externa NU devine NICIODATA automat fapt intern de
// business — e semnal, cu sursa + data + incredere; impactul e o INFERENTA.
// Reutilizeaza web search-ul existent (callClaudeWithMCP). Gated + shadow-first.
import { getState, setState } from "../state.js";
import { audit } from "../audit.js";

const STATE_KEY = "ceo:external-intel";

// §24 — registrul de topicuri monitorizate, cu volatilitate (cadenta).
export const EXTERNAL_TOPICS = [
  { key: "dobanzi_bnr", label: "Dobanzi BNR / ROBOR / cost credit", volatility: "high", why_matters: "finantarea cumparatorilor Bell + costul creditelor firmei" },
  { key: "eur_ron", label: "Curs EUR/RON", volatility: "high", why_matters: "preturile Bell sunt in EUR, incasarile/cheltuielile in RON" },
  { key: "credit_imobiliar", label: "Conditii credit ipotecar / Prima Casa / Noua Casa", volatility: "medium", why_matters: "conversia rezervarilor Bell in vanzari depinde de finantarea cumparatorilor" },
  { key: "imm_invest", label: "IMM Invest / programe garantare", volatility: "medium", why_matters: "finantarea firmei" },
  { key: "anaf_tva", label: "ANAF / TVA / fiscalitate constructii-imobiliare", volatility: "medium", why_matters: "expunere fiscala pe proiecte si contracte" },
  { key: "imobiliar_sibiu", label: "Piata imobiliara rezidentiala Sibiu", volatility: "low", why_matters: "cererea si preturile pentru Bell Residence" },
  { key: "costuri_constructii", label: "Costuri materiale constructii / energie", volatility: "medium", why_matters: "costul de productie C3" },
  { key: "concurenta_sibiu", label: "Ansambluri rezidentiale concurente Sibiu", volatility: "low", why_matters: "pozitionare pret si stoc Bell" },
];

/**
 * Construieste brief-ul de intelligence extern (web search real). async.
 * @param {object} p { topics (chei), llm (callClaudeWithMCP injectabil), nowISO }
 * @returns { at, signals:[{topic, headline, source, published, retrieved_at,
 *   reliability, confidence, internal_impact, exposed_areas, urgency,
 *   recommendation}], note } — NICIODATA fapt intern, doar semnal + inferenta.
 */
export async function buildExternalBrief({ topics = null, llm = null, nowISO = null } = {}) {
  const chosen = (topics && topics.length ? EXTERNAL_TOPICS.filter((t) => topics.includes(t.key)) : EXTERNAL_TOPICS);
  const now = nowISO || new Date().toISOString();
  const call = llm || (await import("../claude.js")).callClaudeWithMCP;

  const system =
    "Esti motorul de intelligence extern al lui JARVIS (CEO AI pentru Profi Concept, dezvoltator imobiliar in Sibiu, ansamblul Bell Residence). " +
    "Cauta pe web stiri/date RECENTE (ultimele ~2 saptamani) pe topicurile date, RELEVANTE pentru Romania/Sibiu. " +
    "Pentru FIECARE semnal gasit, mapeaza-l la impactul asupra companiei (EXTERNAL->INTERNAL). " +
    "REGULA CRITICA: informatia externa e SEMNAL, nu fapt intern de business — nu afirma nimic despre cifrele companiei. " +
    "Daca nu gasesti nimic recent pe un topic, sari peste el (nu inventa). Raspunde DOAR cu JSON valid, fara text in jur:\n" +
    '{"signals":[{"topic":"<cheie>","headline":"<scurt>","source":"<publicatie>","published":"<data sau necunoscut>",' +
    '"reliability":"high|medium|low","confidence":0-100,"exposed_areas":["cash"|"sales"|"financing"|"construction"|"tax"|"pricing"],' +
    '"internal_impact":"<o fraza: de ce conteaza pentru Bell/Profi Concept>","urgency":"low|medium|high",' +
    '"recommendation":"<o fraza: ce ar trebui monitorizat/facut>"}]}';
  const user = "Topicuri de monitorizat:\n" + chosen.map((t) => `- ${t.label} (${t.why_matters})`).join("\n") +
    "\nData curenta: " + now.slice(0, 10) + ". Cauta si mapeaza la Bell Residence / Profi Concept.";

  let signals = [];
  try {
    const raw = await call({ system, messages: [{ role: "user", content: user }], webSearch: true, maxTokens: 3000 });
    const m = String(raw || "").match(/\{[\s\S]*\}/);
    if (m) { const parsed = JSON.parse(m[0]); signals = Array.isArray(parsed.signals) ? parsed.signals : []; }
  } catch (e) { return { at: now, signals: [], error: e.message, note: "web search/parse esuat — zero semnale (nu inventez)" }; }

  // Provenienta obligatorie + marcaj EXTERNAL (I14).
  signals = signals.map((s) => ({
    topic: s.topic || "necunoscut", headline: String(s.headline || "").slice(0, 200),
    source: s.source || "necunoscut", published: s.published || "necunoscut", retrieved_at: now,
    reliability: s.reliability || "low", confidence: Number(s.confidence) || 40,
    exposed_areas: Array.isArray(s.exposed_areas) ? s.exposed_areas : [],
    internal_impact: String(s.internal_impact || "").slice(0, 300),
    urgency: s.urgency || "low", recommendation: String(s.recommendation || "").slice(0, 300),
    kind: "EXTERNAL_SIGNAL", // NU fapt intern
  }));
  return { at: now, signals, note: "Semnale EXTERNE — inferente de impact, NU fapte interne de business." };
}

/** Ruleaza + persista brief-ul, cu detectie NEW/CONFIRMED/UPDATED (§26). */
export async function runExternalScan({ topics = null, llm = null, persist = true, nowISO = null } = {}) {
  const brief = await buildExternalBrief({ topics, llm, nowISO });
  if (persist && brief.signals.length) {
    const prev = (await getState(STATE_KEY, { signals: [] })) || { signals: [] };
    const prevHeadlines = new Set((prev.signals || []).map((s) => (s.headline || "").toLowerCase().slice(0, 60)));
    for (const s of brief.signals) s.status = prevHeadlines.has((s.headline || "").toLowerCase().slice(0, 60)) ? "CONFIRMED" : "NEW";
    await setState(STATE_KEY, { at: brief.at, signals: brief.signals }).catch(() => {});
    await audit("external_intel", `${brief.signals.length} semnale externe`, brief.signals.map((s) => s.headline).join(" | ").slice(0, 400), true).catch(() => {});
  }
  return brief;
}

/** Rezumat compact pentru chat/digest (doar semnale materiale). */
export function externalForPrompt(brief) {
  const mat = (brief?.signals || []).filter((s) => s.urgency !== "low" || s.confidence >= 60);
  if (!mat.length) return "INTELLIGENCE EXTERN: niciun semnal material recent (sau web search indisponibil).";
  return "INTELLIGENCE EXTERN (semnale externe, NU fapte interne — impactul e inferenta):\n" +
    mat.slice(0, 6).map((s, i) => `${i + 1}. ${s.headline} [${s.source}, ${s.published}] → ${s.internal_impact} (urgenta ${s.urgency}, ${s.recommendation})`).join("\n");
}

// ── CONTINUOUS MODE (Faza 25-26) — dedup, novelty, credibilitate sursa. Nu news
// spam: doar EXTERNAL SIGNAL → INTERNAL EXPOSURE → IMPACT → RECOMMENDATION.
const SOURCE_CREDIBILITY = {
  bnr: 95, "banca nationala": 95, ins: 90, "institutul national": 90, eurostat: 90,
  anaf: 90, ancpi: 85, zf: 75, "ziarul financiar": 75, profit: 70, economica: 65,
  agerpres: 80, hotnews: 65, mediafax: 65, imobiliare: 60, storia: 60, necunoscut: 30,
};

/** Scor de credibilitate din numele sursei (0-100). PUR. */
export function sourceCredibility(source) {
  const n = String(source || "").toLowerCase();
  for (const [k, v] of Object.entries(SOURCE_CREDIBILITY)) if (n.includes(k)) return v;
  return SOURCE_CREDIBILITY.necunoscut;
}

/**
 * Filtreaza semnale noi fata de cele deja vazute (dedup pe headline normalizat)
 * si le scoreaza pe novelty + credibilitate. Nu declanseaza pe zgomot.
 * @returns {{ fresh, confirmed }} fresh = noi & materiale.
 */
export function classifySignals(newSignals = [], prevSignals = []) {
  const seen = new Set((prevSignals || []).map((s) => normHeadline(s.headline)));
  const fresh = [], confirmed = [];
  for (const s of newSignals || []) {
    const cred = sourceCredibility(s.source);
    const enriched = { ...s, source_credibility: cred };
    const key = normHeadline(s.headline);
    if (seen.has(key)) { enriched.novelty = "CONFIRMED"; confirmed.push(enriched); }
    else {
      enriched.novelty = "NEW";
      // material = credibil SAU urgent SAU incredere ridicata (altfel = zgomot).
      const material = cred >= 60 || s.urgency === "high" || (Number(s.confidence) || 0) >= 65;
      if (material) fresh.push(enriched);
    }
  }
  return { fresh, confirmed };
}

function normHeadline(h) { return String(h || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 60); }

/** Detecteaza intrebari despre lumea externa. */
export function asksExternal(text) {
  const n = String(text || "").toLowerCase();
  return /(ce se (intampla|petrece) in (lume|piata|afara)|stiri|noutati (din )?piata|dobanzi|curs(ul)? (euro|eur|valutar)|piata imobiliara|concurenta|ce ne afecteaza|context (extern|economic)|ce se schimba in (lume|economie|piata))/.test(n);
}
