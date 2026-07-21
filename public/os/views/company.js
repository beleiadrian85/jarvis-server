// COMPANY — realitatile firmei, nu dashboard-uri. Fiecare domeniu incepe cu
// concluzia AI (Reality Statement), apoi progressive disclosure:
// stim / presupunem / lipseste / s-a schimbat / dovezi / detalii.
import { h, card, pill, realityStatement, disclosure, table, dataUnavailable, emptyCalm } from "../components/ui.js";
import * as A from "../adapters.js";

// Traducerea codurilor de status ale lanțului de atribuție (nu expunem jargon EN).
const statusRo = (s) => ({
  CONNECTED: "conectat", ATTRIBUTION_GAP: "gap de atribuție",
  SOURCE_DOWN: "sursă picată", NOT_CONNECTED: "neconectat", PARTIAL: "parțial",
}[s] || (s ? String(s).toLowerCase() : "neconectat"));

const DOMAINS = {
  cash:      { label: "CASH",       sub: "lichiditate, solduri, obligații" },
  sales:     { label: "VÂNZĂRI",    sub: "unități, rezervări, încasări, funnel" },
  projects:  { label: "PROIECTE",   sub: "C1/C2/C3 — execuție, costuri, blocaje" },
  people:    { label: "OAMENI",     sub: "responsabilități, blocaje, așteptări" },
  marketing: { label: "MARKETING",  sub: "trafic, lead-uri, atribuție" },
  financing: { label: "FINANȚARE",  sub: "credite, leasing, serviciul datoriei" },
  operations:{ label: "OPERAȚIUNI", sub: "surse, sisteme, conectivitate" },
};

export async function render(root, ctx, sub) {
  if (sub && DOMAINS[sub]) return renderDomain(root, ctx, sub);

  const nodes = A.orbitNodes({ dataHealth: ctx.store.dataHealth, today: ctx.store.today });
  root.replaceChildren(
    h("h2", { style: "margin-bottom:var(--sp-4)" }, "Realitățile companiei"),
    h("div", { class: "domain-grid" },
      Object.entries(DOMAINS).map(([key, d]) => {
        const n = nodes.find((x) => x.route.endsWith(key)) || {};
        return h("button", { class: "domain-card", onclick: () => ctx.goto("#/company/" + key) },
          h("div", { style: "display:flex;justify-content:space-between;align-items:center" },
            h("h3", {}, d.label),
            pill(n.tone === "off" ? "NECONECTAT" : n.tone === "bad" ? "ACȚIUNE" : n.tone === "warn" ? "ATENȚIE" : "OK",
                 n.tone === "off" ? null : n.tone)),
          h("p", {}, d.sub),
          n.coverage ? h("p", { class: "faint" }, n.coverage) : null);
      })));
}

async function renderDomain(root, ctx, key) {
  root.replaceChildren(h("div", { class: "faint" }, "Se încarcă realitatea " + DOMAINS[key].label + "…"));
  const back = h("button", { class: "btn quiet", onclick: () => ctx.goto("#/company") }, "← Company");
  const token = ctx.navToken;
  try {
    const view = await ({ cash: cashView, sales: salesView, projects: projectsView, people: peopleView,
      marketing: marketingView, financing: financingView, operations: operationsView }[key])(ctx);
    if (!ctx.isCurrent(token)) return; // o navigare mai nouă a câștigat între timp
    root.replaceChildren(back, ...view);
  } catch (e) {
    if (!ctx.isCurrent(token)) return;
    root.replaceChildren(back, card(null,
      realityStatement({ status: "SURSĂ INDISPONIBILĂ", tone: "warn",
        statement: "Nu am putut încărca domeniul: " + e.message + ". Aceasta este o problemă de sistem, nu o deteriorare a afacerii." })));
  }
}

