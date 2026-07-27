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

  // Matricea de permisiuni email (transparenta: ce e permis vs blocat).
  app.get("/api/monitor/email-permissions", (_req, res) => {
    res.json({ matrix: emailPermissionMatrix(), send_available: false, note: "read-only + drafturi la cerere; SEND dezactivat" });
  });
}
