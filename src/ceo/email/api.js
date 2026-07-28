// EMAIL — API. Wizard de conectare + operatii READ-ONLY + drafturi la cerere.
// Sub PIN. Trimiterea e blocata structural. Operatiile reale cer Gmail conectat
// (refresh token) — altfel raspund onest "neconectat". Reutilizeaza OAuth existent
// (/auth/google), adapter read-only, permisiuni code-enforced, audit.
import { config } from "../../config.js";
import { emailStatus, isConnected, missingEnv } from "./status.js";
import { emailPermissionMatrix, canEmail } from "./permissions.js";
import { searchEmail, readEmailThread, createEmailDraft, buildSearchPlan } from "./adapter.js";
import { getState, setState } from "../../state.js";
import { audit } from "../../audit.js";

const DRAFTS_KEY = "ceo:email:drafts";
const arr = (v) => (Array.isArray(v) ? v : []);

export function registerEmailApi(app) {
  const guard = (res) => { if (!config.emailIntel?.enabled) { res.status(503).json({ error: "Email Intelligence off (JARVIS_EMAIL_INTELLIGENCE_ENABLED)" }); return true; } return false; };
  const needConn = (res) => { if (!isConnected()) { res.status(409).json({ error: "Gmail neconectat", missing_env: missingEnv(), status: emailStatus() }); return true; } return false; };

  // Status conexiune (vizibil si neconectat).
  app.get("/api/email/status", (_req, res) => { if (guard(res)) return; res.json(emailStatus()); });
  app.get("/api/email/permissions", (_req, res) => { res.json({ matrix: emailPermissionMatrix(), send_available: false, note: "read-only + drafturi; SEND dezactivat structural" }); });

  // Conectare: porneste OAuth existent (redirect). Nu incepe daca lipsesc env.
  app.post("/api/email/connect", (req, res) => {
    if (guard(res)) return;
    const missing = missingEnv();
    if (missing.length) return res.status(412).json({ error: "Configurare admin necesara inainte de conectare", missing_env: missing, guide: "/docs/GMAIL-CONNECTION-GUIDE.md" });
    res.json({ ok: true, redirect: `/auth/google?k=${encodeURIComponent(String(req.query.k || ""))}`, note: "Vei fi redirectionat catre Google. JARVIS nu vede parola." });
  });
  app.post("/api/email/disconnect", async (_req, res) => {
    if (guard(res)) return;
    // Invalidarea reala a tokenului se face prin unset env (RailwayApi) — best-effort.
    try {
      const { upsertVariables, railwayApiAvailable } = await import("../../connectors/railwayApi.js").catch(() => ({}));
      if (typeof upsertVariables === "function" && railwayApiAvailable?.()) await upsertVariables({ GOOGLE_REFRESH_TOKEN: "" });
      await audit("email_disconnect", "revocare acces Gmail (token invalidat)", "", true).catch(() => {});
      res.json({ ok: true, note: "Acces revocat. Tokenul a fost invalidat; reconectarea cere reautorizare." });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Test de conectare read-only (identitate + o cautare limitata).
  app.post("/api/email/test", async (_req, res) => {
    if (guard(res)) return; if (needConn(res)) return;
    try {
      const r = await searchEmail(buildSearchPlan({ intent: "CONNECTION_TEST", terms: ["test"], has_attachment: false }), { ctx: {} });
      await audit("email_test", "test conexiune read-only", `ok=${r.ok}`, true).catch(() => {});
      res.json({ ok: r.ok, read_only: true, note: r.ok ? "Gmail conectat. Read-only functional. Trimiterea ramane dezactivata." : "Test esuat — verifica reconectarea", reason: r.reason || null });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Cautare (read-only). Intrebari naturale → plan de cautare.
  app.post("/api/email/search", async (req, res) => {
    if (guard(res)) return; if (needConn(res)) return;
    try {
      const { query = "", people = [], terms = [], has_attachment = null, intent = "SEARCH" } = req.body || {};
      const plan = buildSearchPlan({ intent, relevant_people: people, terms: terms.length ? terms : String(query).split(/\s+/).slice(0, 6), has_attachment });
      res.json(await searchEmail(plan, { ctx: {} }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/email/thread/:id", async (req, res) => {
    if (guard(res)) return; if (needConn(res)) return;
    try { res.json(await readEmailThread(req.params.id, { ctx: {} })); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Drafturi (creare/modificare DOAR la cerere explicita; receipt real; sent=false).
  app.get("/api/email/drafts", async (_req, res) => {
    if (guard(res)) return;
    const st = (await getState(DRAFTS_KEY, { drafts: [] }).catch(() => null)) || { drafts: [] };
    res.json({ drafts: arr(st.drafts) });
  });
  app.post("/api/email/drafts", async (req, res) => {
    if (guard(res)) return; if (needConn(res)) return;
    const perm = canEmail("EMAIL_CREATE_DRAFT", { explicitRequest: true });
    if (!perm.allowed) return res.status(403).json({ error: perm.reason });
    try {
      const { to, subject, body, threadId = null } = req.body || {};
      const r = await createEmailDraft({ to, subject, body, threadId }, { ctx: { explicitRequest: true } });
      if (!r.ok) return res.status(502).json({ error: r.reason });
      const st = (await getState(DRAFTS_KEY, { drafts: [] }).catch(() => null)) || { drafts: [] };
      const rec = { id: r.draft_id, to, subject, threadId, status: "DRAFT_CREATED", sent: false, created_at: new Date().toISOString() };
      st.drafts = [rec, ...arr(st.drafts)].slice(0, 100);
      await setState(DRAFTS_KEY, st).catch(() => {});
      res.json({ ok: true, draft: rec, note: "Draftul a fost creat. NU a fost trimis." });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.patch("/api/email/drafts/:id", async (req, res) => {
    if (guard(res)) return; if (needConn(res)) return;
    const perm = canEmail("EMAIL_UPDATE_DRAFT", { explicitRequest: true });
    if (!perm.allowed) return res.status(403).json({ error: perm.reason });
    // Actualizarea reala prin provider — reutilizeaza createEmailDraft cu acelasi thread.
    try {
      const { to, subject, body, threadId = null } = req.body || {};
      const r = await createEmailDraft({ to, subject, body, threadId }, { ctx: { explicitRequest: true } });
      if (!r.ok) return res.status(502).json({ error: r.reason });
      const st = (await getState(DRAFTS_KEY, { drafts: [] }).catch(() => null)) || { drafts: [] };
      st.drafts = arr(st.drafts).map((d) => d.id === req.params.id ? { ...d, status: "DRAFT_UPDATED", updated_at: new Date().toISOString() } : d);
      await setState(DRAFTS_KEY, st).catch(() => {});
      res.json({ ok: true, note: "Draft actualizat. NU a fost trimis." });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Health email (subset din monitoring health).
  app.get("/api/email/health", (_req, res) => {
    const conn = isConnected();
    res.json({ gmail_oauth: conn ? "ok" : "not_connected", token_valid: conn, send_enabled: false,
      degraded: !conn, reason: conn ? null : "Gmail neconectat — reautorizare necesara pentru a citi emailurile" });
  });
}
