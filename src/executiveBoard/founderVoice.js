// EXECUTIVE BOARD — Founder Voice. DETERMINIST, zero LLM, zero IO.
// Citeaza EXCLUSIV principiile documentate ale fondatorului (F01-F40, sursa:
// codex/02-founder-dna/FOUNDER_DNA.md). Nu inventeaza opinii; cand nu exista
// principii relevante documentate → insufficient_data, cu semnalare explicita.

export const FOUNDER_PRINCIPLES = [
  { id: "F01", text: "CEO AI a fost creat pentru ca Adrian sa nu mai gandeasca singur dezvoltarea companiei.", tags: ["ai"] },
  { id: "F02", text: "AI consulta si verifica, dar nu il inlocuieste pe fondator.", tags: ["ai"] },
  { id: "F03", text: "Adevarul este mai important decat confortul.", tags: ["adevar", "core"] },
  { id: "F04", text: "CEO AI poate si trebuie sa il contrazica argumentat pe Adrian.", tags: ["ai"] },
  { id: "F05", text: "Adrian ramane decidentul final.", tags: ["decizie", "core"] },
  { id: "F06", text: "Compania trebuie sa devina independenta de fondator in executia zilnica.", tags: ["companie", "oameni"] },
  { id: "F07", text: "Timpul este mai valoros decat banii.", tags: ["timp", "bani", "core"] },
  { id: "F08", text: "Caracterul este mai important decat diferenta mica de performanta.", tags: ["oameni"] },
  { id: "F09", text: "Competenta poate fi dezvoltata prin mentorat.", tags: ["oameni"] },
  { id: "F10", text: "Rabdarea se termina cand omul incepe sa oboseasca sau sa traga in jos compania.", tags: ["oameni"] },
  { id: "F11", text: "Greseala poate fi iertata; repetarea aceleiasi greseli arata lipsa invatarii.", tags: ["oameni"] },
  { id: "F12", text: "Omul care recunoaste rapid greseala si vine cu solutii poate pastra increderea.", tags: ["oameni"] },
  { id: "F13", text: "Minciuna, manipularea si ascunderea pentru autoprotectie distrug increderea.", tags: ["oameni", "redline"] },
  { id: "F14", text: "Salariul recompenseaza contributia, nu functia.", tags: ["oameni", "bani"] },
  { id: "F15", text: "Un specialist poate castiga mai mult decat managerul sau.", tags: ["oameni", "bani"] },
  { id: "F16", text: "Linistea financiara a unui om poate creste valoarea produsa.", tags: ["oameni", "bani"] },
  { id: "F17", text: "Nicio persoana nu este indispensabila, inclusiv fondatorul.", tags: ["oameni", "companie"] },
  { id: "F18", text: "Profitul nu trebuie obtinut prin ranirea deliberata a oamenilor.", tags: ["oameni", "redline"] },
  { id: "F19", text: "Cand compania ajuta, se cauta varianta in care beneficiarul isi asuma responsabilitatea si costul.", tags: ["oameni", "bani"] },
  { id: "F20", text: "Un NU trebuie insotit de cautarea unei alternative.", tags: ["decizie", "clienti"] },
  { id: "F21", text: "Specialistul trebuie contestat fara a transforma discutia intr-o lupta de orgolii.", tags: ["decizie", "oameni"] },
  { id: "F22", text: "Cand un specialist spune „nu se poate”, se separa: imposibil tehnic / imposibil legal / imposibil in buget / imposibil in termen / imposibil cu metoda actuala / necunoastere sau limita personala.", tags: ["decizie", "tehnic"] },
  { id: "F23", text: "Deciziile reversibile trebuie testate repede.", tags: ["decizie", "risc"] },
  { id: "F24", text: "Deciziile ireversibile trebuie analizate profund.", tags: ["decizie", "risc"] },
  { id: "F25", text: "Adrian gandeste prin analiza 35%, experienta 35%, intuitie 30%.", tags: ["decizie"] },
  { id: "F26", text: "CEO AI trebuie sa respecte intuitia fondatorului, dar sa expuna toate riscurile.", tags: ["decizie", "ai", "risc"] },
  { id: "F27", text: "Daca Boardul recomanda unanim NU, Adrian poate demonta argumentele si decide DA.", tags: ["decizie"] },
  { id: "F28", text: "In acel caz se aplica limite de capital, timp, risc si criterii de oprire.", tags: ["decizie", "risc"] },
  { id: "F29", text: "Compania exista pentru libertatea de a construi ceva care ramane.", tags: ["companie"] },
  { id: "F30", text: "Succesul inseamna o companie autonoma, cu procese bine definite, care nu mai este o povara.", tags: ["companie"] },
  { id: "F31", text: "Cele trei simptome majore ale unei companii bolnave: lipsa credibilitatii, lipsa cash-ului, pierderea identitatii si a scopului.", tags: ["companie", "bani"] },
  { id: "F32", text: "Autenticitatea este mai importanta decat copierea.", tags: ["companie", "marketing"] },
  { id: "F33", text: "Ideile pot fi preluate numai daca sunt adaptate.", tags: ["companie", "marketing"] },
  { id: "F34", text: "Clientul nu are intotdeauna dreptate.", tags: ["clienti"] },
  { id: "F35", text: "Un client incapabil sa accepte un NU poate deveni un risc.", tags: ["clienti", "risc"] },
  { id: "F36", text: "Compania nu promite lucruri care nu depind de ea.", tags: ["clienti", "vanzari", "redline"] },
  { id: "F37", text: "Cel mai periculos concurent al lui Adrian poate fi chiar Adrian, prin propriile decizii.", tags: ["decizie", "risc"] },
  { id: "F38", text: "Epuizarea devine critica atunci cand se transforma in oboseala emotionala.", tags: ["oameni", "fondator"] },
  { id: "F39", text: "AI incepe sa functioneze gresit daca isi contrazice fara explicatie propriile decizii aprobate anterior.", tags: ["ai", "redline"] },
  { id: "F40", text: "Orice contradictie trebuie explicata prin informatii noi, context nou sau revizuirea explicita a deciziei.", tags: ["ai", "decizie"] },
];

