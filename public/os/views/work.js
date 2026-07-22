// WORK — o singura suprafata de guvernanta, patru perspective:
// NEEDS YOU · JARVIS · PEOPLE · HISTORY. Doar realitate; aprobarile folosesc
// endpoint-urile existente (permisiunile raman in backend).
import { h, card, pill, needsItem, emptyCalm, openDrawer, disclosure } from "../components/ui.js";
import * as A from "../adapters.js";

const TABS = [
  ["needs", "NEEDS YOU"],
  ["jarvis", "JARVIS"],
  ["people", "PEOPLE"],
  ["history", "HISTORY"],
];

export async function render(root, ctx, sub) {
  const tab = TABS.some(([k]) => k === sub) ? sub : "needs";
  const token = ctx.navToken;
  const [queue, decisions] = await Promise.all([
    ctx.api.get("/api/ceo/queue").catch(() => null),
    ctx.api.get("/api/ceo/decisions").catch(() => null),
  ]);
  if (!ctx.isCurrent(token)) return; // o navigare mai nouă a câștigat
  const needs = A.needsYou(ctx.store.today);
  const counts = {
    needs: needs.length,
    jarvis: (queue?.WAITING_FOR_DATA || []).length + (queue?.IN_PROGRESS || []).length + (queue?.BLOCKED || []).length,
    people: (queue?.WAITING_FOR_DATA || []).length,
    history: (queue?.COMPLETED || []).length,
  };

  const tabs = h("div", { class: "tabs", role: "tablist" },
    TABS.map(([k, label]) => h("button", {
      class: k === tab ? "active" : "", role: "tab", "aria-selected": String(k === tab),
      onclick: () => ctx.goto("#/work/" + k),
    }, label, counts[k] ? h("span", { class: "cnt num" }, "(" + counts[k] + ")") : null)));

  const body = { needs: needsTab, jarvis: jarvisTab, people: peopleTab, history: historyTab }[tab];
  root.replaceChildren(tabs, ...(await body(ctx, { queue, decisions, needs })));
}

/* ─ NEEDS YOU: Decide / Aproba / Revizuieste / Ofera informatie / Intervino ─ */
async function needsTab(ctx, { needs }) {
  if (!needs.length) return [card(null, emptyCalm("Nicio intervenție necesară",
    "JARVIS gestionează tot ce e activ. Te anunț când o decizie ajunge la tine."))];
  return [card("CER DECIZIA SAU INTERVENȚIA TA",
    h("div", {}, needs.map((n) => needsItem(n, {
      onDecision: async (item, decision, send) => {
        let note = "";
        if (decision === "MODIFY") { note = prompt("Ce modifici la propunere?") || ""; if (!note) return; }
        if (send && !confirm("Trimit cererea REALĂ către persoana responsabilă (Telegram)?")) return;
        try {
          const r = await ctx.api.post("/api/ceo/proposals/decision", { proposal_id: item.proposalId, decision, note, send: !!send });
          if (r?.error || r?.ok === false) alert("Eroare: " + (r?.error || JSON.stringify(r?.errors || "")));
          else if (r?.delivery) alert("Livrare: " + r.delivery.status + (r.delivery.fix ? " — " + r.delivery.fix : ""));
        } catch (e) { alert("Nu am putut trimite decizia: " + e.message); return; }
        await ctx.refresh(); ctx.goto("#/work/needs", true);
      },
      onEvidence: (item) => openDrawer("Dovezi — " + item.title,
        h("ul", {}, (item.evidence || []).map((e) => h("li", {}, String(e))))),
    }))))];
}

