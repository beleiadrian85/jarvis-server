// PERSISTENT WATCHER — worker pe scheduler (NU bucla infinita a modelului): pentru
// subiectele active, cauta pe web (surse oficiale), detecteaza schimbari materiale,
// evalueaza impactul vs profil, produce notificari prin Notification Center.
// Inregistreaza health la fiecare rulare. Reutilizeaza web search + change detection.
import { config } from "../../config.js";
import { getTopics, getImpactProfile } from "./watchTopics.js";
import { detectChange, assessImpact } from "./changeDetection.js";
import { sourceTier, stageSummary } from "./legalStatus.js";
import { pushNotification } from "../notifications/center.js";
import { recordRun } from "./health.js";

const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * O rulare a watcher-ului legislativ/web. `llm` = callClaudeWithMCP (web search).
 * @returns { checked, material, notified, errors }
 */
export async function runWatch({ llm = null, topicFilter = null, nowISO = null, store = null } = {}) {
  const t0 = Date.now();
  const out = { checked: 0, material: 0, notified: 0, errors: [] };
  try {
    if (!config.legislationMonitoring && !config.webMonitoring) { await recordRun("legislation_watcher", { ok: true, latency_ms: 0, store }); return { ...out, skipped: "flags off" }; }
    const call = llm || (await import("../../claude.js")).callClaudeWithMCP;
    const profile = await getImpactProfile({ store });
    const topics = (await getTopics({ store })).filter((t) => t.enabled && (!topicFilter || t.id === topicFilter));

    for (const topic of topics.slice(0, 8)) {
      out.checked++;
      let signals = [];
      try {
        const raw = await call({
          system: "Esti watcher-ul legislativ/informational al lui JARVIS (dezvoltator imobiliar Sibiu, Profi Concept). " +
            "Cauta pe web NOUTATI OFICIALE recente (ultimele 2 saptamani) pe topicul dat, din surse oficiale (Monitorul Oficial, Portal Legislativ, ANAF, ANCPI, gov.ro, EUR-Lex). " +
            "Pentru fiecare, da JSON: {signals:[{title, url, source, published_at, legal_stage (unul din stadiile legislative), effective_date, summary, confidence}]}. " +
            "NU confunda adoptarea cu aplicabilitatea. Daca nimic oficial recent, signals:[]. DOAR JSON.",
          messages: [{ role: "user", content: `Topic: ${topic.title}. Interese: ${arr(profile.industries).join(", ")}, judete: ${arr(profile.counties).join(", ")}.` }],
          webSearch: true, maxTokens: 1500,
        });
        const m = String(raw || "").match(/\{[\s\S]*\}/);
        if (m) signals = arr(JSON.parse(m[0]).signals);
      } catch (e) { out.errors.push(`${topic.id}: ${e.message}`); continue; }

      for (const s of signals.slice(0, 5)) {
        s.source_tier = sourceTier(s.url || s.source);
        const change = await detectChange({ url: s.url, title: s.title, content: s.summary, legal_stage: s.legal_stage, published_at: s.published_at }, { store, topicId: topic.id });
        if (!change.notify) continue;
        out.material++;
        const impact = assessImpact({ ...s, applicable: stageSummary({ stage: s.legal_stage, effective_date: s.effective_date }).applicable, affected_processes: [] }, profile);
        // Doar semnale cu impact MEDIUM+ sau oficiale genereaza notificare imediata; restul → digest.
        const severity = impact.impact_level === "CRITICAL" ? "CRITICAL" : impact.impact_level === "HIGH" ? "HIGH" : impact.impact_level === "MEDIUM" ? "MEDIUM" : "INFORMATIONAL";
        const r = await pushNotification({
          title: `${topic.title}: ${s.title}`.slice(0, 140),
          summary: `${stageSummary({ stage: s.legal_stage, effective_date: s.effective_date, source: s.source }).note}. ${impact.mechanism}. Sursa: ${s.source} (tier ${s.source_tier}).`,
          severity, category: "legislation", source_type: "web", source_reference: s.url,
          topic_ids: [topic.id], material_change: change.changes.join("; "),
          requires_action: impact.impact_level === "HIGH" || impact.impact_level === "CRITICAL",
          requires_founder: impact.founder_decision_required,
          deduplication_key: `legis:${change.key}`,
        }, { store, nowISO });
        if (r.created) out.notified++;
      }
    }
    await recordRun("legislation_watcher", { ok: true, latency_ms: Date.now() - t0, sources_unavailable: [], store, nowISO });
  } catch (e) {
    out.errors.push(e.message);
    await recordRun("legislation_watcher", { ok: false, error: e.message, latency_ms: Date.now() - t0, store, nowISO }).catch(() => {});
  }
  return out;
}
