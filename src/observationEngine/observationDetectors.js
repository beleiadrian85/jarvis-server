// OBSERVATION ENGINE — detectori DETERMINISTI. PURI: primesc "world" (starea
// colectata de observationSources) si intorc SCHITE de observatii (drafts).
// Reguli: lipsa datelor NU este zero (fara date → fara observatie); zero cifre
// inventate; dovezi etichetate [sursa]; formulari neutre la categoria founder.

const lei = (n) => Math.round(n).toLocaleString("ro-RO") + " lei";
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86_400_000);

/** Schita de observatie — completata de registry cu scoring/id/status. */
function draft(o) {
  return {
    type: o.type, category: o.category, title: o.title, summary: o.summary,
    entity: o.entity || "-",
    evidence: o.evidence || [], sources: o.sources || [],
    metrics: o.metrics || {}, baseline: o.baseline || {}, deviation: o.deviation || {},
    business_impact: o.business_impact || [], urgency_reason: o.urgency_reason || "",
    possible_causes: o.possible_causes || [], unknowns: o.unknowns || [],
    recommended_next_analysis: o.recommended_next_analysis || [],
    factors: o.factors || {}, confidence: o.confidence,
    threatensCore: o.threatensCore || null, contradiction: o.contradiction || null,
  };
}

// ── 1. CASH ──────────────────────────────────────────────────────────────
export function detectCash(w) {
  const out = [];
  const obligations = w.obligations || [];
  if (!obligations.length) return out; // fara date → fara observatii (nu zero)

  const asOf = w.asOf;
  const due21 = obligations.filter((o) => o.dueDate && o.dueDate >= asOf && daysBetween(asOf, o.dueDate) <= 21);
  const total21 = due21.reduce((a, o) => a + (o.amountRON || 0), 0);
  if (total21 >= 25_000) {
    const top3 = [...due21].sort((a, b) => (b.amountRON || 0) - (a.amountRON || 0)).slice(0, 3);
    const soldNecunoscut = w.openingBalance == null;
    out.push(draft({
      type: "cash_gap_21d", category: "cash", entity: "cash-21z",
      title: `Obligatii de ${lei(total21)} in urmatoarele 21 de zile`,
      summary: soldNecunoscut
        ? `In urmatoarele 21 de zile obligatiile confirmate totalizeaza ${lei(total21)}. Soldul bancar curent NU este conectat — acoperirea nu poate fi confirmata. Principalele surse de presiune: ${top3.map((o) => `${o.title} (${lei(o.amountRON)}, ${o.dueDate})`).join("; ")}.`
        : `In urmatoarele 21 de zile obligatiile confirmate totalizeaza ${lei(total21)}, cu sold declarat ${lei(w.openingBalance)}. Principalele surse de presiune: ${top3.map((o) => `${o.title} (${lei(o.amountRON)})`).join("; ")}.`,
      evidence: top3.map((o) => `[operational] ${o.dueDate} · ${o.title} · ${lei(o.amountRON)}`),
      sources: ["operational:list_payment_obligations", "cashForecast"],
      metrics: { total21RON: total21, obligatii: due21.length },
      business_impact: ["Presiune directa pe lichiditate (lichiditate > profit)."],
      urgency_reason: `Prima scadenta in ${Math.min(...due21.map((o) => daysBetween(asOf, o.dueDate)))} zile.`,
      unknowns: soldNecunoscut ? ["Soldul bancar curent nu este conectat — necesarul NET nu poate fi calculat."] : [],
      recommended_next_analysis: ["cash forecast pe 90 de zile", "confirmarea incasarilor certe din perioada"],
      factors: {
        financialImpactRON: total21, urgencyDays: Math.min(...due21.map((o) => daysBetween(asOf, o.dueDate))),
        probability: 0.9, operationalRisk: true, dataQuality: soldNecunoscut ? "partial" : "complete",
      },
      confidence: soldNecunoscut ? 70 : 90,
      threatensCore: "cash",
    }));
  }

  // Restante (deja depasite) — certe.
  const restante = obligations.filter((o) => o.dueDate && o.dueDate < asOf);
  if (restante.length) {
    const totalR = restante.reduce((a, o) => a + (o.amountRON || 0), 0);
    const fiscal = restante.some((o) => /tva|anaf|fiscal|salarii|d112/i.test(`${o.title} ${o.category || ""}`));
    out.push(draft({
      type: "restante", category: "cash", entity: "restante",
      title: `${restante.length} obligatii restante (${lei(totalR)})`,
      summary: `${restante.length} obligatii au scadenta depasita, total ${lei(totalR)}: ${restante.slice(0, 3).map((o) => `${o.title} (${o.dueDate})`).join("; ")}.`,
      evidence: restante.slice(0, 4).map((o) => `[operational] restanta: ${o.title} · ${lei(o.amountRON)} · scadenta ${o.dueDate}`),
      sources: ["operational:list_payment_obligations"],
      metrics: { restante: restante.length, totalRON: totalR },
      business_impact: ["Penalitati si dobanzi.", "Deteriorarea relatiei cu furnizorii" + (fiscal ? "/ANAF" : "") + "."],
      urgency_reason: "Deja depasite — costul creste zilnic.",
      factors: { financialImpactRON: totalR, urgencyDays: 0, probability: 1, legalRisk: fiscal, operationalRisk: true, dataQuality: "complete" },
      confidence: 95, threatensCore: "cash",
    }));
  }

  // Concentrare de plati: o fereastra de 7 zile care aduna ≥50% din totalul pe 90z.
  const due90 = obligations.filter((o) => o.dueDate && o.dueDate >= asOf && daysBetween(asOf, o.dueDate) <= 90);
  const total90 = due90.reduce((a, o) => a + (o.amountRON || 0), 0);
  if (total90 >= 100_000) {
    let best = null;
    for (let s = 0; s <= 83; s++) {
      const win = due90.filter((o) => { const d = daysBetween(asOf, o.dueDate); return d >= s && d < s + 7; });
      const sum = win.reduce((a, o) => a + (o.amountRON || 0), 0);
      if (!best || sum > best.sum) best = { start: s, sum, count: win.length };
    }
    if (best && best.sum >= total90 * 0.5 && best.count >= 2) {
      out.push(draft({
        type: "payment_concentration", category: "cash", entity: `fereastra-${best.start}`,
        title: `Concentrare de plati: ${lei(best.sum)} intr-o fereastra de 7 zile`,
        summary: `${best.count} plati totalizand ${lei(best.sum)} (${Math.round((100 * best.sum) / total90)}% din totalul pe 90 de zile) sunt concentrate in zilele ${best.start}-${best.start + 7} de acum.`,
        evidence: [`[cashForecast] fereastra Z+${best.start}..Z+${best.start + 7}: ${lei(best.sum)} din ${lei(total90)} (90z)`],
        sources: ["cashForecast"],
        metrics: { windowRON: best.sum, total90RON: total90, sharePct: Math.round((100 * best.sum) / total90) },
        urgency_reason: `Fereastra incepe in ${best.start} zile.`,
        business_impact: ["Consum major de cash intr-un interval scurt — necesita pregatire."],
        factors: { financialImpactRON: best.sum, urgencyDays: best.start, probability: 0.8, operationalRisk: true, dataQuality: "complete" },
        confidence: 85,
      }));
    }
  }
  return out;
}

