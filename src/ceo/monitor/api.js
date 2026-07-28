// MONITOR + NOTIFICATIONS + EMAIL — API (read + config). Sub PIN. Gated pe flags.
// Notification Center persistent; Adrian controleaza subiecte/frecvente/profil.
import { config } from "../../config.js";
import { listNotifications, updateNotification } from "../notifications/center.js";
import { monitoringHealth } from "./health.js";
import { getTopics, upsertTopic, getImpactProfile, setImpactProfile } from "./watchTopics.js";
import { emailPermissionMatrix } from "../email/permissions.js";

export function registerMonitorApi(app) {
  // Notification Center (grupat + badge).
  app.get("/api/monitor/notifications", async (_req, res) => {
    if (!config.notificationCenter) return res.status(503).json({ error: "Notification Center off" });
    try { res.json(await listNotifications({})); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/monitor/notifications/:id", async (req, res) => {
    if (!config.notificationCenter) return res.status(503).json({ error: "off" });
    try {
      const { action, snooze_until } = req.body || {};
      const now = new Date().toISOString();
      const patch = { seen: { status: "SEEN", seen_at: now }, read: { status: "READ", read_at: now },
        dismiss: { status: "DISMISSED", dismissed_at: now }, snooze: { status: "SNOOZED", snoozed_until: snooze_until || null } }[String(action || "").toLowerCase()];
      if (!patch) return res.status(400).json({ error: "action ∈ seen/read/dismiss/snooze" });
      res.json(await updateNotification(req.params.id, patch));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Sanatatea monitorizarii (transparenta — nu ascunde workeri opriti).
  app.get("/api/monitor/health", async (_req, res) => {
    if (!config.monitoringHealth) return res.status(503).json({ error: "off" });
    try { res.json(await monitoringHealth({})); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Subiecte urmarite + profil de impact (config Adrian).
  app.get("/api/monitor/topics", async (_req, res) => {
    try { res.json({ topics: await getTopics({}), impact_profile: await getImpactProfile({}) }); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/monitor/topics", async (req, res) => {
    try { res.json(await upsertTopic(req.body || {}, {})); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/monitor/impact-profile", async (req, res) => {
    try { res.json(await setImpactProfile(req.body || {}, {})); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Testeaza o notificare (Part VIII — feature de config; util si pt validare live).
  app.post("/api/monitor/test-notification", async (req, res) => {
    if (!config.notificationCenter) return res.status(503).json({ error: "off" });
    try {
      const { pushNotification } = await import("../notifications/center.js");
      const sev = req.body?.severity || "MEDIUM";
      const r = await pushNotification({ title: req.body?.title || "Notificare de test", summary: req.body?.summary || "Aceasta este o notificare de test pentru Notification Center.", severity: sev, category: "test", requires_founder: sev === "FOUNDER_DECISION", requires_action: ["HIGH", "CRITICAL", "FOUNDER_DECISION"].includes(sev) });
      res.json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Ruleaza watcher-ul o data (manual — pt validare live). Gated pe web/legislatie.
  app.post("/api/monitor/run-watch", async (req, res) => {
    if (!config.legislationMonitoring && !config.webMonitoring) return res.status(503).json({ error: "web/legislation monitoring off" });
    try { const { runWatch } = await import("./worker.js"); res.json(await runWatch({ topicFilter: req.body?.topic_id || null })); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // PATCH topic (editeaza) + run acum (validare live).
  app.patch("/api/monitor/topics/:id", async (req, res) => {
    try { const { upsertTopic } = await import("./watchTopics.js"); res.json(await upsertTopic({ id: req.params.id, ...(req.body || {}) }, {})); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/monitor/topics/:id/run", async (req, res) => {
    if (!config.legislationMonitoring && !config.webMonitoring) return res.status(503).json({ error: "monitoring off" });
    try { const { runWatch } = await import("./worker.js"); res.json(await runWatch({ topicFilter: req.params.id })); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  // Personal Watch Topic din limbaj natural ("Monitorizează X").
  app.post("/api/monitor/watch-nl", async (req, res) => {
    if (!config.personalWatchTopics) return res.status(503).json({ error: "personal watch topics off" });
    try {
      const { detectWatchRequest, createWatchFromRequest } = await import("./watchTopics.js");
      const det = detectWatchRequest(req.body?.text || "");
      if (!det.isWatch) return res.status(400).json({ error: "nu am detectat o cerere de monitorizare" });
      res.json(await createWatchFromRequest(det.term, {}));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // INTELLIGENCE FEED (cronologie, management by exception).
  app.get("/api/intelligence/feed", async (_req, res) => {
    if (!config.intelligenceFeed) return res.status(503).json({ error: "Intelligence Feed off" });
    try { const { buildFeed } = await import("../feed.js"); res.json(await buildFeed({})); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Matricea de permisiuni email (transparenta: ce e permis vs blocat).
  app.get("/api/monitor/email-permissions", (_req, res) => {
    res.json({ matrix: emailPermissionMatrix(), send_available: false, note: "read-only + drafturi la cerere; SEND dezactivat" });
  });
}
