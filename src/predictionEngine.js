// ─────────────────────────────────────────────────────────────────────────
//  P1 — PREDICTION ENGINE
//  100% determinist. Zero AI, zero MCP, zero DB, zero fetch, zero config
//  global, zero IO, zero egress, zero importuri. Funcție pură.
//
//  predict(state, opts?) → { predictions, alerts, confidence, assumptions }
//
//  Coexistă cu riskEngine.js (varianta A):
//    riskEngine     = situația PREZENTĂ (snapshot).
//    predictionEngine = probabilități VIITOARE (forward-looking).
//
//  Extensibil: detectoarele trăiesc într-un registru (DETECTORS). Adaugi unul
//  nou fie prin push în DETECTORS, fie prin opts.extraDetectors — FĂRĂ să
//  modifici predict(). Fiecare detector e o funcție pură (ctx) => Prediction[].
// ─────────────────────────────────────────────────────────────────────────

// ── utilitare pure ──────────────────────────────────────────────────────
const DAY = 86400000;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const round = (x) => Math.round(x);
const sum = (a) => a.reduce((s, v) => s + v, 0);

// diferența în zile între două date "YYYY-MM-DD" (b - a). Determinist.
function daysBetween(a, b) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY);
}
// formatare numerică pură (fără locale/ICU): 1234567 → "1.234.567"
function fmt(n) {
  n = Math.round(n);
  const neg = n < 0;
  const s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + s;
}
const lei = (n) => fmt(n) + " lei";

// scor bandat determinist: stops crescătoare → probabilități discrete
function band(x, stops) {
  const P = [0.25, 0.5, 0.75, 0.95];
  let r = 0.1;
  for (let i = 0; i < stops.length; i++) if (x >= stops[i]) r = P[i];
  return r;
}
// urgența în funcție de zilele până la problemă (mai aproape → pondere mai mare)
function proximityWeight(days) {
  if (days == null) return 0.7;
  return clamp(1 - days / 60, 0.3, 1);
}
// score 0–100 = probabilitate ponderată cu urgența
function toScore(prob, days) {
  return round(clamp(prob, 0, 1) * (0.5 + 0.5 * proximityWeight(days)) * 100);
}
function severityOf(prob, days) {
  if (prob >= 0.75 && days != null && days <= 14) return "critical";
  if (prob >= 0.6) return "high";
  if (prob >= 0.35) return "medium";
  return "low";
}
// construiește o predicție completă (adaugă severity, score, why obligatoriu)
function mk(o) {
  const prob = clamp(o.probability, 0, 1);
  const days = o.daysUntilProblem ?? null;
  return {
    key: o.key,
    title: o.title,
    severity: o.severity || severityOf(prob, days),
    probability: round(prob * 100) / 100,
    score: toScore(prob, days),
    impact: o.impact ?? null,
    daysUntilProblem: days,
    recommendation: o.recommendation || "",
    why: o.why || "",
  };
}

// ── construirea contextului (o singură dată, determinist) ────────────────
const DEFAULTS = { cashBuffer: 50000, overloadTasks: 6, bigObligation: 50000, criticalDays: 14, horizons: [7, 14, 30, 60] };

