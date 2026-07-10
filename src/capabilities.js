import { config, hasCalendar, hasGoogle, hasOperational, hasDb, hasStrategy } from "./config.js";
import { hasVoice } from "./tts.js";

/**
 * C1 — Capability Engine: sursa UNICA de adevar despre ce poate / nu poate face
 * JARVIS in acest moment. Pur si sincron: fara IO, fara DB, fara retea, fara async.
 * Doar deduce din config + flag-urile deja existente.
 *
 * NU schimba comportamentul: momentan nimeni nu-l foloseste (informativ/testabil).
 * Modulul e complet izolat — nu importa brain/decisionEngine/mcp etc.
 */

export function getCapabilities() {
  return {
    operational: !!hasOperational,   // MCP Operational conectat
    googleCalendar: !!hasCalendar,   // OAuth Google (calendar)
    gmail: !!hasGoogle,              // acelasi OAuth Google
    drive: !!hasGoogle,              // acelasi OAuth Google
    memory: !!hasDb,                 // Postgres (memorie persistenta)
    railwayLogs: false,              // neintegrat
    ga4: false,                      // neintegrat
    searchConsole: false,            // neintegrat
    banking: false,                  // neintegrat (Faza 5 blocata)
    strategy: !!hasStrategy,         // Strategy Engine construit+integrat; activ DOAR cand OPENAI_API_KEY && STRATEGY_ROUTING=on
    voice: !!hasVoice,               // TTS (OpenAI/ElevenLabs)
    vision: !!config.anthropicKey,   // Claude vision (documente/foto)
  };
}

/** true daca o capabilitate e disponibila acum; false pentru chei necunoscute. */
export function supports(feature) {
  const caps = getCapabilities();
  return Object.prototype.hasOwnProperty.call(caps, feature) ? !!caps[feature] : false;
}

/** Lista capabilitatilor indisponibile in acest moment. */
export function listUnavailable() {
  const caps = getCapabilities();
  return Object.keys(caps).filter((k) => !caps[k]);
}
