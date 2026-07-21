// JARVIS CEO OS — nucleul aplicatiei: gate, store, router, refresh.
// Prioritate: DATA → INFORMATION → INTERACTION → MOTION → SPECTACLE.
import * as api from "./api.js";
import * as A from "./adapters.js";
import { h, closeDrawer } from "./components/ui.js";

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 2 * 60_000;

const ctx = {
  api,
  store: { manifest: null, today: null, organism: null, stream: null, queue: null, dataHealth: null },
  pendingAsk: null,
  goto(hash, replace = false) {
    if (replace && location.hash === hash) { route(); return; }
    if (location.hash === hash) route(); else location.hash = hash;
  },
  ask(question) {
    ctx.pendingAsk = question;
    if (location.hash.startsWith("#/jarvis")) route(); else location.hash = "#/jarvis";
  },
  board(question, force = false) {
    ctx.boardQuestion = question;
    if (location.hash === "#/board" || force) route(); else location.hash = "#/board";
  },
  refresh: loadCore,
  navToken: 0,
  isCurrent(token) { return token === undefined || token === ctx.navToken; },
  isMobile: () => matchMedia("(max-width: 760px)").matches,
  motionOK: () => !matchMedia("(prefers-reduced-motion: reduce)").matches,
};

/* ───────── Boot ───────── */
init();
async function init() {
  // Ecranele isi gestioneaza singure scrollul (route reseteaza la 0).
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  api.setUnauthorizedHandler(() => { api.clearKey(); showGate("PIN-ul a expirat sau a fost respins."); });
  $("btn-theme").addEventListener("click", cycleTheme);
  $("btn-refresh").addEventListener("click", async () => { api.invalidate(); await loadCore(); route(); });
  $("btn-home").addEventListener("click", () => ctx.goto("#/today"));
  $("drawer-close").addEventListener("click", closeDrawer);
  $("ask-bar").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("ask-input").value.trim();
    if (!q) return;
    $("ask-input").value = "";
    ctx.ask(q);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); $("ask-input").focus(); }
    if (e.key === "Escape") closeDrawer();
  });
  applyTheme(localStorage.getItem("jarvis_theme") || "auto");

  if (api.DEMO) $("demo-banner").hidden = false;
  if (api.hasKey()) enterApp();
  else showGate();

  $("gate-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = $("gate-pin").value.trim();
    if (!pin) return;
    $("gate-err").textContent = "";
    if (await api.verifyKey(pin)) { api.setKey(pin); enterApp(); }
    else { $("gate-err").textContent = "PIN respins."; $("gate-pin").value = ""; }
  });
}

function showGate(err) {
  $("app").hidden = true;
  $("gate").hidden = false;
  if (err) $("gate-err").textContent = err;
  $("gate-pin")?.focus();
}

async function enterApp() {
  $("gate").hidden = true;
  $("app").hidden = false;
  window.addEventListener("hashchange", route);
  renderShellState(); // schelet imediat, fara spinner total
  await loadCore();
  if (!location.hash) location.hash = "#/today";
  route();
  setInterval(() => { if (!document.hidden) loadCore().then(renderShellState); }, REFRESH_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadCore().then(renderShellState); });
  // Traversarea pragului mobil/desktop re-randeaza ecranul curent.
  matchMedia("(max-width: 760px)").addEventListener("change", () => route());
}

/* ───────── Store: incarcarea nucleului (paralel, tolerant la esec) ───────── */
async function loadCore() {
  const [manifest, today, organism, stream, queue, dataHealth] = await Promise.all([
    api.get("/api/ceo/manifest").catch(() => null),
    api.get("/api/ceo/today", { fresh: true }).catch((e) => ({ error: e.message })),
    api.get("/api/ceo/organism", { fresh: true }).catch(() => null),
    api.get("/api/ceo/activity-stream").catch(() => null),
    api.get("/api/ceo/queue").catch(() => null),
    api.get("/api/ceo/data-health").catch(() => null),
  ]);
  Object.assign(ctx.store, { manifest, today, organism, stream, queue, dataHealth });
  renderShellState();
  return ctx.store;
}

/* ───────── Shell: brand, stare JARVIS, badge WORK ───────── */
function renderShellState() {
  const { manifest, today, organism, stream } = ctx.store;
  // Instanta companiei vine din API — nucleul UI nu hardcodeaza compania.
  $("company-name").textContent = manifest?.company?.name || "JARVIS";
  const cs = A.companyState(today, ctx.store.dataHealth);
  $("brand-dot").dataset.tone = cs.tone;
  const js = A.jarvisState({ organism, stream });
  const badge = $("jarvis-state-badge");
  badge.replaceChildren(
    h("span", { class: "st-dot" }),
    h("span", {}, "JARVIS · " + js.stateLabel),
    js.activity ? h("span", { class: "st-activity" }, js.activity) : "");
  $("data-stamp").textContent = cs.generatedAt ? (A.relTime(cs.generatedAt) || "") : "";
  const needs = A.needsYou(today).length;
  const wb = $("work-badge");
  wb.hidden = !needs;
  wb.textContent = needs;
}

/* ───────── Router ───────── */
const routes = {
  today: () => import("./views/today.js"),
  jarvis: () => import("./views/jarvis.js"),
  company: () => import("./views/company.js"),
  work: () => import("./views/work.js"),
  organism: () => import("./views/organism.js"),
  board: () => import("./views/board.js"),
};

let routeSeq = 0;
async function route() {
  closeDrawer();
  const [, name = "today", sub] = location.hash.replace(/^#\//, "").split("/").length
    ? ["", ...location.hash.replace(/^#\//, "").split("/")] : ["", "today"];
  const section = routes[name] ? name : "today";
  for (const a of $("nav").querySelectorAll("a")) a.classList.toggle("active", a.dataset.route === section);

  const view = $("view");
  const seq = ++routeSeq;
  ctx.navToken = seq; // view-urile async verifica ctx.isCurrent(token) inainte de scrierea finala
  try {
    const mod = await routes[section]();
    if (seq !== routeSeq) return; // navigare mai noua a castigat (dupa import)
    if (section === "today" && sub === "list" && mod.renderList) await mod.renderList(view, ctx);
    else await mod.render(view, ctx, sub);
    // Re-verificare DUPA render: view-urile async pot termina dupa o navigare
    // mai noua; nu resetam scroll/focus si nu lasam continut invechit sa castige.
    if (seq !== routeSeq) return;
    view.focus({ preventScroll: true });
    view.scrollTop = 0;
  } catch (e) {
    console.error("[os.route]", e);
    if (seq !== routeSeq) return;
    view.replaceChildren(h("div", { class: "card" },
      h("b", {}, "Ecranul nu s-a putut încărca."),
      h("p", { class: "dim", style: "margin-top:8px" }, e.message),
      h("button", { class: "btn ghost", style: "margin-top:12px", onclick: () => route() }, "Reîncearcă")));
  }
}

/* ───────── Tema: auto → dark → light ───────── */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem("jarvis_theme", t);
}
function cycleTheme() {
  const order = ["auto", "dark", "light"];
  const cur = document.documentElement.dataset.theme || "auto";
  applyTheme(order[(order.indexOf(cur) + 1) % order.length]);
}
