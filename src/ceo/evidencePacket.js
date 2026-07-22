// CEO EVIDENCE PACKET (Partea III-V) — contextul DETERMINIST pe care orice
// raspuns managerial il primeste, ca sa porneasca din ACEEASI realitate (nu din
// ce inventeaza modelul). Reutilizeaza: organismul Nervous persistat, Action
// Ledger, Source Truth, whoNeedsToDoWhat. Read-only, ieftin (jarvis_state).
// "UN SINGUR ADEVAR" — chat, board, rapoarte pot folosi acelasi packet.
import { getState } from "../state.js";
import { isOwnershipQuestion, isFounderActionsQuestion } from "../intents.js";
import { asksAboutRequests } from "./actionLedger.js";

// Intent-urile canonice (Partea IV).
export const INTENTS = ["FOUNDER_ACTIONS", "REQUEST_HISTORY", "OWNERSHIP", "CASH", "SALES", "TASKS", "PEOPLE", "RISK", "SOURCE_ACCESS", "CAPABILITY", "DECISION", "GENERAL"];

/** Detecteaza intent-urile unei intrebari (mai multe posibile). Determinist. */
export function detectIntents(text) {
  const n = String(text || "").toLowerCase();
  const out = new Set();
  if (isFounderActionsQuestion(text)) out.add("FOUNDER_ACTIONS");
  if (asksAboutRequests(text).about) out.add("REQUEST_HISTORY");
  if (isOwnershipQuestion(text)) out.add("OWNERSHIP");
  if (/\b(cash|sold|lichidit|deficit|bani|cont|banc)/.test(n)) out.add("CASH");
  if (/\b(vanzar|rezervar|unitat|apartament|avans|client|bell)/.test(n)) out.add("SALES");
  if (/\b(task|restant|termen|deadline|de facut|blocaj|blocat)/.test(n)) out.add("TASKS");
  if (/\b(nelu|dana|mihaela|echipa|oameni|supraincarcat|workload)/.test(n)) out.add("PEOPLE");
  if (/\b(risc|pericol|expunere)/.test(n)) out.add("RISK");
  if (/\b(smartbill|gmail|email|calendar|banca|ing|conectat|acces|sursa|surse|poti (citi|verifica|accesa))/.test(n)) out.add("SOURCE_ACCESS");
  if (/\b(poti|capabilit|stii sa|esti in stare|ce nu poti|ce iti lipseste)/.test(n)) out.add("CAPABILITY");
  if (out.size === 0) out.add("GENERAL");
  return [...out];
}

/**
 * Construieste packet-ul de evidenta pentru intent-urile date. Read-only din
 * jarvis_state (organismul Nervous persistat + ceo:context). Returneaza facts
 * relevante + clasificarea (fact/derived/unknown). Nu arunca niciodata.
 */
export async function buildEvidencePacket({ text = "", intents = null } = {}) {
  const ints = intents || detectIntents(text);
  const packet = { at: new Date().toISOString(), intents: ints, facts: {} };
  try {
    const organism = (await getState("ceo:nervous:last", null)) || {};
    const ceoCtx = (await getState("ceo:context", null)) || {};
    const f = packet.facts;

    // FOUNDER_ACTIONS (Partea V): DOAR ce cere autoritatea fondatorului.
    if (ints.includes("FOUNDER_ACTIONS")) {
      f.founder_required = organism.needs_founder || [];
      f.dana_handles = (organism.what_i_need || []).filter((n) => n.owner_hint === "dana").map((n) => n.title);
      f.nelu_handles = (organism.what_i_need || []).filter((n) => n.owner_hint === "nelu").map((n) => n.title);
      f.jarvis_tracking = (organism.what_i_asked || []).map((a) => a.title).filter(Boolean).slice(0, 5);
      f.founder_note = (organism.needs_founder || []).length ? null : "Adrian nu are nicio actiune operationala necesara acum — echipa si JARVIS acopera.";
    }
    // OWNERSHIP: doar rolurile CONFIRMATE; restul UNKNOWN (nu inventa).
    if (ints.includes("OWNERSHIP")) {
      f.confirmed_roles = { dana: "cifre/contabilitate/financiar/documente", nelu: "executie/santier/materiale/furnizori operationali", adrian: "fondator/decizii/capital/strategie" };
      f.ownership_rule = "Alti owneri (director financiar, manager riscuri, echipa vanzari) = UNKNOWN pana la dovada. NU inventa.";
    }
    // CASH: sold verificat vs necesar; fara sold → lichiditate neta UNKNOWN.
    if (ints.includes("CASH")) {
      f.cash = { min_verificat: ceoCtx.cash_min ?? null, receivables: ceoCtx.receivables ?? null, note: "Fara sold bancar verificat, lichiditatea NETA = UNKNOWN. Bank NOT_CONNECTED — soldul vine prin om." };
    }
    // PEOPLE: incarcarea reala (din organism), fara moralizare.
    if (ints.includes("PEOPLE")) {
      f.people_load = (organism.people_load || []).map((d) => `${d.person_id}: ${d.key}`);
      f.workload_reviews = organism.workload_reviews || {};
    }
    // TASKS: ce vede organismul (nu inventa).
    if (ints.includes("TASKS")) {
      f.open_tasks = organism.what_i_see?.open_tasks ?? null;
      f.watchdog = (organism.watchdog || []).map((w) => `${w.title}: ${w.action}`);
    }
    // Datele lipsa raman UNKNOWN, declarat.
    if (!Object.keys(f).length) f.note = "Fara date manageriale specifice — raspuns pe intent general, cu grounding din Source Truth.";
  } catch (e) { packet.error = e.message; }
  return packet;
}

