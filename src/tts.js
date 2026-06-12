import { config } from "./config.js";

/**
 * FAZA V — sinteza vocala JARVIS (ElevenLabs Flash v2.5, romana).
 * hasVoice e fals daca lipsesc cheia/voice-id → clientul cade pe vocea
 * browserului (degradare eleganta, nu crash).
 */
export const hasVoice = !!(config.elevenKey && config.elevenVoiceId);

export async function synthesize(text) {
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
