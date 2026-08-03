// CONVERSATION MEMORY (§17) — conversatiile se inregistreaza CONTROLAT. NU se salveaza
// fiecare mesaj ca memorie semantica. La final/periodic se genereaza un rezumat cu:
// decizii, angajamente, fapte-candidat, necunoscute, taskuri, preferinte-candidat, si ce
// NU se stocheaza. Memory Write Gate decide ce persista. Transcriptul e separat de memoria
// semantica (retentie proprie). Gated de config.multiModel.conversationMemory.
import { config } from "../../config.js";
import { remember } from "./store.js";
import { classifyWrite, containsSecret } from "./writeGate.js";
let _state = null;
async function getState(k, f) { if (!_state) _state = await import("../../state.js"); return _state.getState(k, f); }
async function setState(k, v) { if (!_state) _state = await import("../../state.js"); return _state.setState(k, v); }
const TRANSCRIPT_KEY = "ceo:memory:transcripts";

const norm = (s) => String(s || "").toLowerCase();

/** Extrage structura dintr-o conversatie (determinist, fara model). */
export function summarizeConversation(messages = []) {
  const text = messages.map((m) => `${m.role || "?"}: ${m.content || ""}`).join("\n");
  const lines = messages.map((m) => String(m.content || ""));
  const decisions = [], commitments = [], facts = [], unknowns = [], tasks = [], preferences = [], doNotStore = [];
  for (const l of lines) {
    const t = norm(l);
    if (containsSecret(l)) { doNotStore.push("(mesaj cu secrete — nu se stocheaza)"); continue; }
    if (/\b(am decis|hotaram|hotarat|mergem cu|alegem)\b/.test(t)) decisions.push(l.slice(0, 200));
    if (/\b(o sa|voi|ma ocup|promit|pana (luni|marti|miercuri|joi|vineri|maine))\b/.test(t)) commitments.push(l.slice(0, 200));
    if (/\b(de facut|task|creeaza|trebuie sa)\b/.test(t)) tasks.push(l.slice(0, 200));
    if (/\b(prefer|imi place|de acum|mereu|intotdeauna)\b/.test(t)) preferences.push(l.slice(0, 200));
    if (/\b(nu stiu|nu sunt sigur|de verificat|ramane de vazut|neclar)\b/.test(t)) unknowns.push(l.slice(0, 200));
    if (/\b(este|are|apartine|owner|responsabil)\b/.test(t) && l.length < 160) facts.push(l.slice(0, 200));
  }
  return {
    summary: (decisions[0] || commitments[0] || lines[0] || "").slice(0, 300),
    decisions, commitments, facts_candidates: facts, unknowns, tasks, preferences_candidates: preferences, do_not_store: doNotStore,
    message_count: messages.length,
  };
}

/**
 * Persista rezumatul: fiecare candidat trece prin Write Gate. Transcriptul se pastreaza
 * separat (retentie). NU persista fapte automat drept confirmate.
 */
export async function persistConversationSummary(messages = [], opts = {}) {
  if (!(config.multiModel?.conversationMemory === true)) return { stored: false, reason: "Conversation Memory OFF" };
  const sum = summarizeConversation(messages);
  const store = opts.store;
  const stored = [];
  // Decizii → Decision Memory (gate).
  for (const d of sum.decisions.slice(0, 5)) {
    const r = await remember({ title: d.slice(0, 80), content: d, kind: "decision", source_type: "conversation", source_reference: opts.conversation_id || null, verification_status: "DECLARED" }, { store });
    if (r.stored) stored.push(r.item.id);
  }
  // Fapte → candidate semantice (nu confirmate).
  for (const f of sum.facts_candidates.slice(0, 5)) {
    const cat = classifyWrite({ text: f, kind: "fact", source_type: "conversation", verification_status: "DECLARED" });
    if (cat.category === "STORE_SEMANTIC_CANDIDATE" || cat.category === "STORE_EPISODE") {
      const r = await remember({ title: f.slice(0, 80), content: f, kind: "fact", source_type: "conversation", verification_status: "DECLARED", confidence: 0.4 }, { store });
      if (r.stored) stored.push(r.item.id);
    }
  }
  // Transcript separat (retentie), NU ca memorie semantica.
  const s = store || { get: getState, set: setState };
  const tdb = (await s.get(TRANSCRIPT_KEY, null)) || { transcripts: [] };
  tdb.transcripts = [{ id: opts.conversation_id || `conv:${Date.now?.() || ""}`, at: new Date().toISOString(), summary: sum.summary, message_count: sum.message_count }, ...(tdb.transcripts || [])].slice(0, 500);
  await s.set(TRANSCRIPT_KEY, tdb);
  return { stored: true, memory_items: stored, summary: sum };
}
