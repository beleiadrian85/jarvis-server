// ACTION CARDS — API. Apasarea unui buton = POST /api/actions/execute (token semnat →
// revalidare → executie TASKS-only → receipt). Sub middleware-ul PIN existent.
// Gated cu CEO_ACTION_CARDS_ENABLED. Zero write in afara CommandBus.
import { config } from "../../config.js";
import { executeAction, renderExecuted } from "./executor.js";
import { getCard, activeCards, transitionCard } from "./actionStore.js";
import { recordDecisionExample, getPreferences } from "./decisionLearning.js";
import { decidePolicy, listPolicies, recordSupervisedFeedback } from "./autonomyPolicy.js";
import { audit } from "../../audit.js";

const arr = (v) => (Array.isArray(v) ? v : []);

export function registerActionApi(app) {
  // POST /api/actions/execute — apasare buton (aproba/alege/informatie).
  app.post("/api/actions/execute", async (req, res) => {
    if (!config.actionCards) return res.status(503).json({ error: "Action Cards indisponibile (CEO_ACTION_CARDS_ENABLED off)" });
    try {
      const { token, card_id, action_id, user_id = "adrian", conversation_id = null, choice_label = null } = req.body || {};
      if (!token || !card_id || !action_id) return res.status(400).json({ error: "token, card_id, action_id obligatorii" });
      const r = await executeAction({ token, card_id, action_id, user_id, conversation_id, choice_label });
      // Invatare: inregistreaza decizia (context+alegere), best-effort.
      if (r.ok || r.status) {
        const card = await getCard(card_id).catch(() => null);
        if (card) await recordDecisionExample(card, { selected_action: choice_label || action_id }).catch(() => {});
      }
      await audit("action_card_execute", `${card_id}/${action_id}`, `ok=${r.ok} status=${r.status || "-"} ${r.reason || ""}`).catch(() => {});
      res.json({ ...r, rendered: r.card ? renderExecuted(r.card) : null });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/actions/decision — Aproba/Respinge/Amana (fara executie imediata).
  app.post("/api/actions/decision", async (req, res) => {
    if (!config.actionCards) return res.status(503).json({ error: "off" });
    try {
      const { card_id, decision } = req.body || {};
      const map = { APPROVE: "APPROVED", REJECT: "REJECTED", DEFER: "PROPOSED", CANCEL: "CANCELLED" };
      const to = map[String(decision || "").toUpperCase()];
      if (!card_id || !to) return res.status(400).json({ error: "card_id + decision (APPROVE/REJECT/DEFER/CANCEL)" });
      const r = await transitionCard(card_id, to, {});
      const card = await getCard(card_id).catch(() => null);
      if (card) await recordDecisionExample(card, { selected_action: decision }).catch(() => {});
      res.json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/actions/cards — carduri active (management by exception, max 3).
  app.get("/api/actions/cards", async (req, res) => {
    if (!config.actionCards) return res.status(503).json({ error: "off" });
    try { res.json({ cards: await activeCards({ limit: Number(req.query.limit) || 3 }) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/actions/policy/decision — Adrian aproba/activeaza/pauzeaza/revoca o regula.
  app.post("/api/actions/policy/decision", async (req, res) => {
    if (!config.actionCards) return res.status(503).json({ error: "off" });
    try {
      const { policy_id, decision, draft = null } = req.body || {};
      if (!policy_id || !decision) return res.status(400).json({ error: "policy_id + decision" });
      const r = await decidePolicy(policy_id, decision, { draft });
      res.json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/actions/policy/feedback — Corect/Anuleaza in etapa SUPERVISED.
  app.post("/api/actions/policy/feedback", async (req, res) => {
    if (!config.actionCards) return res.status(503).json({ error: "off" });
    try {
      const { policy_id, feedback } = req.body || {};
      if (!policy_id || !feedback) return res.status(400).json({ error: "policy_id + feedback (CORRECT/CANCEL/STOP_AUTO)" });
      res.json(await recordSupervisedFeedback(policy_id, feedback));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/actions/home — datele ecranului din CEO Home (read-only).
  app.get("/api/actions/home", async (_req, res) => {
    if (!config.actionCards) return res.status(503).json({ error: "off" });
    try {
      const [cards, prefs, policies] = await Promise.all([activeCards({ limit: 20 }), getPreferences(), listPolicies()]);
      res.json({
        proposed: cards.filter((c) => c.status === "PROPOSED"),
        approved: cards.filter((c) => c.status === "APPROVED"),
        learning: prefs.filter((p) => ["CANDIDATE", "OBSERVED_PATTERN"].includes(p.status)),
        rules_proposed: prefs.filter((p) => p.status === "RULE_PROPOSED"),
        supervised: policies.filter((p) => p.status === "SUPERVISED"),
        autonomous: policies.filter((p) => p.status === "ACTIVE"),
        suspended: policies.filter((p) => ["PAUSED", "REVOKED"].includes(p.status)),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
