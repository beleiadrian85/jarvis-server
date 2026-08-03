// JARVIS MEMORY WRITE GATE (§8) — nicio informatie nu se memoreaza automat fara
// clasificare. Secretele/parolele/tokenurile NU se memoreaza. Presupunerile nu
// devin fapte; opiniile unui model nu devin politici; Policy Memory cere aprobare.
// PUR + determinist.

export const WRITE_CATEGORIES = [
  "DO_NOT_STORE", "WORKING_MEMORY_ONLY", "STORE_EPISODE", "STORE_DOCUMENT_REFERENCE",
  "STORE_SEMANTIC_CANDIDATE", "STORE_DECISION", "STORE_POLICY_ONLY_WITH_APPROVAL",
];

// Tipare de SECRETE care NU se memoreaza in text clar.
const SECRET_PATTERNS = [
  /\b(GOCSPX-[A-Za-z0-9_-]+)\b/,                               // Google client secret
  /\b(sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/,     // API keys (OpenAI/Slack)
  /\b(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,    // GitHub tokens
  /\bBearer\s+[A-Za-z0-9._-]{20,}\b/i,                          // bearer tokens
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/, // JWT
  /\b(parola|password|passwd|pwd|pin|otp|cod (de )?(verificare|autentificare)|api[_ ]?key|secret|token|refresh_token|client_secret)\b\s*[:=]\s*\S+/i,
  // Forma naturala "parola mea e Secret123" — valoarea trebuie sa arate a credential
  // (contine cifra), ca sa nu bifam proza normala ("parola este importanta").
  /\b(parol[ae]|password|pin)\b[^\n]{0,14}?\b(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{6,}\b/i,
  /\b(?:\d[ -]?){13,19}\b/,                                     // card numbers (13-19 cifre)
  /\b(iban)\b[:\s]*[A-Z]{2}\d{2}[A-Z0-9]{10,}/i,               // IBAN complet (sensibil)
];

/** Contine secrete? (nu se memoreaza in clar). */
export function containsSecret(text) {
  const t = String(text || "");
  for (const rx of SECRET_PATTERNS) if (rx.test(t)) return true;
  return false;
}

/**
 * Clasifica ce se face cu o informatie candidata la memorare.
 * @param {object} cand { text, kind (episode|document|fact|decision|policy|preference|
 *   opinion|assumption), source_type, verification_status, from_model (bool),
 *   founder_approved (bool) }
 * @returns { category, reason, redact (bool) }
 */
export function classifyWrite(cand = {}) {
  const c = cand || {};
  const kind = String(c.kind || "").toLowerCase();

  // 1) Secrete → NICIODATA in text clar.
  if (containsSecret(c.text)) return { category: "DO_NOT_STORE", reason: "contine secrete/parole/tokenuri/card — nu se memoreaza in clar", redact: true };

  // 2) Politici → doar cu aprobarea explicita a fondatorului.
  if (kind === "policy" || kind === "rule") {
    if (c.founder_approved === true) return { category: "STORE_POLICY_ONLY_WITH_APPROVAL", reason: "politica aprobata de fondator" };
    return { category: "DO_NOT_STORE", reason: "o politica NU se memoreaza fara aprobarea explicita a fondatorului (email/document/model nu pot scrie politici)" };
  }

  // 3) Opinia unui model / presupunere → NU devine fapt permanent.
  if (c.from_model === true || kind === "opinion" || kind === "assumption") {
    return { category: "WORKING_MEMORY_ONLY", reason: "inferenta/opinie de model sau presupunere — context temporar, nu fapt permanent (AI_INFERENCE)" };
  }

  // 4) Decizie a fondatorului → Decision Memory.
  if (kind === "decision") return { category: "STORE_DECISION", reason: "decizie a fondatorului — cu context/outcome/reversibilitate" };

  // 5) Document → referinta (nu corpul integral automat).
  if (kind === "document") return { category: "STORE_DOCUMENT_REFERENCE", reason: "referinta document + fragment probatoriu (nu corp integral automat)" };

  // 6) Fapt observat/extras cu sursa → candidat semantic (nu direct 'fapt confirmat').
  if (kind === "fact" && (c.verification_status === "OBSERVED" || c.verification_status === "EXTRACTED" || c.source_type)) {
    return { category: "STORE_SEMANTIC_CANDIDATE", reason: "fapt observat cu sursa → candidat semantic (nu confirmat automat)" };
  }

  // 7) Eveniment verificabil → episod.
  if (kind === "episode" || c.source_type) return { category: "STORE_EPISODE", reason: "eveniment cu sursa → memorie episodica" };

  // Implicit: doar working memory (nu persistam ce nu are temei).
  return { category: "WORKING_MEMORY_ONLY", reason: "fara temei clar de persistare → doar context temporar" };
}

/** Redacteaza secretele dintr-un text (inainte de a-l trece printr-un model/log). */
export function redactSecrets(text) {
  let t = String(text || "");
  for (const rx of SECRET_PATTERNS) t = t.replace(new RegExp(rx.source, rx.flags.includes("g") ? rx.flags : rx.flags + "g"), "[REDACTAT]");
  return t;
}

/** True daca o categorie inseamna persistare reala (nu working/do-not-store). */
export function persistsToLongTerm(category) {
  return ["STORE_EPISODE", "STORE_DOCUMENT_REFERENCE", "STORE_SEMANTIC_CANDIDATE", "STORE_DECISION", "STORE_POLICY_ONLY_WITH_APPROVAL"].includes(category);
}
