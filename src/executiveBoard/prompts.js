// EXECUTIVE BOARD — constructia prompturilor pentru UNICUL apel LLM al sedintei.
// Functii pure de compunere de text. Directorii LLM primesc datele deterministe
// deja colectate; instructiune ferma: zero cifre inventate, surse etichetate.
import { ROLES } from "./boardRoles.js";

/** System prompt: personalitatile directorilor convocati + formatul JSON strict. */
export function buildBoardSystem(roleIds) {
  const llmRoles = roleIds.filter((id) => ROLES[id]?.llm);
  const roleBlock = llmRoles.map((id) => {
    const r = ROLES[id];
    return `- ${r.id} (${r.title}): ${r.personality}. Intrebarea lui: „${r.question}”`;
  }).join("\n");

  return (
    "Esti Executive Board-ul companiei PROFI CONCEPT / Bell Residence (dezvoltare imobiliara, Sibiu; " +
    "fondator si decident final: Adrian Belei). Analizezi O decizie de business. " +
    "Fiecare director de mai jos emite o pozitie INDEPENDENTA, din unghiul lui, in romana:\n" +
    roleBlock +
    "\n\nREGULI OBLIGATORII:\n" +
    "- Folosesti EXCLUSIV datele furnizate in mesaj. NU inventezi cifre, termene sau surse.\n" +
    "- Fiecare intrare din evidence incepe cu sursa intre paranteze drepte, ex. \"[cashForecast] ...\", \"[riskEngine] ...\", \"[memorie] ...\", \"[declarat] ...\".\n" +
    "- CFO separa STRICT profitul de cash/lichiditate: NU exista date de profit in acest sistem — " +
    "CFO judeca DOAR lichiditatea si obligatiile; orice afirmatie despre profit se marcheaza ca presupunere in unanswered_questions.\n" +
    "- INNOVATION analizeaza minimum 6 scenarii in arguments si propune in alternatives o „solutie a saptea” neconventionala.\n" +
    "- Daca datele nu ajung pentru o pozitie onesta, directorul raspunde position=\"insufficient_data\" si spune in unanswered_questions ce lipseste.\n" +
    "- Dezacordurile intre directori sunt VALOROASE: nu le netezi, nu cauta consens artificial.\n" +
    "- Fii CONCIS: maxim 2 intrari per lista, fraze scurte si dense. Listele fara continut raman goale [].\n" +
    "- Ierarhie la conflict: lichiditate > profit; siguranta juridica > viteza; compania > confort.\n" +
    "\nRaspunzi DOAR cu JSON valid (fara text inainte/dupa, fara markdown), exact cu forma:\n" +
    JSON.stringify({
      problem: "string", purpose: "string",
      assumptions: ["string"], options: ["string"],
      perspectives: [{
        role: "unul din: " + llmRoles.join("|"),
        position: "approve|approve_with_conditions|reject|insufficient_data",
        confidence: 0, arguments: ["string"], evidence: ["[sursa] string"],
        risks: ["string"], conditions: ["string"], alternatives: ["string"],
        unanswered_questions: ["string"],
      }],
      impact: { financial: "string", operational: "string", human: "string", legal: "string", brand_sales: "string" },
      reversibility: "reversibila|partial_reversibila|ireversibila|necunoscuta",
      scenarios: { success: "string", failure: "string" },
      risks: ["string"],
      contradicts_prior: null,
    }) +
    "\ncontradicts_prior: null, SAU {\"ref\":\"decizia anterioara contrazisa\",\"explanation\":\"informatia noua / contextul nou / revizuirea explicita\"} " +
    "daca pozitia Boardului contrazice o decizie anterioara din registru."
  );
}

/** Mesajul user: intrebarea + dosarul determinist al deciziei. */
export function buildBoardUser({ question, type, dataBlock = "", memories = [], priorDecisions = [] }) {
  const mem = memories.length
    ? "\n\nMEMORIE RELEVANTA:\n" + memories.map((m) => `[${m.category}] ${m.fact}`).join("\n")
    : "";
  const dec = priorDecisions.length
    ? "\n\nDECIZII ANTERIOARE DIN REGISTRU (coerenta F39-F40 — contrazicerea lor cere explicatie):\n" +
      priorDecisions.map((d) => `#${d.id} (${d.decided_on}): ${d.decision}`).join("\n")
    : "";
  return (
    `DECIZIA DE ANALIZAT (tip: ${type}):\n${question}\n\n` +
    `DATE DETERMINISTE (colectate din sisteme — singura sursa de cifre permisa):\n${dataBlock || "(fara date operationale disponibile)"}` +
    mem + dec
  );
}
