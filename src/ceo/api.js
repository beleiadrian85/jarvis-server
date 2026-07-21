// CEO COMMAND CENTER — fundatia API (P2). READ-ONLY, sub PIN-ul existent al
// HUD-ului (middleware-ul /api din api.js se aplica si aici — rutele se
// inregistreaza DUPA registerApi). Interfata de management PESTE Operational,
// nu dublarea lui. Zero scrieri, zero actiuni.
import { collectCeoContext, ceoShadowAnswers, buildDataMap, buildDataGaps } from "./index.js";
import { buildLiquidityModel } from "./cashIntelligence.js";
import { ceoSystemHealth } from "./selfAudit.js";
import { listProposals, decideProposal } from "./proposalEngine.js";
import { setBalance, getBalances } from "./balanceStore.js";
import { buildFinancingRegister } from "./financingRegister.js";
import { buildCapabilityManifest } from "./capabilityManifest.js";
import { whoNeedsToDoWhat, forward30 } from "./managementView.js";
import { smartbillHealth } from "../connectors/smartbill.js";
import { getState } from "../state.js";

export function registerCeoApi(app) {
  // Harta de date + health score (fara IO greu: config + probe usoare).
  app.get("/api/ceo/data-health", async (_req, res) => {
    try {
      const map = buildDataMap({});
      res.json({ healthScore: map.healthScore, connected: map.connectedCount, total: map.domains.length, notConnected: map.notConnected, partial: map.partial, domains: map.domains });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/ceo/gaps", async (_req, res) => {
    try { res.json({ gaps: buildDataGaps(buildDataMap({})) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/ceo/system-health", async (_req, res) => {
    try { res.json(await ceoSystemHealth()); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/ceo/proposals", async (_req, res) => {
    try {
      const [proposals, improvements] = await Promise.all([
        listProposals(), getState("ceo:improvements", {}),
      ]);
      res.json({ proposals, improvements, note: "SHADOW — nimic trimis/executat fara aprobarea lui Adrian." });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Imaginea completa (context real — mai scump; pentru zonele TODAY/ATTENTION).
  app.get("/api/ceo/overview", async (_req, res) => {
    try {
      const ctx = await collectCeoContext();
      const answers = ceoShadowAnswers(ctx);
      res.json(answers);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/ceo/cash", async (_req, res) => {
    try {
      const ctx = await collectCeoContext();
      const bal = ctx.balances && !ctx.balances.expired ? ctx.balances.totalRON : null;
      const liq = buildLiquidityModel({
        asOf: ctx.world.asOf, bankBalance: bal,
        confirmedReceivables: null, probableReceivables: null,
        obligations: ctx.world.obligations || [], projectCommitments: null,
      });
      res.json({ ...liq, balances: ctx.balances });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Master Phase 2 ─────────────────────────────────────────────────────
  // Soldul bancar — SINGURA scriere permisa (jarvis_state, aditiv, auditat).
  app.post("/api/ceo/bank-balance", async (req, res) => {
    try {
      const r = await setBalance({ ...req.body, source: "command-center" });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/ceo/bank-balance", async (_req, res) => {
    try { res.json(await getBalances() || { accounts: [], note: "NU AM DATE — introdu soldurile" }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Approval Inbox: decizia fondatorului (nu trimite nimic — doar stare+audit).
  app.post("/api/ceo/proposals/decision", async (req, res) => {
    try {
      const r = await decideProposal({ ...req.body, decided_by: "adrian" });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/ceo/financing", async (_req, res) => {
    try {
      const ctx = await collectCeoContext();
      res.json(buildFinancingRegister({ asOf: ctx.world.asOf, obligations: ctx.world.obligations || [] }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/ceo/manifest", async (_req, res) => {
    try { res.json(buildCapabilityManifest({})); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/ceo/smartbill-health", (_req, res) => res.json(smartbillHealth()));

  // ── Master Phase 3 — Nervous System ────────────────────────────────────
  app.get("/api/ceo/bank-intel", async (_req, res) => {
    try {
      const { getBankLines } = await import("../connectors/opsdata.js");
      const { analyzeBankFlows } = await import("./nervousSystem.js");
      const lines = await getBankLines();
      res.json(lines ? analyzeBankFlows(lines) : { status: "SOURCE_DOWN" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/ceo/attribution", async (_req, res) => {
    try {
      const { getSiteTraffic, getLeads, getFunnelCounts } = await import("../connectors/opsdata.js");
      const { buildAttribution } = await import("./nervousSystem.js");
      const ctx = await collectCeoContext();
      const [leads, fc] = await Promise.all([getLeads(), getFunnelCounts()]);
      res.json(buildAttribution({ traffic: ctx.world.traffic, leads, funnelCounts: fc, sales: ctx.world.sales, salesHistory: ctx.salesHistory }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/ceo/source-health", async (_req, res) => {
    try {
      const { getSourcesHealth } = await import("../connectors/opsdata.js");
      res.json({ sources: getSourcesHealth(), autonomy: (await import("./nervousSystem.js")).AUTONOMY_LEVELS, active_level: 1 });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/ceo/registers/:name", async (req, res) => {
    try {
      const { getRegister } = await import("./nervousSystem.js");
      res.json(await getRegister(req.params.name));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/ceo/decisions", async (_req, res) => {
    try {
      const [proposals, memory, loop] = await Promise.all([
        listProposals(), getState("ceo:decision-memory", []), getState("ceo:closedloop", { records: {}, confidence: {} }),
      ]);
      res.json({ proposals, decision_memory: memory.slice(-20), loop });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Google Connection Wizard: pasul 1 — client id/secret (stocate sigur, nelogate).
  app.post("/api/ceo/google-credentials", async (req, res) => {
    try {
      const { client_id, client_secret } = req.body || {};
      if (!client_id || !client_secret) return res.status(400).json({ ok: false, error: "client_id + client_secret" });
      const { getState: gs2, setState: ss2 } = await import("../state.js");
      const prev = await gs2("google:oauth", {}) || {};
      await ss2("google:oauth", { ...prev, client_id, client_secret, creds_at: new Date().toISOString() });
      res.json({ ok: true, next: "/auth/google?k=PIN" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/ceo/google-status", async (_req, res) => {
    try {
      const { config: cfg } = await import("../config.js");
      const st = await getState("google:oauth", {}) || {};
      const hasClient = !!(cfg.google.clientId || st.client_id);
      const hasRefresh = !!(cfg.google.refreshToken || st.refresh_token);
      res.json({
        configured: hasClient && hasRefresh,
        source: cfg.google.refreshToken ? "env" : st.refresh_token ? "state" : null,
        has_client: hasClient, has_refresh: hasRefresh,
        next_step: hasRefresh ? "conectat" : hasClient ? "apasa CONNECT (consimtamant Google, ~1 min)" : "introdu Client ID + Secret din console.cloud.google.com (wizard, ~5 min, o singura data)",
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // TODAY: totul pentru ecranul principal Command Center intr-un singur call.
  app.get("/api/ceo/today", async (_req, res) => {
    try {
      const ctx = await collectCeoContext();
      const answers = ceoShadowAnswers(ctx);
      const health = await ceoSystemHealth();
      const who = whoNeedsToDoWhat({ answers, systemFailing: health.failing });
      const fwd = forward30({ answers, liquidity: null, episodes: ctx.episodes });
      const proposals = await listProposals();
      res.json({
        company: answers.company, generated_at: answers.generated_at,
        data_health: answers.data_health, system_health: { score: health.score, failing: health.failing },
        cash: answers.q2_cash, receivables: answers.receivables,
        priorities: answers.priorities, who, forward30: fwd,
        needs_decision: Object.values(proposals).filter((p) => ["draft", "proposed"].includes(p.state)),
        gaps: answers.q7_informatii_lipsa,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
