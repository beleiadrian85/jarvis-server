// PROACTIVE CEO — CEO Brief. PUR, DETERMINIST, FARA LLM (cost zero).
// Forma scurta, maxim utila pentru Adrian: 5 sectiuni fixe, sub ~900 caractere.
// In shadow se salveaza DOAR in audit — nu se notifica.

const URGENCY = { critical: "CRITICĂ", high: "RIDICATĂ", medium: "MEDIE", low: "SCĂZUTĂ", info: "SCĂZUTĂ" };
export const BRIEF_MAX_CHARS = 900;
export const BRIEF_SECTIONS = [
  "CE TREBUIE SĂ ȘTII", "CE SE POATE ÎNTÂMPLA", "CE DATE LIPSESC",
  "CE DECIZIE AR PUTEA FI NECESARĂ", "URGENȚĂ",
];

const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");

/** Construieste CEO Brief-ul unui episod. → { text, sections } */
export function buildCeoBrief(episode) {
  const members = episode._members || [];
  const top = members[0] || {};

  const know = episode.status === "resolved"
    ? `S-a închis: ${episode.title}. ${clip(top.summary || "", 150)}`
    : clip(`${episode.title}: ${top.summary || top.title || ""}`, 240);

  const happen = clip(
    members
      .map((m) => m.urgency_reason)
      .filter(Boolean)
      .slice(0, 2)
      .join(" ") ||
    members.slice(1, 3).map((m) => m.title).join("; ") ||
    "Fără consecințe suplimentare identificate din datele curente.",
    200
  );

  const missing = episode.unknowns.length
    ? clip(episode.unknowns.join(" "), 160)
    : "Nimic esențial — datele disponibile acoperă observația.";

  const decision = episode.status === "resolved"
    ? "Niciuna — de confirmat închiderea."
    : episode._decisions || "Analiză suplimentară înainte de decizie.";

  const urgency = episode.status === "resolved" ? "SCĂZUTĂ" : (URGENCY[episode.combined_severity] || "MEDIE");

  const sections = {
    know, happen, missing, decision, urgency,
  };
  const text = clip(
    `CE TREBUIE SĂ ȘTII\n${know}\n\n` +
    `CE SE POATE ÎNTÂMPLA\n${happen}\n\n` +
    `CE DATE LIPSESC\n${missing}\n\n` +
    `CE DECIZIE AR PUTEA FI NECESARĂ\n${decision}\n\n` +
    `URGENȚĂ\n${urgency}`,
    BRIEF_MAX_CHARS
  );
  return { text, sections };
}
