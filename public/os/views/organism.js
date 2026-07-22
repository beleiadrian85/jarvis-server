// ORGANISM — zona-semnatura: JARVIS ca inteligenta vie, in limbaj de CEO.
// VĂD · NU ȘTIU · AȘTEPT · FAC · ÎNVĂȚ · TREBUIE SĂ DEVIN MAI BUN.
// Jargonul tehnic traieste doar in sertarul avansat. Include Capability Builder.
import { h, card, pill, emptyCalm, disclosure, dataUnavailable, lifecycleBar, openDrawer } from "../components/ui.js";
import * as A from "../adapters.js";

export async function render(root, ctx, sub) {
  const token = ctx.navToken;
  const [gapsApi, nervHealth, proposals, manifest] = await Promise.all([
    ctx.api.get("/api/ceo/gaps").catch(() => null),
    ctx.api.get("/api/ceo/nervous-health").catch(() => null),
    ctx.api.get("/api/ceo/proposals").catch(() => null),
    ctx.api.get("/api/ceo/manifest").catch(() => null),
  ]);
  if (!ctx.isCurrent(token)) return; // o navigare mai nouă a câștigat
  const org = ctx.store.organism || {};
  const dh = ctx.store.dataHealth;
  const gaps = A.dataGaps(gapsApi);
  const js = A.jarvisState({ organism: org, stream: ctx.store.stream });

  const sec = (key, title, itemsNode) =>
    h("section", { class: "card org-sec", "data-sec": key },
      h("div", { class: "card-title" }, title), itemsNode);
  const ul = (items, fmt = (x) => x) => items.length
    ? h("ul", {}, items.map((i) => h("li", {}, fmt(i))))
    : h("p", { class: "faint" }, "—");

  /* VĂD */
  const see = org.what_i_see || {};
  const connected = (dh?.domains || []).filter((d) => d.connected === "CONNECTED").map((d) => d.domain);
  const seeItems = [
    typeof see.data_health === "number" ? `Sănătatea datelor: ${see.data_health}/100` : (typeof dh?.healthScore === "number" ? `Sănătatea datelor: ${dh.healthScore}/100` : null),
    connected.length ? `Surse conectate (${connected.length}): ${connected.join(", ").toLowerCase()}` : null,
    typeof see.open_tasks === "number" ? `${see.open_tasks} task-uri deschise în Operational` : null,
    typeof see.observations === "number" ? `${see.observations} observații active despre companie` : null,
    see.stale_sources?.length ? `Surse învechite: ${see.stale_sources.join(", ")}` : null,
  ].filter(Boolean);

  /* NU ȘTIU */
  const unknownItems = gaps.slice(0, 6).map((g) =>
    h("span", {}, h("b", {}, g.what + ". "), g.why || "",
      g.owner ? h("span", { class: "faint" }, ` Am verificat sursele; insuficient — responsabil: ${g.owner}.`) : null));

  /* AȘTEPT */
  const waitingItems = [
    ...(org.waiting || []).map((w) => "Aprobare/răspuns: " + w),
    ...(org.what_i_asked || []).filter((a) => a.state !== "COMPLETED").map((a) => `${a.owner || "?"}: ${a.title || "?"}${a.shadow ? " (shadow — nimic trimis)" : ""}`),
  ];

  /* FAC */
  const doingItems = [
    org.ceo_status,
    ...((org.results?.proposed || []).map((p) => `Am propus: ${p.title} → ${p.owner}`)),
    ...((org.results?.created || []).map((p) => `Am creat task: ${p.title} → ${p.owner}`)),
    ...((org.results?.would_create || []).map((p) => `Aș delega (shadow): ${p.title} → ${p.owner}`)),
  ].filter(Boolean);

  /* ÎNVĂȚ */
  const selfeval = nervHealth?.selfeval || org.selfeval || null;
  const memory = nervHealth?.memory || null;
  // memory = summarizeMemory(): { pairs, strongest, weakest } cu
  // { person_id, task_type, confidence, total }. Formatăm doar perechile cu istoric.
  const strongest = (memory?.strongest || []).filter((p) => p.total > 0);
  const learnItems = [
    ...(org.resolved || []).map((r) => "Buclă închisă, rezultat verificat: " + r),
    selfeval ? "Autoevaluare: " + Object.entries(selfeval).slice(0, 4).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(" · ") : null,
    org.verdict || null,
    strongest.length
      ? "Am învățat cine rezolvă ce: " + strongest.slice(0, 3).map((p) => `${p.person_id}/${p.task_type} (încredere ${Math.round((p.confidence || 0) * (p.confidence <= 1 ? 100 : 1))}%)`).join(" · ")
      : null,
  ].filter(Boolean);

  /* TREBUIE SĂ DEVIN MAI BUN — Capability Builder */
  const improvements = Object.values(proposals?.improvements || {});
  const capabilityCards = improvements.slice(0, 8).map((imp) => capabilityCard(imp));

  const header = h("div", { class: "company-state" },
    h("h2", {}, "Organismul JARVIS"),
    pill(js.stateLabel, "sys"),
    org.mode ? pill("mod " + org.mode.toUpperCase(), org.mode === "shadow" ? "warn" : "ok") : null,
    nervHealth?.health?.status ? pill("sănătate " + nervHealth.health.status, nervHealth.health.status === "OK" ? "ok" : "warn") : null,
    h("p", { class: "cs-sub" },
      org.at
        ? `Ultimul ciclu de management: ${A.relTime(org.at) || org.at}. Tot ce vezi aici este starea reală a organismului — fără teatru.`
        : (org.status || "Sistemul nervos nu a rulat încă niciun ciclu.")));

  const actions = h("div", { style: "display:flex;gap:var(--sp-2);margin-bottom:var(--sp-4);flex-wrap:wrap" },
    h("button", { class: "btn ghost", onclick: async (e) => {
      e.target.disabled = true; e.target.textContent = "rulează…";
      const r = await ctx.api.post("/api/ceo/nervous-cycle", {});
      e.target.disabled = false; e.target.textContent = "Rulează un ciclu acum (shadow-safe)";
      if (r?.error) alert("Eroare: " + r.error);
      else if (r?.skipped) alert("Sărit: " + r.skipped);
      ctx.api.invalidate(); await ctx.refresh(); ctx.goto("#/organism", true);
    } }, "Rulează un ciclu acum (shadow-safe)"),
    h("button", { class: "btn quiet", onclick: () => openAdvanced(ctx) }, "diagnostic avansat"));

  root.replaceChildren(header, actions,
    h("div", { class: "organism-grid" },
      sec("see", "VĂD", ul(seeItems)),
      sec("unknown", "NU ȘTIU", unknownItems.length ? h("ul", {}, unknownItems.map((i) => h("li", {}, i))) : emptyCalm("Niciun necunoscut material", "Golurile de date închise rămân închise.")),
      sec("waiting", "AȘTEPT", ul(waitingItems)),
      sec("doing", "FAC", ul(doingItems)),
      sec("learning", "ÎNVĂȚ", ul(learnItems)),
      sec("better", "TREBUIE SĂ DEVIN MAI BUN",
        capabilityCards.length ? h("div", {}, capabilityCards) : emptyCalm("Nicio capabilitate lipsă detectată"))),
    manifest ? h("div", { style: "margin-top:var(--sp-3)" },
      card(null, disclosure("Ce pot / ce nu pot (manifestul instanței)", [
        "Pot observa: " + (manifest.can_observe || []).join(", ").toLowerCase(),
        "Pot propune: " + (manifest.can_propose || []).join(", "),
        "Pot executa autonom: " + ((manifest.can_execute || []).length ? manifest.can_execute.join(", ") : "NIMIC — regulă permanentă"),
        ...(manifest.requires_approval || []).map((r) => "Cere aprobare: " + r),
      ]))) : null);
}

/* Capability Request → card inteligibil de CEO + lifecycle (spec §20). */
function capabilityCard(imp) {
  // Backend-ul curent duce capabilitatile pana la SPECIFICATIE/PROPUNERE;
  // etapele urmatoare exista in lifecycle si se aprind cand devin reale.
  const stage = imp.state === "approved" ? 8 : imp.proposed_change ? 1 : 0;
  return h("div", { class: "needs-item" },
    h("div", { class: "needs-title" }, imp.problem || "?"),
    imp.proposed_change ? h("small", {}, "Propunere: " + imp.proposed_change) : null,
    imp.value ? h("small", {}, "Valoare: " + imp.value) : null,
    imp.risk ? h("small", {}, "Risc: " + imp.risk) : null,
    lifecycleBar(stage),
    h("small", { class: "faint" }, "Deploy în producție doar cu aprobarea fondatorului — regulă de sistem."));
}

async function openAdvanced(ctx) {
  const stream = ctx.store.stream;
  const body = h("div", {},
    h("p", { class: "faint" }, "Jurnal tehnic (activity stream) — pentru diagnoză, nu pentru operare."),
    h("pre", { class: "mono" }, stream?.text || "—"));
  openDrawer("Diagnostic avansat", body);
}
