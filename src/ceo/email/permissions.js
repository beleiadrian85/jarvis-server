// EMAIL PERMISSIONS — verificate in COD, nu in prompt. Modelul NU isi poate acorda
// singur o permisiune. Politica implicita: read-only + drafturi la cerere; SEND si
// orice modificare de inbox = DEZACTIVATE. PUR + determinist.
import { config } from "../../config.js";

export const EMAIL_PERMISSIONS = [
  "EMAIL_SEARCH", "EMAIL_READ", "EMAIL_READ_ATTACHMENTS", "EMAIL_CREATE_DRAFT",
  "EMAIL_UPDATE_DRAFT", "EMAIL_SEND", "EMAIL_FORWARD", "EMAIL_ARCHIVE",
  "EMAIL_DELETE", "EMAIL_LABEL",
];

// Permisiuni care NU pot fi activate in aceasta faza, indiferent de env/model.
export const PERMANENTLY_DISABLED = ["EMAIL_SEND", "EMAIL_FORWARD", "EMAIL_ARCHIVE", "EMAIL_DELETE"];

/**
 * Poate JARVIS folosi o permisiune de email? Verifica flags + gard hard pe
 * actiunile interzise. `ctx.explicitRequest` cere cerere explicita pt drafturi.
 * @returns { allowed, reason }
 */
export function canEmail(permission, ctx = {}) {
  const p = String(permission || "").toUpperCase();
  if (!EMAIL_PERMISSIONS.includes(p)) return { allowed: false, reason: "permisiune email necunoscuta" };
  // Gard HARD: aceste actiuni raman OFF indiferent de config/model.
  if (PERMANENTLY_DISABLED.includes(p)) return { allowed: false, reason: `${p} este DEZACTIVAT permanent in aceasta faza (read-only + drafturi)` };
  const cfg = config.emailIntel || {};
  if (!cfg.enabled) return { allowed: false, reason: "Email Intelligence dezactivat (JARVIS_EMAIL_INTELLIGENCE_ENABLED off)" };
  switch (p) {
    case "EMAIL_SEARCH":
    case "EMAIL_READ": return { allowed: true, reason: "read-only permis pentru conturile autorizate" };
    case "EMAIL_READ_ATTACHMENTS":
      return cfg.attachments ? { allowed: true, reason: "citire atasamente permisa (cu reguli de securitate)" } : { allowed: false, reason: "citirea atasamentelor dezactivata (JARVIS_EMAIL_ATTACHMENTS_ENABLED off)" };
    case "EMAIL_CREATE_DRAFT":
    case "EMAIL_UPDATE_DRAFT":
      if (!cfg.drafts) return { allowed: false, reason: "drafturile dezactivate (JARVIS_EMAIL_DRAFTS_ENABLED off)" };
      if (ctx.explicitRequest !== true) return { allowed: false, reason: "draftul se creeaza DOAR la cererea explicita a lui Adrian (sau Action Card aprobat)" };
      return { allowed: true, reason: "draft permis la cerere explicita" };
    case "EMAIL_LABEL": return { allowed: false, reason: "etichetarea dezactivata implicit" };
    default: return { allowed: false, reason: "nepermis implicit" };
  }
}

/** True daca SEND e disponibil — MEREU false in aceasta faza (garantie structurala). */
export function emailSendAvailable() { return false; }

/** Rezumat pentru CEO Home / audit: ce e permis vs blocat. */
export function emailPermissionMatrix() {
  return EMAIL_PERMISSIONS.map((p) => ({ permission: p, ...canEmail(p, { explicitRequest: true }) }));
}
