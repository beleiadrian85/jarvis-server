// AI MODELS — ecran de conectare si control al modelelor (motoare de rationament).
// Providers / Routing (matrice date) / Costs / Health / Evaluation / Audit + wizard de
// conectare OpenAI prin API oficial (cheia NU se afiseaza; test API real). Modelele nu
// detin memoria si nu ating Operational. Consuma /api/models/*.
import { h, card, pill, emptyCalm, openDrawer } from "../components/ui.js";
import * as api from "../api.js";

const TRUST_TONE = { external: "warn", private: "ok", local: "ok" };

export async function render(root, ctx) {
  const token = ctx.navToken;
  const [status, profiles] = await Promise.all([
    api.get("/api/models/status", { fresh: true }).catch(() => ({ enabled: false })),
    api.get("/api/models/profiles", { fresh: true }).catch(() => ({ profiles: [], keys: {} })),
  ]);
  if (ctx.navToken !== token) return;

  const header = h("div", { class: "company-state" },
    h("h2", {}, "AI Models"),
    pill(status.enabled ? "activ" : "inactiv", status.enabled ? "ok" : "warn"),
    h("p", { class: "cs-sub" }, "Modelele sunt motoare de raționament. Model conectat ≠ memorie conectată. Memoria rămâne la JARVIS; modelul primește doar contextul relevant și permis. Datele RESTRICTED nu pleacă la un model extern."));

  const nodes = [header];

  // ── Providers + wizard de conectare ──
  const keys = profiles.keys || {};
  const provCards = (profiles.profiles || []).map((p) => {
    const connected = p.enabled || !!keys[p.id];
    return h("div", { class: "card", style: "margin-top:8px" },
      h("div", { class: "form-row", style: "justify-content:space-between;align-items:center" },
        h("div", {}, h("b", {}, p.model ? `${labelFor(p.provider)} · ${p.model}` : labelFor(p.provider)),
          h("div", { class: "form-row", style: "flex-wrap:wrap;gap:4px;margin-top:4px" },
            pill(p.trust, TRUST_TONE[p.trust]),
            ...(p.capabilities || []).slice(0, 4).map((c) => pill(c, "sys")))),
        pill(p.enabled ? "ACTIV" : keys[p.id] ? "cheie salvată" : "neconectat", p.enabled ? "ok" : keys[p.id] ? "sys" : null)),
      h("p", { class: "dim", style: "margin-top:6px;font-size:.85em" }, `Date permise: ${(p.data_classifications_allowed || []).join(", ")}`),
      p.provider !== "private" ? connectRow(p.provider) : null);
  });
  nodes.push(card("Providers", ...provCards,
    h("p", { class: "dim", style: "margin-top:10px" }, "Abonamentul ChatGPT și accesul OpenAI API sunt servicii distincte. Nu se cere parola contului — folosim o cheie API stocată criptat, verificată printr-un test real.")));

  // ── Routing (matrice de date §19) ──
  const CLASSES = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "HIGHLY_CONFIDENTIAL", "RESTRICTED"];
  const rows = (profiles.profiles || []).map((p) => h("tr", {},
    h("td", {}, labelFor(p.provider)),
    ...CLASSES.map((cl) => h("td", { style: "text-align:center" }, (p.data_classifications_allowed || []).includes(cl) ? "✓" : "—"))));
  nodes.push(card("Routing — matrice de acces la date",
    h("div", { style: "overflow-x:auto" }, h("table", { class: "mem-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "Provider"), ...CLASSES.map((c) => h("th", { style: "font-size:.7em" }, c.replace("_", " "))))),
      h("tbody", {}, ...rows))),
    h("p", { class: "dim", style: "margin-top:8px" }, `Data Routing: ${status.data_routing ? "pornit" : "oprit"}. RESTRICTED → doar model privat/local.`)));

  // ── Costs (§21) ──
  const cost = status.cost || {};
  nodes.push(card("Costuri",
    h("div", { class: "form-row", style: "flex-wrap:wrap;gap:6px" },
      pill(`azi: ${cost.today?.usd ?? 0}$ / ${cost.today?.cap || "∞"}$`, "sys"),
      pill(`luna: ${cost.month?.usd ?? 0}$ / ${cost.month?.cap || "∞"}$`, "sys"),
      cost.alert?.alert ? pill("prag alertă depășit", "bad") : pill("sub prag", "ok"))));

  // ── Health (§23) ──
  const healthWrap = h("div", { class: "dim" }, "apasă butonul pentru un test live");
  nodes.push(card("Health",
    h("div", { class: "form-row" }, h("button", { class: "btn", onclick: async () => {
      healthWrap.replaceChildren(h("span", { class: "dim" }, "verific…"));
      const hres = await api.get("/api/models/health?probe=1", { fresh: true }).catch((e) => ({ error: e.message }));
      healthWrap.replaceChildren(h("pre", { class: "codeblock" }, JSON.stringify(hres, null, 2)));
    } }, "Verifică")),
    h("div", { style: "margin-top:8px" }, healthWrap)));

  // ── Reviewer/Arbiter + Evaluation ──
  nodes.push(card("Validare & învățare",
    h("div", { class: "form-row", style: "flex-wrap:wrap;gap:6px" },
      pill(`Reviewer: ${status.reviewer ? "on" : "off"}`, status.reviewer ? "ok" : null),
      pill(`Arbiter: ${status.arbiter ? "on" : "off"}`, status.arbiter ? "ok" : null),
      pill(`Evaluation: ${status.evaluation ? "on" : "off"}`, status.evaluation ? "ok" : null)),
    h("p", { class: "dim", style: "margin-top:8px" }, "Reviewerul se folosește doar când riscul o justifică (contracte, legislație, financiar, decizii ireversibile, contradicții). Arbitrul doar la dezacord material.")));

  if (!status.enabled) nodes.push(card("Multi-Model OFF",
    h("p", { class: "dim" }, "Se activează cu variabilele de mediu (fiecare provider separat):"),
    h("pre", { class: "codeblock" }, "JARVIS_MULTI_MODEL_ENABLED=on\nJARVIS_OPENAI_PROVIDER_ENABLED=on\nJARVIS_DATA_ROUTING_ENABLED=on\nJARVIS_COST_GUARD_ENABLED=on\nJARVIS_MODEL_MAX_COST_USD_PER_DAY=5")));

  root.replaceChildren(...nodes);
}