/**
 * Raspuns DETERMINIST la "ce am eu de facut?" (Partea V) — nu lasa modelul sa
 * inventeze o lista de sarcini pentru fondator. Structura TU/DANA/NELU/JARVIS.
 * Returneaza string user-facing sau null daca nu se poate (fallback la chat).
 */
export async function founderActionsAnswer() {
  try {
    const organism = (await getState("ceo:nervous:last", null));
    if (!organism) return null;
    // Partea VIII — curata codurile interne (#XXXXXX) din textul catre om.
    const clean = (s) => String(s || "").replace(/\s*#[A-Z0-9]{5,6}\b:?/g, "").replace(/\s+/g, " ").trim();
    const founder = (organism.needs_founder || []).map(clean);
    const dana = (organism.what_i_need || []).filter((n) => n.owner_hint === "dana").map((n) => clean(n.title));
    const nelu = (organism.what_i_need || []).filter((n) => n.owner_hint === "nelu").map((n) => clean(n.title));
    const jarvis = (organism.what_i_asked || []).map((a) => clean(a.title)).filter(Boolean);
    const L = [];
    L.push("👤 TU, ADRIAN (doar ce cere autoritatea ta):");
    if (founder.length) founder.forEach((x) => L.push(`  • ${x}`));
    else L.push("  • Nimic operational necesar acum — echipa si JARVIS acopera. Te implic doar pentru decizii/capital/negocieri/contracte.");
    if (dana.length) { L.push("\n💰 DANA gestioneaza (JARVIS ii cere, nu tu):"); dana.slice(0, 4).forEach((x) => L.push(`  • ${x}`)); }
    if (nelu.length) { L.push("\n🔧 NELU gestioneaza (JARVIS il urmareste, nu tu):"); nelu.slice(0, 4).forEach((x) => L.push(`  • ${x}`)); }
    if (jarvis.length) { L.push("\n🤖 JARVIS urmareste singur:"); jarvis.slice(0, 5).forEach((x) => L.push(`  • ${x}`)); }
    return L.join("\n");
  } catch { return null; }
}

/** Instructiune + facts pentru injectare in chat (Partea IV: fidelitate de intent). */
export function packetForPrompt(packet) {
  const f = packet.facts || {};
  let s = `EVIDENCE PACKET (intent: ${packet.intents.join("+")}) — porneste raspunsul de aici, nu inventa:\n`;
  if (f.founder_required) {
    s += `• DECIZII CARE CER AUTORITATEA LUI ADRIAN (din organism): ${f.founder_required.length ? f.founder_required.join("; ") : "NICIUNA"}\n`;
    s += `• Dana gestioneaza (NU Adrian): ${f.dana_handles?.join("; ") || "-"}\n• Nelu gestioneaza (NU Adrian): ${f.nelu_handles?.join("; ") || "-"}\n• JARVIS urmareste singur (NU Adrian): ${f.jarvis_tracking?.join("; ") || "-"}\n`;
    if (f.founder_note) s += `• ${f.founder_note}\n`;
    s += "REGULA ABSOLUTA (founder filter, Partea V): Adrian primeste DOAR: decizii de aprobat, negocieri majore, capital/finantare, angajamente contractuale/juridice, exceptii. " +
      "NU-i da lui Adrian sarcini de tip 'cere Danei X' / 'monitorizeaza Y' / 'urmareste Z' / 'verifica task' — ALEA LE FACE JARVIS sau echipa, NU Adrian. " +
      "Daca lista de decizii care cer autoritatea lui e goala, raspunzi EXACT: 'Nu ai nicio actiune operationala necesara acum — echipa si JARVIS acopera.' " +
      "Structura raspunsului: TU (doar decizii), DANA, NELU, JARVIS.\n";
  }
  if (f.confirmed_roles) {
    s += `• Roluri confirmate: Dana=${f.confirmed_roles.dana}; Nelu=${f.confirmed_roles.nelu}; Adrian=${f.confirmed_roles.adrian}\n• ${f.ownership_rule}\n`;
    s += "REGULA (intent fidelity): la 'cine se ocupa de X' raspunzi DESPRE OWNER, NU cu o lista de riscuri/task-uri.\n";
  }
  if (f.cash) s += `• Cash: min verificat=${JSON.stringify(f.cash.min_verificat)}; ${f.cash.note}\n`;
  if (f.people_load) s += `• Incarcare oameni: ${f.people_load.join("; ") || "-"}\n`;
  if (f.open_tasks != null) s += `• Task-uri deschise: ${f.open_tasks}; watchdog: ${f.watchdog?.slice(0, 4).join("; ") || "-"}\n`;
  if (f.note) s += `• ${f.note}\n`;
  s += "INTENT FIDELITY: raspunde la intrebarea PUSA, nu la alta.";
  return s;
}
