import { Telegraf, Markup } from "telegraf";
import { config } from "./config.js";
import { handleMessage, confirmAction, splitVoice } from "./brain.js";
import { audit } from "./audit.js";

export const bot = new Telegraf(config.telegramToken);

// Doar proprietarul poate comanda botul.
function isOwner(ctx) {
  return String(ctx.chat?.id) === config.ownerChatId;
}

bot.start((ctx) => {
  if (!isOwner(ctx)) return deny(ctx);
  ctx.reply(
    [
      "JARVIS online. Faza 4 activa: inteligenta critica + consiliu.",
      "",
      "• 'Bună dimineața Jarvis' sau /raport — raportul complet",
      "• /birou — starea firmei într-un ecran (cash, vânzări, task-uri, scor)",
      "• 'consiliu: ...' — 5 perspective (CFO, contabil, jurist, dezvoltator, bancher)",
      "• 'creează task: ...' — task in Operational (cu confirmare)",
      "• 'notează decizia: ...' — registrul de decizii (/decizii); consiliu auto la >50k €",
      "• 'ține minte: ...' — memorie permanenta",
      "• 'caută în drive ...' / 'draft răspuns la ...' — Google",
      "• rezolvat #id / amână #id [zile] / ignoră #id — remindere",
      "• orice altceva — vorbim normal (te avertizez daca te inseli)",
      "",
      "Automat: raport complet la 09:00, verificare task-uri la 17:00,",
      "notificari imediate (task nou/intarziat, email important, termene).",
    ].join("\n")
  );
});

bot.command("raport", (ctx) => handle(ctx, "/raport"));
bot.command("birou", (ctx) => handle(ctx, "/birou"));
bot.command("decizii", (ctx) => handle(ctx, "/decizii"));

bot.command("id", (ctx) => {
  // Util ca sa-ti afli chat ID-ul la setup.
  ctx.reply(`Chat ID: ${ctx.chat.id}`);
});

bot.on("text", (ctx) => handle(ctx, ctx.message.text));

// Mesaje vocale: vocea traieste in HUD (browser, ro-RO, gratuit) — decizie Faza 2.
bot.on("voice", (ctx) => {
  if (!isOwner(ctx)) return deny(ctx);
  ctx.reply("Vocea functioneaza in aplicatia HUD (apasa microfonul acolo). Aici scrie-mi text.");
});

// Confirmari pe butoane (Da/Nu).
bot.action(/^cf:(yes|no):(.+)$/, async (ctx) => {
  if (String(ctx.chat?.id) !== config.ownerChatId) return ctx.answerCbQuery("Acces restrictionat.");
  await ctx.answerCbQuery();
  const [, verdict, id] = ctx.match;
  const result = await confirmAction(id, verdict === "yes");
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  await ctx.reply(splitVoice(result).text);
});

async function handle(ctx, text) {
  if (!isOwner(ctx)) return deny(ctx);
  try {
    await ctx.sendChatAction("typing");
    const res = await handleMessage("telegram", text);
    const reply = splitVoice(res.reply).text;
    const confirmId = res.confirmId;
    if (confirmId) {
      await ctx.reply(
        reply.replace(/\n\nRaspunde: da \/ nu$/, ""),
        Markup.inlineKeyboard([
          Markup.button.callback("✅ Da", `cf:yes:${confirmId}`),
          Markup.button.callback("❌ Nu", `cf:no:${confirmId}`),
        ])
      );
    } else {
      await ctx.reply(reply);
    }
  } catch (e) {
    console.error("[telegram]", e.message);
    await ctx.reply("Eroare la nucleu. Verifica logurile.");
  }
}

function deny(ctx) {
  // Constitutie: logam tentativa.
  console.warn(`[acces] tentativa de la chat ${ctx.chat?.id} (@${ctx.from?.username || "?"})`);
  audit("acces_refuzat", `chat ${ctx.chat?.id} @${ctx.from?.username || "?"}`, "telegram", false);
  return ctx.reply("Acces restrictionat.");
}

/**
 * Trimite un mesaj proactiv proprietarului (folosit de scheduler in Faza 3).
 */
export async function pushToOwner(text) {
  try {
    await bot.telegram.sendMessage(config.ownerChatId, splitVoice(text).text);
  } catch (e) {
    console.error("[push]", e.message);
  }
}