/* ───────────── CASH ───────────── */
async function cashView(ctx) {
  const [cash, bal, intel, today] = await Promise.all([
    ctx.api.get("/api/ceo/cash"), ctx.api.get("/api/ceo/bank-balance"),
    ctx.api.get("/api/ceo/bank-intel").catch(() => null), Promise.resolve(ctx.store.today),
  ]);
  const min = today?.cash?.minim || {};
  const hasBalance = typeof min.available_now === "number";
  const deficit = min.first_deficit_date && min.first_deficit_date !== "UNKNOWN";

  const statement = hasBalance
    ? `Cash disponibil ${A.lei(min.available_now)}. Punct minim estimat ${A.lei(min.minimum_cash) ?? "necunoscut"}${min.minimum_cash_date && min.minimum_cash_date !== "UNKNOWN" ? " la " + min.minimum_cash_date : ""}.` +
      (deficit ? ` Primul deficit probabil: ${min.first_deficit_date}.` : " Fără deficit în orizontul calculat.")
    : "Soldul bancar nu este conectat — pot calcula doar necesarul BRUT de plăți, nu lichiditatea netă. Cifrele de mai jos sunt ieșiri cunoscute, nu poziție de cash.";

  const horizons = cash?.horizons || {};
  // Model incomplet (sursă de obligații/sold picată): un 0 nu e „zero real",
  // ci „nu pot confirma" — nu îl afișăm ca ieșire certă de 0 lei.
  const degraded = cash?.complete === false || (cash?.data_gaps || []).length > 0;
  // Shape real (cashIntelligence.js): inflows.confirmed / outflows.total_known
  // sunt numere sau stringul "UNKNOWN"; lichiditatea netă e `available_cash`.
  const outCell = (hz) => {
    const v = hz.outflows?.total_known;
    if (typeof v === "number" && v > 0) return A.lei(v);        // ieșiri cunoscute reale
    if (typeof v === "number" && v === 0 && degraded) return dataUnavailable("NECONECTAT"); // 0 dintr-o sursă picată = necunoscut
    return A.lei(v) ?? dataUnavailable("NECONECTAT");
  };
  const allBlank = [7, 14, 21, 30, 60, 90].every((d) => !horizons[d] ||
    (A.lei(horizons[d].inflows?.confirmed) == null && A.lei(horizons[d].available_cash ?? horizons[d].projected_liquidity) == null &&
     !(typeof horizons[d].outflows?.total_known === "number" && horizons[d].outflows.total_known > 0)));
  const rows = [7, 14, 21, 30, 60, 90].filter((d) => horizons[d]).map((d) => {
    const hz = horizons[d];
    return [d + " zile",
      A.lei(hz.inflows?.confirmed) ?? dataUnavailable("NECONECTAT"),
      outCell(hz),
      A.lei(hz.available_cash ?? hz.projected_liquidity) ?? dataUnavailable("FĂRĂ SOLD")];
  });

  const confNote = typeof cash?.confidence === "string" ? " · încredere " + cash.confidence : "";
  const freshness = (bal?.accounts?.length
    ? `solduri: ${bal.freshness || "?"} · ${bal.accounts.map((a) => `${a.bank} acum ${a.age_hours}h`).join(" · ")}`
    : "solduri: neintroduse") + confNote;

  return [
    realityStatement({
      status: "CASH REALITY — " + (deficit ? "ACȚIUNE" : hasBalance ? "SUB CONTROL" : "ATENȚIE"),
      tone: deficit ? "bad" : hasBalance ? "ok" : "warn",
      statement, confidence: typeof cash?.confidence === "number" ? cash.confidence : null,
      freshness, stale: !hasBalance || bal?.expired,
    }),
    card("ORIZONTURI", !rows.length
      ? dataUnavailable("FĂRĂ ORIZONTURI CALCULATE")
      : allBlank
        ? h("p", { class: "dim", style: "font-size:var(--fs-sm)" }, "Necesarul net pe orizonturi (7–90 zile) devine disponibil după conectarea soldului bancar și a obligațiilor. Nu afișez cifre pe care nu le pot confirma.")
        : table(["Orizont", { label: "Intrări confirmate", num: true }, { label: "Ieșiri cunoscute", num: true }, { label: "Net", num: true }], rows)),
    card(null,
      disclosure("Ce știm", [
        ...(bal?.accounts || []).map((a) => `${a.bank}/${a.account}: ${a.available.toLocaleString("ro-RO")} ${a.currency} (introdus de ${a.enteredBy || "?"}, acum ${a.age_hours}h)`),
        today?.receivables?.statement,
      ].filter(Boolean), { open: true }),
      disclosure("Ce presupunem", [
        degraded ? "NU pot confirma că obligațiile din Operational sunt la zi — sursa e degradată." : "Obligațiile din Operational sunt complete și la zi.",
        "Cursul EUR/RON folosit este cel din configurație, nu în timp real.",
      ], { open: false }),
      disclosure("Ce lipsește", (cash?.data_gaps || today?.cash?.ce_nu_stim || []).map(String), { open: !hasBalance }),
      disclosure("Dovezi / surse", [
        "Obligații: Operational (list_payment_obligations)",
        "Solduri: introduse manual în Command Center (balanceStore)",
        "Încasări: Operational (income_invoices + estimated_cash_inflows)",
      ])),
    intel && intel.totals ? card("RULAJE BANCARE (fără sold)",
      h("p", { class: "dim", style: "font-size:var(--fs-sm)" },
        `${intel.period?.from} → ${intel.period?.to}: intrări ${A.lei(intel.totals.inRON)} · ieșiri ${A.lei(intel.totals.outRON)} · medie ieșiri/zi ${A.lei(intel.daily_avg?.outRON)}`),
      intel.burn_rate_note ? h("p", { class: "faint" }, intel.burn_rate_note) : null,
      disclosure("Ieșiri recurente detectate", (intel.recurring_out || []).slice(0, 6).map((r) => `${r.key} ~${A.lei(r.avgRON)}`)))
      : null,
    balanceForm(ctx, bal),
  ].filter(Boolean);
}

