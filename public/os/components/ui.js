// JARVIS CEO OS — primitive DOM + componente executive reutilizabile.
// h() construieste DOM fara innerHTML pentru continut dinamic (fara injectii).

export function h(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (k === "html") n.innerHTML = v; // DOAR pentru continut static propriu
    else n.setAttribute(k, v);
  }
  for (const c of children.flat(9)) {
    if (c == null || c === false) continue;
    n.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return n;
}

export const card = (title, ...body) =>
  h("section", { class: "card" },
    title ? h("div", { class: "card-title" }, ...(Array.isArray(title) ? title : [title])) : null,
    ...body);

export const pill = (text, tone) => h("span", { class: "pill", "data-tone": tone || null }, text);

/** Stare de date lipsa — semantic, niciodata un zero fals. */
export const dataUnavailable = (what) => h("span", { class: "data-state" }, what || "DATE INDISPONIBILE");

export const emptyCalm = (title, sub) =>
  h("div", { class: "empty-calm" }, h("b", {}, title), sub ? h("span", {}, sub) : null);

/** Confidence — afisat doar cand exista o valoare reala. */
export const confidence = (v) =>
  typeof v === "number" ? pill(`încredere ${Math.round(v)}%`, v >= 75 ? "ok" : v >= 45 ? "warn" : "bad") : null;

/* ─ Episod de atentie (contractul din spec §7) ─ */
export function episodeCard(ep, { rank, onAction } = {}) {
  const act = (label, action, primary) =>
    h("button", { class: primary ? "btn" : "btn ghost", onclick: () => onAction && onAction(action, ep) }, label);
  return h("article", { class: "card episode", "data-tone": ep.tone },
    h("div", { class: "episode-head" },
      rank ? h("span", { class: "episode-rank num" }, String(rank).padStart(2, "0")) : null,
      h("span", { class: "episode-conclusion" }, ep.conclusion),
      ep.type ? pill(ep.type, ep.tone) : null,
      confidence(ep.confidence)),
    h("div", { class: "episode-body" },
      ep.why ? h("div", {}, h("b", {}, "De ce acum: "), ep.why) : null,
      ep.impact ? h("div", {}, h("b", {}, "Impact: "), ep.impact) : null,
      ep.jarvisAction ? h("div", {}, h("b", {}, "JARVIS: "), ep.jarvisAction) : null),
    h("div", { class: "episode-actions" },
      ep.noActionRequired
        ? h("span", { class: "jarvis-handling" }, "JARVIS gestionează — nu necesită intervenția ta")
        : act(ep.founderAction || "Analizează", "analyze", true),
      ep.evidence?.length ? act("Dovezi", "evidence") : null,
      !ep.noActionRequired ? act("Consiliu", "board") : null));
}

/* ─ Element „Needs You" ─ */
export function needsItem(item, { onDecision, onEvidence } = {}) {
  const kindLabel = { DECIDE: "DECIZIE", APPROVE: "APROBARE", REVIEW: "REVIZUIRE", PROVIDE: "INFORMAȚIE", INTERVENE: "INTERVENȚIE" }[item.kind] || item.kind;
  const n = h("div", { class: "needs-item" },
    h("span", { class: "needs-kind", "data-k": item.kind }, kindLabel),
    h("div", { class: "needs-title" }, item.title),
    item.detail ? h("small", {}, item.detail) : null,
    item.assignee ? h("small", {}, `→ ${item.assignee}${item.deadline ? " · termen " + item.deadline : ""}`) : null,
    item.unlocks ? h("small", {}, "Deblochează: " + item.unlocks) : null);
  if (item.proposalId && onDecision) {
    n.append(h("div", { class: "episode-actions" },
      item.readiness === "READY_FOR_FIRST_CONTROLLED_EXECUTION"
        ? h("button", { class: "btn", onclick: () => onDecision(item, "APPROVE", true) }, "Aprobă și trimite")
        : h("button", { class: "btn", onclick: () => onDecision(item, "APPROVE", false) }, "Aprobă"),
      h("button", { class: "btn ghost", onclick: () => onDecision(item, "MODIFY", false) }, "Modifică"),
      h("button", { class: "btn danger", onclick: () => onDecision(item, "REJECT", false) }, "Respinge"),
      item.evidence?.length ? h("button", { class: "btn quiet", onclick: () => onEvidence && onEvidence(item) }, "dovezi") : null));
  }
  return n;
}

/* ─ Reality Statement (spec §10) ─ */
export function realityStatement({ status, tone, statement, confidence: conf, freshness, stale }) {
  return h("section", { class: "card reality", "data-tone": tone },
    h("div", { class: "reality-status" }, status),
    h("div", { class: "reality-statement" }, statement),
    h("div", { class: "reality-meta" },
      confidence(conf),
      freshness ? h("span", { class: "freshness", "data-stale": String(!!stale) }, freshness) : null));
}

/* ─ Progressive disclosure ─ */
export const disclosure = (label, items, { open = false } = {}) =>
  !items || !items.length ? null :
    h("details", { class: "disclosure", open: open || null },
      h("summary", {}, label),
      h("ul", {}, items.map((i) => h("li", {}, i))));

/* ─ Lifecycle-ul unei capabilitati (spec §20) ─ */
export const LIFECYCLE_STAGES = ["PROBLEMĂ", "SPECIFICAȚIE", "COD", "TESTE", "SECURITATE", "REGRESIE", "PERMISIUNI", "SHADOW", "APROBARE", "DEPLOY", "ÎNVĂȚARE"];
export function lifecycleBar(currentIdx) {
  const bar = h("div", { class: "lifecycle" });
  LIFECYCLE_STAGES.forEach((s, i) => {
    if (i) bar.append(h("span", { class: "lc-arrow" }, "→"));
    bar.append(h("span", { class: "lc-step " + (i < currentIdx ? "done" : i === currentIdx ? "now" : "") }, s));
  });
  return bar;
}

/* ─ Sertarul de dovezi ─ */
export function openDrawer(title, bodyNode) {
  const d = document.getElementById("drawer");
  document.getElementById("drawer-title").textContent = title;
  const b = document.getElementById("drawer-body");
  b.replaceChildren(bodyNode);
  d.hidden = false;
  d.querySelector("#drawer-close").focus();
}
export function closeDrawer() { document.getElementById("drawer").hidden = true; }

/* ─ Tabel simplu ─ */
export function table(headers, rows) {
  return h("table", { class: "htable" },
    h("thead", {}, h("tr", {}, headers.map((hd) =>
      h("th", { class: hd.num ? "num" : null }, hd.label ?? hd)))),
    h("tbody", {}, rows.map((r) => h("tr", {}, r.map((c, i) =>
      h("td", { class: headers[i]?.num ? "num" : null }, c ?? "—"))))));
}
