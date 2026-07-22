import { Telegraf, Markup } from "telegraf";
import { config } from "./config.js";
import { handleMessage, confirmAction, splitVoice } from "./brain.js";
import { audit } from "./audit.js";

export const bot = new Telegraf(config.telegramToken);

// Telegram refuza mesajele > 4096 caractere. Raspunsurile la mai multe intrebari
// pot depasi limita → trimitem in bucati, taind pe limite de linie/paragraf.
const TG_LIMIT = 4000; // marja sub 4096
export function chunkMessage(text, limit = TG_LIMIT) {
  const t = String(text ?? "");
  if (t.length <= limit) return [t];
  const chunks = [];
  let buf = "";
  for (const line of t.split("\n")) {
    // O singura linie mai lunga decat limita → o spargem dur.
    if (line.length > limit) {
      if (buf) { chunks.push(buf); buf = ""; }
      for (let i = 0; i < line.length; i += limit) chunks.push(line.slice(i, i + limit));
      continue;
    }
    if ((buf + "\n" + line).length > limit) { chunks.push(buf); buf = line; }
    else buf = buf ? buf + "\n" + line : line;
  }
  if (buf) chunks.push(buf);
  return chunks.length ? chunks : [t.slice(0, limit)];
}

/** Trimite un raspuns (posibil lung) prin ctx, in bucati sub limita Telegram. */
async function replyChunked(ctx, text, extra) {
  const parts = chunkMessage(text);
  for (let i = 0; i < parts.length; i++) {
    // Butoanele (extra) doar pe ultima bucata.
    await ctx.reply(parts[i], i === parts.length - 1 ? extra : undefined);
  }
}

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
  await replyChunked(ctx, splitVoice(result).text);
});

async function handle(ctx, text) {
  if (!isOwner(ctx)) return deny(ctx);
  try {
    await ctx.sendChatAction("typing");
    const res = await handleMessage("telegram", text);
    const reply = splitVoice(res.reply).text;
    const confirmId = res.confirmId;
    if (confirmId) {
      await replyChunked(
        ctx,
        reply.replace(/\n\nRaspunde: da \/ nu$/, ""),
        Markup.inlineKeyboard([
          Markup.button.callback("✅ Da", `cf:yes:${confirmId}`),
          Markup.button.callback("❌ Nu", `cf:no:${confirmId}`),
        ])
      );
    } else {
      await replyChunked(ctx, reply);
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
  // MP5: candidat de identitate — Adrian confirma maparea in Command Center
  // (niciodata auto-map pe nume; doar captura pentru confirmare explicita).
  import("./state.js").then(async ({ getState, setState }) => {
    const cands = await getState("people:telegram:candidates", {}).catch(() => ({}));
    const id = String(ctx.chat?.id || "");
    if (id && !cands[id]) {
      cands[id] = { username: ctx.from?.username || null, name: [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || null, first_seen: new Date().toISOString() };
      await setState("people:telegram:candidates", cands);
    }
  }).catch(() => {});
  return ctx.reply("Acces restrictionat.");
}

/**
 * Trimite un mesaj proactiv proprietarului (folosit de scheduler in Faza 3).
 */
export async function pushToChat(chatId, text) {
  // Livrare catre o persoana anume (LEVEL 2, doar cu mapping verificat).
  const r = await bot.telegram.sendMessage(String(chatId), text);
  return { message_id: r?.message_id ?? null };
}

export async function pushToOwner(text) {
  try {
    for (const part of chunkMessage(splitVoice(text).text)) {
      await bot.telegram.sendMessage(config.ownerChatId, part);
    }
  } catch (e) {
    console.error("[push]", e.message);
  }
}