// ── 2. SALES ─────────────────────────────────────────────────────────────
export function detectSales(w) {
  const out = [];
  const s = w.sales;
  if (!s) return out; // lipsa datelor NU inseamna vanzari zero
  if ((s.rezervat || 0) > 0 && (s.avansIncasat || 0) === 0) {
    out.push(draft({
      type: "rezervari_fara_avans", category: "sales", entity: "avans",
      title: `${s.rezervat} rezervari fara niciun avans incasat`,
      summary: `${s.rezervat} unitati sunt rezervate dar avansul incasat este 0 — rezervari fragile, se pot anula fara cost.`,
      evidence: [`[operational] sales_summary: rezervate ${s.rezervat}, avans incasat ${s.avansIncasat || 0}`],
      sources: ["operational:sales_summary"],
      metrics: { rezervat: s.rezervat, avansIncasat: s.avansIncasat || 0 },
      business_impact: ["Cash-flow nesigur din vanzari.", "Pipeline de vanzari supraevaluat."],
      urgency_reason: "Fiecare zi fara avans creste riscul de anulare.",
      recommended_next_analysis: ["care rezervari au depasit termenul uzual de avans", "politica de confirmare a rezervarilor"],
      factors: { probability: 0.6, financialImpactRON: 0, systemsAffected: 2, reputationalRisk: false, operationalRisk: true, dataQuality: "complete" },
      confidence: 80,
    }));
  }
  return out;
}

