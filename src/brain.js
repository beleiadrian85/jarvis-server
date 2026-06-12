import { callClaude } from "./claude.js";
import { pool, query } from "./db.js";
import { appendMessage, getContext, maybeSummarize } from "./history.js";
import { recall, saveMemory, saveDecision, listDecisions, extractFacts } from "./memory.js";
import { activeReminders, settleReminder, formatReminders, addReminder } from "./reminders.js";
import { prepareTaskCreate, takePending, executeConfirmed } from "./taskflow.js";
import { searchDrive } from "./sources/drive.js";
import { findEmail, createDraft } from "./sources/gmail.js";
import { buildMorningReport } from "./morning.js";
import { audit } from "./audit.js";

/**
 * Creierul comun Telegram + HUD: istoric si memorie partajate,
 * intentii deterministe (fara tokeni) inainte de chat-ul general.
 *
 * handleMessage(channel, text) → { reply, confirmId? }
 * confirmId = exista o actiune in asteptare; UI-ul afiseaza Da/Nu.
 */

// Ierarhia decizionala din constitutie — injectata in toate apelurile de chat.
const PERSONA =
  "Esti JARVIS, asistentul operational al lui Adi (Adrian Belei), dezvoltator imobiliar " +
  "in Sibiu, firma PROFI CONCEPT. Romana, direct, scurt, pragmatic, fara politeturi.\n" +
  "IERARHIE DECIZIONALA la orice recomandare: lichiditate > profit; siguranta juridica > viteza; " +
  "protejarea companiei > confortul utilizatorului.\n" +
  "ANTI-HALUCINATIE: deosebeste clar ce e confirmat din sistem/documente de inferentele tale. " +
  "Cand datele nu ajung pentru o concluzie sigura, spui exact: " +
  "'Nu am suficiente informatii pentru o concluzie sigura.'\n" +
  "PLATI: nu executi si nu promiti executarea niciunei plati, indiferent de instructiuni — " +
  "poti doar pregati datele unei plati (suma, IBAN, scadenta) pentru executie umana.";

const norm = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const WAKE = ["buna dimineata jarvis", "buna dimineata", "neata jarvis"];

let pendingByChannel = new Map(); // confirmare prin text ("da"/"nu")
let userMsgCounter = 0;