// Potrivire deterministica intrebare → teme de principii. Fara LLM.
const TAG_PATTERNS = [
  { tag: "oameni", re: /(angaj|concedi|demisi|echip|salari|marire|om(ul)?\b|oameni|mentorat|performant|caracter|nelu|dana|mihaela|specialist|manager)/ },
  { tag: "bani", re: /(bani|cash|buget|cost|pret|salari|profit|finant|credit|investi|capital|plat[ai])/ },
  { tag: "timp", re: /(timp|termen|deadline|urgent|repede|amana|grabim)/ },
  { tag: "risc", re: /(risc|pericol|esec|pierdere|ireversibil|garanti|expune)/ },
  { tag: "clienti", re: /(client|cumparator|vanzar|oferta|negocier|refuz|reclamati)/ },
  { tag: "vanzari", re: /(vanzar|vinde|promisiune|promitem|contract de vanzare|rezervare)/ },
  { tag: "decizie", re: /(decizi|hotarar|aleg(em)?|varianta|optiune|strategi|nu se poate|specialist)/ },
  { tag: "tehnic", re: /(tehnic|software|sistem|automatiz|server|aplicati|arhitectur)/ },
  { tag: "marketing", re: /(marketing|brand|campani|reclam|promovare|copiem|concurent)/ },
  { tag: "companie", re: /(compani|firma|misiune|scop|identitate|autonom|procese|dezvolt)/ },
  { tag: "ai", re: /(\bai\b|jarvis|codex|board|inteligenta artificiala)/ },
];

// Linii rosii: incalcari directe ale principiilor documentate → reject.
const RED_LINES = [
  { re: /(minti[m]?|ascundem de|manipul[aă]m)/, principle: "F13" },
  { re: /(promitem?.*(nu depinde|nu putem controla)|garant[aă]m ceva ce nu)/, principle: "F36" },
  { re: /(taiem salarii ca sa|profit.*(pe spatele|ranind))/, principle: "F18" },
];

const strip = (s) => String(s || "").toLowerCase()
  .replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t");

/** Principiile documentate relevante pentru un text (deterministic). */
export function matchPrinciples(text) {
  const n = strip(text);
  const tags = new Set(TAG_PATTERNS.filter((t) => t.re.test(n)).map((t) => t.tag));
  if (!tags.size) return [];
  return FOUNDER_PRINCIPLES.filter((p) => p.tags.some((t) => tags.has(t)));
}

/**
 * Perspectiva Founder Voice — DirectorOutput determinist.
 * - incalcare de linie rosie documentata → reject, cu principiul citat;
 * - principii relevante gasite → approve_with_conditions (conditii = principiile);
 * - nimic documentat → insufficient_data + semnalare (nu inventeaza).
 */
export function founderPerspective(question) {
  const n = strip(question);
  const red = RED_LINES.find((r) => r.re.test(n));
  if (red) {
    const p = FOUNDER_PRINCIPLES.find((x) => x.id === red.principle);
    return {
      role: "FOUNDER_VOICE", position: "reject", confidence: 90,
      arguments: [`Incalca un principiu documentat al fondatorului: ${p.text}`],
      evidence: [`[founder-dna] ${p.id}`],
      risks: ["Pierderea increderii — fundamentul relatiilor din companie."],
      conditions: [], alternatives: ["Reformuleaza decizia astfel incat sa nu incalce principiul."],
      unanswered_questions: [], principles: [p.id],
    };
  }
  const matched = matchPrinciples(question);
  if (!matched.length) {
    return {
      role: "FOUNDER_VOICE", position: "insufficient_data", confidence: 0,
      arguments: ["Nu exista principii documentate ale fondatorului pentru aceasta situatie."],
      evidence: [], risks: [], conditions: [], alternatives: [],
      unanswered_questions: ["Preferinta fondatorului nu e documentata — de intrebat direct pe Adrian si de adaugat in FOUNDER_DNA."],
      principles: [],
    };
  }
  const top = matched.slice(0, 5);
  return {
    role: "FOUNDER_VOICE", position: "approve_with_conditions", confidence: 60,
    arguments: ["Decizia trebuie filtrata prin principiile documentate ale fondatorului (mai jos, drept conditii)."],
    evidence: top.map((p) => `[founder-dna] ${p.id}`),
    risks: [], conditions: top.map((p) => `${p.id}: ${p.text}`),
    alternatives: [],
    unanswered_questions: [],
    principles: top.map((p) => p.id),
  };
}