/* ─ JARVIS: activ / asteapta / blocat / finalizat ─ */
async function jarvisTab(ctx, { queue }) {
  const org = ctx.store.organism;
  const sec = (title, tone, items, fmt) => card([title, h("span", { class: "spacer" }), pill(String((items || []).length), (items || []).length ? tone : null)],
    (items || []).length
      ? h("ul", { class: "dim", style: "padding-left:18px;font-size:var(--fs-sm)" }, items.map((x) => h("li", {}, fmt(x))))
      : h("p", { class: "faint" }, "—"));
  const qf = (x) => `${x.problem}${x.assignee ? " → " + x.assignee : ""}${x.delivery ? " [" + x.delivery + "]" : ""}`;
  return [
    org?.ceo_status ? card(null, h("p", { class: "dim", style: "font-size:var(--fs-sm)" }, org.ceo_status)) : null,
    sec("ÎN LUCRU", "sys", [...(queue?.IN_PROGRESS || [])], qf),
    sec("AȘTEAPTĂ DATE / RĂSPUNS", "warn", [...(queue?.WAITING_FOR_DATA || []), ...(queue?.WAITING_FOR_APPROVAL || [])], qf),
    sec("BLOCAT", "bad", queue?.BLOCKED, qf),
    sec("PROPUS (în Inbox)", null, queue?.NEEDS_ADRIAN, qf),
  ].filter(Boolean);
}

/* ─ PEOPLE: delegari, cereri de informatii, blocaje ─ */
async function peopleTab(ctx, { queue }) {
  const org = ctx.store.organism;
  const asked = org?.what_i_asked || [];
  const load = org?.people_load || [];
  return [
    card("DELEGAT DE JARVIS",
      asked.length
        ? h("ul", { class: "dim", style: "padding-left:18px;font-size:var(--fs-sm)" },
            asked.map((a) => h("li", {}, `${a.title || "?"} → ${a.owner || "?"} [${a.state}${a.shadow ? " · shadow" : ""}]`)))
        : emptyCalm("Nimic delegat acum")),
    card("SISTEMUL AȘTEAPTĂ DE LA OAMENI",
      (queue?.WAITING_FOR_DATA || []).length
        ? h("ul", { class: "dim", style: "padding-left:18px;font-size:var(--fs-sm)" },
            queue.WAITING_FOR_DATA.map((w) => h("li", {}, `${w.assignee || "?"}: ${w.problem}`)))
        : emptyCalm("Nicio dependență umană deschisă")),
    load.length ? card(null, disclosure("Încărcarea oamenilor (semnale)", load.map((l) => typeof l === "string" ? l : l.note || JSON.stringify(l)))) : null,
  ].filter(Boolean);
}

/* ─ HISTORY: rezultate VERIFICATE ≠ doar finalizate + memoria deciziilor ─ */
async function historyTab(ctx, { queue, decisions }) {
  const org = ctx.store.organism;
  const mem = decisions?.decision_memory || [];
  // VERIFICAT = buclă închisă (org.resolved) sau item cu state 'verified'.
  // „Finalizat" (COMPLETED, bifat) NU e același lucru — merge separat.
  const verified = [
    ...(org?.resolved || []),
    ...(queue?.COMPLETED || []).filter((c) => c.state === "verified").map((c) => c.problem),
  ];
  const doneUnverified = (queue?.COMPLETED || []).filter((c) => c.state !== "verified");
  return [
    card("REZULTATE VERIFICATE",
      verified.length
        ? h("ul", { class: "dim", style: "padding-left:18px;font-size:var(--fs-sm)" }, verified.map((r) => h("li", {}, "✓ " + r)))
        : h("p", { class: "faint" }, "Încă niciun rezultat verificat — bifat nu înseamnă rezolvat; aici apar doar buclele închise, cu dovadă.")),
    doneUnverified.length ? card("FINALIZATE (neverificate)",
      h("ul", { class: "dim", style: "padding-left:18px;font-size:var(--fs-sm)" },
        doneUnverified.map((c) => h("li", {}, "• " + c.problem + " — marcat gata, fără dovadă verificată")))) : null,
    card("MEMORIA DECIZIILOR",
      mem.length
        ? h("ul", { class: "dim", style: "padding-left:18px;font-size:var(--fs-sm)" },
            mem.slice(-12).reverse().map((d) => h("li", {},
              `${d.decision || d.title || "?"}${d.decided_at ? " · " + String(d.decided_at).slice(0, 10) : ""}${d.outcome ? " → " + d.outcome : ""}${d.lesson ? " · lecție: " + d.lesson : ""}`)))
        : h("p", { class: "faint" }, "Registrul de decizii se populează pe măsură ce decizi prin JARVIS.")),
  ].filter(Boolean);
}
