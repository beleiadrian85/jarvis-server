// ASK CODEX — API (§1). Endpoint pentru butonul "Intreaba CODEX" din Operational.
// Se inregistreaza DUPA middleware-ul PIN (backendul Operational detine PIN-ul si
// trece `user_id` = angajatul autentificat → need-to-know). Acelasi Cognitive
// Kernel. Comenzile raman TASKS-only prin CommandBus. Gateat cu CODEX_ASK_ENABLED.
import { config } from "../config.js";
import { askCodex } from "./askCodex.js";
import { loadThread } from "./conversationStore.js";
import { captureFriction } from "./friction.js";
import { detectBlocker, asksMissingData } from "./askCodex.js";
import { buildSourceTruth } from "../ceo/sourceTruth.js";
import { audit } from "../audit.js";

const arr = (v) => (Array.isArray(v) ? v : []);

export function registerCodexApi(app) {
  // POST /api/codex/ask — o intrebare/comanda de la Dana/Nelu/Adrian.
  app.post("/api/codex/ask", async (req, res) => {
    if (!config.askCodex) return res.status(503).json({ error: "Ask CODEX indisponibil (CODEX_ASK_ENABLED off)" });
    try {
      const { user_id, question, thread_id = "default", task_context = null, attachments = [] } = req.body || {};
      if (!user_id || !String(question || "").trim()) return res.status(400).json({ error: "user_id si question sunt obligatorii" });

      // Serverul construieste Source Truth (nu clientul) — nu se poate falsifica din UI.
      const sourceTruth = await buildSourceTruth().catch(() => null);

      const result = await askCodex({
        user_id, question, thread_id, task_context,
        attachments: arr(attachments).slice(0, 5), // limita atasamente/tur
        sourceTruth,
      });

      // Senzor de frictiune (§9) — best-effort, nu blocheaza raspunsul.
      const blk = detectBlocker(question);
      if (blk.isBlocker) await captureFriction({ kind: "repeated_blocker", subject: blk.blocker_text, user_id, impact: blk.external_dependency ? 3 : 2, at: new Date().toISOString() }).catch(() => {});
      if (asksMissingData(question)) await captureFriction({ kind: "missing_document", subject: question, user_id, impact: 2, at: new Date().toISOString() }).catch(() => {});

      await audit("codex_ask", `${user_id}: ${String(question).slice(0, 80)}`, `mode=${result.mode} receipt=${result.receipt?.ok || false} oos=${result.out_of_scope.join(",")}`, true).catch(() => {});
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/codex/thread?user_id=&thread_id= — istoricul unui fir (context).
  app.get("/api/codex/thread", async (req, res) => {
    if (!config.askCodex) return res.status(503).json({ error: "Ask CODEX indisponibil" });
    try {
      const { user_id, thread_id = "default" } = req.query || {};
      if (!user_id) return res.status(400).json({ error: "user_id obligatoriu" });
      const t = await loadThread(user_id, thread_id);
      // Nu expunem clasificarea interna in UI — doar rol + text.
      res.json({ user_id, thread_id, turns: arr(t.turns).map((x) => ({ role: x.role, text: x.text, at: x.at })) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
