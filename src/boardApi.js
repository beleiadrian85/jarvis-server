// CEO OS — Executive Board API (read-only). SINGURA adaugire backend pentru
// redesign: expune Boardul 6+1 EXISTENT (executiveBoard/runBoardMeeting) catre
// interfata, printr-un contract curat. Nu modifica nicio logica existenta.
//
// Boardul e CONSULTATIV prin design (executiveBoard/index.js): READ-ONLY total,
// zero taskflow/approvalGate/mcp, un singur apel LLM per sedinta, scrie DOAR in
// audit_log. Fondatorul care cere Consiliul din UI = invocare legitima (la fel
// ca vechea comanda „consiliu" din Telegram). Se inregistreaza DUPA middleware-ul
// /api (PIN) din registerApi, deci mostenete autentificarea existenta.
import { runBoardMeeting, boardMode } from "./executiveBoard/index.js";

export function registerBoardApi(app) {
  // Modul boardului (active/shadow/off) — pur, ieftin.
  app.get("/api/ceo/board-mode", (_req, res) => {
    try { res.json({ mode: boardMode() }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // O sedinta de Board pe o intrebare/decizie. LENT (un apel LLM, pana la ~180s)
  // — de aceea e POST explicit, declansat de fondator, cu cache de 10 min in motor.
  app.post("/api/ceo/board", async (req, res) => {
    const question = String(req.body?.question || "").trim();
    if (!question) return res.status(400).json({ error: "question lipsa" });
    try {
      const m = await runBoardMeeting(question.slice(0, 500));
      res.json(m);
    } catch (e) {
      console.error("[api/ceo/board]", e.message);
      res.status(502).json({ error: "Sedinta de Board a esuat: " + e.message });
    }
  });
}
