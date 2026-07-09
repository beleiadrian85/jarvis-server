import { norm } from "./lib/text.js";
import { getCapabilities, listUnavailable } from "./capabilities.js";
import { isOperationalTopic } from "./intents.js";

/**
 * L1 — Fast Path: raspunsuri INSTANT (sub 100ms) pentru mesaje triviale, FARA
 * Claude, FARA MCP, FARA memory recall, FARA embeddings.
 *
 * fastReply(text) → string (raspuns instant) SAU null (nu e fast-path → cale normala).
 * Patternurile sunt ANCORATE pe intreg mesajul → nu fura mesaje cu intentie reala
 * (ex. "salut, cum stau task-urile" NU e prins aici, curge normal).
 */

const GREET  = /^(salut|buna|neata|servus|noroc|hei|hey|hello|hi|yo|ceau|pa)( jarvis)?$/;
const THANKS = /^(mersi|multumesc|multam|ms|thx|thanks|ok|okay|bravo|perfect|super|misto|nice|gata)( mult| frumos| jarvis)?$/;
const HELP   = /^(ajutor|help|ce poti (sa )?faci|ce poti face|ce stii (sa )?faci|cu ce (ma )?(poti )?ajuti|cu ce (ma )?ajuti|ce capabilitati ai|ce functii ai|ce ai voie sa faci|ce comenzi ai)\??$/;

export function fastReply(text) {
  const n = norm(text).replace(/[!.?,]+$/g, "").trim();

  if (!n) return "Zi-mi cu ce te pot ajuta.";
  if (HELP.test(n)) return capabilitiesReply();
  if (GREET.test(n)) return "Salut! Cu ce te ajut?";
  if (THANKS.test(n)) return "Cu placere.";
  // foarte scurt, fara intentie operationala clara → cerem clarificare instant
  if (n.length <= 2 && !isOperationalTopic(text)) return "Zi-mi mai clar cu ce te ajut.";

  return null; // niciun fast-path → mesajul curge pe calea normala
}

function capabilitiesReply() {
  const caps = getCapabilities();
  const have = Object.keys(caps).filter((k) => caps[k] && k !== "date");
  const missing = listUnavailable().filter((k) => k !== "date");
  return (
    "Pot să: fac rapoarte (cash, riscuri, CEO, proiecte), citesc din Operational, creez task-uri și " +
    "evenimente în calendar (cu confirmarea ta), caut în email/Drive, țin minte lucruri și rulez consiliul AI.\n" +
    "Active acum: " + have.join(", ") + "." +
    (missing.length ? "\nÎncă neconectate: " + missing.join(", ") + "." : "")
  );
}
