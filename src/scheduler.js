import cron from "node-cron";
import { pushToOwner } from "./telegram.js";
import { getMyOpenTasks } from "./sources/operational.js";

/**
 * SCHELET pentru FAZA 3.
 * Verificare task-uri de 2x/zi (09:00 si 17:00) + raport proactiv.
 *
 * In Faza 1 e DEZACTIVAT. Activeaza-l apeland startScheduler() din index.js
 * cand ajungem la Faza 3 (cand avem si logica de "task NOU fata de ultima
 * verificare", ca sa nu te spamuiasca cu aceleasi task-uri).
 */
export function startScheduler() {
  // 09:00 si 17:00, ora Romaniei
  cron.schedule(
    "0 9,17 * * *",
    async () => {
      const tasks = await getMyOpenTasks();
      await pushToOwner(`🕘 Verificare task-uri Operational:\n\n${tasks || "—"}`);
    },
    { timezone: "Europe/Bucharest" }
  );
  console.log("[scheduler] activ: 09:00 si 17:00 Europe/Bucharest");
}
