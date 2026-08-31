// AUTO-INGEST SELECTIV (Faza 7). Memoria NU e jurnal. Salvam AUTOMAT doar categorii cu
// valoare pe termen lung, declarate clar de fondator: DECISION / POLICY / STABLE_FACT /
// RESPONSIBILITY / PREFERENCE / COMMITMENT. NU salvam statusuri triviale, mesaje sociale,
// fiecare task/email/observatie, sau date volatile care exista deja in Operational.
// Scrierea trece prin memoria proprie (Write Gate: secrete blocate, dedup, gated de flag).
import { config } from "../../config.js";

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Tipare CONSERVATOARE (declaratii clare, nu ghiciri). Fiecare → o categorie.
const RULES = [
  { cat: "RESPONSIBILITY", rx: /\b(raspunde de|se ocupa de|e responsabil (de|pe)|este responsabil (de|pe)|owner(ul)? (pe|de)|gestioneaza (zona|domeniul|partea de)|preia (zona|domeniul))\b/, min: 0.6 },
  { cat: "POLICY", rx: /\b(regula (e|este)|politica (e|este)|nu (se )?accept[ae]|niciodata sa nu|intotdeauna sa|obligatoriu (sa|e)|standardul (e|este)|regula generala)\b/, min: 0.7 },
  { cat: "DECISION", rx: /\b(am decis|s-a decis|am hotarat|s-a hotarat|hotaram|mergem cu|am ales|alegem|decizia (e|este|finala)|ramane (stabilit|decis)|s-a stabilit sa)\b/, min: 0.65 },
  { cat: "STABLE_FACT", rx: /\b(expira (la|pe|in)|scadent[aă]? (la|pe|in)|valabil pana (la|in)|contractul.*(expira|pana la)|termenul contractual (e|este)|se termina (contractul|mandatul) (la|pe))\b/, min: 0.6 },
  { cat: "COMMITMENT", rx: /\b(ma angajez sa|ne angajam sa|am promis (ca|sa)|promit (ca|sa)|livram pana (la|pe)|termen ferm|deadline ferm|garantez (ca|pana))\b/, min: 0.6 },
  { cat: "PREFERENCE", rx: /\b(prefer (sa|ca)|imi place (sa|cand)|vreau (mereu|de fiecare data)|de obicei aleg|stilul meu (e|este)|mereu (sa|vreau sa)|nu-mi place (sa|cand))\b/, min: 0.55 },
];

/**
 * Clasifica un enunt drept candidat de memorie. Conservator: majoritatea → null.
 * @returns { category, statement, confidence } | null
 */
export function classifyMemoryCandidate(text) {
  const t = norm(text);
  if (t.length < 12 || t.length > 600) return null; // prea scurt = trivial; prea lung = conversatie
  // exclude intrebari (nu declaratii) si mesaje sociale.
  if (/[?]/.test(text) || /^(salut|buna|mersi|multumesc|ok|bine|noapte buna|hai)\b/.test(t)) return null;
  for (const r of RULES) {
    if (r.rx.test(t)) return { category: r.cat, statement: String(text).trim().slice(0, 400), confidence: r.min };
  }
  return null;
}

/**
 * Scrie selectiv un candidat in memoria pe termen lung, prin helperii tipati (Write Gate).
 * Gated de config.memory.longTerm. @returns { stored, category, reason }
 */
export async function autoIngest(cand, { source = "chat", source_id = null, store = null } = {}) {
  if (!cand || !cand.category) return { stored: false, reason: "no_candidate" };
  if (config.memory?.longTerm !== true) return { stored: false, reason: "memory_off" };
  const mem = await import("./index.js");
  const base = { title: cand.statement.slice(0, 90), content: cand.statement, source_type: source, source_reference: source_id, verification_status: "DECLARED", confidence: cand.confidence, structured_data: { category: cand.category, auto_ingested: true } };
  try {
    switch (cand.category) {
      case "DECISION": return { ...(await mem.rememberDecision({ situation: cand.statement.slice(0, 90), choice: cand.statement, reason: "decizie declarata de fondator", ...base }, { store })), category: "DECISION" };
      case "POLICY": // fondatorul o declara explicit → founder_approved.
        return { ...(await mem.rememberPolicy({ ...base }, { store, founder_approved: true })), category: "POLICY" };
      case "PREFERENCE": return { ...(await mem.rememberPreference({ preference: cand.statement, ...base }, { store })), category: "PREFERENCE" };
      case "STABLE_FACT":
      case "COMMITMENT": return { ...(await mem.rememberFact({ ...base }, { store })), category: cand.category };
      case "RESPONSIBILITY": return { ...(await mem.rememberFact({ ...base }, { store })), category: "RESPONSIBILITY" };
      default: return { stored: false, reason: "unknown_category" };
    }
  } catch (e) { return { stored: false, reason: e.message }; }
}

/** Din mesajul fondatorului: clasifica + ingesteaza (best-effort, selectiv). */
export async function autoIngestFromMessage(text, opts = {}) {
  const cand = classifyMemoryCandidate(text);
  if (!cand) return { stored: false, reason: "not_memorable" };
  return autoIngest(cand, opts);
}
