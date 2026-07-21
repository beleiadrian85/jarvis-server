// PROACTIVE CEO — Board Escalation PREVIEW. PUR, determinist.
// NU convoaca Executive Board (gated pe PROACTIVE_CEO_BOARD_EXECUTION_ENABLED,
// implicit OFF). Doar stabileste: ce directori AR fi convocati, de ce, cu ce
// intrebari, din ce surse, si ce lipseste. REUTILIZEAZA matricea Boardului.
import { selectDirectors } from "../executiveBoard/boardRouter.js";
import { ROLES } from "../executiveBoard/boardRoles.js";

const uniq = (a) => [...new Set(a)];

/** Preview determinist pentru un episod candidat la Board. */
export function buildBoardPreview(episode) {
  const type = episode._boardType || "general";
  let directors = selectDirectors(type);
  // Guardian obligatoriu la risc major, chiar daca matricea tipului nu il are.
  if (episode.combined_severity === "critical" && !directors.includes("GUARDIAN")) {
    directors = [...directors, "GUARDIAN"];
  }

  const members = episode._members || [];
  const why = directors.map((id) => ({
    role: id,
    reason: ROLES[id] ? `${ROLES[id].title} — apara ${ROLES[id].protects}` : id,
  }));
  const questions = directors
    .filter((id) => ROLES[id]?.llm)
    .map((id) => ({
      role: id,
      question: `${ROLES[id].question} — aplicat la: „${episode.title}”`,
    }));
  const sources = uniq(members.flatMap((m) => m.sources || []));
  const missing = uniq([
    ...episode.unknowns,
    ...members.flatMap((m) => m.unknowns || []),
  ]).slice(0, 6);

  return {
    episode_id: episode.episode_id,
    decision_type: type,
    directors,
    why,
    questions,
    sources,
    missing_information: missing,
    would_convene: episode.requires_board_review,
    note: "PREVIEW — Boardul NU este convocat (PROACTIVE_CEO_BOARD_EXECUTION_ENABLED=off).",
  };
}
