import { getWeather } from "./sources/weather.js";
import { getTodayEvents } from "./sources/calendar.js";
import { getImportantEmails, getUnansweredSent } from "./sources/gmail.js";
import { listTasks } from "./mcp.js";
import { getVaultDigest } from "./sources/vault.js";
import { activeReminders, formatReminders } from "./reminders.js";
import { config, hasOperational, hasVault } from "./config.js";
import { callClaude } from "./claude.js";
// P2 — predictii deterministe (GATED pe config.predictionEngine).
import { buildPredictionState } from "./predictionState.js";
import { predict } from "./predictionEngine.js";

/**
 * Raportul de dimineata extins (constitutie 2.5).
 * Toate sursele se aduna determinist (fara tokeni); UN singur apel Claude
 * face sinteza finala — consum predictibil (regula 7).
 */

function groupTasks(rawLines) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
  const groups = { blocate: [], azi: [], intarziate: [], rest: 0 };
  for (const line of rawLines) {
    const status = line.match(/status:\s*(\w+)/)?.[1];
    const deadline = line.match(/termen:\s*([\d-]+)/)?.[1];
    if (status === "blocat") groups.blocate.push(line);
    else if (deadline && deadline < today) groups.intarziate.push(line);
    else if (deadline === today) groups.azi.push(line);
    else groups.rest++;
  }
  return groups;
}

/** PUR: sectiunea CASH din snapshot-ul financiar. Fara placeholder; ce lipseste =
 *  "Date insuficiente". Marcheaza incasarile estimate ca ASTEPTARI (Constitutia). */
export function formatCashSection(cash) {
  const fmt = (n) => Number(n).toLocaleString("ro-RO");
  if (!cash) return "CASH / FINANCIAR: Date insuficiente (Operational financiar indisponibil).";
  const l = [];
  l.push(`  • De încasat (facturi neplătite): ${cash.toReceive ? `${fmt(cash.toReceive.amount)} lei · ${cash.toReceive.count} facturi (${fmt(cash.toReceive.soon)} lei scadente ≤30 zile)` : "Date insuficiente"}`);
  l.push(`  • De plătit (furnizori neconfirmați): ${cash.toPay ? `${fmt(cash.toPay.amount)} lei · ${cash.toPay.count}` : "Date insuficiente"}`);
  if (cash.estimated) l.push(`  • Încasări estimate (AȘTEPTĂRI, neconfirmate): ${fmt(cash.estimated.amount)} lei · ${cash.estimated.count}`);
  l.push("  • Sold bancar: Date insuficiente (nu e conectat — vine prin extras/input manual).");
  return "CASH / FINANCIAR (Operational, read-only):\n" + l.join("\n");
}