// ── 3. TRAFFIC (bellresidence.ro, prin Spion — cand sursa e conectata) ──
export function detectTraffic(w) {
  const out = [];
  const t = w.traffic;
  if (!t || !Array.isArray(t.daily)) return out; // sursa neconectata → nimic (nu zero)
  const days = t.daily.filter((d) => d && d.date && typeof d.visits === "number"); // zilele FARA date se exclud, nu se considera 0
  if (days.length < 10) return out;
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const last7 = sorted.slice(-7), prev7 = sorted.slice(-14, -7);
  if (prev7.length < 5) return out;
  const avg = (arr) => arr.reduce((a, d) => a + d.visits, 0) / arr.length;
  const a7 = avg(last7), p7 = avg(prev7);
  if (p7 >= 5 && a7 < p7 * 0.6) {
    out.push(draft({
      type: "traffic_drop", category: "traffic", entity: "site",
      title: `Trafic in scadere cu ${Math.round(100 - (100 * a7) / p7)}% fata de saptamana anterioara`,
      summary: `Media zilnica a scazut de la ${p7.toFixed(1)} la ${a7.toFixed(1)} vizite (pe zilele cu date).`,
      evidence: [`[spion] medie 7z: ${a7.toFixed(1)} vs ${p7.toFixed(1)} anterior (${days.length} zile cu date)`],
      sources: ["spion-site"],
      metrics: { avg7: a7, prev7: p7 }, baseline: { prev7: p7 }, deviation: { pct: Math.round((100 * a7) / p7 - 100) },
      urgency_reason: "Scaderea sustinuta reduce pipeline-ul de lead-uri.",
      possible_causes: ["campanii oprite", "sezon", "problema tehnica de masurare"],
      factors: { probability: 0.7, systemsAffected: 1, reputationalRisk: false, dataQuality: "partial" },
      confidence: 65,
    }));
  }
  return out;
}

// ── 4/5. PROJECTS + PEOPLE — adaptor peste predictionEngine (REUTILIZARE) ─
const PRED_CATEGORY = { op_block: "projects", proj_delay: "projects", task_overrun: "projects", assignee_overload: "people" };
export function detectFromPredictions(w) {
  const out = [];
  for (const p of w.predictions || []) {
    const catKey = Object.keys(PRED_CATEGORY).find((k) => String(p.key || "").startsWith(k));
    if (!catKey) continue; // predictiile de cash raman la detectorii de cash (fara dublare)
    out.push(draft({
      type: `pred_${catKey}`, category: PRED_CATEGORY[catKey], entity: String(p.key),
      title: p.title, summary: `${p.why || p.title} Recomandare: ${p.recommendation || "-"}`,
      evidence: [`[predictionEngine] ${p.why || p.title}`],
      sources: ["predictionEngine"],
      metrics: { score: p.score ?? 0, probability: p.probability ?? 0 },
      urgency_reason: p.daysUntilProblem != null ? `Estimat in ${p.daysUntilProblem} zile.` : "",
      factors: {
        probability: p.probability ?? 0.5, urgencyDays: p.daysUntilProblem,
        operationalRisk: true, systemsAffected: 1,
        dataQuality: "partial",
      },
      confidence: Math.round((p.probability ?? 0.5) * 100),
    }));
  }
  return out;
}

// Task-uri importante fara responsabil / fara termen.
export function detectTaskHygiene(w) {
  const out = [];
  const tasks = w.tasks || [];
  if (!tasks.length) return out;
  const open = tasks.filter((t) => !["acceptat", "oprit", "rezolvat"].includes(t.status));
  const noOwner = open.filter((t) => !t.assignee && !t.assigneeName);
  if (noOwner.length) {
    out.push(draft({
      type: "task_no_owner", category: "projects", entity: "fara-responsabil",
      title: `${noOwner.length} activitati deschise fara responsabil`,
      summary: `Activitati deschise fara proprietar clar: ${noOwner.slice(0, 3).map((t) => t.title || t.id).join("; ")}.`,
      evidence: noOwner.slice(0, 4).map((t) => `[operational] task ${t.id || "?"} „${(t.title || "").slice(0, 60)}” — fara responsabil (status ${t.status})`),
      sources: ["operational:list_tasks"],
      metrics: { count: noOwner.length },
      urgency_reason: "Fara proprietar, nimeni nu raspunde de termen.",
      possible_causes: ["lipsa claritatii", "lipsa autoritatii de alocare"],
      factors: { probability: 0.9, operationalRisk: true, systemsAffected: 1, dataQuality: "complete" },
      confidence: 90,
    }));
  }
  const noDeadline = open.filter((t) => !t.deadline);
  if (noDeadline.length >= 3) {
    out.push(draft({
      type: "task_no_deadline", category: "projects", entity: "fara-termen",
      title: `${noDeadline.length} activitati deschise fara termen`,
      summary: `${noDeadline.length} activitati deschise nu au termen — nu pot fi urmarite si nu intra in predictii.`,
      evidence: [`[operational] ${noDeadline.length} task-uri deschise fara deadline (ex.: ${noDeadline.slice(0, 2).map((t) => (t.title || t.id || "").toString().slice(0, 40)).join("; ")})`],
      sources: ["operational:list_tasks"],
      metrics: { count: noDeadline.length },
      urgency_reason: "",
      possible_causes: ["lipsa disciplinei de planificare"],
      factors: { probability: 0.7, operationalRisk: true, dataQuality: "complete" },
      confidence: 85,
    }));
  }
  return out;
}

