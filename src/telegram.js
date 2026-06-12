import { Telegraf } from "telegraf";
import { config } from "./config.js";
import { buildMorningReport } from "./morning.js";
import { callClaude } from "./claude.js";

export const bot = new Telegraf(config.telegramToken);

// Doar proprietarul poate comanda botul.
function isOwner(ctx) {
  return String(ctx.chat?.id) === config.ownerChatId;
}

// Normalizare pt detectarea frazei de trezire.
function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const WAKE = ["buna dimineata jarvis", "buna dimineata", "neata jarvis"];

bot.start((ctx) => {
  if (!isOwner(ctx)) return;
  ctx.reply(
    [
      "JARVIS online. Faza 1 activa.",
      "",
      "• 'Bună dimineața Jarvis' — raport: vreme + calendar + task-uri",
      "• /raport — la fel, pe comanda",
      "• orice altceva — vorbim normal",
      "",
      `Chat ID-ul tau: ${ctx.chat.id}`,
    ].join("\n")
  );
});

bot.command("raport", async (ctx) => {
  if (!isOwner(ctx)) return;
  await sendMorning(ctx);
});

bot.command("id", (ctx) => {
  // Util ca sa-ti afli chat ID-ul la setup.
  ctx.reply(`Chat ID: ${ctx.chat.id}`);
});

bot.on("text", async (ctx) => {
  if (!isOwner(ctx)) {
    return ctx.reply("Acces restrictionat.");
  }
  const text = ctx.message.text;
  const norm = normalize(text);

  if (WAKE.some((w) => norm.includes(w))) {
    return sendMorning(ctx);
  }

  // Chat general (Faza 1: fara memorie persistenta inca — vine in Faza 2).
  try {
    await ctx.sendChatAction("typing");
    const reply = await callClaude({
      system:
        "Esti JARVIS, asistentul personal al lui Adi. Romana, direct, scurt, pragmatic. " +
        "Daca nu stii, spui clar. Fara politeturi inutile.",
      messages: [{ role: "user", content: text }],
      maxTokens: 800,
    });
    await ctx.reply(reply || "…");
  } catch (e) {
    console.error("[chat]", e.message);
    await ctx.reply("Eroare la nucleu. Verifica logurile.");
  }
});

async function sendMorning(ctx) {
  try {
    await ctx.sendChatAction("typing");
    const report = await buildMorningReport();
    await ctx.reply(report);
  } catch (e) {
    console.error("[morning]", e.message);
    await ctx.reply("Nu am putut genera raportul. Verifica logurile.");
  }
}

/**
 * Trimite un mesaj proactiv proprietarului (folosit de scheduler in Faza 3).
 */
export async function pushToOwner(text) {
  try {
    await bot.telegram.sendMessage(config.ownerChatId, text);
  } catch (e) {
    console.error("[push]", e.message);
  }
}