function balanceForm(ctx, bal) {
  const f = {};
  const inp = (id, ph, type) => (f[id] = h("input", { placeholder: ph, type: type || "text", "aria-label": ph }));
  return card("ACTUALIZEAZĂ SOLDURILE (Dana / Adrian)",
    bal?.note ? h("p", { class: "faint" }, bal.note) : null,
    h("div", { class: "form-row" }, inp("bank", "Bancă (ex: ING)"), inp("acc", "Cont (ultimele 4)"),
      (f.cur = h("select", { "aria-label": "Valută" }, h("option", {}, "RON"), h("option", {}, "EUR"))),
      inp("val", "Sold disponibil", "number")),
    h("div", { class: "form-row" }, inp("who", "Cine introduce"),
      h("button", { class: "btn", onclick: async () => {
        const r = await ctx.api.post("/api/ceo/bank-balance", {
          bank: f.bank.value.trim(), account: f.acc.value.trim(), currency: f.cur.value,
          available: Number(f.val.value), enteredBy: f.who.value.trim(),
        });
        alert(r?.ok ? "Salvat. Lichiditatea se recalculează." : "Eroare: " + (r?.errors?.join(", ") || r?.error || "?"));
        if (r?.ok) { ctx.api.invalidate(); await ctx.refresh(); ctx.goto("#/company/cash", true); }
      } }, "Salvează soldul")));
}