// People — disciplina (REUTILIZEAZA supervisor/detectors D1-D12, fara judecati de caracter).
export function detectPeople(w) {
  const out = [];
  const flags = w.disciplineFlags || [];
  if (!flags.length) return out;
  const byPerson = new Map();
  for (const f of flags) {
    const k = f.assignee || "necunoscut";
    if (!byPerson.has(k)) byPerson.set(k, []);
    byPerson.get(k).push(f);
  }
  for (const [person, list] of byPerson) {
    const types = new Set(list.map((f) => f.type));
    if (list.length >= 2 && (types.has("D1_raport_gol") || types.has("D2_neterminat") || types.has("D3_termen_depasit"))) {
      out.push(draft({
        type: "repeated_discipline", category: "people", entity: person,
        title: `Tipar repetat de executie la ${person}: ${list.length} semnale`,
        summary: `${person} are ${list.length} semnale de disciplina in task-urile curente (${[...types].join(", ")}). Observatie factuala, fara judecata de caracter — cauza trebuie separata.`,
        evidence: list.slice(0, 4).map((f) => `[supervisor] ${f.type} · task „${(f.title || "").slice(0, 50)}” · ${f.evidence}`),
        sources: ["supervisor:detectors"],
        metrics: { semnale: list.length },
        urgency_reason: "Tiparul repetat indica o cauza sistemica, nu un incident.",
        possible_causes: [
          "lipsa competentei", "lipsa resurselor", "lipsa claritatii sarcinii",
          "lipsa autoritatii", "lipsa disciplinei", "lipsa datelor pentru o concluzie",
        ],
        unknowns: ["Cauza reala — de stabilit cu persoana, nu presupusa."],
        factors: { probability: 0.8, persistence: "repeated", operationalRisk: true, dataQuality: "complete" },
        confidence: 75,
      }));
    }
  }
  return out;
}

// ── 6. DECISIONS — contradictii, decizii neexecutate, analiza repetata ───
const ANTONYMS = [
  ["oprim", "continuam"], ["opreste", "continua"], ["oprit", "pornit"],
  ["vindem", "pastram"], ["vanzare", "pastrare"], ["crestem", "reducem"],
  ["marim", "micsoram"], ["acceptam", "refuzam"], ["angajam", "concediem"],
  ["incepem", "amanam"], ["extindem", "restrangem"],
];
const strip = (s) => String(s || "").toLowerCase().replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t");
const tokens = (s) => new Set(strip(s).split(/[^a-z0-9]+/).filter((x) => x.length > 3));