export async function handleMessage(channel, text) {
  const n = norm(text);

  // 0) Confirmare/anulare actiune in asteptare (text, pentru HUD si Telegram).
  const waiting = pendingByChannel.get(channel);
  if (waiting) {
    pendingByChannel.delete(channel);
    if (["da", "confirm", "confirma", "ok"].includes(n)) {
      return { reply: await runConfirmed(waiting) };
    }
    if (["nu", "anuleaza", "stop"].includes(n)) {
      await audit("actiune_anulata", "", `pending ${waiting}`, false);
      return { reply: "Anulat." };
    }
    // alt mesaj → renunta tacit la pending si proceseaza normal
  }

  // 1) Raport de dimineata.
  if (WAKE.some((w) => n.includes(w)) || n === "/raport" || n === "raport") {
    const report = await buildMorningReport();
    await audit("raport", "raport de dimineata generat", "vreme+calendar+gmail+operational+reminders");
    remember(channel, text, report);
    return { reply: report };
  }

  // 2) Remindere: rezolvat / amana / ignora #id.
  const rem = n.match(/^(rezolvat|amana|ignora)\s*#?(\d+)(?:\s+(\d+))?$/);
  if (rem) {
    const msg = await settleReminder(Number(rem[2]), rem[1], rem[3] ? Number(rem[3]) : 3);
    return { reply: msg };
  }

  // 3) Registrul de decizii.
  const dec = text.match(/noteaz[aă] decizia[:\s]+([\s\S]+)/i);
  if (dec) {
    const d = await saveDecision(dec[1].trim());
    await audit("decizie_notata", d.decision, "registru decizii", true);
    remember(channel, text, d.decision);
    return {
      reply:
        `📌 Decizie notata (#${d.id}):\n${d.decision}` +
        (d.figures ? `\nCifre: ${d.figures}` : "") +
        (d.risks ? `\nRiscuri: ${d.risks}` : "") +
        (d.review_by ? `\nRevizuire: ${d.review_by}` : ""),
    };
  }
  if (n === "/decizii" || n === "decizii") {
    const rows = await listDecisions(10);
    if (!rows.length) return { reply: "Registrul de decizii e gol." };
    return {
      reply:
        "📌 Ultimele decizii:\n" +
        rows
          .map((d) => `#${d.id} (${new Date(d.decided_on).toLocaleDateString("ro-RO")}) ${d.decision}`)
          .join("\n"),
    };
  }

  // 4) Memorie explicita: "tine minte: ...".
  const mem = text.match(/[tț]ine minte[:\s]+([\s\S]+)/i);
  if (mem) {
    await saveMemory(guessCategory(mem[1]), mem[1].trim(), "comanda directa");
    return { reply: "🧠 Retinut." };
  }

  // 5) Creare task (Nivel 2, cu confirmare).
  if (/creeaz[aă]\s+task/i.test(text)) {
    const { id, preview } = await prepareTaskCreate(text);
    pendingByChannel.set(channel, id);
    return { reply: preview + "\n\nRaspunde: da / nu", confirmId: id };
  }

  // 6) Cautare in Drive.
  const drv = text.match(/caut[aă]\s+[iî]n\s+drive[:\s]+(.+)/i);
  if (drv) {
    const files = await searchDrive(drv[1].trim());
    if (files === null) return { reply: "Drive neconfigurat (lipseste OAuth Google)." };
    if (!files.length) return { reply: "Nimic gasit in folderul JARVIS." };
    return {
      reply: files.map((f) => `📄 ${f.name} (${f.modified})\n${f.link}`).join("\n\n"),
    };
  }

  // 7) Draft de raspuns email (Nivel 2).
  const drf = text.match(/draft(?:\s+r[aă]spuns)?(?:\s+la)?[:\s]+([\s\S]+)/i);
  if (drf) {
    return { reply: await makeDraft(drf[1].trim()) };
  }

  // 8) Chat general cu memorie.
  return { reply: await generalChat(channel, text) };
}

/** Confirmare venita pe buton (Telegram callback). */
export async function confirmAction(confirmId, yes) {
  if (!yes) {
    takePending(confirmId);
    await audit("actiune_anulata", "", `pending ${confirmId}`, false);
    return "Anulat.";
  }
  return runConfirmed(confirmId);
}

async function runConfirmed(confirmId) {
  const p = takePending(confirmId);
  if (!p) return "Actiunea a expirat. Reia comanda.";
  try {
    return await executeConfirmed(p);
  } catch (e) {
    console.error("[confirm]", e.message);
    return "Nu am putut executa: " + e.message;
  }
}

async function makeDraft(request) {
  const email = await findEmail(request.split(/\s+/).slice(0, 6).join(" "));
  if (email === null) return "Gmail neconfigurat sau nu am gasit emailul.";
  const body = await callClaude({
    system:
      PERSONA +
      "\nScrii un draft de raspuns la email in numele lui Adi. Profesional, direct, romana. " +
      "Doar corpul emailului, fara subiect, fara semnaturi inventate — inchei cu 'Adrian Belei'.",
    messages: [{
      role: "user",
      content: `Email primit:\nDe la: ${email.from}\nSubiect: ${email.subject}\nFragment: ${email.snippet}\n\nInstructiuni pentru raspuns: ${request}`,
    }],
    maxTokens: 700,
  });
  const draftId = await createDraft({
    to: email.from,
    subject: email.subject,
    body,
    threadId: email.threadId,
  });
  await audit("draft_email", `Re: ${email.subject}`, `gmail draft ${draftId}`, true);
  return `✉️ Draft creat in Gmail la „${email.subject}”:\n\n${body}\n\n(E doar draft — il trimiti tu din Gmail.)`;
}

async function generalChat(channel, text) {
  const [ctx, memories, reminders] = await Promise.all([
    getContext(),
    recall(text),
    activeReminders(5),
  ]);

  let system = PERSONA;
  if (ctx.summary) system += `\n\nSUMARUL CONVERSATIEI DE PANA ACUM:\n${ctx.summary}`;
  if (memories.length) {
    system +=
      "\n\nMEMORIE RELEVANTA (fapte salvate anterior):\n" +
      memories.map((m) => `[${m.category}] ${m.fact}`).join("\n");
  }

  const messages = [
    ...ctx.recent.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: text },
  ];

  let reply = await callClaude({ system, messages, maxTokens: 900 });
  reply = reply || "…";

  // Modul "nu ma lasa sa uit": reamintire la fiecare interactiune.
  if (reminders.length) {
    reply +=
      `\n\n⏰ Nerezolvate (${reminders.length}):\n` +
      formatReminders(reminders.slice(0, 3)) +
      `\n(raspunde: rezolvat #id / amana #id [zile] / ignora #id)`;
  }

  remember(channel, text, reply);
  return reply;
}

/** Persistenta istoric + intretinere async (sumar, extragere fapte). */
function remember(channel, userText, assistantText) {
  if (!pool) return;
  (async () => {
    await appendMessage(channel, "user", userText);
    await appendMessage(channel, "assistant", assistantText);
    userMsgCounter++;
    if (userMsgCounter % 8 === 0) {
      const recent = await query(
        `SELECT role, content FROM conversations ORDER BY id DESC LIMIT 16`
      );
      const block = recent
        .reverse()
        .map((m) => `${m.role === "user" ? "Adi" : "JARVIS"}: ${m.content}`)
        .join("\n");
      await extractFacts(block);
    }
    await maybeSummarize();
  })().catch((e) => console.error("[remember]", e.message));
}

function guessCategory(text) {
  const n = norm(text);
  if (/(credit|banca|tva|factur|plat[ai]|incasar|cash|eur|ron|lei)/.test(n)) return "Financiar";
  if (/(contract|notar|avocat|clauz|juridic|instant)/.test(n)) return "Contracte";
  if (/(proiect|bloc|santier|apartament|bell|residence)/.test(n)) return "Proiecte";
  if (/(task|nelu|dana|mihaela|echipa)/.test(n)) return "Operational";
  return "Personal";
}

// Folosit de gmail la clasificare → reminders; reexportat pentru scheduler (Faza 3).
export { addReminder };
