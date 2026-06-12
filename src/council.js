import { callClaude } from "./claude.js";
import { recall } from "./memory.js";
import { audit } from "./audit.js";

/**
 * Consiliul AI (constitutie, Faza 4): 5 perspective intr-UN singur apel
 * structurat, incheiat cu RECOMANDARE FINALA DA / NU / AMANA.
 * Se cheama explicit ("Jarvis, consiliu ...") sau automat la decizii >50k EUR.
 */
const COUNCIL_SYSTEM =
  "Esti un consiliu de 5 experti care analizeaza o decizie de business pentru Adi " +
  "(PROFI CONCEPT, dezvoltare imobiliara in Sibiu). Intr-UN SINGUR raspuns structurat, " +
  "in romana, dai cinci perspective DISTINCTE, fiecare 2-4 fraze, directe, fara umplutura:\n" +
  "1. CFO — lichiditate, cash-flow, impact financiar pe termen scurt.\n" +
  "2. Expert contabil — fiscalitate, TVA, implicatii contabile.\n" +
  "3. Jurist — riscuri juridice, contracte, conformitate.\n" +
  "4. Dezvoltator imobiliar — piata, vanzari, executie, timing.\n" +
  "5. Bancher — bancabilitate, finantare, garantii.\n" +
  "Apoi sectiunea 'RECOMANDARE FINALA:' cu exact una din DA / NU / AMANA + argumentare scurta.\n" +
  "Ierarhie suverana la conflict: lichiditate > profit > reducerea riscului > viteza. " +
  "Foloseste contextul din memorie daca exista; nu inventa cifre.";

export async function runCouncil(question) {
  const memories = await recall(question, 8).catch(() => []);
  const ctx = memories.length
    ? "\n\nCONTEXT DIN MEMORIE:\n" + memories.map((m) => `[${m.category}] ${m.fact}`).join("\n")
    : "";
  const out = await callClaude({
    system: COUNCIL_SYSTEM,
    messages: [{ role: "user", content: `Decizia/subiectul de analizat:\n${question}${ctx}` }],
    maxTokens: 1600,
  });
  await audit("consiliu", question.slice(0, 200), `5 perspective${memories.length ? " + memorie" : ""}`);
  return out;
}

/**
 * Heuristica: impactul depaseste 50.000 EUR? (declanseaza consiliul automat)
 * Prinde "50000", "50.000", "120 mii", "0.2 mil", "200k", cu eur/euro/€ in jur.
 */
export function impactOver50k(text) {
  const t = (text || "").toLowerCase().replace(/ /g, " ");
  // milioane
  if (/(\d+(?:[.,]\d+)?)\s*(mil|milioane|mln)/.test(t)) {
    const m = t.match(/(\d+(?:[.,]\d+)?)\s*(mil|milioane|mln)/);
    if (parseFloat(m[1].replace(",", ".")) >= 0.05) return true;
  }
  // mii / k
  let mm;
  const reMii = /(\d+(?:[.,]\d+)?)\s*(mii|k)\b/g;
  while ((mm = reMii.exec(t))) {
    if (parseFloat(mm[1].replace(",", ".")) >= 50) return true;
  }
  // numere brute, optional cu separatori de mii
  let nm;
  const reNum = /(\d{1,3}(?:[.\s]\d{3})+|\d{4,})/g;
  while ((nm = reNum.exec(t))) {
    const val = parseInt(nm[1].replace(/[.\s]/g, ""), 10);
    if (val >= 50000) return true;
  }
  return false;
}
