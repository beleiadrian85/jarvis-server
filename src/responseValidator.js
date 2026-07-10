/**
 * Response Validator (INERT, PUR).
 *
 * validateResponse(response) — verifica forma raspunsului compus (de
 * responseComposer) INAINTE de a ajunge la user. NU modifica; doar valideaza
 * si raporteaza. Nu preia responsabilitatea composer-ului (nu compune),
 * doar poarta de calitate.
 *
 * GARANTII: zero importuri, IO, fetch, node:*, config, DB. Pur.
 */

const REQUIRED = ["title", "summary", "sections", "actions", "warnings", "voiceSummary",
  "confidence", "needsApproval", "approvalPreview", "nextQuestions", "metadata"];
const VOICE_MAX = 300;

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

export function validateResponse(response) {
  const errors = [];
  const warnings = [];

  if (!isObj(response)) return { valid: false, errors: ["raspuns invalid (nu e obiect)"], warnings };

  for (const k of REQUIRED) if (!(k in response)) errors.push(`lipseste campul: ${k}`);

  if (typeof response.voiceSummary === "string" && response.voiceSummary.length > VOICE_MAX)
    errors.push(`voiceSummary > ${VOICE_MAX} caractere (${response.voiceSummary.length})`);

  if (!Array.isArray(response.sections)) {
    errors.push("sections nu e array");
  } else {
    const seenTypes = new Set();
    for (const s of response.sections) {
      if (!isObj(s) || !("type" in s) || !Array.isArray(s.items)) { errors.push("sectiune malformata"); continue; }
      if (!s.items.length) warnings.push(`sectiune goala expusa: ${s.type}`);
      if (seenTypes.has(s.type)) warnings.push(`sectiune duplicata: ${s.type}`);
      seenTypes.add(s.type);
    }
  }

  const c = response.confidence;
  if (typeof c !== "number" || c < 0 || c > 1) errors.push("confidence trebuie numar in [0,1]");

  if (isObj(response.metadata) && response.metadata.composer && response.metadata.composer !== "jarvis")
    warnings.push("metadata.composer != 'jarvis'");

  if (response.needsApproval === true && !response.approvalPreview)
    warnings.push("needsApproval=true dar approvalPreview lipseste");

  return { valid: errors.length === 0, errors, warnings };
}
