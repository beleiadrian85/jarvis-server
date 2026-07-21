// FOUNDER ATTENTION — Daily CEO Digest (preview). PUR, determinist, fara LLM.
// Compact: 5 sectiuni, MAXIM 7 puncte relevante in total, zero zgomot de audit.

export const DIGEST_MAX_POINTS = 7;
export const DIGEST_SECTIONS = [
  "CE NECESITĂ ATENȚIA TA", "CE S-A AGRAVAT", "CE S-A REZOLVAT",
  "CE DECIZII SE APROPIE", "CE DATE LIPSESC",
];

const SEV_RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const relevant = (e) => (SEV_RANK[e.combined_severity] ?? 0) >= 2 || e.requires_founder_attention;

/** Construieste digestul din episoadele rularii + candidatii permisi. */
export function buildDailyDigest({ episodes = [], candidates = [] }) {
  const eps = episodes.filter(relevant);
  const pick = [];
  const add = (section, text) => {
    if (pick.length < DIGEST_MAX_POINTS && text) pick.push({ section, text });
  };

  // 1) Atentia ta: alerte/decizii (inclusiv cele retrogradate din quiet hours).
  //    DATA_REQUIRED se afiseaza EXPLICIT ca cerere de date, nu ca decizie.
  for (const c of candidates.filter((x) =>
    ["INTERRUPTIVE_ALERT", "FOUNDER_DECISION_REQUIRED", "DATA_REQUIRED_BEFORE_DECISION"].includes(x.attention_level) || x.quiet_deferred)) {
    const prefix = c.attention_level === "DATA_REQUIRED_BEFORE_DECISION"
      ? `Întâi avem nevoie de date: ${(c.missing_data[0] || "date esențiale").replace(/\.$/, "")} → apoi decizia „${c.title}”`
      : `${c.title}${c.deadline ? ` (${c.deadline})` : ""} — ${c.why_now.slice(0, 110)}`;
    add("CE NECESITĂ ATENȚIA TA", prefix);
  }

  // 2) Agravari.
  for (const e of eps.filter((x) => x.status === "worsening"))
    add("CE S-A AGRAVAT", `${e.title} — severitate ${e.combined_severity}`);

  // 3) Rezolvari (apar O data — garanteaza reconcilierea de episod).
  for (const e of eps.filter((x) => x.status === "resolved"))
    add("CE S-A REZOLVAT", e.title);

  // 4) Decizii apropiate (termen ≤ 7 zile).
  for (const e of eps.filter((x) => x._minUrgencyDays != null && x._minUrgencyDays <= 7 && x.status !== "resolved"))
    add("CE DECIZII SE APROPIE", `${e.title} — in ${e._minUrgencyDays} zile`);

  // 5) Date lipsa (agregat).
  const missing = [...new Set(eps.flatMap((e) => e.unknowns || []))].slice(0, 2);
  for (const m of missing) add("CE DATE LIPSESC", m);

  const bySection = {};
  for (const s of DIGEST_SECTIONS) bySection[s] = pick.filter((p) => p.section === s).map((p) => p.text);
  const text = DIGEST_SECTIONS
    .filter((s) => bySection[s].length)
    .map((s) => `${s}\n${bySection[s].map((t) => `• ${t}`).join("\n")}`)
    .join("\n\n") || "Nimic relevant azi — sistemele observa in liniste.";

  return { points: pick.length, sections: bySection, text };
}
