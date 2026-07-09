import { config } from "./config.js";

/**
 * Sinteza vocala JARVIS. Preferam OpenAI (gpt-4o-mini-tts), cadem pe ElevenLabs
 * daca OpenAI lipseste/esueaza, iar clientul cade pe vocea browserului daca nu
 * exista niciuna (degradare eleganta, nu crash).
 */
export const hasVoice = !!(config.openaiKey || (config.elevenKey && config.elevenVoiceId));

async function openaiTTS(text) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { authorization: "Bearer " + config.openaiKey, "content-type": "application/json" },
    body: JSON.stringify({
      model: config.openaiTtsModel,
      voice: config.openaiTtsVoice,
      input: text,
      response_format: "mp3",
    }),
  });
  if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function elevenTTS(text) {
  const url =
    `https://api.elevenlabs.io/v1/text-to-speech/${config.elevenVoiceId}` +
    `?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": config.elevenKey, "content-type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_flash_v2_5",
      language_code: "ro",
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function synthesize(text) {
  if (config.openaiKey) {
    try { return await openaiTTS(text); }
    catch (e) { console.error("[tts] OpenAI esuat, incerc ElevenLabs:", e.message); }
  }
  if (config.elevenKey && config.elevenVoiceId) return await elevenTTS(text);
  throw new Error("Nicio voce configurata.");
}
