import { config } from "./config.js";

const API_URL = "https://api.anthropic.com/v1/messages";

const VISION_SYSTEM =
  "Esti JARVIS, asistentul lui Adi (dezvoltator imobiliar, Sibiu). Primesti un document " +
  "sau o fotografie. Descrie pe scurt, in romana, ce este. Daca e act/factura/contract/plan/" +
  "bon/poza de santier, EXTRAGE datele cheie: emitent, numere, sume, scadente, date, nume, " +
  "obiect. Maxim 6 randuri, concret, fara umplutura. Daca nu poti citi ceva clar, spune.";

/**
 * Trimite imaginea/PDF-ul la Claude (vision) si intoarce o descriere + date cheie.
 * mediaType: image/jpeg|png|webp|gif sau application/pdf. data: base64 (fara prefix).
 */
export async function describeFile({ mediaType, data, filename }) {
  const isPdf = mediaType === "application/pdf";
  const block = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data } };

  const headers = {
    "content-type": "application/json",
    "x-api-key": config.anthropicKey,
    "anthropic-version": "2023-06-01",
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      max_tokens: 700,
      system: VISION_SYSTEM,
      messages: [{
        role: "user",
        content: [block, { type: "text", text: `Fisier: ${filename}. Descrie si extrage datele cheie.` }],
      }],
    }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(`vision ${res.status}: ${JSON.stringify(d).slice(0, 200)}`);
  return (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}
