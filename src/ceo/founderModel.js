// FOUNDER DECISION MODEL (Faza 9) — JARVIS invata din Adrian. Agrega istoricul
// de decizii (ceo:decision-memory) in IPOTEZE despre stilul lui, fiecare cu
// EVIDENCE / CONFIDENCE / COUNTEREXAMPLES. PUR + determinist: primeste memoria,
// NU face IO.
// REGULA DE AUR: KNOW ADRIAN, DO NOT BECOME A YES-MAN. Modelul serveste la
// "tu ce ai face?" DAR trebuie sa poata si CONTRAZICE argumentat cand dovezile
// interne/externe bat preferinta invatata. O ipoteza slaba NU e o certitudine.

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const norm = (s) => String(s || "").toLowerCase()
  .replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t");

// Dimensiunile de stil urmarite, fiecare cu semnale text (pro / contra).
const TRAITS = [
  { key: "risk_tolerance", label: "toleranta la risc",
    pro: ["risc", "pariez", "indraznet", "agresiv", "oportunitate", "hai sa incercam"], con: ["prudent", "sigur", "conservator", "asteptam", "nu riscam"] },
  { key: "liquidity_preference", label: "preferinta pentru lichiditate",
    pro: ["cash", "lichiditate", "sa avem bani", "rezerva", "sa nu ramanem fara"], con: ["investim tot", "bagam tot", "reinvestim complet"] },
  { key: "capital_allocation", label: "alocare de capital",
    pro: ["investim", "bagam capital", "finantam", "dezvoltam", "mai bagam"], con: ["nu mai bagam", "oprim investitia", "taiem"] },
  { key: "debt_appetite", label: "apetit pentru datorie/credit",
    pro: ["credit", "imprumut", "finantare bancara", "levier", "linia de credit"], con: ["fara credit", "din surse proprii", "nu ne indatoram"] },
  { key: "asset_retention", label: "pastrare vs. vanzare active",
    pro: ["pastram", "tinem", "nu vindem", "asteptam pret mai bun"], con: ["vindem", "lichidam", "scapam de"] },
  { key: "speed_vs_certainty", label: "viteza vs. certitudine",
    pro: ["repede", "urgent", "acum", "rapid", "nu asteptam"], con: ["sigur", "verificam intai", "cand suntem siguri", "cu grija"] },
  { key: "negotiation_style", label: "stil de negociere",
    pro: ["negociem", "mai jos", "presam", "contra-oferta", "nu accept pretul"], con: ["acceptam", "e ok pretul", "batem palma"] },
  { key: "delegation", label: "delegare",
    pro: ["deleg", "sa se ocupe", "dam la", "nelu se ocupa", "dana face"], con: ["fac eu", "ma ocup eu", "vreau sa vad eu"] },
];

function countSignals(text, words) {
  const n = norm(text);
  let c = 0;
  for (const w of words) if (n.includes(w)) c++;
  return c;
}

/**
 * Extrage textul relevant dintr-un record de decizie (ce a decis + de ce).
 * Pondereaza mai mult ce a spus/ales ADRIAN decat recomandarea lui JARVIS.
 */
function decisionText(rec) {
  const parts = [rec?.adrian_decision, rec?.why, rec?.lesson, rec?.context].filter(Boolean);
  return parts.join(" . ");
}

/**
 * Construieste modelul fondatorului din memoria de decizii.
 * @param {Array} memory  records buildDecisionRecord (cu adrian_decision setat)
 * @returns { hypotheses:[{trait,label,leaning,confidence,evidence,counterexamples,n}], decisions_seen }
 */
export function buildFounderModel(memory = []) {
  const decided = arr(memory).filter((m) => isObj(m) && (m.adrian_decision || m.why));
  const hypotheses = TRAITS.map((t) => {
    const evidence = [];
    const counter = [];
    let pro = 0, con = 0;
    for (const rec of decided) {
      const txt = decisionText(rec);
      const p = countSignals(txt, t.pro);
      const c = countSignals(txt, t.con);
      if (p > c && p > 0) { pro++; evidence.push({ decision_id: rec.decision_id, cue: t.pro.find((w) => norm(txt).includes(w)) }); }
      else if (c > p && c > 0) { con++; counter.push({ decision_id: rec.decision_id, cue: t.con.find((w) => norm(txt).includes(w)) }); }
    }
    const n = pro + con;
    // Leaning: spre "pro" daca domina, dar cu counterexamples pastrate.
    let leaning = "UNKNOWN";
    if (n > 0) leaning = pro > con ? "HIGH" : pro < con ? "LOW" : "MIXED";
    // Confidence: creste cu volumul si consistenta; plafonata (nu devine dogma).
    const consistency = n ? Math.abs(pro - con) / n : 0;
    const confidence = n === 0 ? 0 : Math.min(75, Math.round(consistency * 100 * Math.min(1, n / 5)));
    return {
      trait: t.key, label: t.label, leaning, confidence, n,
      evidence: evidence.slice(0, 5), counterexamples: counter.slice(0, 5),
    };
  });
  return {
    at: null, // stampilat de apelant
    decisions_seen: decided.length,
    hypotheses: hypotheses.filter((h) => h.n > 0), // doar ipoteze cu dovezi
  };
}

/**
 * Cand Adrian intreaba "tu ce ai face?" — folosim modelul, DAR cu garda anti-
 * yes-man: daca dovezile curente (facts) contrazic preferinta, o spunem.
 */
export function founderModelForPrompt(model) {
  if (!model?.hypotheses?.length) return "MODEL FONDATOR: inca insuficiente decizii inregistrate pentru a invata un tipar (nu presupun).";
  const lines = model.hypotheses
    .filter((h) => h.confidence >= 20)
    .map((h) => `- ${h.label}: inclinatie ${h.leaning} (incredere ${h.confidence}%, din ${h.n} decizii${h.counterexamples.length ? `, ${h.counterexamples.length} contraexemple` : ""})`);
  if (!lines.length) return "MODEL FONDATOR: tipare inca slabe — folosesc cu prudenta, nu ca certitudine.";
  return "MODEL FONDATOR (tipare INVATATE din deciziile lui Adrian — orientative, NU reguli):\n" +
    lines.join("\n") +
    "\nREGULA: foloseste-le la 'tu ce ai face?', dar daca dovezile actuale contrazic tiparul, CONTRAZI argumentat (nu esti yes-man).";
}

/** Detecteaza intrebarea "tu ce ai face / ce m-ai sfatui". */
export function asksFounderOpinion(text) {
  const n = norm(text);
  return /(tu ce ai face|ce ai face tu|ce m[- ]?ai sfatui|ce recomanzi tu|ce ai alege|parerea ta|tu ce zici)/.test(n);
}
