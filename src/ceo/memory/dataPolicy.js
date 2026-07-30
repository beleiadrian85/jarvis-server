// DATA CLASSIFICATION POLICY (§9, §17-§19) — decide ce categorie de date poate
// parasi sistemul catre un model extern. RESTRICTED nu pleaca NICIODATA la un model
// extern. Fara secrete/parole/tokenuri in prompturi. PUR + determinist.
import { containsSecret, redactSecrets } from "./writeGate.js";

export const CLASS_ORDER = { PUBLIC: 0, INTERNAL: 1, CONFIDENTIAL: 2, HIGHLY_CONFIDENTIAL: 3, RESTRICTED: 4 };

// Ce categorii sunt RESTRICTED prin natura lor (nu ies din sistem).
const RESTRICTED_HINTS = [
  /\b(parola|password|pin|otp|secret|token|refresh_token|client_secret|api[_ ]?key)\b/i,
  /\b(cnp|serie buletin|numar card|iban)\b/i,
  /\bsalari(u|i|ul|ile)\b/i, // date de personal sensibile
];

/**
 * Poate acest continut sa fie trimis unui model extern de categoria `providerClass`?
 * @param {object} p { text, sensitivity, providerTrust ('external'|'private'|'local') }
 * @returns { allowed, redactedText, reason, effectiveSensitivity }
 */
export function classifyForEgress(p = {}) {
  const text = String(p.text || "");
  let sensitivity = p.sensitivity || "INTERNAL";
  // Escaladeaza clasificarea daca continutul pare restrictionat.
  if (RESTRICTED_HINTS.some((rx) => rx.test(text))) sensitivity = "RESTRICTED";
  if (containsSecret(text) && CLASS_ORDER[sensitivity] < CLASS_ORDER.RESTRICTED) sensitivity = "RESTRICTED";

  const trust = p.providerTrust || "external";

  // RESTRICTED: nu paraseste sistemul catre modele externe. Doar local/privat, redactat.
  if (sensitivity === "RESTRICTED") {
    if (trust === "external") return { allowed: false, redactedText: null, reason: "RESTRICTED nu se trimite modelelor externe", effectiveSensitivity: sensitivity };
    return { allowed: true, redactedText: redactSecrets(text), reason: "RESTRICTED permis doar pe model privat/local, redactat", effectiveSensitivity: sensitivity };
  }
  // HIGHLY_CONFIDENTIAL catre extern: doar rezumat redactat.
  if (sensitivity === "HIGHLY_CONFIDENTIAL" && trust === "external") {
    return { allowed: true, redactedText: redactSecrets(text), reason: "confidential ridicat → redactat inainte de egress extern", effectiveSensitivity: sensitivity };
  }
  // Restul: permis, dar mereu redactam eventuale secrete scapate.
  return { allowed: true, redactedText: redactSecrets(text), reason: "permis (redactat de siguranta)", effectiveSensitivity: sensitivity };
}

/** Filtreaza o lista de memorii pentru egress catre un provider dat. */
export function filterMemoriesForEgress(items, { providerTrust = "external" } = {}) {
  const kept = [], dropped = [];
  for (const it of items || []) {
    const r = classifyForEgress({ text: `${it.title} ${it.content}`, sensitivity: it.sensitivity, providerTrust });
    if (r.allowed) kept.push({ ...it, _egressText: r.redactedText, _egressSensitivity: r.effectiveSensitivity });
    else dropped.push({ id: it.id, reason: r.reason, sensitivity: it.sensitivity });
  }
  return { kept, dropped };
}