/* ───────────── VÂNZĂRI ───────────── */
async function salesView(ctx) {
  const [attr, today, overview] = await Promise.all([
    ctx.api.get("/api/ceo/attribution").catch(() => null),
    Promise.resolve(ctx.store.today),
    ctx.api.get("/api/ceo/overview").catch(() => null),
  ]);
  const recv = today?.receivables;
  const chain = attr?.chain || {};
  const chainRow = Object.entries(chain).map(([k, v]) =>
    `${k}: ${statusRo(v.status)}${v.count != null ? " · " + v.count : v.last7_avg != null ? " · ~" + v.last7_avg + "/zi" : ""}`);

  const missing = overview?.funnel_missing || [];
  // Concluzia trebuie să justifice tonul: dacă funnelul e rupt, DESPRE asta e
  // titlul — nu despre o linie de încasări „0 lei" venită dintr-o sursă picată.
  const recvDown = (recv?.gaps || []).some((g) => /picat|indisponibil|sursa/i.test(String(g)));
  const statement = missing.length
    ? "Vânzările semnate și inventarul sunt conectate, dar funnelul amonte e incomplet: " + missing.join(", ") + ". Nu pot măsura conversia de la lead până la contract."
    : recv?.statement || "Vânzările semnate și inventarul sunt conectate; funnelul amonte este conectat.";

  return [
    realityStatement({
      status: "SALES REALITY — " + (missing.length ? "ATENȚIE" : "SUB CONTROL"),
      tone: missing.length ? "warn" : "ok",
      statement,
    }),
    card("LANȚUL TRAFIC → CASH", chainRow.length ? h("ul", { class: "dim", style: "padding-left:18px;font-size:var(--fs-sm)" },
      chainRow.map((c) => h("li", {}, c))) : dataUnavailable("ATRIBUȚIE INDISPONIBILĂ"),
      (attr?.findings || []).length ? disclosure("Constatări", attr.findings.map((f) => f.finding)) : null),
    recv?.totals && !recvDown ? card("ÎNCASĂRI",
      h("div", { class: "kv" },
        Object.entries(recv.totals).slice(0, 4).map(([k, v]) => {
          const label = { confirmedRON: "confirmate", overdueRON: "restante", probableRON: "probabile", collected_count: "încasate (nr)" }[k] || k.replace(/_/g, " ");
          return h("div", {}, h("b", { class: "num" }, k === "collected_count" ? String(v) : (A.lei(v) ?? String(v))), h("span", {}, label));
        })),
      (recv.gaps || []).length ? disclosure("Ce lipsește", recv.gaps.map(String)) : null)
      : card("ÎNCASĂRI", dataUnavailable(recvDown ? "SURSĂ PICATĂ — încasările nu sunt vizibile" : "REGISTRU INDISPONIBIL"),
          recvDown && (recv.gaps || []).length ? h("p", { class: "faint", style: "margin-top:6px" }, recv.gaps.join(" · ")) : null),
    card(null, disclosure("Întrebări de decizie", [
      "Prețuri: menținem sau ajustăm pe stocul disponibil?",
      "Avansuri: colectăm avansurile pe rezervările fără avans?",
      "Canal: ce sursă de lead-uri merită buget suplimentar?",
    ], { open: true })),
  ];
}

/* ───────────── PROIECTE ───────────── */
async function projectsView(ctx) {
  const rep = await ctx.api.post("/api/report", { kind: "projects" }).catch(() => null);
  const prios = (ctx.store.today?.priorities || []).filter((p) => /proiect|santier|[șs]antier|c[123]|furnizor/i.test(p.title || ""));
  // Sursa proiectelor (CONSTRUCTION/PROJECTS) e conectată? Fără ea, „nicio
  // variație" e absență de semnal, nu confirmare — nu spunem verde „SUB CONTROL".
  const dh = ctx.store.dataHealth?.domains || [];
  const proj = dh.filter((d) => ["PROJECTS", "CONSTRUCTION", "SUPPLIERS"].includes(d.domain));
  const reportOk = !!rep?.report;
  const projConnected = proj.some((d) => d.domain === "PROJECTS" && d.connected === "CONNECTED") && reportOk;
  const construction = proj.find((d) => d.domain === "CONSTRUCTION");
  let status, tone, statement;
  if (prios.length) {
    status = "PROJECTS REALITY — ATENȚIE"; tone = "warn"; statement = prios.map((p) => p.title).join(" · ");
  } else if (!projConnected) {
    status = "PROJECTS REALITY — VIZIBILITATE REDUSĂ"; tone = "warn";
    statement = "Nu pot evalua execuția — sursa Operational a proiectelor e deconectată. " +
      (construction && construction.connected !== "CONNECTED" ? "Progresul fizic pe faze nu e măsurabil vs plăți." : "");
  } else {
    status = "PROJECTS REALITY — SUB CONTROL"; tone = "ok";
    statement = "Nicio variație de execuție semnalată de date. Detaliile în raportul de mai jos.";
  }
  return [
    realityStatement({ status, tone, statement }),
    card("RAPORT PROIECTE (motor existent)",
      reportOk ? h("pre", { class: "mono dim", style: "white-space:pre-wrap" }, rep.report)
        : dataUnavailable(rep?.error || "OPERATIONAL NECONECTAT")),
  ];
}

