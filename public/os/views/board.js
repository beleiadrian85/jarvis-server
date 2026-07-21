// EXECUTIVE BOARD 6+1 — experiență vizuală executivă (spec §16).
// Problema → 6 perspective (cu dezacorduri) → cel mai puternic PRO / CONTRA →
// asumpții · riscuri · reversibilitate · dovezi lipsă → a 7-a = decizia sintetizată.
// Consumă runBoardMeeting EXISTENT prin /api/ceo/board (read-only). Boardul
// RECOMANDĂ, nu decide — decizia rămâne a fondatorului.
import { h, card, pill, confidence, disclosure, emptyCalm, dataUnavailable, openDrawer } from "../components/ui.js";

const ROLE_TITLE = {
  CEO: "CEO — Chairman", CFO: "CFO — financiar & capital", COO: "COO — execuție & capacitate",
  CRO: "CRO — risc & scenarii de eșec", CLO: "CLO — juridic & conformitate",
  CHRO: "CHRO — oameni & cultură", CMO: "CMO — brand & piață", CSO: "CSO — vânzări",
  CTO: "CTO — tehnologie & arhitectură", INNOVATION: "Innovation — soluția a șaptea",
  GUARDIAN: "Guardian — protecția CODEX", FOUNDER_VOICE: "Founder Voice — ADN-ul fondatorului",
};
const POS = {
  approve: { label: "PENTRU", tone: "ok", camp: "pro" },
  approve_with_conditions: { label: "PENTRU, CU CONDIȚII", tone: "warn", camp: "pro" },
  reject: { label: "ÎMPOTRIVĂ", tone: "bad", camp: "contra" },
  insufficient_data: { label: "DATE INSUFICIENTE", tone: null, camp: "neutral" },
};
const REC = {
  DA: { label: "DA — recomandat", tone: "ok" },
  NU: { label: "NU — nerecomandat", tone: "bad" },
  AMANA: { label: "AMÂNĂ", tone: "warn" },
  DATE_INSUFICIENTE: { label: "DATE INSUFICIENTE — întâi datele", tone: "warn" },
};

export async function render(root, ctx) {
  const token = ctx.navToken;
  const question = ctx.boardQuestion || "ultima decizie discutată";

  const backBtn = h("button", { class: "btn quiet", onclick: () => history.back() }, "← înapoi");
  const header = h("div", { class: "company-state" },
    h("h2", {}, "Executive Board 6+1"),
    pill("consultativ — decizi tu", "sys"),
    h("p", { class: "cs-sub" }, "Șase perspective independente pe o decizie, apoi a șaptea: sinteza. Boardul expune dezacordul și downside-ul; nu te flatează și nu decide în locul tău."));

  // Runner: reconvocare cu altă întrebare
  const qInput = h("input", { placeholder: "Decizia de analizat…", value: question === "ultima decizie discutată" ? "" : question, "aria-label": "Decizie" });
  const runner = card(null, h("div", { class: "form-row" }, qInput,
    h("button", { class: "btn", onclick: () => { const q = qInput.value.trim(); if (q) ctx.board(q, true); } }, "Convoacă Boardul")));

  root.replaceChildren(backBtn, header, runner,
    h("div", { id: "board-body" },
      card(null, h("div", { class: "faint" }, `Boardul analizează „${question}"… (o ședință reală poate dura până la ~3 minute — un singur apel de raționament, apoi sinteza deterministă).`))));

  let m;
  try {
    m = await ctx.api.post("/api/ceo/board", { question });
  } catch (e) {
    if (!ctx.isCurrent(token)) return;
    document.getElementById("board-body")?.replaceChildren(card(null,
      h("b", {}, "Ședința nu a putut rula."), h("p", { class: "dim", style: "margin-top:8px" }, e.message)));
    return;
  }
  if (!ctx.isCurrent(token)) return; // utilizatorul a navigat în timpul ședinței
  if (!m || m.error) {
    document.getElementById("board-body")?.replaceChildren(card(null,
      h("b", {}, "Board indisponibil."), h("p", { class: "dim", style: "margin-top:8px" }, m?.error || "Motor de Board inactiv sau eroare de rețea."),
      h("p", { class: "faint" }, "Boardul e o capabilitate existentă (executiveBoard). Dacă e dezactivat pe server, activarea e o decizie de configurare.")));
    return;
  }
  document.getElementById("board-body")?.replaceChildren(...renderMeeting(m, ctx));
}

