// EXECUTIVE BOARD — clasificarea deciziei + selectia directorilor relevanti.
// Functii PURE (regex peste text normalizat). Nu se convoaca toti directorii
// pentru orice intrebare (disciplina de cost din CODEX).
import { norm } from "../lib/text.js";

export const DECISION_TYPES = ["investment", "hiring", "technical", "marketing", "contract", "general"];

// Matricea oficiala de selectie (BOARD_MEETING_PROTOCOL.md).
export const SELECTION = {
  investment: ["CEO", "CFO", "COO", "CRO", "CLO", "CSO", "CMO", "GUARDIAN", "FOUNDER_VOICE", "INNOVATION"],
  hiring:     ["CEO", "COO", "CHRO", "CFO", "GUARDIAN", "FOUNDER_VOICE"],
  technical:  ["CEO", "CTO", "COO", "CRO", "GUARDIAN"],
  marketing:  ["CEO", "CMO", "CSO", "CFO", "CRO"],
  contract:   ["CEO", "CLO", "CFO", "COO", "CRO"],
  general:    ["CEO", "CFO", "COO", "CRO", "GUARDIAN"],
};

/** Tipul deciziei, dedus determinist din text. Prima potrivire castiga. */
export function classifyDecision(text) {
  const n = norm(text || "");
  if (/(angaj|concedi|demisi|recrut|interviu|salari[uz]|marire de salariu|post nou|fisa postului|om nou in echipa|inlocui(m|re).*(om|angajat)|mentorat)/.test(n)) return "hiring";
  if (/(contract|clauz|act aditional|notar|semnam|semnarea|acord cadru|parteneriat|antrepriz|furnizor nou|licitati)/.test(n)) return "contract";
  if (/(campanie|marketing|brand|reclam|promovare|\bads\b|google ads|meta ads|social media|lansare pe piata|pret de lista|pozitionare)/.test(n)) return "marketing";
  if (/(tehnic|arhitectur|software|server|automatiz|integrare|aplicati|sistem nou|migrare|refactor|deploy|infrastructur)/.test(n)) return "technical";
  if (/(investi|achiziti|cumpar(am|a|are)? (teren|utilaj|echipament|apartament|imobil|actiuni)|proiect nou|extindere|dezvoltare noua|credit nou|finantare|imprumut|capital nou|leasing nou)/.test(n)) return "investment";
  return "general";
}

/** Directorii convocati pentru un tip de decizie (copie, nu referinta). */
export function selectDirectors(type) {
  return [...(SELECTION[type] || SELECTION.general)];
}