function buildContext(state) {
  const asOf = state.asOf;
  const cfg = { ...DEFAULTS, ...(state.config || {}) };
  const opening = typeof state.openingBalance === "number" ? state.openingBalance : null;

  const outflows = (state.obligations || [])
    .map((o) => ({ ...o, amountRON: Number(o.amountRON) || 0, days: daysBetween(asOf, o.dueDate) }))
    .filter((o) => Number.isFinite(o.days) && o.days >= 0)
    .sort((a, b) => a.days - b.days);

  const inflows = (state.inflows || [])
    .map((i) => ({ ...i, amountRON: Number(i.amountRON) || 0, days: daysBetween(asOf, i.date) }))
    .filter((i) => Number.isFinite(i.days) && i.days >= 0)
    .sort((a, b) => a.days - b.days);

  const tasks = (state.tasks || []).map((t) => {
    const d = t.deadline ? daysBetween(asOf, t.deadline) : null;
    return {
      ...t,
      daysToDeadline: d,
      overdue: d != null && d < 0 && !["acceptat", "respins"].includes(t.status),
      blocked: t.status === "blocat",
      open: ["nou", "in_lucru", "blocat"].includes(t.status),
    };
  });

  const horizons = {};
  for (const H of cfg.horizons) {
    const out = sum(outflows.filter((o) => o.days <= H).map((o) => o.amountRON));
    const inc = sum(inflows.filter((i) => i.days <= H).map((i) => i.amountRON));
    horizons[H] = { out, in: inc, net: out - inc, proj: opening != null ? opening - (out - inc) : null };
  }

  let firstDeficit = null;
  if (opening != null) {
    const events = [
      ...outflows.map((o) => ({ d: o.days, amt: -o.amountRON, t: o.title })),
      ...inflows.map((i) => ({ d: i.days, amt: i.amountRON, t: "încasare" })),
    ].sort((a, b) => a.d - b.d);
    let bal = opening;
    for (const e of events) {
      bal += e.amt;
      if (bal < 0) { firstDeficit = { days: e.d, balance: round(bal), trigger: e.t }; break; }
    }
  }

  const byProject = {}, byAssignee = {};
  for (const t of tasks) {
    if (!t.open) continue;
    const near = t.daysToDeadline != null && t.daysToDeadline >= 0 && t.daysToDeadline <= cfg.criticalDays;
    const p = t.project || "General";
    const gp = (byProject[p] = byProject[p] || { active: 0, overdue: 0, blocked: 0, near: 0 });
    gp.active++; if (t.overdue) gp.overdue++; if (t.blocked) gp.blocked++; if (near) gp.near++;
    const a = t.assignee || "—";
    const ga = (byAssignee[a] = byAssignee[a] || { active: 0, overdue: 0, blocked: 0, near: 0, minDeadline: null });
    ga.active++; if (t.overdue) ga.overdue++; if (t.blocked) ga.blocked++; if (near) ga.near++;
    if (t.daysToDeadline != null && t.daysToDeadline >= 0 && (ga.minDeadline == null || t.daysToDeadline < ga.minDeadline)) ga.minDeadline = t.daysToDeadline;
  }

  return { asOf, cfg, opening, outflows, inflows, tasks, horizons, firstDeficit, byProject, byAssignee, sales: state.sales || {} };
}

// ─────────────────────────────────────────────────────────────────────────
//  DETECTOARE — funcții pure (ctx) => Prediction[]. Adaugă altul nou aici sau
//  prin opts.extraDetectors, fără a atinge predict().
// ─────────────────────────────────────────────────────────────────────────

// 1) Risc lipsă cash pe 7/14/30/60 zile
function d_cashShortfall(ctx) {
  const out = [];
  const { opening, cfg, horizons, firstDeficit } = ctx;
  for (const H of cfg.horizons) {
    const h = horizons[H];
    if (!h) continue;
    let prob, why, impact, days;
    if (opening != null) {
      const proj = h.proj;
      if (proj < 0) prob = clamp(0.9 + 0.1 * Math.min(1, -proj / Math.max(h.net, 1)), 0.9, 1);
      else if (proj < cfg.cashBuffer) prob = clamp(0.4 + 0.4 * (1 - proj / cfg.cashBuffer), 0.4, 0.8);
      else prob = clamp(0.2 * (cfg.cashBuffer / Math.max(proj, 1)), 0, 0.2);
      impact = proj < 0 ? lei(-proj) + " lipsă" : lei(Math.max(0, cfg.cashBuffer - proj)) + " sub prag";
      days = firstDeficit && firstDeficit.days <= H ? firstDeficit.days : proj < 0 ? H : null;
      why = `Sold ${lei(opening)} − necesar ${lei(h.net)} pe ${H} zile = ${lei(proj)} proiectat` + (proj < cfg.cashBuffer ? `, sub pragul de siguranță ${lei(cfg.cashBuffer)}.` : ".");
    } else {
      prob = clamp(0.25 + h.net / 4000000, 0.2, 0.55);
      impact = lei(h.net) + " necesar";
      days = null;
      why = `Sold curent necunoscut; necesar de plăți ${lei(h.net)} în ${H} zile. Estimare fără sold — confidence redusă.`;
    }
    if (prob < 0.2) continue;
    out.push(mk({
      key: `cash_${H}z`, title: `Risc lipsă cash în ${H} zile`, probability: prob, impact, daysUntilProblem: days,
      recommendation: opening != null && h.proj < cfg.cashBuffer
        ? `Asigură lichiditate până în ${H} zile (încasări / linie de credit) sau reeșalonează plățile mari.`
        : `Confirmă acoperirea necesarului de ${lei(h.net)} pentru ${H} zile.`,
      why,
    }));
  }
  return out;
}