export async function buildMorningReport() {
  const [weather, events, emails, unanswered, tasksRaw, vault, reminders] = await Promise.all([
    getWeather(),
    getTodayEvents(),
    getImportantEmails(),
    getUnansweredSent(),
    hasOperational ? listTasks({ status: "deschise" }).catch((e) => {
      console.error("[morning.tasks]", e.message);
      return null;
    }) : Promise.resolve(null),
    hasVault ? getVaultDigest().catch((e) => {
      console.error("[morning.vault]", e.message);
      return null;
    }) : Promise.resolve(null),
    activeReminders(8),
  ]);

  const parts = [];

  // Vreme
  if (weather) {
    parts.push(
      `VREME ${weather.city}: acum ${weather.now}°C (resimtit ${weather.feels}°C), ${weather.desc}, ` +
      `vant ${weather.wind} km/h. Azi: min ${weather.min}°C / max ${weather.max}°C, ` +
      `${weather.dayDesc}, sansa ploaie ${weather.rainChance}%.`
    );
  } else parts.push("VREME: indisponibila.");

  // Calendar
  if (events === null) parts.push("CALENDAR: neconfigurat.");
  else if (!events.length) parts.push("CALENDAR: nimic programat azi.");
  else parts.push("CALENDAR azi:\n" + events.map((e) => `  ${e.time} — ${e.title}`).join("\n"));

  // Emailuri
  if (emails === null) parts.push("EMAIL: neconfigurat.");
  else if (!emails.length) parts.push("EMAIL: niciun email important nou.");
  else {
    parts.push(
      "EMAILURI IMPORTANTE (ultimele 2 zile):\n" +
        emails.map((e) => `  • „${e.subject}” — ${e.from.replace(/<.*>/, "").trim()} — ${e.snippet}`).join("\n")
    );
  }
  if (unanswered && unanswered.length) {
    parts.push(
      "TRIMISE FARA RASPUNS >3 zile lucratoare:\n" +
        unanswered.map((u) => `  • „${u.subject}” catre ${u.to} (${u.days} zile)`).join("\n")
    );
  }

  // Task-uri Operational, grupate determinist
  if (tasksRaw === null) parts.push("OPERATIONAL: neconfigurat sau indisponibil.");
  else {
    const lines = tasksRaw.split("\n").filter((l) => l.trim().startsWith("•"));
    const g = groupTasks(lines);
    const sec = [];
    if (g.blocate.length) sec.push("🔴 BLOCATE:\n" + g.blocate.join("\n"));
    if (g.azi.length) sec.push("🟡 SCADENTE AZI:\n" + g.azi.join("\n"));
    if (g.intarziate.length) sec.push("🟠 INTARZIATE:\n" + g.intarziate.join("\n"));
    sec.push(`🟢 Restul: ${g.rest} task-uri in lucru, fara probleme.`);
    parts.push("STATUS OPERATIONAL:\n" + sec.join("\n"));
  }

  // Vault Obsidian (firma-vault) — actiuni deschise din note
  if (vault) parts.push(vault);

  // Termene critice din reminders
  if (reminders.length) {
    parts.push("TERMENE CRITICE / NEREZOLVATE (registrul reminders):\n" + formatReminders(reminders));
  } else parts.push("TERMENE CRITICE: nimic in registru.");

  // CASH / FINANCIAR — DOAR date reale din Operational (fara placeholder, fara estimari
  // inventate). Ce lipseste = "Date insuficiente", niciodata o cifra inventata.
  {
    let cash = null;
    if (hasOperational) { try { cash = await (await import("./connectors/opsdata.js")).getCashSnapshot(); } catch { cash = null; } }
    parts.push(formatCashSection(cash));
  }

  const raw = parts.join("\n\n");
  const now = new Date();
  const dateStr = now.toLocaleDateString("ro-RO", {
    weekday: "long", day: "numeric", month: "long",
    timeZone: "Europe/Bucharest",
  });

  let report = await callClaude({
    system:
      "Esti JARVIS, asistentul operational al lui Adi — dezvoltator imobiliar in Sibiu (PROFI CONCEPT). " +
      "Scrii raportul de dimineata in romana, ton direct si pragmatic, fara politeturi.\n\n" +
      "STRUCTURA OBLIGATORIE (in aceasta ordine):\n" +
      "1) Salut + data (o linie).\n" +
      "2) Vremea (1 linie + recomandare practica doar daca e relevant).\n" +
      "3) Calendarul zilei.\n" +
      "4) Emailuri importante nerezolvate + trimise fara raspuns (daca exista).\n" +
      "5) Status Operational GRUPAT — pastreaza EXACT gruparea primita: " +
      "🔴 Blocate (detaliat: responsabil, termen, ultim update), 🟡 Scadente azi (detaliat), " +
      "🟠 Intarziate (detaliat), 🟢 Restul (doar numarul). Nu inventa grupuri goale.\n" +
      "6) Termene critice din registru (daca exista).\n" +
      "7) Sectiunea 'TOP 5 PRIORITATI AZI' — NUCLEUL raportului.\n" +
      "8) Sectiunea 'CASH / FINANCIAR' — REDA EXACT cifrele reale primite (de încasat, de plătit, " +
      "sold bancar). NU inventa nicio valoare. Unde scrie 'Date insuficiente', pastreaza asa — " +
      "nu estima. Marcheaza incasarile estimate ca AȘTEPTĂRI, nu ca bani siguri.\n\n" +
      "REGULI TOP 5 PRIORITATI:\n" +
      "- Ordonezi dupa ierarhia stricta de impact: (1) cash-flow, (2) vanzari, (3) finantari, " +
      "(4) executie, (5) juridic. Impact pe criteriu superior bate criteriile inferioare. " +
      "Termenele apropiate urca prioritatea in cadrul aceluiasi criteriu.\n" +
      "- MAXIM 5. Nu inventezi ca sa umpli. Selectezi din task-uri, emailuri, calendar, termene critice, actiuni din vault.\n" +
      "- Format: 'N. [CRITERIU] Actiune concreta — de ce azi'. CRITERIU ∈ CASH-FLOW/VANZARI/FINANTARE/EXECUTIE/JURIDIC.\n" +
      "- Element cu impact neevaluabil → la final cu '(impact neclar)'. Nu ghici.\n\n" +
      "Sectiunile 'neconfigurat' le mentionezi intr-un cuvant. Fara introduceri. Compact, citibil in 30 secunde.\n\n" +
      "La FINAL, pe linie separata, adauga exact: '[VOCE] ' urmat de un rezumat de 1-2 fraze de " +
      "rostit cu voce — esentialul zilei plus orice necesita atentia (blocaje, intarzieri, prioritatea 1). " +
      "Raportul scris ramane complet; [VOCE] e doar pentru ascultat rapid.",
    messages: [{
      role: "user",
      content: `Data de azi: ${dateStr}.\n\nDate brute:\n\n${raw}\n\nScrie raportul de dimineata.`,
    }],
    maxTokens: 3000,
  });

  // Rezilienta: daca sinteza Claude vine goala, nu lasam raportul zilnic gol —
  // cadem pe datele brute structurate (nu depindem 100% de model).
  if (!report || !report.trim()) {
    console.error("[morning] callClaude a intors gol — fallback pe date brute.");
    report = `☀️ RAPORT DE DIMINEAȚĂ — ${dateStr}\n(sinteză indisponibilă; date brute mai jos)\n\n${raw}`;
  }

  // P2 — insereaza DETERMINIST (fara LLM) primele alerte high/critical care NU
  //       dubleaza gruparea de task-uri, inainte de linia [VOCE]. GATED pe flag.
  if (config.predictionEngine && hasOperational) {
    try {
      const block = await morningPredictionBlock();
      if (block) {
        const idx = report.search(/\n*\[VOCE\]/i);
        report = idx >= 0
          ? report.slice(0, idx).replace(/\s+$/, "") + "\n\n" + block + "\n\n" + report.slice(idx).replace(/^\s+/, "")
          : report + "\n\n" + block;
      }
    } catch (e) { console.error("[morning.prediction]", e.message); }
  }

  return report;
}

// Bloc determinist de predictii pentru morning (top 3 high/critical, fara
// dublarea blocajelor/intarzierilor deja prezente in STATUS OPERATIONAL).
async function morningPredictionBlock() {
  const result = predict(await buildPredictionState());
  const alerts = result.predictions
    .filter((p) => p.severity === "high" || p.severity === "critical")
    .filter((p) => !/^op_block|^task_overrun|^proj_delay/.test(p.key))
    .slice(0, 3);
  if (!alerts.length) return null;
  const lc = result.confidence < 0.5 ? ` (confidence ${Math.round(result.confidence * 100)}% — date parțiale)` : "";
  return "🔮 PREDICȚII (probabilistic)" + lc + ":\n" +
    alerts.map((p) => `  ${p.severity === "critical" ? "🔴" : "🟠"} ${p.title} — probabilitate ${Math.round(p.probability * 100)}%` +
      (p.daysUntilProblem != null ? `, în ${p.daysUntilProblem}z` : "")).join("\n");
}