/* ───────────── OAMENI ───────────── */
async function peopleView(ctx) {
  const today = ctx.store.today;
  const who = today?.who || {};
  const [queue, idents] = await Promise.all([
    ctx.api.get("/api/ceo/queue").catch(() => null),
    ctx.api.get("/api/ceo/identity-candidates").catch(() => null),
  ]);
  const personCard = (name, items) => card(name.toUpperCase(),
    (items || []).length && !/^NO EXECUTIVE/.test(items[0])
      ? h("ul", { class: "dim", style: "padding-left:18px;font-size:var(--fs-sm)" }, items.map((i) => h("li", {}, i)))
      : emptyCalm("Nimic cerut de date", "Nu îl încărcăm degeaba."));
  const waiting = (queue?.WAITING_FOR_DATA || []);
  // Dependențele umane deschise trăiesc și în who.* (nu doar în queue), altfel
  // titlul poate spune „nicio dependență" în timp ce cardul Danei arată o cerere.
  const openPer = (arr) => (arr || []).filter((t) => !/^NO EXECUTIVE/.test(t));
  const openHuman = [["Dana", who.DANA], ["Nelu", who.NELU]]
    .flatMap(([name, arr]) => openPer(arr).map((t) => ({ name, t })));
  const anyOpen = waiting.length || openHuman.length;
  return [
    realityStatement({
      status: "PEOPLE REALITY",
      tone: anyOpen ? "warn" : "ok",
      statement: anyOpen
        ? "Sistemul așteaptă de la oameni: " + [
            ...waiting.map((w) => (w.assignee || "?") + " (" + w.problem + ")"),
            ...openHuman.map((o) => o.name + " (" + (o.t.length > 60 ? o.t.slice(0, 59) + "…" : o.t) + ")"),
          ].slice(0, 4).join(" · ")
        : "Nicio dependență umană blocantă în acest moment. Măsurăm impact, nu număr de task-uri.",
    }),
    personCard("Adrian", who.ADRIAN), personCard("Dana", who.DANA),
    personCard("Nelu", who.NELU), personCard("Sistem", who.SYSTEM),
    idents ? card("IDENTITĂȚI TELEGRAM",
      h("p", { class: "dim", style: "font-size:var(--fs-sm)" },
        "Mapate: " + (Object.keys(idents.mapped || {}).join(", ") || "doar fondatorul (env)")),
      Object.keys(idents.candidates || {}).length
        ? disclosure("Candidați (persoana a scris botului)", Object.entries(idents.candidates).map(([id, c]) => `${id} — ${c.username || c.name || "?"}`), { open: true })
        : h("p", { class: "faint" }, "Niciun candidat — persoana trimite orice mesaj botului pentru a apărea aici.")) : null,
  ].filter(Boolean);
}

/* ───────────── MARKETING ───────────── */
async function marketingView(ctx) {
  const attr = await ctx.api.get("/api/ceo/attribution").catch(() => null);
  const dh = ctx.store.dataHealth;
  const mkt = (dh?.domains || []).filter((d) => ["MARKETING", "WEBSITE_TRAFFIC", "LEADS"].includes(d.domain));
  const notConn = mkt.filter((d) => d.connected !== "CONNECTED");
  return [
    realityStatement({
      status: "MARKETING REALITY — " + (notConn.length ? "PARȚIAL CONECTAT" : "SUB CONTROL"),
      tone: notConn.length ? "warn" : "ok",
      statement: notConn.length
        ? "Nu pot măsura complet lanțul campanie → lead → vânzare. Ce lipsește este mai jos, cu remedii concrete — nu afișez cifre pe care nu le am."
        : "Lanțul de atribuție este conectat.",
    }),
    attr?.chain ? card("CE VĂD ACUM", h("ul", { class: "dim", style: "padding-left:18px;font-size:var(--fs-sm)" },
      Object.entries(attr.chain).map(([k, v]) => h("li", {}, `${k}: ${statusRo(v.status)}${v.count != null ? " · " + v.count : v.last7_avg != null ? " · ~" + v.last7_avg + "/zi" : ""}`)))) : null,
    card("SURSE ȘI REMEDII", table(["Sursă", "Stare", "Impact", "Remediu"],
      mkt.map((d) => [d.domain, d.connected, d.business_impact || "—", d.how_to_fix || "—"]))),
  ].filter(Boolean);
}

