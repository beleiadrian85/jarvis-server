// JARVIS — conversatia executiva. Nu e un chat gol: porneste din context
// (starea companiei + intrebari executive), pastreaza continuitatea cu
// Telegram/HUD (acelasi istoric pe canalul "hud") si nu pretinde niciodata
// ca a executat ceva neconfirmat de server (confirmId → butoane explicite).
import { h, card, pill } from "../components/ui.js";
import * as A from "../adapters.js";

// Prompturile rapide sunt generice; persoana de financiar vine din instanța
// companiei (manifest.roles), nu e hardcodată în nucleul produsului.
function fastPrompts(manifest) {
  const fin = (manifest?.roles || []).find((r) => /financiar|contab/i.test(r.role || ""))?.name;
  return [
    "Ce probleme am azi?",
    "Consiliu",
    "Arată-mi cash-ul",
    fin ? `Ce face ${fin}?` : "Ce fac oamenii azi?",
    "Ce aștepți de la oameni acum?",
    "Ce ai nevoie ca să funcționezi mai bine?",
    "Ce ai construi dacă ți-aș da voie?",
  ];
}

let logEl = null;

export async function render(root, ctx) {
  const cs = A.companyState(ctx.store.today, ctx.store.dataHealth);
  logEl = h("div", { class: "chat-log", role: "log", "aria-live": "polite" });

  const context = h("div", { class: "chat-context" },
    card(null, h("div", { class: "company-state", style: "margin:0" },
      h("span", {}, pill(cs.status, cs.tone)),
      h("span", { class: "dim", style: "font-size:var(--fs-sm)" }, cs.summary))));

  const prompts = h("div", { class: "chat-prompts" },
    fastPrompts(ctx.store.manifest).map((p) => h("button", { class: "chip", onclick: () => send(ctx, p) }, p)));

  root.replaceChildren(h("div", { class: "chat" }, context, prompts, logEl));

  // Istoricul comun (Telegram + HUD) — continuitate reala, nu pagina goala.
  try {
    const hist = await ctx.api.get("/api/history");
    for (const m of (hist?.messages || []).slice(-12)) {
      addMsg(m.role === "user" ? "user" : "jarvis", m.content);
    }
    if (!(hist?.messages || []).length) {
      addMsg("jarvis", "Sunt aici. Am contextul companiei — întreabă-mă orice sau alege o întrebare de mai sus.");
    }
  } catch {
    addMsg("jarvis", "Istoricul nu e disponibil momentan — conversația funcționează în continuare.");
  }
  scrollEnd();

  if (ctx.pendingAsk) { const q = ctx.pendingAsk; ctx.pendingAsk = null; send(ctx, q); }
}

export async function send(ctx, text) {
  if (!logEl || !logEl.isConnected) await render(document.getElementById("view"), ctx);
  addMsg("user", text);
  const typing = h("div", { class: "typing" }, "JARVIS analizează…");
  logEl.append(typing); scrollEnd();
  try {
    const r = await ctx.api.post("/api/chat", { text });
    typing.remove();
    if (r?.error) { addMsg("jarvis", "Eroare la nucleu: " + r.error); return; }
    const m = addMsg("jarvis", r.reply || "—");
    if (r.confirmId) {
      m.append(h("div", { class: "chat-confirm" },
        h("button", { class: "btn", onclick: (e) => confirmAction(ctx, r.confirmId, true, e.target.parentNode) }, "Confirmă"),
        h("button", { class: "btn danger", onclick: (e) => confirmAction(ctx, r.confirmId, false, e.target.parentNode) }, "Anulează")));
    }
  } catch (e) {
    typing.remove();
    addMsg("jarvis", "Nu am putut ajunge la server: " + e.message);
  }
  scrollEnd();
}

async function confirmAction(ctx, confirmId, yes, node) {
  node.querySelectorAll("button").forEach((b) => (b.disabled = true));
  let r;
  try {
    r = await ctx.api.post("/api/confirm", { confirmId, yes });
  } catch (e) {
    // Nu lăsăm butoanele blocate pe eroare de rețea — reactivăm + semnalăm.
    node.querySelectorAll("button").forEach((b) => (b.disabled = false));
    addMsg("jarvis", "Nu am putut confirma: " + e.message);
    scrollEnd();
    return;
  }
  node.remove();
  addMsg("jarvis", r?.reply || r?.error || "—");
  scrollEnd();
  ctx.refresh();
}

function addMsg(role, text) {
  const m = h("div", { class: "msg " + role }, String(text ?? ""));
  logEl.append(m);
  return m;
}
function scrollEnd() {
  // Deruleaza DOAR daca acest chat mai e pe ecran — altfel am fura scrollul
  // ecranului pe care utilizatorul tocmai a navigat.
  requestAnimationFrame(() => {
    if (!logEl || !logEl.isConnected) return;
    const v = document.getElementById("view");
    v.scrollTop = v.scrollHeight;
  });
}
