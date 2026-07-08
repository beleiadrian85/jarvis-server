import { callClaude, callClaudeWithMCP } from "./claude.js";
import { config, hasOperational, hasGoogle } from "./config.js";
import { pool, query } from "./db.js";
import { appendMessage, getContext, maybeSummarize } from "./history.js";
import { recall, saveMemory, saveDecision, listDecisions, extractFacts } from "./memory.js";
import { activeReminders, settleReminder, formatReminders, addReminder } from "./reminders.js";
import { prepareTaskCreate, prepareCalendarEvent, takePending, executeConfirmed } from "./taskflow.js";
import { searchDrive } from "./sources/drive.js";
import { findEmail, createDraft, searchThreads, readThread } from "./sources/gmail.js";
import { buildMorningReport } from "./morning.js";
import { cashForecastReport } from "./engines/financialBrain.js";
import { ceoHomeReport, riskReport } from "./engines/ceoHome.js";
import { projectIntelReport } from "./engines/projectIntel.js";
import { entity360Report } from "./engines/entity360.js";
import { runCouncil, impactOver50k } from "./council.js";
import { buildBriefing } from "./supervisor/briefing.js";
import { buildSalesReport } from "./supervisor/sales.js";
import { audit } from "./audit.js";

/**
 * Creierul comun Telegram + HUD: istoric si memorie partajate,
 * intentii deterministe (fara tokeni) inainte de chat-ul general.
 *
 * handleMessage(channel, text) → { reply, confirmId? }
 * confirmId = exista o actiune in asteptare; UI-ul afiseaza Da/Nu.
 */

// Model rapid pentru conversatie (rapoartele/consiliul raman pe config.model).
const CHAT_MODEL = process.env.CHAT_MODEL || "claude-haiku-4-5-20251001";

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
  "poti doar pregati datele unei plati (suma, IBAN, scadenta) pentru executie umana.\n" +
  "MOD CONSILIER: nu esti operator de centrala, esti partener de management. Avertizezi cand " +
  "auzi o intentie riscanta, propui alternative nechemat, semnalezi riscuri SI oportunitati " +
  "(comerciale, fiscale, de finantare) pe baza memoriei si a reminderelor — niciodata inventate. " +
  "Tratezi utilizatorul ca pe directorul companiei.\n" +
  "MOD CRITIC: daca ceva contrazice o decizie anterioara, o cifra, un termen sau obiectivele " +
  "din memorie, spui DIRECT, exact formularea: 'Consider ca aceasta este o greseala.' urmat de " +
  "motiv. Doar cand ai dovada clara din memorie/sistem, nu din precautie excesiva. " +
  "Corectezi pe loc cifre si contradictii ('Stai — luna trecuta ai zis X').\n" +
  "STIL: raspunsuri SCURTE implicit (2-5 fraze, potrivite si pentru voce). Detaliile lungi le " +
  "oferi la cerere ('Vrei varianta detaliata?') sau le rezumi. Ceri clarificari doar la " +
  "ambiguitate reala intre cel putin doi candidati plauzibili, nu din exces de prudenta.\n" +
  "REZUMAT VOCAL: cand raspunsul e lung sau structurat (raport, lista, mai multe puncte), " +
  "adauga la FINAL, pe linie separata, exact: '[VOCE] ' urmat de un rezumat de 1-2 fraze de " +
  "rostit cu voce — esentialul plus orice necesita atentia lui Adi (blocaje, intarzieri, urgente). " +
  "Restul ramane scris, pentru citit. La raspunsuri scurte NU adauga [VOCE].";

/**
 * Separa rezumatul vocal '[VOCE] ...' de textul complet.
 * → { text: ce se afiseaza, voice: ce se rosteste (null daca lipseste) }.
 */