/* ───────────── FINANȚARE ───────────── */
async function financingView(ctx) {
  const fin = await ctx.api.get("/api/ceo/financing").catch(() => null);
  const entries = fin?.entries || [];
  const monthly = fin?.total_monthly_service;
  return [
    realityStatement({
      status: "FINANCING REALITY",
      tone: entries.length ? "ok" : "warn",
      statement: entries.length
        ? `${entries.length} finanțări active (deduse din scadențar)${typeof monthly === "number" && monthly ? " · serviciul datoriei ~" + A.lei(monthly) + "/lună" : ""}. Soldul rămas, dobânda și maturitatea finală NU sunt conectate — le declar necunoscute, nu le estimez.`
        : "Registrul de finanțări se construiește din obligațiile recurente (credit/leasing) din Operational — niciuna identificată acum.",
    }),
    entries.length ? card("REGISTRU", table(["Creditor", "Tip", { label: "Rată", num: true }, "Următoarea scadență", { label: "Angajat 90z", num: true }, "Sold rămas"],
      entries.map((e) => [e.creditor, e.type, A.lei(e.installmentRON) ?? "—", e.next_due || "—", A.lei(e.committed_90d) ?? "—",
        e.outstanding_balance === "UNKNOWN" ? dataUnavailable("NECUNOSCUT") : e.outstanding_balance])))
      : card("REGISTRU", dataUnavailable("FĂRĂ FINANȚĂRI DETECTATE ÎN OBLIGAȚII")),
    fin?.data_gaps?.length ? card(null, disclosure("Ce lipsește", fin.data_gaps.map(String), { open: true })) : null,
    fin?.information_request_hint ? card(null, h("p", { class: "faint" }, fin.information_request_hint)) : null,
  ].filter(Boolean);
}

/* ───────────── OPERAȚIUNI (surse & sisteme) ───────────── */
async function operationsView(ctx) {
  const [sh, sys] = await Promise.all([
    ctx.api.get("/api/ceo/source-health").catch(() => null),
    ctx.api.get("/api/ceo/system-health").catch(() => null),
  ]);
  const dh = ctx.store.dataHealth;
  const rows = (dh?.domains || []).map((d) => [d.domain, d.connected,
    d.owner || "—", d.connected === "CONNECTED" ? "—" : (d.how_to_fix || d.business_impact || "—")]);
  const failing = sys?.failing || [];
  return [
    realityStatement({
      status: "SISTEME & SURSE",
      tone: failing.length ? "warn" : "ok",
      statement: failing.length
        ? `${failing.length} componente de sistem au probleme — nimic din business nu e afectat; JARVIS/IT le remediază. Detaliile tehnice în „conectorii (avansat)".`
        : `Sănătatea sistemului ${sys?.score ?? "—"}/100 · date ${dh?.healthScore ?? "—"}/100. O pană de conector nu înseamnă o deteriorare a firmei.`,
    }),
    failing.length ? card(null, disclosure("Componentele cu probleme (tehnic)", failing.map(String), { open: false })) : null,
    card("HARTA DATELOR — " + (dh?.connected ?? "?") + "/" + (dh?.total ?? "?") + " CONECTATE",
      table(["Domeniu", "Stare", "Responsabil", "Remediu"], rows)),
    sh?.sources ? card(null, disclosure("Sănătatea conectorilor (avansat)",
      Object.entries(sh.sources).map(([k, v]) => `${k}: ${v.status || "?"}${v.as_of ? " · " + (A.relTime(v.as_of) || v.as_of) : ""}`))) : null,
  ].filter(Boolean);
}
