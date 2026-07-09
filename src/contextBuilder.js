/**
 * C4 — Context Builder (PUR, sincron, fara IO/DB/MCP/LLM).
 *
 * Responsabilitate unica: pentru o ruta (decisa de decisionEngine), decide
 * CE CONTEXT trebuie incarcat inainte de a chema un model. NU incarca datele —
 * intoarce un "plan de context" (flag-uri boolean per sursa). Un loader viitor
 * (neconstruit aici) va executa planul. Nu cheama Claude/OpenAI, nu face tool-uri.
 */

// Toate sursele de context posibile → shape STABIL (usor de testat).
export const SOURCES = [
  "capabilities", "limitations", "operational", "reports", "memory",
  "history", "weather", "calendar", "gmail", "drive", "reminders",
  "codebase", "date",
];

// Ce sursa depinde de ce capabilitate (pentru pruning optional, cand se dau capabilities).
const SOURCE_CAP = {
  operational: "operational",
  reports: "operational",
  gmail: "gmail",
  calendar: "googleCalendar",
  drive: "drive",
  memory: "memory",
  history: "memory",
  reminders: "memory",
  // weather / capabilities / limitations / codebase / date → mereu disponibile
};

// Planul de context per ruta (ce se incarca). `date` e mereu inclus separat.
const ROUTE_PLAN = {
  simple:             ["history", "memory", "capabilities"],
  operational_read:   ["operational"],
  report:             ["weather", "calendar", "gmail", "operational", "reminders"],
  strategy:           ["operational", "reports", "memory", "history", "capabilities", "limitations"],
  council:            ["memory", "reports", "operational"],
  action_propose:     ["operational", "capabilities"],
  email:              ["gmail", "history"],
  draft:              ["gmail", "history"],
  drive:              ["drive"],
  memory:             ["memory"],
  clarify:            ["capabilities", "limitations"],
  capability_missing: ["capabilities", "limitations"],
  codebase:           ["capabilities", "codebase", "limitations"],
  confirm:            [],
};

function blankPlan() {
  const o = {};
  for (const s of SOURCES) o[s] = false;
  return o;
}

/**
 * buildContext(text, route, opts?) → plan de context (obiect cu flag-uri boolean).
 * - text: mesajul utilizatorului (rezervat pentru rafinari viitoare; planul e pe ruta).
 * - route: ruta decisa de decisionEngine (sau "codebase"/"capability_missing").
 * - opts.capabilities: optional — daca se dau, se elimina sursele indisponibile (pruning).
 */
export function buildContext(text, route, opts = {}) {
  const plan = blankPlan();
  plan.date = true; // JARVIS stie mereu data curenta.

  const wanted = ROUTE_PLAN[route] || ["capabilities"]; // fallback prudent pt ruta necunoscuta
  for (const s of wanted) if (s in plan) plan[s] = true;

  // Pruning optional: nu incarca surse a caror capabilitate lipseste.
  if (opts.capabilities) {
    for (const s of SOURCES) {
      const cap = SOURCE_CAP[s];
      if (plan[s] && cap && opts.capabilities[cap] === false) plan[s] = false;
    }
  }
  return plan;
}

/** Lista surselor de incarcat (cheile true) — utila pentru loader si teste. */
export function neededSources(context) {
  return Object.keys(context).filter((k) => context[k]);
}
