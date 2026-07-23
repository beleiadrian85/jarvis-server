// ASK CODEX — CONVERSATION MEMORY (§7). Persista firele Ask CODEX per user+thread.
// Memoria de conversatie = CONTEXT, NU business truth. O afirmatie umana ("factura
// e platita") = HUMAN_CLAIM / evidence candidate — NU devine VERIFIED_FACT fara
// verificare independenta. Reutilizeaza state.js (jarvis_state). Zero write Operational.
import { getState, setState } from "../state.js";

const KEY = (userId, threadId) => `codex:thread:${String(userId || "unknown").toLowerCase()}:${String(threadId || "default")}`;
const MAX_TURNS = 40; // fir marginit

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);

// Tipare de afirmatie factuala umana (devin HUMAN_CLAIM, nu fapt).
const CLAIM_PATTERNS = [
  /\b(am platit|e platit|s-a platit|am incasat|s-a incasat|am trimis|am facut|am terminat|e gata|am rezolvat|am semnat|am depus)\b/i,
  /\b(soldul (e|este)|avem (in cont|in banca)|a intrat|a iesit|factura .* (platit|incasat))\b/i,
];

/** Clasifica un mesaj uman: contine o afirmatie factuala? → HUMAN_CLAIM. */
export function classifyUserStatement(text) {
  const t = String(text || "");
  const isClaim = CLAIM_PATTERNS.some((rx) => rx.test(t));
  return {
    kind: isClaim ? "HUMAN_CLAIM" : "STATEMENT",
    verified: false, // NICIODATA true fara verificare independenta
    note: isClaim ? "afirmatie umana — candidat de dovada, NU fapt verificat" : null,
  };
}

/** Incarca firul (ultimele MAX_TURNS mesaje). */
export async function loadThread(userId, threadId, { store = null } = {}) {
  const S = store || { get: getState, set: setState };
  const st = (await S.get(KEY(userId, threadId), null).catch(() => null)) || { user_id: userId, thread_id: threadId, turns: [] };
  return { ...st, turns: arr(st.turns) };
}

/** Adauga un tur (user + codex). Persista marginit. Afirmatiile → HUMAN_CLAIM. */
export async function appendTurn(userId, threadId, { user_text, codex_text, meta = {} }, { store = null, nowISO = null } = {}) {
  const S = store || { get: getState, set: setState };
  const key = KEY(userId, threadId);
  const now = nowISO || new Date().toISOString();
  const thread = await loadThread(userId, threadId, { store: S });
  const claim = classifyUserStatement(user_text);
  const turns = [
    ...thread.turns,
    { role: "user", text: String(user_text || "").slice(0, 2000), at: now, classification: claim },
    { role: "codex", text: String(codex_text || "").slice(0, 4000), at: now, meta: isObj(meta) ? meta : {} },
  ].slice(-MAX_TURNS);
  await S.set(key, { user_id: userId, thread_id: threadId, turns, updated_at: now }).catch(() => {});
  return { turns, claim };
}

/** Rezumat al firului pentru promptul CODEX (context conversational, nu adevar). */
export function threadForPrompt(thread) {
  const turns = arr(thread?.turns).slice(-10);
  if (!turns.length) return "";
  const lines = turns.map((t) => `${t.role === "user" ? "Utilizator" : "CODEX"}: ${t.text}`);
  const claims = turns.filter((t) => t.role === "user" && t.classification?.kind === "HUMAN_CLAIM");
  let out = "ISTORIC CONVERSATIE (context, NU adevar operational):\n" + lines.join("\n");
  if (claims.length) out += "\nATENTIE: afirmatiile utilizatorului de mai sus sunt HUMAN_CLAIM (candidati de dovada), NU fapte verificate — nu le trata ca adevar fara verificare.";
  return out;
}

/** Extrage claim-urile umane dintr-un fir (candidati de verificare/reconciliere). */
export function extractClaims(thread) {
  return arr(thread?.turns)
    .filter((t) => t.role === "user" && t.classification?.kind === "HUMAN_CLAIM")
    .map((t) => ({ text: t.text, at: t.at, status: "UNVERIFIED" }));
}
