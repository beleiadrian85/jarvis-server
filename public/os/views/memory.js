// MEMORIA JARVIS — ecran de transparenta si control. JARVIS DETINE memoria, iar
// fondatorul o vede si o controleaza: ce stie, DE UNDE stie (provenienta), cat de
// sigur, si poate revoca (dreptul de a fi uitat). Read-only + revoke + recall.
// Consuma /api/memory/* si /api/models/status (gated, fail-closed).
import { h, card, pill, confidence, emptyCalm, openDrawer } from "../components/ui.js";
import * as api from "../api.js";

const TYPE_LABEL = { EPISODIC: "Episoade", SEMANTIC: "Fapte", DOCUMENT: "Documente", DECISION: "Decizii", RELATIONSHIP: "Relații", PREFERENCE: "Preferințe", POLICY: "Politici", WORKING: "Temporare" };
const VER_TONE = { CONFIRMED: "ok", VERIFIED: "ok", CORRELATED: "ok", OBSERVED: "sys", EXTRACTED: "sys", DECLARED: "warn", UNVERIFIED: "warn", CONTRADICTED: "bad", SUPERSEDED: null, REVOKED: "bad" };

export async function render(root, ctx) {
  const token = ctx.navToken;
  const [status, models] = await Promise.all([
    api.get("/api/memory/status", { fresh: true }).catch(() => ({ enabled: false })),
    api.get("/api/models/status", { fresh: true }).catch(() => ({ enabled: false })),
  ]);
  if (ctx.navToken !== token) return;

  const header = h("div", { class: "company-state" },
    h("h2", {}, "Memoria JARVIS"),
    pill(status.enabled ? "activă" : "inactivă", status.enabled ? "ok" : "warn"),
    h("p", { class: "cs-sub" }, "JARVIS deține memoria. Tu vezi ce știe, de unde știe și cât de sigur — și poți revoca orice. Modelele externe primesc doar context temporar; nu dețin memoria și nu sunt sursă de adevăr."));

  const nodes = [header];

  if (!status.enabled) {
    nodes.push(card("Memorie pe termen lung — OFF",
      h("p", { class: "dim" }, "Fundația e instalată și testată, dar dezactivată (fail-closed). Se activează prin variabila de mediu:"),
      h("pre", { class: "codeblock" }, "JARVIS_LONG_TERM_MEMORY_ENABLED=on"),
      h("p", { class: "dim", style: "margin-top:8px" }, "Până atunci, JARVIS nu memorează nimic pe termen lung — răspunde din Operational (sursa de adevăr).")));
  } else {
    // Statistici pe tip.
    const st = status.stats || {};
    const byType = st.by_type || {};
    const chips = Object.keys(TYPE_LABEL).filter((t) => byType[t]).map((t) => pill(`${TYPE_LABEL[t]}: ${byType[t]}`, "sys"));
    nodes.push(card("Ce ține minte",
      h("div", { class: "form-row", style: "flex-wrap:wrap;gap:6px" }, ...(chips.length ? chips : [h("span", { class: "dim" }, "încă nimic memorat")])),
      h("p", { class: "dim", style: "margin-top:8px" }, `${st.active || 0} memorii active din ${st.total || 0} (versiunile vechi și cele revocate rămân în audit, dar nu în recall).`)));

    // Recall (read-only).
    const q = h("input", { placeholder: "Ce știe JARVIS despre…?", "aria-label": "Caută în memorie" });
    const out = h("div", { class: "recall-out" });
    async function doRecall() {
      out.replaceChildren(h("span", { class: "dim" }, "caut…"));
      const r = await api.get("/api/memory/recall?q=" + encodeURIComponent(q.value.trim()), { fresh: true }).catch((e) => ({ error: e.message }));
      if (!r || r.error) { out.replaceChildren(h("span", { class: "dim" }, r?.error || "eroare")); return; }
      if (!r.found) { out.replaceChildren(h("p", { class: "dim" }, r.summary || "Nu am nimic relevant. (Nu inventez — verific la sursă.)")); return; }
      out.replaceChildren(h("p", { class: "dim", style: "margin-bottom:6px" }, r.summary), ...r.items.map((it) => memRow(it, doRefresh)));
    }
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") doRecall(); });
    nodes.push(card("Întreabă memoria",
      h("div", { class: "form-row" }, q, h("button", { class: "btn", onclick: doRecall }, "Caută")),
      out));

    // Listare pe tip.
    const listWrap = h("div", {});
    async function doRefresh() { const items = (await api.get("/api/memory/list?limit=60", { fresh: true }).catch(() => ({ items: [] }))).items || [];
      listWrap.replaceChildren(items.length ? h("div", {}, ...items.map((it) => memRow(it, doRefresh))) : emptyCalm("Memorie goală", "Nimic memorat încă.")); }
    await doRefresh();
    nodes.push(card("Memorii recente", listWrap));
  }

  // Modele (motoare de rationament).
  const mp = (models.providers_all || []).map((p) => pill(`${p.label}${(models.providers_active || []).includes(p.id) ? " ✓" : ""}`, (models.providers_active || []).includes(p.id) ? "ok" : null));
  nodes.push(card("Modele — motoare de raționament",
    h("div", { class: "form-row", style: "flex-wrap:wrap;gap:6px" }, ...mp),
    h("p", { class: "dim", style: "margin-top:8px" }, models.enabled
      ? `Multi-Model activ. Data Routing: ${models.data_routing ? "pornit" : "oprit"}. Cheltuială azi: ${models.cost?.usd ?? 0}$ / plafon ${models.cost?.cap || "—"}$.`
      : "Multi-Model OFF. Se activează cu JARVIS_MULTI_MODEL_ENABLED=on plus flag-ul fiecărui provider (ex. JARVIS_OPENAI_MODEL_ENABLED=on) și cheia API. Datele RESTRICTED nu pleacă niciodată la un model extern.")));

  root.replaceChildren(...nodes);
}

