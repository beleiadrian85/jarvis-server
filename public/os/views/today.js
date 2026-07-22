// TODAY — ecranul-far. Raspunde in 10 secunde: cum e compania, ce s-a
// schimbat, ce conteaza (max 3), ce are nevoie de Adrian, ce face JARVIS,
// ce NU necesita interventie. Desktop: command center. Mobil: orbital home.
import { h, card, pill, episodeCard, needsItem, emptyCalm, openDrawer, dataUnavailable } from "../components/ui.js";
import { companyOrbit, orbitalHome } from "../components/hud.js";
import * as A from "../adapters.js";

export async function render(root, ctx) {
  const { store } = ctx;
  const today = store.today, organism = store.organism;
  const cs = A.companyState(today, store.dataHealth);
  const js = A.jarvisState({ organism, stream: store.stream });
  const eps = A.attentionEpisodes(today);
  const needs = A.needsYou(today);
  const now = A.jarvisNow({ organism, queue: store.queue, today });
  const nodes = A.orbitNodes({ dataHealth: store.dataHealth, today });
  const links = A.orbitLinks({ today, organism });

  if (ctx.isMobile()) return renderMobile(root, ctx, { cs, js, eps, needs, nodes, today });

  const onEpisodeAction = (action, ep) => {
    if (action === "evidence") openDrawer("Dovezi — " + ep.conclusion, evidenceBody(ep));
    else if (action === "board") ctx.board(ep.conclusion);
    else ctx.ask("Analizează: " + ep.conclusion);
  };

  const hud = h("div", { class: "hud-stage " + (ctx.motionOK() ? "jarvis-anim-on" : "") });
  hud.append(companyOrbit({
    nodes, links, state: js.state, coreSub: js.stateLabel,
    onNode: (n) => ctx.goto(n.route),
    onCore: () => ctx.goto("#/jarvis"),
  }));
  hud.append(h("div", { class: "hud-foot" },
    h("span", {}, now.counts.active + " acțiuni active"),
    h("span", {}, now.counts.waiting + " în așteptare"),
    js.lastCycleAt ? h("span", {}, "ultima evaluare " + (A.relTime(js.lastCycleAt) || "—")) : null,
    js.dormantNote ? h("span", {}, js.dormantNote) : null,
    h("span", { class: "spacer", style: "flex:1" }),
    links.length ? h("span", { title: "relații active Core → domeniu" },
      "relații active: " + links.map((l) => ({ CASH: "cash", SALES: "vânzări", PROJECTS: "proiecte", PEOPLE: "oameni", MARKETING: "marketing", FINANCING: "finanțare" }[l] || l.toLowerCase())).join(" · ")) : null,
  ));

  root.replaceChildren(
    h("div", { class: "company-state" },
      h("h2", {}, cs.status),
      pill(cs.tone === "ok" ? "SĂNĂTOS" : cs.tone === "warn" ? "ATENȚIE" : "CRITIC", cs.tone),
      typeof cs.confidence === "number" ? pill("date " + cs.confidence + "/100", cs.confidence >= 70 ? "ok" : "warn") : null,
      h("p", { class: "cs-sub" }, cs.summary)),
    h("div", { class: "today" },
      h("div", { class: "today-hud" }, hud),
      h("div", { class: "today-attention" },
        card(["CE CONTEAZĂ ACUM", h("span", { class: "spacer" }), pill(String(eps.length), eps.length ? "warn" : "ok")],
          eps.length
            ? h("div", {}, eps.map((ep, i) => episodeCard(ep, { rank: i + 1, onAction: onEpisodeAction })))
            : emptyCalm("Nimic material acum", "JARVIS continuă să observe — te anunț când apare ceva ce contează."))),
      h("div", { class: "today-side" },
        card(["NEEDS YOU", h("span", { class: "spacer" }), pill(String(needs.length), needs.length ? "bad" : "ok")],
          needs.length
            ? h("div", {}, needs.map((n) => needsItem(n, {
                onDecision: (item, decision, send) => decideProposal(ctx, item, decision, send),
                onEvidence: (item) => openDrawer("Dovezi — " + item.title, evidenceBody(item)),
              })))
            : emptyCalm("Nicio intervenție necesară", "Tot ce e activ este gestionat de JARVIS sau delegat.")),
        card("JARVIS NOW",
          now.items.length
            ? h("div", { class: "jnow-list" }, now.items.map((i) =>
                h("div", { class: "jnow-item", "data-kind": i.kind },
                  h("span", { class: "jn-ico" }, i.kind === "waiting" ? "⧗" : i.kind === "done" ? "✓" : "→"),
                  h("span", {}, i.text))))
            : h("div", { class: "faint" }, js.dormantNote || "Observ pasiv — nicio acțiune în curs."),
          h("div", { class: "jnow-foot" },
            now.ceoStatus || js.dormantNote || "JARVIS observă și propune — nu trimite nimic fără aprobarea ta.")))));
}