export function detectDecisions(w) {
  const out = [];
  const decisions = w.decisions || [];
  const asOf = w.asOf;

  // Decizie aprobata cu termen de revizuire depasit → posibil neexecutata.
  for (const d of decisions) {
    if (d.review_by && String(d.review_by).slice(0, 10) < asOf) {
      out.push(draft({
        type: "decision_overdue", category: "decisions", entity: `dec-${d.id}`,
        title: `Decizia #${d.id} are termenul de revizuire depasit`,
        summary: `Decizia „${String(d.decision).slice(0, 80)}” (aprobata ${String(d.decided_on).slice(0, 10)}) avea revizuire pana la ${String(d.review_by).slice(0, 10)} — nu exista urma de revizuire sau executie.`,
        evidence: [`[decizii] #${d.id} · ${String(d.decision).slice(0, 100)} · revizuire ${String(d.review_by).slice(0, 10)}`],
        sources: ["memory:decisions"],
        metrics: { decizieId: d.id },
        urgency_reason: "O decizie aprobata dar neurmarit devine directie moarta.",
        factors: { probability: 0.7, operationalRisk: true, dataQuality: "partial" },
        confidence: 70,
      }));
    }
  }

  // Contradictie intre decizii: suprapunere mare de subiect + pereche antonimica.
  for (let i = 0; i < decisions.length; i++) {
    for (let j = i + 1; j < decisions.length; j++) {
      const a = decisions[i], b = decisions[j];
      const ta = tokens(a.decision), tb = tokens(b.decision);
      const inter = [...ta].filter((x) => tb.has(x));
      if (inter.length < 2) continue;
      const sa = strip(a.decision), sb = strip(b.decision);
      const pair = ANTONYMS.find(([x, y]) => (sa.includes(x) && sb.includes(y)) || (sa.includes(y) && sb.includes(x)));
      if (!pair) continue;
      out.push(draft({
        type: "decision_contradiction", category: "decisions", entity: `dec-${a.id}-${b.id}`,
        title: `Posibila contradictie intre deciziile #${a.id} si #${b.id}`,
        summary: `Decizia #${b.id} („${String(b.decision).slice(0, 60)}”) pare sa contrazica decizia #${a.id} („${String(a.decision).slice(0, 60)}”) pe acelasi subiect (${inter.slice(0, 3).join(", ")}).`,
        evidence: [
          `[decizii] #${a.id} (${String(a.decided_on).slice(0, 10)}): ${String(a.decision).slice(0, 90)}`,
          `[decizii] #${b.id} (${String(b.decided_on).slice(0, 10)}): ${String(b.decision).slice(0, 90)}`,
        ],
        sources: ["memory:decisions"],
        metrics: { suprapunere: inter.length },
        urgency_reason: "Directii contradictorii se propaga in executie (F39).",
        unknowns: ["Contradictia TREBUIE explicata prin: informatii noi / context nou / ipoteze schimbate / revizuire explicita / eroare (F40)."],
        recommended_next_analysis: ["revizuirea explicita a deciziei vechi sau anularea celei noi"],
        contradiction: { refA: `#${a.id}`, refB: `#${b.id}`, needsExplanation: true },
        factors: { probability: 0.6, systemsAffected: 2, persistence: "new", operationalRisk: true, dataQuality: "partial" },
        confidence: 60,
        threatensCore: "identity",
      }));
    }
  }

  // Aceeasi problema analizata repetat (consiliu/board) fara decizie notata.
  const analyses = (w.auditRecent || []).filter((r) => ["consiliu", "board_meeting", "board_shadow"].includes(r.action));
  const groups = new Map();
  for (const r of analyses) {
    const key = [...tokens(r.detail)].sort().slice(0, 4).join("|");
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  for (const [key, list] of groups) {
    if (list.length < 3) continue;
    const lastAnalysis = list[0];
    const decidedAfter = decisions.some((d) => {
      const dt = tokens(d.decision);
      return [...tokens(lastAnalysis.detail)].filter((x) => dt.has(x)).length >= 2;
    });
    if (decidedAfter) continue;
    out.push(draft({
      type: "analysis_no_decision", category: "decisions", entity: key.slice(0, 30),
      title: `Aceeasi problema analizata de ${list.length} ori fara decizie`,
      summary: `Subiectul „${String(lastAnalysis.detail).slice(0, 70)}” a fost analizat de ${list.length} ori (consiliu/board) fara nicio decizie notata in registru.`,
      evidence: list.slice(0, 3).map((r) => `[audit] ${r.action} · ${String(r.detail).slice(0, 70)} · ${String(r.created_at).slice(0, 10)}`),
      sources: ["audit_log", "memory:decisions"],
      metrics: { analize: list.length },
      urgency_reason: "Analiza repetata fara decizie consuma timp si amana directia.",
      factors: { probability: 0.7, persistence: "repeated", founderDependency: true, dataQuality: "partial" },
      confidence: 65,
    }));
  }
  return out;
}

// ── 7. OPS RISK — job-uri, erori, surse indisponibile, date vechi ────────
export function detectOpsRisk(w) {
  const out = [];
  for (const j of w.jobs || []) {
    if (!j.lastRunAt || !j.expectedHours) continue;
    const ageH = (Date.parse(w.now) - Date.parse(j.lastRunAt)) / 3_600_000;
    if (ageH > j.expectedHours * 1.5) {
      out.push(draft({
        type: "job_stale", category: "ops_risk", entity: j.name,
        title: `Job-ul „${j.name}” nu a mai rulat de ${Math.round(ageH)} ore`,
        summary: `Ultima rulare: ${j.lastRunAt}. Interval asteptat: ~${j.expectedHours}h. Job-ul pare oprit sau esueaza silentios.`,
        evidence: [`[jarvis_state] ${j.name}: ultima rulare ${j.lastRunAt} (asteptat la fiecare ${j.expectedHours}h)`],
        sources: ["jarvis_state"],
        metrics: { ageHours: Math.round(ageH), expectedHours: j.expectedHours },
        urgency_reason: "Un job oprit inseamna monitorizare oarba pe zona lui.",
        factors: { probability: 0.9, operationalRisk: true, systemsAffected: 1, dataQuality: "complete" },
        confidence: 90,
      }));
    }
  }
  for (const e of w.errors || []) {
    if ((e.count || 0) >= 3) {
      out.push(draft({
        type: "repeated_errors", category: "ops_risk", entity: e.kind,
        title: `Eroare repetitiva: ${e.kind} (${e.count} aparitii)`,
        summary: `Eroarea „${e.kind}” a aparut de ${e.count} ori in perioada analizata. Ultima: ${e.lastAt || "?"}.`,
        evidence: [`[audit] ${e.kind} × ${e.count}, ultima la ${e.lastAt || "?"}`],
        sources: ["audit_log"],
        metrics: { count: e.count },
        urgency_reason: "Erorile repetitive semnaleaza o defectiune sistemica, nu un incident.",
        factors: { probability: 0.85, operationalRisk: true, persistence: "repeated", dataQuality: "complete" },
        confidence: 85,
      }));
    }
  }
  const missing = w.sourceMeta?.missing || [];
  if (missing.length >= 2) {
    out.push(draft({
      type: "sources_unavailable", category: "ops_risk", entity: "surse",
      title: `${missing.length} surse de date indisponibile`,
      summary: `Surse indisponibile la colectare: ${missing.join("; ")}. Observatiile din aceste zone sunt suspendate (lipsa datelor NU se interpreteaza drept zero).`,
      evidence: missing.map((m) => `[sources] indisponibil: ${m}`),
      sources: ["observationSources"],
      metrics: { missing: missing.length },
      urgency_reason: "Fara surse, motorul de observatie e partial orb.",
      factors: { probability: 1, operationalRisk: true, systemsAffected: missing.length, dataQuality: "poor" },
      confidence: 95,
    }));
  }
  return out;
}

// ── 8. FOUNDER — dependenta operationala, formulata NEUTRU ──────────────
export function detectFounder(w) {
  const out = [];
  const signals = [];
  const pending = w.pendingApprovals;
  if (pending != null && pending >= 5) signals.push(`${pending} actiuni asteapta aprobarea fondatorului`);
  const flags = (w.disciplineFlags || []).filter((f) => f.type === "D4_validare_restanta");
  if (flags.length >= 3) signals.push(`${flags.length} task-uri rezolvate asteapta validarea fondatorului de >2 zile`);
  const tasks = w.tasks || [];
  if (tasks.length >= 8) {
    const adr = tasks.filter((t) => /adrian|adi/i.test(`${t.assignee || ""} ${t.assigneeName || ""}`));
    if (adr.length / tasks.length >= 0.4) signals.push(`${adr.length} din ${tasks.length} task-uri active sunt alocate direct fondatorului`);
  }
  if (!signals.length) return out;
  out.push(draft({
    type: "founder_dependency", category: "founder", entity: "dependenta",
    title: `Compania depinde inca de interventia fondatorului in ${signals.length} procese recurente`,
    summary: `Semnale factuale: ${signals.join("; ")}. Observatie operationala, nu evaluare personala — obiectivul documentat este independenta companiei de fondator in executia zilnica (F06).`,
    evidence: signals.map((s) => `[operational] ${s}`),
    sources: ["operational", "jarvis_state"],
    metrics: { procese: signals.length },
    urgency_reason: "Dependenta concentrata creste riscul de oboseala decizionala si blocheaza scalarea (F06, F38).",
    possible_causes: ["procese fara proprietar delegat", "praguri de aprobare prea joase", "lipsa de autoritate delegata"],
    recommended_next_analysis: ["care dintre procese pot fi delegate sau automatizate"],
    factors: { probability: 0.8, founderDependency: true, persistence: "repeated", dataQuality: "partial" },
    confidence: 75,
  }));
  return out;
}
