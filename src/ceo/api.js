// CEO COMMAND CENTER — fundatia API (P2). READ-ONLY, sub PIN-ul existent al
// HUD-ului (middleware-ul /api din api.js se aplica si aici — rutele se
// inregistreaza DUPA registerApi). Interfata de management PESTE Operational,
// nu dublarea lui. Zero scrieri, zero actiuni.
import { collectCeoContext, ceoShadowAnswers, buildDataMap, buildDataGaps } from "./index.js";
import { buildLiquidityModel } from "./cashIntelligence.js";
import { ceoSystemHealth } from "./selfAudit.js";
import { listProposals } from "./proposalEngine.js";
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
      const liq = buildLiquidityModel({
        asOf: ctx.world.asOf, bankBalance: ctx.world.openingBalance ?? null,
        confirmedReceivables: null, probableReceivables: null,
        obligations: ctx.world.obligations || [], projectCommitments: null,
      });
      res.json(liq);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
