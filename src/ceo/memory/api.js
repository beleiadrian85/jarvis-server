// MEMORY + MULTI-MODEL — API. Sub PIN (montat dupa middleware-ul existent).
// Citire: status/stats/list/why (provenienta). Scriere: DOAR prin Write Gate
// (fondatorul isi poate salva decizii/preferinte/politici — politica cere aprobare
// explicita). Modelele: status + consultare gated (fail-closed daca OFF).
import { config } from "../../config.js";
import { remember, recall, list, stats, why, revoke, classifyOnly, memoryEnabled, correct, corrections, exportAll, restore, addRelation, neighbors, graphPath, edges, graphStats } from "./index.js";
import { detectContradictions } from "./contradiction.js";

export function registerMemoryApi(app) {
  const memGuard = (res) => { if (!config.memory?.longTerm) { res.status(503).json({ error: "Long-Term Memory OFF (JARVIS_LONG_TERM_MEMORY_ENABLED)" }); return true; } return false; };

  // Stare + statistici.
  app.get("/api/memory/status", async (_req, res) => {
    res.json({ enabled: memoryEnabled(), types: config.memory || {}, stats: memoryEnabled() ? await stats().catch(() => null) : null });
  });
  app.get("/api/memory/stats", async (_req, res) => { if (memGuard(res)) return; res.json(await stats()); });

  // Listare pe tip (read-only, exclude superseded/revoked).
  app.get("/api/memory/list", async (req, res) => {
    if (memGuard(res)) return;
    const items = await list({ type: req.query.type || null, includeInactive: req.query.all === "1", limit: Math.min(200, Number(req.query.limit || 50)) });
    res.json({ items });
  });

  // Recall (read-only) — "ce stii despre ...".
  app.get("/api/memory/recall", async (req, res) => {
    if (memGuard(res)) return;
    res.json(await recall(String(req.query.q || ""), { limit: Math.min(20, Number(req.query.limit || 8)) }));
  });

  // "De unde stii?" — provenienta unui id.
  app.get("/api/memory/why/:id", async (req, res) => {
    if (memGuard(res)) return;
    const p = await why(req.params.id);
    if (!p) return res.status(404).json({ error: "memorie inexistenta" });
    res.json(p);
  });

  // Preview clasificare (fara a scrie) — arata ce ar face Write Gate.
  app.post("/api/memory/classify", (req, res) => {
    res.json(classifyOnly({ text: `${req.body?.title || ""} ${req.body?.content || ""}`, kind: req.body?.kind, source_type: req.body?.source_type, from_model: req.body?.from_model === true, founder_approved: req.body?.founder_approved === true }));
  });

  // Scriere (fondator) — trece prin Write Gate; politica cere founder_approved.
  app.post("/api/memory/remember", async (req, res) => {
    if (memGuard(res)) return;
    const b = req.body || {};
    const r = await remember(
      { title: b.title, content: b.content, kind: b.kind, source_type: b.source_type || "founder", source_reference: b.source_reference || null, verification_status: b.verification_status || "DECLARED", sensitivity: b.sensitivity || "INTERNAL", entities: b.entities || [] },
      { founder_approved: b.founder_approved === true, from_model: false }
    );
    res.status(r.stored ? 200 : 422).json(r);
  });

  // Revocare (dreptul de a fi uitat).
  app.post("/api/memory/revoke", async (req, res) => {
    if (memGuard(res)) return;
    if (!req.body?.id) return res.status(400).json({ error: "id lipsa" });
    res.json(await revoke(req.body.id, req.body.reason || "revocat de fondator"));
  });
  // Corectare + restore (§9).
  app.post("/api/memory/correct", async (req, res) => {
    if (memGuard(res)) return;
    const b = req.body || {};
    if (!b.id) return res.status(400).json({ error: "id lipsa" });
    res.json(await correct(b.id, { title: b.title, content: b.content, kind: b.kind || "fact", source_type: b.source_type || "founder", verification_status: b.verification_status || "DECLARED" }, { reason: b.reason }));
  });
  app.post("/api/memory/restore", async (req, res) => { if (memGuard(res)) return; if (!req.body?.id) return res.status(400).json({ error: "id lipsa" }); res.json(await restore(req.body.id, {})); });
  app.get("/api/memory/corrections", async (_req, res) => { if (memGuard(res)) return; res.json({ corrections: await corrections({}) }); });
  app.get("/api/memory/export", async (_req, res) => { if (memGuard(res)) return; res.json(await exportAll({})); });

  // Graf de relatii (§14).
  app.get("/api/memory/graph", async (_req, res) => { if (memGuard(res)) return; res.json({ stats: await graphStats({}), edges: await edges({}) }); });
  app.get("/api/memory/graph/neighbors", async (req, res) => { if (memGuard(res)) return; res.json({ entity: req.query.entity, neighbors: await neighbors(String(req.query.entity || ""), {}) }); });
  app.post("/api/memory/graph/relation", async (req, res) => { if (memGuard(res)) return; res.json(await addRelation(req.body || {}, {})); });

  // Dashboard memorie (§16).
  app.get("/api/memory/dashboard", async (_req, res) => {
    if (memGuard(res)) return;
    const st = await stats({});
    const active = await list({ includeInactive: false, limit: 2000 });
    const noSource = active.filter((x) => !x.source_reference && x.verification_status !== "DECLARED").length;
    const unverified = active.filter((x) => ["UNVERIFIED", "DECLARED"].includes(x.verification_status)).length;
    const contradictions = detectContradictions(active).length;
    const expired = active.filter((x) => x.valid_until && Date.parse(x.valid_until) < Date.now()).length;
    res.json({ ...st, unverified, no_source: noSource, contradictions, expired, corrections_recent: (await corrections({ limit: 10 })).length, graph: await graphStats({}) });
  });

  // Import selectiv (§18).
  app.post("/api/memory/import/preview", async (req, res) => {
    if (!config.memory?.import) return res.status(503).json({ error: "Memory Import OFF (JARVIS_MEMORY_IMPORT_ENABLED)" });
    const { previewImport } = await import("./import.js");
    res.json(await previewImport(req.body?.items || [], { source: req.body?.source || "chatgpt" }));
  });
  app.post("/api/memory/import/confirm", async (req, res) => {
    if (!config.memory?.import) return res.status(503).json({ error: "Memory Import OFF" });
    const { confirmImport } = await import("./import.js");
    res.json(await confirmImport(req.body?.items || [], { source: req.body?.source || "chatgpt", selectedIndexes: req.body?.selected || null }));
  });

  // MODELE — status + consultare (gated, read-only pe memorie).
  app.get("/api/models/status", async (_req, res) => {
    try { const { modelsStatus } = await import("../models/index.js"); res.json(await modelsStatus()); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/models/profiles", async (_req, res) => {
    try { const { allProfiles } = await import("../models/registry.js"); const { keyMeta } = await import("../models/keyStore.js"); res.json({ profiles: allProfiles(), keys: await keyMeta({}) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/models/health", async (req, res) => {
    try { const { modelsHealth } = await import("../models/index.js"); res.json(await modelsHealth({ probe: req.query.probe === "1" })); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/models/audit", async (_req, res) => {
    try { const { recentModelAudit } = await import("../models/index.js"); res.json({ entries: await recentModelAudit({ limit: 100 }) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/models/evaluation", async (_req, res) => {
    try { const { evaluationSummary } = await import("../models/index.js"); res.json({ evaluation: await evaluationSummary({}) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // WIZARD conectare provider — cheia se stocheaza CRIPTAT si se verifica prin test API
  // real. NU se afiseaza cheia. NU se cere parola contului. (§13, §26)
  app.post("/api/models/connect", async (req, res) => {
    const provider = String(req.body?.provider || "").toLowerCase();
    if (!["openai", "anthropic", "google"].includes(provider)) return res.status(400).json({ error: "provider necunoscut" });
    if (!req.body?.apiKey) return res.status(400).json({ error: "apiKey lipsa" });
    try { const { connectProvider } = await import("../models/connect.js"); res.json(await connectProvider(provider, String(req.body.apiKey), {})); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/models/test", async (req, res) => {
    const provider = String(req.body?.provider || "").toLowerCase();
    try { const { testProvider } = await import("../models/connect.js"); res.json(await testProvider(provider, {})); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/models/disconnect", async (req, res) => {
    const provider = String(req.body?.provider || "").toLowerCase();
    try { const { deleteProviderKey } = await import("../models/keyStore.js"); res.json(await deleteProviderKey(provider, {})); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/models/ask", async (req, res) => {
    if (!config.multiModel?.enabled) return res.status(503).json({ error: "Multi-Model OFF (JARVIS_MULTI_MODEL_ENABLED)" });
    try {
      const { ask } = await import("../models/index.js");
      const r = await ask({ query: String(req.body?.query || ""), task: req.body?.task || "reasoning", sensitivity: req.body?.sensitivity || "INTERNAL", prefer: req.body?.prefer || null, maxTokens: Math.min(1200, Number(req.body?.maxTokens || 800)) });
      res.json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