function memRow(it, onChange) {
  const prov = it.provenance || {};
  const tone = VER_TONE[it.verification_status] ?? null;
  const tag = it.is_inference ? pill("inferență", "warn") : pill("fapt", "ok");
  const row = h("div", { class: "mem-row card", style: "margin-top:8px" },
    h("div", { class: "form-row", style: "justify-content:space-between;align-items:flex-start" },
      h("div", {},
        h("b", {}, it.title || "(fără titlu)"),
        it.content ? h("p", { class: "dim", style: "margin-top:4px" }, String(it.content).slice(0, 200)) : null),
      h("div", { style: "display:flex;gap:4px;flex-shrink:0" }, tag, pill(it.verification_status, tone))),
    h("div", { class: "form-row", style: "flex-wrap:wrap;gap:6px;margin-top:6px" },
      pill(TYPE_LABEL[it.memory_type] || it.memory_type, "sys"),
      it.sensitivity && it.sensitivity !== "INTERNAL" ? pill(it.sensitivity, it.sensitivity === "RESTRICTED" ? "bad" : "warn") : null,
      typeof it.confidence === "number" ? confidence(it.confidence) : null),
    h("div", { class: "form-row", style: "justify-content:space-between;margin-top:6px" },
      h("button", { class: "btn quiet", onclick: () => openDrawer("De unde știe JARVIS asta?",
        h("div", {}, h("p", {}, prov.answer || "proveniență indisponibilă"),
          h("pre", { class: "codeblock", style: "margin-top:8px" }, JSON.stringify({ sursa: it.source_type, referinta: it.source_reference, verificare: it.verification_status, incredere: it.confidence, inferenta: it.is_inference, creat: it.created_at }, null, 2)))) }, "De unde știi?"),
      h("button", { class: "btn ghost", onclick: async () => {
        if (!confirm("Revoc definitiv această memorie? (rămâne în audit, iese din recall)")) return;
        await api.post("/api/memory/revoke", { id: it.id });
        row.remove(); onChange && onChange();
      } }, "Uită asta")));
  return row;
}