function labelFor(id) { return { openai: "ChatGPT (OpenAI)", anthropic: "Claude (Anthropic)", google: "Gemini (Google)", private: "Model privat" }[id] || id; }

function connectRow(provider) {
  const keyInput = h("input", { type: "password", placeholder: `Cheie API ${labelFor(provider)}`, "aria-label": "Cheie API", autocomplete: "off" });
  const out = h("span", { class: "dim" });
  const connect = async () => {
    if (!keyInput.value || keyInput.value.length < 12) { out.textContent = "cheie prea scurtă"; return; }
    out.textContent = "conectez și testez…";
    const r = await api.post("/api/models/connect", { provider, apiKey: keyInput.value }).catch((e) => ({ ok: false, reason: e.message }));
    keyInput.value = ""; // nu pastram cheia in DOM
    if (r.ok) out.replaceChildren(pill("conectat ✓", "ok"), h("span", { class: "dim", style: "margin-left:6px" }, `${r.test?.models_count ?? "?"} modele · structured output: ${r.test?.structured_output ? "da" : "nu"}`));
    else out.replaceChildren(pill("eșuat", "bad"), h("span", { class: "dim", style: "margin-left:6px" }, r.reason || r.test?.reason || "verifică cheia"));
  };
  return h("div", { class: "form-row", style: "margin-top:8px;gap:6px;flex-wrap:wrap" },
    keyInput, h("button", { class: "btn", onclick: connect }, "Conectează"),
    h("button", { class: "btn ghost", onclick: async () => { await api.post("/api/models/disconnect", { provider }); out.replaceChildren(pill("deconectat", null)); } }, "Șterge cheia"),
    h("div", { style: "flex-basis:100%" }, out));
}