/* ─ Mobil: ORBITAL JARVIS ─ */
function renderMobile(root, ctx, { cs, js, eps, needs, nodes, today }) {
  const head = A.mobileHeadline(today);
  const badgeFor = { NEEDSYOU: needs.length || null, TODAY: eps.length || null };
  const orbitalNodes = [
    { key: "TODAY", label: "AZI", tone: eps.length ? (cs.tone === "bad" ? "bad" : "warn") : "ok", badge: badgeFor.TODAY, route: "#/today/list" },
    ...["CASH", "SALES", "PROJECTS", "PEOPLE"].map((k) => {
      const n = nodes.find((x) => x.key === k) || { tone: "off" };
      return { key: k, label: n.label || k, tone: n.tone, route: n.route };
    }),
    { key: "WORK", label: "WORK", tone: "ok", route: "#/work" },
    { key: "COMPANY", label: "FIRMA", tone: "ok", route: "#/company" },
    { key: "NEEDSYOU", label: "TU", tone: needs.length ? "bad" : "ok", badge: badgeFor.NEEDSYOU, route: "#/work" },
  ];
  const stage = h("div", { class: "orbital-stage " + (ctx.motionOK() ? "jarvis-anim-on" : "") });
  stage.append(orbitalHome({
    nodes: orbitalNodes, state: js.state, coreSub: js.stateLabel,
    onNode: (n) => ctx.goto(n.route),
    onCore: () => ctx.goto("#/jarvis"),
  }));
  root.replaceChildren(h("div", { class: "orbital-home" },
    h("div", { class: "orbital-status", "data-tone": head.tone },
      h("b", {}, head.title),
      h("p", {}, head.sub)),
    stage));
}

/* Lista de atentie pe mobil (#/today/list) */
export async function renderList(root, ctx) {
  const today = ctx.store.today;
  const eps = A.attentionEpisodes(today);
  const needs = A.needsYou(today);
  root.replaceChildren(
    card("CE CONTEAZĂ ACUM",
      eps.length ? h("div", {}, eps.map((ep, i) => episodeCard(ep, { rank: i + 1, onAction: (a, e) => {
        if (a === "evidence") openDrawer("Dovezi", evidenceBody(e));
        else if (a === "board") ctx.board(e.conclusion);
        else ctx.ask("Analizează: " + e.conclusion);
      } }))) : emptyCalm("Nimic material acum")),
    card("NEEDS YOU",
      needs.length ? h("div", {}, needs.map((n) => needsItem(n, {
        onDecision: (item, d, s) => decideProposal(ctx, item, d, s),
        onEvidence: (item) => openDrawer("Dovezi — " + item.title, evidenceBody(item)),
      }))) : emptyCalm("Nicio intervenție necesară")));
}

function evidenceBody(item) {
  const ev = item.evidence || [];
  return h("div", {},
    ev.length ? h("ul", {}, ev.map((e) => h("li", {}, String(e)))) : dataUnavailable("FĂRĂ DOVEZI ÎNREGISTRATE"),
    item.riskIfNothing ? h("p", { style: "margin-top:12px" }, h("b", {}, "Risc dacă nu facem nimic: "), item.riskIfNothing) : null);
}

async function decideProposal(ctx, item, decision, send) {
  let note = "";
  if (decision === "MODIFY") { note = prompt("Ce modifici la propunere?") || ""; if (!note) return; }
  if (send && !confirm("Trimit cererea REALĂ către persoana responsabilă (Telegram)?")) return;
  try {
    const r = await ctx.api.post("/api/ceo/proposals/decision", { proposal_id: item.proposalId, decision, note, send: !!send });
    if (r?.error || r?.ok === false) alert("Eroare: " + (r.error || JSON.stringify(r.errors || r)));
    else if (r?.delivery) alert("Livrare: " + r.delivery.status + (r.delivery.fix ? " — " + r.delivery.fix : ""));
  } catch (e) { alert("Nu am putut trimite decizia: " + e.message); return; }
  await ctx.refresh();
}
