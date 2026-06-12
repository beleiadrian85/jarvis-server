import { getWeather } from "./sources/weather.js";
import { getMyOpenTasks } from "./sources/operational.js";
import { getTodayEvents } from "./sources/calendar.js";
import { callClaude } from "./claude.js";

/**
 * Aduna sursele in paralel si lasa Claude sa scrie un raport scurt,
 * in romana, in stilul direct al lui Adi. Un singur apel de sinteza
 * = consum de tokeni predictibil.
 */
export async function buildMorningReport() {
  const [weather, tasks, events] = await Promise.all([
    getWeather(),
    getMyOpenTasks(),
    getTodayEvents(),
  ]);

  // Construim contextul brut pentru sinteza.
  const parts = [];

  if (weather) {
    parts.push(
      `VREME ${weather.city}: acum ${weather.now}°C (resimtit ${weather.feels}°C), ${weather.desc}, ` +
      `vant ${weather.wind} km/h. Azi: min ${weather.min}°C / max ${weather.max}°C, ` +
      `${weather.dayDesc}, sansa ploaie ${weather.rainChance}%.`
    );
  } else {
    parts.push("VREME: indisponibila.");
  }

  if (events === null) {
    parts.push("CALENDAR: neconfigurat.");
  } else if (events.length === 0) {
    parts.push("CALENDAR: nimic programat azi.");
  } else {
    parts.push(
      "CALENDAR azi:\n" + events.map((e) => `  ${e.time} — ${e.title}`).join("\n")
    );
  }

  parts.push("TASK-URI OPERATIONAL:\n" + (tasks || "neconfigurat"));

  const raw = parts.join("\n\n");

  const now = new Date();
  const dateStr = now.toLocaleDateString("ro-RO", {
    weekday: "long", day: "numeric", month: "long",
    timeZone: "Europe/Bucharest",
  });

  const report = await callClaude({
    system:
      "Esti JARVIS, asistentul personal al lui Adi — dezvoltator imobiliar in Sibiu. " +
      "Scrii un raport de dimineata SCURT, in romana, ton direct si pragmatic, fara politeturi. " +
      "Primesti date brute (vreme, calendar, task-uri) si le transformi intr-un brief clar.\n\n" +
      "STRUCTURA OBLIGATORIE:\n" +
      "1) O linie de salut cu data.\n" +
      "2) Vremea pe scurt (1 linie + recomandare practica doar daca ploua/e frig/e relevant).\n" +
      "3) Calendarul zilei.\n" +
      "4) Sectiunea 'TOP 5 PRIORITATI AZI' — NUCLEUL raportului.\n\n" +
      "REGULI TOP 5 PRIORITATI:\n" +
      "- Selecteaza si ordoneaza din task-uri + calendar dupa aceasta ierarhie de impact, " +
      "in ordine stricta de importanta:\n" +
      "  (1) impact asupra cash-flow-ului,\n" +
      "  (2) impact asupra vanzarilor,\n" +
      "  (3) impact asupra finantarilor,\n" +
      "  (4) impact asupra executiei proiectelor,\n" +
      "  (5) impact asupra riscurilor juridice.\n" +
      "- Un element cu impact pe un criteriu superior bate intotdeauna unul cu impact doar " +
      "pe criterii inferioare. Termenele-limita apropiate urca prioritatea in cadrul aceluiasi criteriu.\n" +
      "- MAXIM 5 prioritati. Niciodata mai mult. Daca sunt mai putine elemente, listezi cate sunt — " +
      "nu inventezi ca sa umpli 5.\n" +
      "- Format per prioritate: 'N. [CRITERIU] Actiune concreta — de ce azi'. Criteriul intre " +
      "paranteze patrate: CASH-FLOW / VANZARI / FINANTARE / EXECUTIE / JURIDIC.\n" +
      "- Daca informatia din task e prea vaga ca sa-i evaluezi impactul, pune-o la final cu " +
      "mentiunea '(impact neclar din titlu)' — nu ghici impact pe care nu-l poti sustine.\n\n" +
      "Daca ceva e 'neconfigurat' sau 'indisponibil', mentioneaza-l intr-un cuvant, nu insista. " +
      "Fara introducere de tip 'iata raportul'. Totalul: compact, citibil in 30 de secunde.",
    messages: [
      {
        role: "user",
        content: `Data de azi: ${dateStr}.\n\nDate brute:\n\n${raw}\n\nScrie raportul de dimineata cu TOP 5 prioritati.`,
      },
    ],
    maxTokens: 1100,
  });

  return report;
}