// 2) Probabilitate întârziere proiect
function d_projectDelay(ctx) {
  const out = [];
  for (const [p, g] of Object.entries(ctx.byProject)) {
    if (g.active === 0) continue;
    const overdueRatio = g.overdue / g.active, blockedRatio = g.blocked / g.active, nearLoad = Math.min(1, g.near / g.active);
    const prob = clamp(0.5 * overdueRatio + 0.3 * blockedRatio + 0.2 * nearLoad, 0, 1);
    if (prob < 0.2) continue;
    out.push(mk({
      key: `proj_delay_${p}`, title: `Risc întârziere proiect: ${p}`, probability: prob,
      impact: `${g.overdue} întârziate · ${g.blocked} blocate din ${g.active} active`, daysUntilProblem: null,
      recommendation: g.blocked ? `Deblochează ${g.blocked} task-uri pe ${p}.` : `Recuperează ${g.overdue} întârzieri pe ${p}.`,
      why: `Pe ${p}: ${g.overdue}/${g.active} întârziate (${round(overdueRatio * 100)}%), ${g.blocked} blocate, ${g.near} cu termen apropiat.`,
    }));
  }
  return out;
}

// 3) Probabilitate ca task-uri să depășească termenul (agregat + cel mai expus)
function d_taskOverrun(ctx) {
  const risky = [];
  for (const t of ctx.tasks) {
    if (!t.open || t.daysToDeadline == null) continue;
    let prob;
    if (t.overdue) prob = 1;
    else {
      const base = t.daysToDeadline <= 0 ? 1 : clamp(1 - t.daysToDeadline / 14, 0.1, 0.9);
      const load = ctx.byAssignee[t.assignee || "—"];
      const overloaded = load && load.active >= ctx.cfg.overloadTasks ? 0.2 : 0;
      prob = clamp(base + (t.blocked ? 0.3 : 0) + overloaded + (t.status === "nou" && t.daysToDeadline <= 7 ? 0.15 : 0), 0, 1);
    }
    if (prob >= 0.4) risky.push({ t, prob });
  }
  if (!risky.length) return [];
  risky.sort((a, b) => b.prob - a.prob);
  const top = risky[0];
  const avg = sum(risky.map((r) => r.prob)) / risky.length;
  const soonest = Math.min(...risky.map((r) => (r.t.daysToDeadline < 0 ? 0 : r.t.daysToDeadline)));
  const overdueN = risky.filter((r) => r.t.overdue).length;
  return [mk({
    key: "task_overrun", title: `${risky.length} task-uri riscă să depășească termenul`, probability: clamp(avg, 0, 1),
    impact: `ex: „${top.t.title || top.t.id}" (${top.t.assignee || "?"})`, daysUntilProblem: soonest,
    recommendation: `Termen nou realist sau redistribuie — începe cu „${top.t.title || top.t.id}".`,
    why: `${risky.length} task-uri deschise cu termen; ${overdueN} deja depășite; cel mai expus „${top.t.title || top.t.id}" (p=${round(top.prob * 100)}%).`,
  })];
}

// 4) Probabilitate blocaj operațional
function d_operationalBlock(ctx) {
  const blocked = ctx.tasks.filter((t) => t.blocked);
  if (!blocked.length) return [];
  const onCritical = blocked.some((t) => { const g = ctx.byProject[t.project || "General"]; return g && g.overdue > 0; });
  const base = blocked.length >= 5 ? 0.8 : blocked.length >= 3 ? 0.6 : blocked.length >= 1 ? 0.4 : 0;
  const prob = clamp(base + (onCritical ? 0.15 : 0), 0, 1);
  return [mk({
    key: "op_block", title: `Risc blocaj operațional`, probability: prob,
    impact: `${blocked.length} task-uri blocate`, daysUntilProblem: 0,
    recommendation: `Deblochează azi cele ${blocked.length} task-uri oprite (identifică cauza + decide).`,
    why: `${blocked.length} task-uri în status „blocat"` + (onCritical ? ", pe proiecte care au deja întârzieri." : "."),
  })];
}