export function splitVoice(reply) {
  const s = String(reply || "");
  const m = s.match(/\n*\[VOCE\]\s*:?\s*([\s\S]+)$/i);
  if (!m) return { text: s.trim(), voice: null };
  return { text: s.slice(0, m.index).trim(), voice: m[1].trim() };
}

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

  // 0.5) Supervisor briefing (F1) — la cerere.
  if (/^\/?(supervizor|briefing|brief|ce probleme)\b/.test(n) || n === "ce e cu operational") {
    const b = await buildBriefing();
    remember(channel, text, b);
    return { reply: b };
  }

  // 0.6) Raport Vanzari + Parteneri — la cerere.
  if (/^\/?(raport\s+)?(vanzari|v[aâ]nz[aă]ri|parteneri|spion)\b/.test(n) || /cum (stau|merg) (vanzarile|v[aâ]nz[aă]rile|partenerii)/.test(n)) {
    const r = await buildSalesReport();
    remember(channel, text, r);
    return { reply: r };
  }

  // 1) Raport de dimineata.
  if (WAKE.some((w) => n.includes(w)) || n === "/raport" || n === "raport") {
    const report = await buildMorningReport();
    await audit("raport", "raport de dimineata generat", "vreme+calendar+gmail+operational+reminders");
    remember(channel, text, report);
    return { reply: report };
  }

  // 1.5) Financial Brain — cash forecast / necesar de plati (determinist).
  if (hasOperational && isCashForecastTopic(text)) {
    const rep = await cashForecastReport({ openingBalance: extractBalance(text) });
    await audit("cash_forecast", "prognoza cash generata", "operational:list_payment_obligations");
    remember(channel, text, rep);
    return { reply: rep };
  }

  // 1.6) CEO Home — starea firmei intr-un ecran + Health Score.
  if (hasOperational && isCeoHomeTopic(text)) {
    const rep = await ceoHomeReport({ openingBalance: extractBalance(text) });
    await audit("ceo_home", "CEO Home generat", "operational:cash+sales+tasks");
    remember(channel, text, rep);
    return { reply: rep };
  }

  // 1.7) Risk Engine — riscuri prioritizate.
  if (hasOperational && isRiskTopic(text)) {
    const rep = await riskReport();
    await audit("risk_engine", "riscuri evaluate", "operational:cash+tasks+sales");
    remember(channel, text, rep);
    return { reply: rep };
  }

  // 1.8) Project Intelligence — cost/task-uri/vanzari pe proiecte.
  if (hasOperational && isProjectTopic(text)) {
    const rep = await projectIntelReport();
    await audit("project_intel", "raport proiecte generat", "operational:project_costs+tasks+sales");
    remember(channel, text, rep);
    return { reply: rep };
  }

  // 1.9) Knowledge Graph lite — Entity 360 ("tot ce tine de X").
  if (hasOperational) {
    const ent = extractEntity(text);
    if (ent) {
      const rep = await entity360Report(ent);
      await audit("entity360", `entitate: ${ent}`, "operational:tasks+plati+vanzari+costuri");
      remember(channel, text, rep);
      return { reply: rep };
    }
  }

  // 2) Remindere: rezolvat / amana / ignora #id.
  const rem = n.match(/^(rezolvat|amana|ignora)\s*#?(\d+)(?:\s+(\d+))?$/);
  if (rem) {
    const msg = await settleReminder(Number(rem[2]), rem[1], rem[3] ? Number(rem[3]) : 3);
    return { reply: msg };
  }

  // 2.5) Consiliu AI (la cerere).
  if (/\bconsiliu\b/i.test(n)) {
    const q = text.replace(/.*consiliu[:\s]*/i, "").trim() || "ultima decizie discutata";
    const r = await runCouncil(q);
    remember(channel, text, r);
    return { reply: "🏛️ CONSILIU JARVIS\n\n" + r };
  }

  // 3) Registrul de decizii.
  const dec = text.match(/noteaz[aă] decizia[:\s]+([\s\S]+)/i);
  if (dec) {
    const d = await saveDecision(dec[1].trim());
    await audit("decizie_notata", d.decision, "registru decizii", true);
    remember(channel, text, d.decision);
    let reply =
      `📌 Decizie notata (#${d.id}):\n${d.decision}` +
      (d.figures ? `\nCifre: ${d.figures}` : "") +
      (d.risks ? `\nRiscuri: ${d.risks}` : "") +
      (d.review_by ? `\nRevizuire: ${d.review_by}` : "");
    // Consiliu automat la impact >50.000 EUR (constitutie, Faza 4).
    if (impactOver50k(`${dec[1]} ${d.figures || ""}`)) {
      const council = await runCouncil(d.decision).catch(() => null);
      if (council) reply += "\n\n🏛️ Impact estimat mare — consiliul JARVIS:\n\n" + council;
    }
    return { reply };
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

  // 5.5) Calendar / alarma (cu confirmare). Necesita Google conectat.
  if (isCalendarTopic(text)) {
    if (!hasGoogle) {
      return { reply: "Calendarul nu e conectat încă. Conectează Google (link-ul de setup) și pot crea evenimente și alarme care apar pe telefon." };
    }
    try {
      const { id, preview } = await prepareCalendarEvent(text);
      pendingByChannel.set(channel, id);
      return { reply: preview + "\n\nRaspunde: da / nu", confirmId: id };
    } catch (e) {
      return { reply: e.message };
    }
  }

  // 5.7) Email: cautare + citire + sinteza (read-only; trimiterea NU se face).
  if (isEmailTopic(text)) {
    if (!hasGoogle) {
      return { reply: "Emailul nu e conectat încă. Conectează Google (link-ul de setup) și pot căuta, citi și pregăti drafturi (nu trimit nimic fără tine)." };
    }
    return { reply: await handleEmailQuery(channel, text) };
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

  // 7.5) Pagina web noua (Google). HUD-ul deschide fila pe device (openUrl);
  // pe Telegram ramane link apasabil in text.
  const web = parseOpenWebPage(text, channel);
  if (web) {
    await audit("pagina_web", web.url, "deschidere browser", true);
    remember(channel, text, web.reply);
    return { reply: web.reply, openUrl: web.url };
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

  // VITEZA: chat pe model rapid (Haiku); tool-urile (MCP/web) intra DOAR cand
  // sunt necesare, ca raspunsurile simple sa fie instant.
  const useOperational = hasOperational && isOperationalTopic(text);
  const useWeb = needsWeb(text);

  let reply;
  if (useOperational || useWeb) {
    if (useWeb) {
      system +=
        "\n\nINTERNET: ai cautare web. Foloseste-o cand intrebarea cere info curenta/externa " +
        "(preturi, cursuri, vreme, stiri, firme, reglementari). Raspuns scurt, cu sursa daca e relevant.";
    }
    if (useOperational) {
      system +=
        "\n\nTOOLS OPERATIONAL (acces complet) — reguli de autoritate (constitutie):\n" +
        "- CITIRE, executa direct: list_tasks, get_task, list_alerts, list_journals, project_costs, " +
        "list_material_orders, building_expenses, production_summary, list_payment_obligations, cash_report, " +
        "sales_summary, list_sales_units, partner_activity (raport spion — ce fac partenerii de vanzari).\n" +
        "- add_observation, import_price_references: Nivel 2, executa direct.\n" +
        "- create_task, create_task_from_obligation: prezinta structura si executa DOAR la confirmare " +
        "('da'); daca tocmai a confirmat, executa.\n" +
        "- update_task (status/edit/resolve/validate) = Nivel 3: NICIODATA fara confirmare explicita. Intreaba intai, scurt.\n" +
        "- delete_task = Nivel 3 (distructiv, dar soft-delete recuperabil 30 zile): cere confirmare explicita inainte. " +
        "restore_task recupereaza un task sters.\n" +
        "- PLATI (Nivel 4): list_payment_obligations si cash_report sunt DOAR informative. Poti PREGATI " +
        "datele unei plati (suma, scadenta, furnizor, IBAN) si le prezinti, dar NU executi si NU promiti " +
        "executarea — plata o face Adi in aplicatia bancii. create_task_from_obligation creeaza doar un memento, nu o plata.";
    }
    reply = await callClaudeWithMCP({
      model: CHAT_MODEL,
      system,
      messages,
      webSearch: useWeb,
      mcpServers: useOperational ? [{ name: "operational", url: config.operationalMcpUrl }] : [],
      maxTokens: 1400,
    });
  } else {
    // Cale rapida: fara tool-uri.
    reply = await callClaude({ model: CHAT_MODEL, system, messages, maxTokens: 800 });
  }
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

// Subiect care cere tool-urile Operational (acces COMPLET de supervizor in chat).
function isOperationalTopic(text) {
  const n = norm(text);
  return /(task|tascu|sarcin|nelu|dana|mihaela|operational|alert|notific|blocat|intarzi|valida|rezolv|partial|criteriu|disciplin|observat|termen|deadline|santier|echipa|cost|costuri|cash|lichiditat|necesar de bani|plat[aei]|obligati|scadent|furnizor|factur|material|comand[ae]|\bpret\b|preturi|jurnal|vanzar|vandut|cumparar|cheltuiel|productie|c3|hipodrom|m[aâ]r[sș]a|proiect|tva|apartament|unitat|bell|residence|partener|spion|rezervat|comision|avans|disponibil)/.test(n);
}

// Extrage entitatea din "tot ce tine de X" / "tot despre X" (Entity 360).
function extractEntity(text) {
  const m = text.match(/(?:tot ce [tț]ine de|tot despre|arat[aă]-?mi tot despre|ce [sș]tii despre|informa[tț]ii despre|leg[aă]turi(?:le)?\s+(?:cu|despre)|dosarul(?:\s+lui)?)\s+(.+)$/i);
  if (!m) return null;
  const name = m[1].replace(/[?.!]+\s*$/, "").trim();
  return name.length >= 2 ? name : null;
}

// Intentie Project Intelligence → raport pe proiecte.
function isProjectTopic(text) {
  const n = norm(text);
  return /(project intelligence|proiectele|toate proiectele|status(ul)? proiect|situati[ae] proiect|cum st(a|au) proiect|raport proiect|costuri pe proiect)/.test(n);
}

// Intentie riscuri → Risk Engine.
function isRiskTopic(text) {
  const n = norm(text);
  return /(\briscuri\b|\brisc\b|ce riscuri|ce poate merge prost|risk engine|ce ma expune|unde sunt expus|pericol)/.test(n);
}

// Intentie CEO Home / starea firmei → agregator + Health Score.
function isCeoHomeTopic(text) {
  const n = norm(text);
  return /(\/?ceo\b|ceo home|ceo mode|starea firmei|cum st[aă] firma|cum st[aă]m|dashboard|acas[aă]|sumar firm|health score|scor.*firm|unde st[aă]m)/.test(n);
}

// Extrage soldul curent din mesaj ("cu 200000 in cont", "sold 150.000",
// "1,5 mil", "250 mii", "1.500.000").
function extractBalance(text) {
  const n = norm(text);
  let m = n.match(/(?:sold|cont|banc[aă]|am|cu)\D{0,10}([\d][\d.,]*)\s*(mii|mil(?:ioane)?|k)?/);
  if (!m) m = n.match(/([\d][\d.,]*)\s*(mii|mil(?:ioane)?|k)\b/);
  if (!m) m = n.match(/([\d][\d.,]{3,})\s*(?:lei\s+)?(?:in|din)\s+(?:cont|banc)/);
  if (!m) return null;
  const raw = m[1];
  const unit = m[2];
  const mul = unit === "mii" || unit === "k" ? 1000 : unit && /mil/.test(unit) ? 1_000_000 : 1;
  let num;
  if (mul !== 1 && /^\d{1,3}([.,]\d{1,3})?$/.test(raw)) num = Number(raw.replace(",", ".")); // zecimal cu unitate
  else num = Number(raw.replace(/\./g, "").replace(",", ".")); // puncte = mii
  if (!isFinite(num)) return null;
  num *= mul;
  if (mul === 1 && num < 1000) return null; // fara unitate, cifre mici = nu e sold
  return num > 0 ? num : null;
}

// Intentie de cash forecast / necesar de plati → Financial Brain determinist.
function isCashForecastTopic(text) {
  const n = norm(text);
  if (/(forecast|cash ?flow|flux (de )?numerar|necesar (de )?(cash|bani|plat[aei])|situatie financiara|proiectie cash|scadentar|cat.*(am de plat|trebuie sa plat))/.test(n)) return true;
  if (/prognoz/.test(n) && /(cash|plat[aei]|bani|financiar|lichiditat)/.test(n)) return true;
  return false;
}

// Intentie despre email (cautare/citire in Gmail).
function isEmailTopic(text) {
  const n = norm(text);
  if (/draft/.test(n)) return false; // draftul are flux propriu
  return /(\bemail\b|\bemailuri\b|\bmail\b|\bmailul\b|gmail|in inbox|in casuta|mesaj de la|scrisoare de la|ce mi-a scris|am primit (vreun |un )?(mail|email)|verifica (mailul|emailul|inbox|casuta))/.test(n);
}

// Cautare + citire + sinteza pe Gmail (read-only). Reguli din handoff-ul lui Adi.
async function handleEmailQuery(channel, text) {
  let q;
  try {
    q = (await callClaude({
      model: CHAT_MODEL,
      system:
        "Transforma cererea in DOAR un query de cautare Gmail valid (o singura linie, fara explicatii). " +
        "Operatori Gmail: from:, subject:, newer_than:, has:attachment, \"fraza exacta\". " +
        "Pentru nume/locuri romanesti adauga variante OR cu si fara diacritice (ex: Marsa OR Mârșa). " +
        "Cauta firme atat dupa denumire cat si dupa domeniul de email. Implicit newer_than:60d.",
      messages: [{ role: "user", content: text }],
      maxTokens: 120,
    })).trim().replace(/^`+|`+$/g, "").split("\n")[0];
  } catch { q = "in:inbox newer_than:30d"; }

  const threads = await searchThreads(q, 25).catch(() => null);
  if (threads === null) return "Nu am putut căuta în Gmail.";
  if (!threads.length) return `Niciun email găsit pentru: ${q}`;

  const detailed = [];
  for (const t of threads.slice(0, 3)) {
    const msgs = await readThread(t.threadId).catch(() => null);
    if (msgs) detailed.push({ subject: t.subject, from: t.from, date: t.date, msgs });
  }
  const ctx = detailed
    .map((d) =>
      `FIR: ${d.subject} — ${d.from} (${d.date})\n` +
      d.msgs.map((m) => `[${m.from} → ${m.to}] ${m.body}${m.attachments.length ? `\n(atasamente: ${m.attachments.join(", ")})` : ""}`).join("\n---\n")
    )
    .join("\n\n=====\n\n");

  const answer = await callClaude({
    model: CHAT_MODEL,
    system:
      PERSONA +
      "\nRaspunzi STRICT pe baza emailurilor de mai jos. Extragi exact ce intreaba Adi " +
      "(date, sume, telefoane — care apar doar in continutul complet, scadente). " +
      "Daca raspunsul nu e in emailuri, spui clar. Scurt.",
    messages: [{ role: "user", content: `Intrebarea: ${text}\n\nEMAILURI (query: ${q}):\n${ctx.slice(0, 12000)}` }],
    maxTokens: 700,
  });
  remember(channel, text, answer);
  return answer;
}

// Intentie "porneste/deschide o pagina (noua) de internet cu Google [si cauta X]".
// Serverul nu are ecran — HUD-ul primeste openUrl si deschide fila la Adi pe device.
function parseOpenWebPage(text, channel) {
  const n = norm(text);
  const verb = /(pornes(te|ti)|porniti|deschi(d|zi)|acces(eaza|ezi)|lans(eaza|ezi)|start(eaza|ezi))/.test(n);
  const target = /(google|motorul de cautare|pagina (noua )?(de )?(internet|net|web)|fila noua|tab nou|browser)/.test(n);
  if (!verb || !target) return null;

  // Cautare ceruta explicit: "... si cauta <ceva>". ("cautare" din
  // "motorul de cautare" nu se potriveste — \s+ cere verbul "cauta").
  const q = text
    .match(/\bcaut[aăe]\s+(?:pe\s+google\s+)?(?:dup[aă]\s+)?(.+?)\s*[.?!]*\s*$/i)?.[1]
    ?.trim() || null;

  const url = q
    ? "https://www.google.com/search?q=" + encodeURIComponent(q)
    : "https://www.google.com/";
  const what = q ? `Google cu căutarea „${q}”` : "Google";
  const reply =
    channel === "hud"
      ? `🌐 Deschid ${what} într-o filă nouă. Dacă browserul o blochează, folosește linkul de sub mesaj.`
      : `🌐 Ți-am pregătit ${what} — deschide pagina de aici:\n${url}`;
  return { url, reply };
}

// Intentie de calendar / alarma (eveniment de programat).
function isCalendarTopic(text) {
  const n = norm(text);
  return /(\bin calendar\b|adauga in calendar|pune in calendar|programeaz|fa-?mi (o |un )?(intalnire|eveniment|alarma)|pune-?mi (o |un )?(intalnire|eveniment|alarma)|\bo intalnire\b|\bun eveniment\b|\balarm[aă]\b|treze[sș]te-?ma|rezerv[aă]-?mi|blocheaz[aă]-?mi (in calendar|ora))/.test(n);
}

// Cand chiar e nevoie de internet (altfel chat rapid fara tool-uri).
function needsWeb(text) {
  const n = norm(text);
  return /(cauta|caut[aă]|pe net|pe internet|google|cat costa|c[aâ]t cost|pret|preturi|curs|euro|dolar|vreme|vremea|meteo|stiri|noutati|adresa|telefon|program(ul)? de|deschis|cota|bursa|legea|reglementar|impozit|tva azi|astazi|acum pe piata)/.test(n);
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
