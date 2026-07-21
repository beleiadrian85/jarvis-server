// JARVIS CEO OS — componentele HUD (SVG-first, fara dependinte).
// JarvisCore (5 stari canonice) + CompanyOrbit (desktop) + OrbitalHome (mobil).
// Animatia e state-driven si pur decorativ-optionala: fara ea, tot ce e
// informativ ramane vizibil (text + tonuri semantice).

const SVGNS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, ...children) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  for (const c of children) n.append(c);
  return n;
};

/** Nucleul JARVIS — grup SVG centrat in (cx,cy). */
export function jarvisCore({ cx, cy, r = 74, state = "OBSERVING", label = "JARVIS", sub = "" }) {
  const g = el("g", { class: "jcore", "data-state": state, tabindex: "0", role: "button",
    "aria-label": `JARVIS — ${state}. Deschide conversația.` });
  g.append(
    el("circle", { class: "jc-halo", cx, cy, r: r * 1.35, "stroke-width": r * 0.32 }),
    el("circle", { class: "jc-ring-outer", cx, cy, r }),
    el("circle", { class: "jc-ring-mid", cx, cy, r: r * 0.72 }),
    el("circle", { class: "jc-heart", cx, cy, r: r * 0.3 }),
    el("text", { class: "jc-label", x: cx, y: cy + r + 22 }, label),
  );
  if (sub) g.append(el("text", { class: "jc-sub", x: cx, y: cy + r + 38 }, sub));
  return g;
}

/**
 * Orbita companiei (desktop). nodes: [{key,label,tone,coverage,route}].
 * links: chei de noduri legate de Core (relatii REALE, max 3).
 */
export function companyOrbit({ nodes = [], links = [], state = "OBSERVING", coreSub = "", onNode, onCore }) {
  const W = 900, H = 460, CX = W / 2, CY = H / 2;
  const RX = 330, RY = 168; // elipsa — profunzime, nu cerc de joc
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "group", "aria-label": "Harta companiei" });

  // ghidaje orbitale fine
  svg.append(
    el("ellipse", { class: "orbit-guide", cx: CX, cy: CY, rx: RX, ry: RY }),
    el("ellipse", { class: "orbit-guide", cx: CX, cy: CY, rx: RX * 0.62, ry: RY * 0.62, opacity: ".35" }),
  );

  const pos = nodes.map((_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / nodes.length;
    return { x: CX + RX * Math.cos(a), y: CY + RY * Math.sin(a) };
  });

  // legaturi reale Core → nod (sub noduri, peste ghidaje)
  for (const key of links) {
    const i = nodes.findIndex((n) => n.key === key);
    if (i < 0) continue;
    const { x, y } = pos[i];
    const mx = (CX + x) / 2, my = (CY + y) / 2 - 26;
    svg.append(el("path", { class: "orbit-link", d: `M ${CX} ${CY} Q ${mx} ${my} ${x} ${y}` }));
  }

  const core = jarvisCore({ cx: CX, cy: CY, state, sub: coreSub });
  if (onCore) { core.addEventListener("click", onCore); core.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") onCore(); }); }
  svg.append(core);

  nodes.forEach((n, i) => {
    const { x, y } = pos[i];
    const g = el("g", { class: "orbit-node", "data-tone": n.tone, tabindex: "0", role: "button",
      "aria-label": `${n.label} — ${n.coverage}` });
    const rr = n.tone === "bad" ? 34 : n.tone === "warn" ? 31 : 27; // atentia creste, sanatosul se retrage
    g.append(
      el("circle", { class: "node-ring", cx: x, cy: y, r: rr }),
      n.tone === "bad" || n.tone === "warn"
        ? el("circle", { cx: x, cy: y, r: 4, fill: n.tone === "bad" ? "var(--bad)" : "var(--warn)" })
        : el("circle", { cx: x, cy: y, r: 3, fill: "var(--neutral)", opacity: ".7" }),
      el("text", { x, y: y + rr + 15, "text-anchor": "middle" }, n.label),
    );
    const act = () => onNode && onNode(n);
    g.addEventListener("click", act);
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") act(); });
    svg.append(g);
  });

  return svg;
}

/**
 * ORBITAL HOME (mobil) — JARVIS in centru, destinatii stabile in jur.
 * nodes: [{key,label,tone,badge,route}] — ordinea NU se schimba intre randari.
 */
export function orbitalHome({ nodes = [], state = "OBSERVING", coreSub = "", onNode, onCore }) {
  const W = 420, H = 420, CX = W / 2, CY = H / 2, R = 158;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "group", "aria-label": "JARVIS orbital" });
  svg.append(el("circle", { class: "orbit-guide", cx: CX, cy: CY, r: R }));

  const core = jarvisCore({ cx: CX, cy: CY, r: 58, state, sub: coreSub });
  if (onCore) { core.addEventListener("click", onCore); core.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") onCore(); }); }
  svg.append(core);

  nodes.forEach((n, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / nodes.length;
    const x = CX + R * Math.cos(a), y = CY + R * Math.sin(a);
    const g = el("g", { class: "orbit-node", "data-tone": n.tone, tabindex: "0", role: "button",
      "aria-label": `${n.label}${n.badge ? ` — ${n.badge}` : ""}` });
    g.append(el("circle", { class: "node-ring", cx: x, cy: y, r: 30 }));
    if (n.badge) {
      g.append(
        el("circle", { cx: x + 21, cy: y - 21, r: 10, fill: "var(--bad)" }),
        el("text", { x: x + 21, y: y - 17.5, "text-anchor": "middle", style: "fill:#fff;font:700 10px var(--font)" }, String(n.badge)),
      );
    }
    g.append(el("text", { x, y: y + 4, "text-anchor": "middle", style: "font-size:9.5px" }, n.label));
    const act = () => onNode && onNode(n);
    g.addEventListener("click", act);
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") act(); });
    svg.append(g);
  });

  return svg;
}