// 5) Probabilitate rată BT/IMM (obligații mari Credit/Leasing) fără acoperire
function d_btRateUncovered(ctx) {
  const out = [];
  const { opening, cfg } = ctx;
  const big = ctx.outflows.filter((o) => o.amountRON >= cfg.bigObligation && /credit|leasing/i.test(o.category || ""));
  for (const o of big.slice(0, 3)) {
    let prob, why, days = o.days;
    if (opening != null) {
      const before = sum(ctx.outflows.filter((x) => x.days <= o.days).map((x) => x.amountRON)) - sum(ctx.inflows.filter((x) => x.days <= o.days).map((x) => x.amountRON));
      const proj = opening - before;
      if (proj >= 0) prob = clamp(0.2 * (o.amountRON / Math.max(proj + o.amountRON, 1)), 0, 0.3);
      else prob = clamp(0.6 + 0.4 * Math.min(1, -proj / o.amountRON), 0.6, 0.98);
      why = `La ${o.dueDate}, sold proiectat ${lei(proj)} față de rata ${lei(o.amountRON)} („${o.title}").`;
    } else {
      prob = 0.5;
      why = `Rată mare „${o.title}" ${lei(o.amountRON)} pe ${o.dueDate}; sold curent necunoscut → acoperire neconfirmată.`;
    }
    if (prob < 0.3) continue;
    out.push(mk({
      key: `rate_${o.days}`, title: `Rată fără acoperire: ${o.title}`, probability: prob, impact: lei(o.amountRON), daysUntilProblem: days,
      recommendation: `Pregătește ${lei(o.amountRON)} până la ${o.dueDate} pentru „${o.title}".`, why,
    }));
  }
  return out;
}

// 6) Trend negativ vânzări Bell Residence
function d_salesTrend(ctx) {
  const s = ctx.sales;
  const hist = s.history || [];
  let prob, why;
  const fragil = s.rezervat > 0 && (s.avansIncasat || 0) === 0;
  if (hist.length >= 2) {
    const sorted = [...hist].sort((a, b) => (a.period < b.period ? -1 : 1));
    const val = (h) => (h.vandut || 0) + (h.rezervat || 0);
    const first = val(sorted[0]), last = val(sorted[sorted.length - 1]);
    const slope = (last - first) / Math.max(sorted.length - 1, 1);
    if (slope >= 0) {
      if (!fragil) return [];
      prob = 0.4;
      why = `Trend stabil, dar ${s.rezervat} rezervări fără avans încasat (pipeline fragil).`;
    } else {
      prob = clamp(0.4 + 0.4 * Math.min(1, -slope / Math.max(first, 1)), 0.4, 0.85);
      why = `Vânzări+rezervări în scădere: ${first}→${last} pe ${sorted.length} luni (pantă ${slope.toFixed(1)}/lună).`;
    }
  } else {
    if (!fragil) return [];
    prob = 0.45;
    why = `Fără istoric; ${s.rezervat} rezervări fără avans încasat = pipeline fragil.`;
  }
  return [mk({
    key: "sales_trend", title: `Risc trend negativ vânzări Bell Residence`, probability: prob,
    impact: `${s.vandut || 0} vândute · ${s.rezervat || 0} rezervate din ${s.total || 0}`, daysUntilProblem: null,
    recommendation: `Solicită avansuri pentru confirmarea rezervărilor și accelerează generarea de leaduri.`, why,
  })];
}

// 7) Supraîncărcarea unui responsabil (ex. Nelu)
function d_assigneeOverload(ctx) {
  const entries = Object.entries(ctx.byAssignee).filter(([a]) => a !== "—");
  if (!entries.length) return [];
  const loads = entries.map(([a, g]) => ({ a, g, load: g.active + 2 * g.overdue + 1.5 * g.near }));
  const avg = sum(loads.map((l) => l.load)) / loads.length;
  const out = [];
  for (const { a, g, load } of loads) {
    const prob = clamp(band(load / ctx.cfg.overloadTasks, [0.5, 1, 1.5, 2]) + (avg > 0 && load > 1.6 * avg ? 0.15 : 0), 0, 1);
    if (prob < 0.35) continue;
    out.push(mk({
      key: `overload_${a}`, title: `Supraîncărcare responsabil: ${a}`, probability: prob,
      impact: `${g.active} active · ${g.overdue} întârziate · ${g.blocked} blocate`, daysUntilProblem: g.minDeadline,
      recommendation: `Redistribuie de la ${a} — are ${g.active} active${g.overdue ? ` și ${g.overdue} întârziate` : ""}.`,
      why: `${a}: load ${round(load)} (media echipei ${round(avg)}); ${g.active} active, ${g.overdue} întârziate, ${g.near} cu termen apropiat.`,
    }));
  }
  return out;
}

