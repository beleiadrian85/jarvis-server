// MODEL ROUTER (§10, §17-§19) — alege providerul dupa: (1) clasa datelor implicate
// (RESTRICTED nu merge la externi), (2) potrivirea pe task, (3) disponibilitate.
// Deterministic. Daca nimic nu se potriveste in siguranta → nu ruteaza (fail-closed).
import { PROVIDERS, enabledProviders } from "./registry.js";
import { config } from "../../config.js";

const CLASS_ORDER = { PUBLIC: 0, INTERNAL: 1, CONFIDENTIAL: 2, HIGHLY_CONFIDENTIAL: 3, RESTRICTED: 4 };

/** Providerul are voie sa vada aceasta clasa de date? */
function providerAllowsClass(id, sensitivity) {
  const p = PROVIDERS[id];
  const lvl = CLASS_ORDER[sensitivity] ?? 1;
  if (p.trust === "external") return lvl <= CLASS_ORDER.HIGHLY_CONFIDENTIAL; // RESTRICTED niciodata la extern
  return true; // private/local pot vedea orice (redactat)
}

/**
 * @param {object} p { task ('managerial'|'strategy'|'research'|'draft'|'reasoning'),
 *   sensitivity, prefer (id optional) }
 * @returns { provider|null, reason, candidates[] }
 */
export function route(p = {}) {
  const mm = config.multiModel || {};
  if (!mm.enabled) return { provider: null, reason: "Multi-Model OFF", candidates: [] };
  if (mm.dataRouting === false && (p.sensitivity === "RESTRICTED")) return { provider: null, reason: "Data Routing OFF dar date RESTRICTED — refuz egress (fail-closed)", candidates: [] };

  const sensitivity = p.sensitivity || "INTERNAL";
  const avail = enabledProviders().filter((id) => providerAllowsClass(id, sensitivity));
  if (!avail.length) return { provider: null, reason: sensitivity === "RESTRICTED" ? "date RESTRICTED si niciun model privat/local activ" : "niciun provider activ pentru clasa de date", candidates: [] };

  // Preferinta explicita, daca e valida.
  if (p.prefer && avail.includes(p.prefer)) return { provider: p.prefer, reason: "preferinta explicita", candidates: avail };

  // Potrivire pe task (strengths).
  const taskMap = { managerial: "managerial", strategy: "strategy", research: "research", draft: "drafting", reasoning: "reasoning", brainstorm: "brainstorm" };
  const want = taskMap[p.task] || "reasoning";
  const ranked = avail.slice().sort((a, b) => (PROVIDERS[b].strengths.includes(want) ? 1 : 0) - (PROVIDERS[a].strengths.includes(want) ? 1 : 0));
  return { provider: ranked[0], reason: `potrivit pe task=${p.task || "reasoning"} (${want})`, candidates: ranked };
}
