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
      if (r.ok) {
        // Bucla se inchide: soldul primit → request-ul CASH devine COMPLETED,
        // gap-ul se inchide, recalculul (min cash/deficit) e automat la citire.
        const { correlateResponse } = await import("./requestDelivery.js");
        r.loop = await correlateResponse("cash", { valid: true, note: `sold ${r.account.bank}/${r.account.account} introdus de ${r.account.enteredBy}` });
        // NERVOUS V1 §2: reactie la schimbare de stare (nu doar cron) —
        // ciclul reevalueaza compania cu datele noi (best-effort, ne-blocant).
        import("./nervous/index.js").then((n) => n.triggerReactiveCycle("bank-balance")).catch(() => {});
      }
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/ceo/bank-balance", async (_req, res) => {
    try { res.json(await getBalances() || { accounts: [], note: "NU AM DATE — introdu soldurile" }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Approval Inbox: decizia fondatorului. Cu send:true (butonul APPROVE & SEND)
  // si DOAR pentru information_request cu flag-ul Level 2 activ → livrare
  // imediata, idempotenta, catre identitatea verificata. Restul = doar stare.
  app.post("/api/ceo/proposals/decision", async (req, res) => {
    try {
      const r = await decideProposal({ ...req.body, decided_by: "adrian" });
      if (!r.ok) return res.status(400).json(r);
      if (req.body.send === true && String(req.body.decision).toUpperCase() === "APPROVE") {
        const { deliverApprovedRequest } = await import("./requestDelivery.js");
        const { pushToChat } = await import("../telegram.js");
        const formUrl = `https://${req.get("host")}/ceo.html`;
        // §12b: cash-request devine inutil daca soldul e deja FRESH (introdus).
        const stillNeeded = async (p) => {
          if (!/cash/.test(p.proposal_id)) return true;
          const b = await getBalances().catch(() => null);
          return !(b && !b.expired && b.freshness === "FRESH");
        };
        r.delivery = await deliverApprovedRequest(req.body.proposal_id, { send: pushToChat, formUrl, stillNeeded });
      }
      // NERVOUS V1: o decizie a fondatorului e schimbare de stare → reevaluare.
      import("./nervous/index.js").then((n) => n.triggerReactiveCycle("founder-decision")).catch(() => {});
      res.json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Mapping identitate (persoana → Telegram chat id; persoana trimite /id botului).
  app.post("/api/ceo/people-mapping", async (req, res) => {
    try {
      const { setIdentity } = await import("./requestDelivery.js");
      const r = await setIdentity(req.body.person_id, req.body.chat_id, "adrian");
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Raport de reconciliere SmartBill ↔ Operational ↔ banca (read-only, grupat).
  app.get("/api/ceo/reconciliation", async (_req, res) => {
    try {
      const { reconcileWithOperational, smartbillConfigured } = await import("../connectors/smartbill.js");
      const { getIncomeInvoices, getBankLines } = await import("../connectors/opsdata.js");
      const { buildReconciliationReport } = await import("./nervousSystem.js");
      if (!smartbillConfigured()) return res.json({ status: "NOT_CONNECTED" });
      const [inv, lines] = await Promise.all([getIncomeInvoices(), getBankLines(300)]);
      const rec = await reconcileWithOperational(inv || [], { maxCalls: 10 });
      res.json(buildReconciliationReport({ recResults: rec.results || [], incomeInvoices: inv || [], bankLines: lines || [] }));
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

  // MP5: candidatii de identitate Telegram (capturati la mesaje non-owner).
  app.get("/api/ceo/identity-candidates", async (_req, res) => {
    try {
      const [cands, map] = await Promise.all([
        getState("people:telegram:candidates", {}), getState("people:telegram", {}),
      ]);
      res.json({ candidates: cands, mapped: map });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // MP5: Executive Action Queue — toate propunerile grupate pe stare/persoana.
  app.get("/api/ceo/queue", async (_req, res) => {
    try {
      const props = Object.values(await listProposals());
      const by = (f) => props.filter(f).map((p) => ({ id: p.proposal_id, problem: p.problem, assignee: p.task_proposal?.assignee, state: p.state, delivery: p.delivery?.status }));
      res.json({
        NEEDS_ADRIAN: by((p) => ["draft", "proposed"].includes(p.state)),
        WAITING_FOR_APPROVAL: by((p) => p.state === "modified"),
        WAITING_FOR_DATA: by((p) => ["AWAITING_RESPONSE", "SENT"].includes(p.delivery?.status)),
        IN_PROGRESS: by((p) => p.state === "approved" && !p.delivery?.status),
        COMPLETED: by((p) => p.delivery?.status === "COMPLETED" || p.state === "verified"),
        BLOCKED: by((p) => ["DELIVERY_BLOCKED_NO_IDENTITY", "FAILED"].includes(p.delivery?.status)),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

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

  // ── NERVOUS SYSTEM V1 (§25-26) — vederea ORGANISM + pulsul ─────────────
  // Ce face CEO AI acum, in maximum 10 secunde: ultimul snapshot de ciclu.
  app.get("/api/ceo/organism", async (_req, res) => {
    try {
      const last = await getState("ceo:nervous:last", null);
      const { config: cfg } = await import("../config.js");
      if (!last) return res.json({ status: cfg.nervousSystem ? "PORNIT — primul ciclu inca nu a rulat" : "DORMANT (CEO_NERVOUS_SYSTEM_ENABLED=off)", enabled: cfg.nervousSystem, mode: cfg.taskAutonomy });
      res.json({ enabled: cfg.nervousSystem, mode: cfg.taskAutonomy, autonomous_info_tasks: cfg.autonomousInfoTasks, kill_switch: cfg.nervousKill, ...last });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Activity Stream — pulsul organismului, auditabil (§26).
  app.get("/api/ceo/activity-stream", async (_req, res) => {
    try {
      const stream = await getState("ceo:nervous:stream", []) || [];
      const { formatStream } = await import("./nervous/activityStream.js");
      res.json({ entries: stream.slice(-40), text: formatStream(stream, 25) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Sanatatea sistemului nervos (§24) + memoria organizationala (§21).
  app.get("/api/ceo/nervous-health", async (_req, res) => {
    try {
      const last = await getState("ceo:nervous:last", null);
      const memory = await getState("ceo:nervous:memory", {}) || {};
      const { summarizeMemory } = await import("./nervous/orgMemory.js");
      res.json({ health: last?.system_health || { status: "UNKNOWN", note: "niciun ciclu inca" }, selfeval: last?.selfeval || null, memory: summarizeMemory(memory) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Declansare manuala a unui ciclu (shadow-safe; util pentru validare).
  app.post("/api/ceo/nervous-cycle", async (_req, res) => {
    try {
      const { runNervousCycle } = await import("./nervous/cycle.js");
      const r = await runNervousCycle({ kind: "manual", persist: true });
      res.json(r.error ? { ok: false, error: r.error } : { ok: true, skipped: r.skipped || null, organism: r.organism || null });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
