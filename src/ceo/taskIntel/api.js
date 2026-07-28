// TASK INTELLIGENCE — API READ-ONLY (memorie/experienta/recomandari). Sub PIN.
// Gated TASK_INTELLIGENCE_ENABLED. NU scrie in Operational, NU executa taskuri.
import { config } from "../../config.js";
import { getTaskRecords } from "./ingest.js";
import { getKnowledge } from "./knowledge.js";
import { getExperiences, adviseNewTask, runLearningCycle } from "./index.js";

export function registerTaskIntelApi(app) {
  // Baza de experienta (ce a invatat JARVIS).
  app.get("/api/taskintel/experience", async (_req, res) => {
    if (!config.taskIntelligence) return res.status(503).json({ error: "Task Intelligence off" });
    try { res.json({ experiences: await getExperiences({}) }); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // Memorie taskuri + knowledge cards.
  app.get("/api/taskintel/knowledge", async (_req, res) => {
    if (!config.taskIntelligence) return res.status(503).json({ error: "off" });
    try { res.json({ tasks: (await getTaskRecords({})).length, knowledge: await getKnowledge({}) }); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // La un task nou: experiente similare + recomandare (DOAR recomanda).
  app.post("/api/taskintel/advise", async (req, res) => {
    if (!config.taskIntelligence) return res.status(503).json({ error: "off" });
    try { res.json(await adviseNewTask(req.body || {}, {})); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // Ruleaza un ciclu de invatare manual (read-only pe Operational).
  app.post("/api/taskintel/run-cycle", async (_req, res) => {
    if (!config.taskIntelligence) return res.status(503).json({ error: "off" });
    try { res.json(await runLearningCycle({})); } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
