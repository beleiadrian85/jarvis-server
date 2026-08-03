// MODEL ROUTER (§10-§11, §17-§19) — alege providerul dupa: clasa datelor (matrice de
// acces; RESTRICTED nu la externi), potrivirea pe task/capabilitate, cost, latenta,
// disponibilitate si performanta istorica. Returneaza un LANT de fallback ordonat, toti
// admisibili pentru clasa de date. Deterministic. Fail-closed daca nimic sigur.
import { PROVIDERS, enabledProviders, providerAllowsClass, capabilityProfile } from "./registry.js";
import { config } from "../../config.js";

const COST_RANK = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
const TASK_CAP = { managerial: "managerial", strategy: "strategy", research: "research", draft: "drafting", reasoning: "reasoning", brainstorm: "brainstorm", document: "document_analysis", classify: "reasoning" };

/**
 * @param {object} p { task, sensitivity, prefer, needsTools, needsSchema, perf (map id→scor) }
 * @returns { provider|null, reason, candidates[] (lant fallback, admisibili) }
 */
export function route(p = {}) {
  const mm = config.multiModel || {};
  if (!mm.enabled) return { provider: null, reason: "Multi-Model OFF", candidates: [] };

  const sensitivity = String(p.sensitivity || "INTERNAL").toUpperCase();
  if (mm.dataRouting === false && sensitivity === "RESTRICTED")
    return { provider: null, reason: "Data Routing OFF dar date RESTRICTED — refuz egress (fail-closed)", candidates: [] };

  // Admisibili: activi + au voie sa vada clasa de date + capabilitati necesare.
  let avail = enabledProviders().filter((id) => providerAllowsClass(id, sensitivity));
  if (p.needsTools) avail = avail.filter((id) => PROVIDERS[id].supports_tools);
  if (p.needsSchema) avail = avail.filter((id) => PROVIDERS[id].supports_json_schema);
  if (!avail.length) return { provider: null, reason: sensitivity === "RESTRICTED" ? "date RESTRICTED si niciun model privat/local activ" : "niciun provider admisibil pentru clasa de date/capabilitati", candidates: [] };

  const want = TASK_CAP[p.task] || "reasoning";
  const perf = p.perf || {};
  const score = (id) => {
    const P = PROVIDERS[id];
    let s = 0;
    if (P.capabilities.includes(want)) s += 100;                 // potrivire pe task
    s += (3 - (COST_RANK[P.cost_class] ?? 2)) * 5;               // mai ieftin = mai bine
    if (P.trust === "private" && sensitivity !== "PUBLIC" && sensitivity !== "INTERNAL") s += 20; // date sensibile → prefera privat
    if (typeof perf[id] === "number") s += perf[id] * 10;        // performanta istorica (§22)
    return s;
  };
  const ranked = avail.slice().sort((a, b) => score(b) - score(a));

  // Preferinta explicita, daca e admisibila → in fata lantului.
  let chain = ranked;
  if (p.prefer && ranked.includes(p.prefer)) chain = [p.prefer, ...ranked.filter((id) => id !== p.prefer)];

  return { provider: chain[0], reason: `task=${p.task || "reasoning"} (${want}), clasa=${sensitivity}, lant=${chain.join(">")}`, candidates: chain, profiles: chain.map(capabilityProfile) };
}
