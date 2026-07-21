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
