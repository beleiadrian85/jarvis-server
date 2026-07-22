// TELEGRAM: mesajele lungi (raspuns la multe intrebari) se impart sub 4096.
// node test/telegramChunk.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

import { readFileSync } from "node:fs";
const { chunkMessage } = await import("../src/telegram.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

ok(chunkMessage("scurt").length === 1, "mesaj scurt → o singura bucata");
ok(chunkMessage("").length === 1, "mesaj gol → o bucata (nu crapa)");

const long = Array.from({ length: 250 }, (_, i) => `${i + 1}. raspuns la intrebarea ${i + 1} cu ceva detaliu real`).join("\n");
const parts = chunkMessage(long);
ok(long.length > 4096, `fixture chiar depaseste limita Telegram (${long.length} car)`);
ok(parts.length >= 2, "mesaj lung → mai multe bucati");
ok(parts.every((p) => p.length <= 4000), "fiecare bucata sub limita (4000)");
ok(parts.join("\n").length >= long.length - parts.length, "nimic pierdut la impartire (continutul se pastreaza)");

// O singura linie uriasa (fara \n) → tot se sparge dur.
const bigLine = "x".repeat(9000);
ok(chunkMessage(bigLine).every((p) => p.length <= 4000) && chunkMessage(bigLine).length === 3, "o linie uriasa fara newline → spargere dura sub limita");

// Cablarea in caile de trimitere.
const tg = readFileSync(new URL("../src/telegram.js", import.meta.url), "utf8");
ok(/replyChunked\(ctx, reply\)/.test(tg), "raspunsul de chat merge prin replyChunked (nu ctx.reply direct)");
ok(/chunkMessage\(splitVoice\(text\)\.text\)/.test(tg), "pushToOwner imparte si el mesajele lungi");
ok(!/await ctx\.reply\(reply\)/.test(tg), "nu mai exista ctx.reply(reply) direct (care crapa la >4096)");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — telegramChunk`);
process.exit(failed === 0 ? 0 : 1);