// 8) Obligații care vor deveni critice
function d_criticalObligations(ctx) {
  const { cfg, opening } = ctx;
  const near = ctx.outflows.filter((o) => o.days <= cfg.criticalDays);
  if (!near.length) return [];
  const prio = (o) => (/ridicat|urgent|critic/i.test(o.priority || "") ? 1.3 : 1);
  const scored = near.map((o) => ({ o, c: (1 - o.days / Math.max(cfg.criticalDays, 1)) * o.amountRON * prio(o) })).sort((a, b) => b.c - a.c);
  const top = scored[0].o;
  let prob = clamp(0.5 + 0.5 * (1 - top.days / cfg.criticalDays), 0.5, 0.9);
  let why = `„${top.title}" ${lei(top.amountRON)} scadent în ${top.days} zile`;
  if (opening != null) {
    const proj = opening - sum(ctx.outflows.filter((x) => x.days <= top.days).map((x) => x.amountRON));
    if (proj < 0) { prob = clamp(prob + 0.1, 0, 1); why += `, sold proiectat negativ (${lei(proj)})`; }
  }
  why += ".";
  return [mk({
    key: "critical_oblig", title: `${near.length} obligații devin critice în ${cfg.criticalDays} zile`, probability: prob,
    impact: `total ${lei(sum(near.map((o) => o.amountRON)))}; cea mai mare „${top.title}" ${lei(top.amountRON)}`, daysUntilProblem: top.days,
    recommendation: `Pregătește plata „${top.title}" (${lei(top.amountRON)}) pentru ${top.dueDate}.`, why,
  })];
}

// ── REGISTRUL de detectoare (extensibil) ─────────────────────────────────
export const DETECTORS = [
  d_cashShortfall,
  d_btRateUncovered,
  d_criticalObligations,
  d_operationalBlock,
  d_projectDelay,
  d_taskOverrun,
  d_assigneeOverload,
  d_salesTrend,
];

// ── confidence + assumptions ─────────────────────────────────────────────
function computeConfidence(state, ctx) {
  let c = 0;
  const missing = [];
  if (ctx.opening != null) c += 0.3; else missing.push("sold curent necunoscut");
  if ((state.inflows || []).length) c += 0.15; else missing.push("fără încasări estimate");
  if (ctx.tasks.some((t) => t.daysToDeadline != null)) c += 0.2; else missing.push("fără termene pe task-uri");
  if ((ctx.sales.history || []).length >= 2) c += 0.15; else missing.push("fără istoric de vânzări");
  if (ctx.outflows.length) c += 0.2; else missing.push("fără obligații de plată");
  return { confidence: round(c * 100) / 100, missing };
}

// ── API PUBLIC ───────────────────────────────────────────────────────────
/**
 * @param {object} state  { asOf, openingBalance?, obligations[], inflows?[], tasks[], sales?, config? }
 * @param {object} [opts] { detectors?: fn[] (înlocuiește), extraDetectors?: fn[] (adaugă) }
 * @returns {{predictions:object[], alerts:object[], confidence:number, assumptions:string[]}}
 */
export function predict(state, opts = {}) {
  if (!state || !state.asOf) {
    return { predictions: [], alerts: [], confidence: 0, assumptions: ["state invalid: lipsește `asOf`."] };
  }
  const ctx = buildContext(state);
  const detectors = opts.detectors || [...DETECTORS, ...(opts.extraDetectors || [])];

  const predictions = [];
  for (const det of detectors) {
    let r;
    try { r = det(ctx); } catch { r = null; } // un detector defect nu strică tot raportul
    if (Array.isArray(r)) predictions.push(...r);
  }
  predictions.sort((a, b) => b.score - a.score);

  const alerts = predictions
    .filter((p) => p.severity === "high" || p.severity === "critical")
    .map((p) => ({ severity: p.severity, title: p.title, score: p.score, daysUntilProblem: p.daysUntilProblem }));

  const { confidence, missing } = computeConfidence(state, ctx);
  const assumptions = [
    ...missing.map((m) => `Date lipsă: ${m}.`),
    "Probabilitățile sunt deterministe (praguri transparente), nu statistice/ML.",
    "score(0–100) = probabilitate ponderată cu urgența (proximitatea zilei problemei).",
    "Sumele sunt presupuse deja normalizate în RON de sursa care alimentează `state`.",
  ];

  return { predictions, alerts, confidence, assumptions };
}