function renderMeeting(m, ctx) {
  const rec = m.recommendation;
  const persp = m.perspectives || [];
  const votes = persp.filter((p) => p.position && p.position !== "insufficient_data");
  const pros = persp.filter((p) => POS[p.position]?.camp === "pro").sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const contras = persp.filter((p) => POS[p.position]?.camp === "contra").sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const strongestPro = pros[0];
  const strongestContra = contras[0];
  const missingEvidence = [...(m.data_missing || []), ...(m.missing_perspectives || []).map((r) => `perspectivă lipsă: ${ROLE_TITLE[r] || r}`)];

  // ── A 7-A: DECIZIA SINTETIZATĂ (eroul ecranului) ──
  const recBlock = rec
    ? h("section", { class: "card board-verdict", "data-tone": REC[rec.recommendation]?.tone || "warn" },
        h("div", { class: "bv-label" }, "A ȘAPTEA — SINTEZA BOARDULUI"),
        h("div", { class: "bv-rec" }, REC[rec.recommendation]?.label || rec.recommendation),
        h("div", { class: "bv-meta" },
          metric("consens", (rec.consensus_level ?? "—") + "%"),
          metric("încredere", (rec.confidence ?? "—") + "%"),
          metric("calitatea datelor", rec.data_quality || "—"),
          metric("reversibilitate", m.reversibility || "—")),
        rec.contradicts_prior ? h("p", { class: "bv-warn" }, "⚠️ Contrazice o decizie anterioară („" + rec.contradicts_prior.ref + "”): " + rec.contradicts_prior.explanation) : null,
        rec.codex_compliance && !rec.codex_compliance.compliant ? h("p", { class: "bv-warn" }, "⚠️ CODEX: " + (rec.codex_compliance.issues || []).join("; ")) : null,
        h("p", { class: "bv-foot" }, "Boardul recomandă. Decizia finală îți aparține."))
    : h("section", { class: "card board-verdict", "data-tone": "bad" },
        h("div", { class: "bv-label" }, "RECOMANDARE NEEMISĂ"),
        h("div", { class: "bv-rec" }, "Blocată de " + (m.blocked?.by || "validator")),
        h("ul", { class: "dim", style: "margin-top:8px;padding-left:18px;font-size:var(--fs-sm)" },
          (m.blocked?.issues || []).slice(0, 5).map((i) => h("li", {}, i))),
        h("p", { class: "bv-foot" }, "Structură incompletă sau neconformă CODEX — Boardul nu emite recomandare pe date insuficiente."));

  // ── Cel mai puternic PRO / CONTRA ──
  const argCard = (title, tone, d) => h("div", { class: "board-arg", "data-tone": tone },
    h("div", { class: "ba-title" }, title),
    d ? h("div", {}, h("b", {}, ROLE_TITLE[d.role] || d.role, " · " + (d.confidence ?? "—") + "%"),
      h("p", { class: "dim", style: "margin-top:4px;font-size:var(--fs-sm)" }, (d.arguments && d.arguments[0]) || "fără argument explicit"))
      : h("p", { class: "faint" }, "niciun director în această tabără"));

  // ── Perspectivele (6) ──
  const perspCard = (p) => {
    const info = POS[p.position] || {};
    return h("article", { class: "persp", "data-tone": info.tone },
      h("div", { class: "persp-head" },
        h("b", {}, ROLE_TITLE[p.role] || p.role),
        pill(info.label || p.position, info.tone),
        typeof p.confidence === "number" ? h("span", { class: "faint num" }, p.confidence + "%") : null),
      (p.arguments || []).length
        ? h("p", { class: "dim", style: "font-size:var(--fs-sm);margin-top:4px" }, p.arguments[0])
        : h("p", { class: "faint" }, p.note || "fără răspuns (marcat lipsă)"),
      (p.arguments || []).length > 1
        ? h("button", { class: "btn quiet", onclick: () => openDrawer(ROLE_TITLE[p.role] || p.role,
            h("ul", {}, p.arguments.map((a) => h("li", { style: "margin:6px 0" }, a)))) }, "toate argumentele")
        : null);
  };

  const dis = rec?.major_disagreements || [];

  return [
    card("DECIZIA ÎN DISCUȚIE",
      h("p", { style: "font-size:var(--fs-lg);font-weight:550" }, m.problem || m.question),
      m.purpose && m.purpose !== m.problem ? h("p", { class: "faint", style: "margin-top:4px" }, m.purpose) : null,
      h("div", { class: "reality-meta" },
        pill(m.type || "decizie", "sys"),
        votes.length ? pill(`${pros.length} pentru · ${contras.length} împotrivă`, contras.length > pros.length ? "bad" : "ok") : null)),
    recBlock,
    h("div", { class: "board-args" },
      argCard("CEL MAI PUTERNIC PRO", "ok", strongestPro),
      argCard("CEL MAI PUTERNIC CONTRA", "bad", strongestContra)),
    dis.length ? card(["DEZACORDURI MAJORE", h("span", { class: "spacer" }), pill(String(dis.length), "warn")],
      h("div", {}, dis.map((d) => h("div", { class: "needs-item" },
        h("b", {}, ROLE_TITLE[d.role] || d.role, " — "), h("span", { class: POS[d.position]?.tone === "bad" ? "bad" : "warn" }, POS[d.position]?.label || d.position),
        h("p", { class: "dim", style: "font-size:var(--fs-sm);margin-top:2px" }, d.reason))))) : null,
    card(["PERSPECTIVELE DIRECTORILOR", h("span", { class: "spacer" }), pill(String(persp.length), "sys")],
      persp.length ? h("div", { class: "persp-grid" }, persp.map(perspCard)) : emptyCalm("Fără perspective", "Modelul nu a returnat directorii — ședință incompletă.")),
    card(null,
      disclosure("Asumpții", (m.assumptions || []).map(String), { open: true }),
      disclosure("Opțiuni evaluate", (m.options || []).map(String)),
      disclosure("Riscuri", (m.risks || []).map(String)),
      disclosure("Dovezi / perspective lipsă", missingEvidence, { open: missingEvidence.length > 0 }),
      rec?.conditions?.length ? disclosure("Condiții (dacă se aprobă)", rec.conditions) : null,
      rec?.risk_limits?.length ? disclosure("Limite de risc", rec.risk_limits) : null,
      rec?.stop_conditions?.length ? disclosure("Criterii de oprire", rec.stop_conditions) : null,
      h("div", { style: "margin-top:12px;display:grid;gap:4px" },
        m.impact ? h("p", { class: "faint" }, h("b", { style: "color:var(--tx-dim)" }, "Impact financiar: "), m.impact.financial || "neevaluat") : null,
        m.scenarios?.success ? h("p", { class: "faint" }, h("b", { style: "color:var(--tx-dim)" }, "Scenariu de succes: "), m.scenarios.success) : null)),
  ].filter(Boolean);
}

const metric = (label, val) => h("div", { class: "bv-metric" },
  h("b", { class: "num" }, val), h("span", {}, label));
