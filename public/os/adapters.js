// JARVIS CEO OS — ADAPTOARE VIEW-MODEL (spec §32).
// Traduce raspunsurile API-urilor EXISTENTE in conceptele semantice ale UI-ului:
// CompanyState, JarvisState, AttentionEpisode, NeedYouItem, DomainReality, DataGap.
// REGULA ABSOLUTA: nu inventam date. Ce lipseste ramane explicit lipsa.

export const lei = (n) =>
  typeof n === "number" ? Math.round(n).toLocaleString("ro-RO") + " lei" : null;

export const relTime = (iso) => {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const m = Math.round(ms / 60000);
  if (m < 1) return "acum";
  if (m < 60) return `acum ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `acum ${h}h`;
  return `acum ${Math.round(h / 24)} zile`;
};

const cap = (s, n = 160) => {
  s = String(s || "").trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
};

/* ───────────── CompanyState — verdictul de 10 secunde ───────────── */
// tone: ok | warn | bad;   status: text scurt;   summary: o propozitie.
export function companyState(today, dataHealth) {
  if (!today || today.error) {
    return { tone: "warn", status: "DATE INDISPONIBILE", summary: "Serverul JARVIS nu a putut genera imaginea companiei. Ultima stare cunoscută rămâne valabilă până revine sursa.", confidence: null };
  }
  // Prioritățile de plumbing (sănătatea JARVIS/Operational) NU sunt probleme de
  // business ale fondatorului — le tratăm separat, nu le lăsăm să declanșeze tonul.
  const prios = (today.priorities || []).filter((p) => !isSystemPriority(p));
  const needs = today.needs_decision || [];
  const min = today.cash?.minim || {};
  const deficit = typeof min.first_deficit_date === "string" && min.first_deficit_date !== "UNKNOWN";
  const highPrio = prios.filter((p) => (p.score ?? 0) >= 70).length;
  // „JARVIS vede compania?" — separat de „compania e sănătoasă?". O pană de
  // sistem/conector nu e o deteriorare a afacerii, dar nu poate fi verde.
  const sysFailing = (today.system_health?.failing || []).length;
  // Sursa unică a scorului de date: endpointul dedicat, altfel today.
  const confidence = dataHealth?.healthScore ?? today.data_health?.score ?? null;

  let tone = "ok", status = "SUB CONTROL";
  if (deficit || highPrio > 0) { tone = "bad"; status = "NECESITĂ ACȚIUNE"; }
  else if (prios.length || needs.length || (confidence ?? 100) < 60 || sysFailing > 0) { tone = "warn"; status = "ATENȚIE"; }

  const bits = [];
  if (typeof min.available_now === "number") bits.push(`cash disponibil ${lei(min.available_now)}`);
  else bits.push("soldul bancar nu este conectat — lichiditatea netă e necunoscută");
  if (deficit) bits.push(`primul deficit probabil: ${min.first_deficit_date}`);
  if (prios.length) bits.push(`${prios.length} ${prios.length === 1 ? "prioritate" : "priorități"} de atenție`);
  if (needs.length) bits.push(`${needs.length} ${needs.length === 1 ? "decizie" : "decizii"} la tine`);
  if (!prios.length && !needs.length && !sysFailing) bits.push("nicio intervenție de fondator cerută de date");
  if (sysFailing) bits.push(`JARVIS are vizibilitate redusă — ${sysFailing} ${sysFailing === 1 ? "sistem" : "sisteme"} de reconectat (nu afectează afacerea)`);

  return {
    tone, status,
    summary: bits.join(" · "),
    confidence,
    systemDegraded: sysFailing > 0,
    generatedAt: today.generated_at || null,
  };
}

/** O prioritate despre plumbing-ul propriu (nu despre business). */
export function isSystemPriority(p) {
  return /s[ăa]n[ăa]tatea sistem|jarvis\/operational|conector|reconect|observation|pipeline/i.test(p?.title || "");
}
/** Un domeniu din orbită se potrivește textului unei priorități? */
function domainMatches(key, text) {
  const rx = { CASH: /cash|sold|lichid|plat|incas|încas/, SALES: /v[âa]nz|rezerv|lead|avans/, PROJECTS: /proiect|[șs]antier|furnizor|c[123]/, PEOPLE: /dana|nelu|mihaela|oameni|task/, MARKETING: /market|trafic|campan/, FINANCING: /finan[țt]|credit|leasing/, OPERATIONS: /email|calendar|legal|deciz/ }[key];
  return rx ? rx.test(String(text || "").toLowerCase()) : false;
}

/* ───────────── JarvisState — OBSERVING/THINKING/ACTING/WAITING/LEARNING ───────────── */
export function jarvisState({ organism, stream } = {}) {
  const entries = stream?.entries || [];
  const last = entries[entries.length - 1] || null;
  const lastAt = organism?.at || last?.at || null;
  const recent = (ev, mins) => entries.some((e) =>
    e.event === ev && Date.now() - new Date(e.at).getTime() < mins * 60000);

  const dormant = organism?.enabled === false || (organism && !organism.at && /dormant/i.test(organism.status || ""));
  let state = "OBSERVING";
  if (dormant) state = "OBSERVING"; // motor oprit — observă pasiv, nu execută
  else if (recent("task_created", 90) || recent("task_proposed", 90)) state = "ACTING";
  else if ((organism?.waiting || []).length || (organism?.what_i_asked || []).length) state = "WAITING";
  else if (recent("loop_closed", 240) || recent("task_verified", 240)) state = "LEARNING";

  const humanize = {
    cycle_start: "Reevaluez compania",
    cycle_end: "Ciclu de evaluare încheiat",
    need_detected: "Am detectat o nevoie",
    owner_identified: "Am identificat responsabilul",
    task_would_create: "Aș delega (mod shadow)",
    task_proposed: "Am propus un task — aștept aprobarea",
    task_created: "Am creat un task",
    duplicate_prevented: "Am prevenit un duplicat",
    task_verified: "Am verificat un rezultat",
    loop_closed: "Am închis bucla — rezultat confirmat",
    escalation_proposed: "Am propus o escaladare",
    follow_up_proposed: "Am propus un follow-up",
    health_issue: "Am semnalat o problemă de sistem",
    owner_unknown: "Cer clarificare de responsabil",
  };
  const activity = last ? (humanize[last.event] || null) : null;

  return {
    state,
    // Când motorul e oprit, nu pretindem că „observă activ".
    stateLabel: dormant ? "ÎN PAUZĂ" : { OBSERVING: "OBSERVĂ", THINKING: "GÂNDEȘTE", ACTING: "ACȚIONEAZĂ", WAITING: "AȘTEAPTĂ", LEARNING: "ÎNVAȚĂ" }[state],
    activity: activity ? `${activity}${last?.detail ? ": " + cap(last.detail, 80) : ""}` : null,
    lastCycleAt: lastAt,
    enabled: organism?.enabled !== false,
    dormant,
    // Niciodată numele brut al flag-ului de mediu — o propoziție umană.
    dormantNote: dormant ? "JARVIS e în pauză — observă, nu execută autonom (activarea o decizi tu)" : null,
    mode: organism?.mode || null,
  };
}

/* ───────────── AttentionEpisode[] — max 3, deduplicate, concluzie-întâi ───────────── */
export function attentionEpisodes(today) {
  if (!today || today.error) return [];
  const eps = [];
  const gapsSet = new Set((today.gaps || []).map((g) => String(g).split(" (")[0]));

  for (const p of (today.priorities || []).slice(0, 3)) {
    const sev = (p.score ?? 0) >= 70 ? "bad" : "warn";
    // Plumbing propriu (sistem/conector) → JARVIS/IT rezolvă, nu fondatorul.
    const isSystem = isSystemPriority(p);
    // Un data-gap pe care JARVIS îl gestionează singur nu cere fondatorul.
    const isGap = /lips|necunoscut|neconectat|gap|sold/i.test(p.title || "");
    const handled = isSystem || isGap;
    eps.push({
      id: "prio:" + (p.rank ?? eps.length),
      tone: isSystem ? "sys" : sev,
      type: isSystem ? "SISTEM" : isGap ? "DATA GAP" : "RISC",
      conclusion: cap(p.title, 140),
      why: p.why || p.evidence || null,
      impact: p.impact || null,
      confidence: p.confidence ?? null,
      jarvisAction: isSystem ? "JARVIS/IT remediază — reconectare în curs" : isGap ? "JARVIS a cerut/așteaptă informația de la responsabil" : null,
      founderAction: handled ? null : "Analizează și decide",
      noActionRequired: handled,
      evidence: [p.evidence, p.why].filter(Boolean),
      score: p.score ?? 0,
    });
  }

  // Riscurile forward30 devin episod doar daca nu dubleaza o prioritate existenta.
  for (const r of (today.forward30?.risks || [])) {
    if (eps.length >= 3) break;
    const dup = eps.some((e) => cap(r.text, 60) && e.conclusion.includes(cap(r.text, 30)));
    if (dup) continue;
    eps.push({
      id: "risk:" + eps.length,
      tone: "warn",
      type: "RISC 30 ZILE",
      conclusion: cap(r.text, 140),
      why: null, impact: null,
      confidence: r.confidence ?? null,
      jarvisAction: gapsSet.size ? "Monitorizez și recalculez la fiecare date noi" : null,
      founderAction: null,
      noActionRequired: true,
      evidence: [r.evidence].filter(Boolean),
      score: r.confidence ?? 0,
    });
  }
  return eps.slice(0, 3);
}

/* ───────────── NeedYouItem[] — DECIDE / APPROVE / REVIEW / PROVIDE / INTERVENE ───────────── */
export function needsYou(today) {
  if (!today || today.error) return [];
  const items = [];
  for (const p of today.needs_decision || []) {
    items.push({
      kind: "APPROVE",
      title: cap(p.problem, 120),
      detail: p.recommendation || null,
      assignee: p.task_proposal?.assignee || null,
      deadline: p.task_proposal?.deadline || null,
      evidence: p.evidence || [],
      proposalId: p.proposal_id,
      readiness: p.readiness || null,
      unlocks: p.what_it_unlocks || null,
      riskIfNothing: p.risk_if_nothing || null,
    });
  }
  for (const a of today.who?.ADRIAN || []) {
    if (/^NO EXECUTIVE ACTION/.test(a)) continue;
    const kind = /^Decide/i.test(a) ? "DECIDE" : /date|datele|informa/i.test(a) ? "PROVIDE" : "REVIEW";
    if (items.some((i) => i.title === cap(a, 120))) continue;
    items.push({ kind, title: cap(a, 160), detail: null, evidence: [], proposalId: null });
  }
  return items;
}

/* ───────────── JarvisActivity — „JARVIS NOW", nu loguri ───────────── */
export function jarvisNow({ organism, queue, today } = {}) {
  const items = [];
  for (const a of organism?.what_i_asked || []) {
    items.push({ kind: "active", text: `${a.title || "Task"} → ${a.owner || "?"}${a.shadow ? " (shadow)" : ""}` });
  }
  for (const w of organism?.waiting || []) items.push({ kind: "waiting", text: `Aștept: ${cap(w, 90)}` });
  for (const b of organism?.blocked || []) items.push({ kind: "waiting", text: `Blocat: ${cap(b, 90)}` });
  for (const r of (organism?.resolved || []).slice(-2)) items.push({ kind: "done", text: `Verificat: ${cap(r, 90)}` });
  const wfd = queue?.WAITING_FOR_DATA || [];
  for (const q of wfd) {
    if (!items.some((i) => i.text.includes(cap(q.problem, 40)))) {
      items.push({ kind: "waiting", text: `Aștept date: ${cap(q.problem, 80)}${q.assignee ? " (" + q.assignee + ")" : ""}` });
    }
  }
  // Când motorul e dormant/gol, cererile deschise trăiesc în who.* — le arătăm
  // ca „aștept de la <persoană>", ca TODAY să nu pară inactiv când nu e.
  if (!items.length) {
    for (const [person, tasks] of Object.entries(today?.who || {})) {
      if (person === "ADRIAN" || person === "SYSTEM") continue;
      for (const t of (tasks || [])) {
        if (/^NO EXECUTIVE/.test(t)) continue;
        items.push({ kind: "waiting", text: `Aștept de la ${person[0] + person.slice(1).toLowerCase()}: ${cap(t, 70)}` });
      }
    }
  }
  const active = items.filter((i) => i.kind === "active").length;
  const waiting = items.filter((i) => i.kind === "waiting").length;
  return { items: items.slice(0, 7), counts: { active, waiting }, ceoStatus: organism?.ceo_status || null };
}

/* ───────────── Orbita — noduri de domenii cu stare reala ───────────── */
// Grupam cele ~20 de domenii tehnice in 7 realitati executive.
const ORBIT_MAP = {
  CASH: ["CASH", "BANK", "ACCOUNTING", "RECEIVABLES", "PAYABLES"],
  SALES: ["SALES", "LEADS", "BELL_INVENTORY"],
  PROJECTS: ["PROJECTS", "CONSTRUCTION", "SUPPLIERS"],
  PEOPLE: ["PEOPLE", "TASKS"],
  MARKETING: ["MARKETING", "WEBSITE_TRAFFIC"],
  FINANCING: ["FINANCING", "CONTRACTS", "ASSETS"],
  OPERATIONS: ["DECISIONS", "EMAIL", "CALENDAR", "LEGAL"],
};
export function orbitNodes({ dataHealth, today } = {}) {
  const domains = dataHealth?.domains || [];
  const byName = Object.fromEntries(domains.map((d) => [d.domain, d]));
  const prios = (today?.priorities || []).filter((p) => !isSystemPriority(p));
  return Object.entries(ORBIT_MAP).map(([key, subs]) => {
    const states = subs.map((s) => byName[s]?.connected).filter(Boolean);
    const connected = states.filter((s) => s === "CONNECTED").length;
    const none = states.length === 0 || states.every((s) => s === "NOT_CONNECTED");
    const noneFullyConnected = states.length > 0 && connected === 0; // ex. tot PARTIAL
    // O prioritate reală (de business) care privește ACEST domeniu îl încălzește.
    const hotPrio = prios.find((p) => domainMatches(key, p.title));
    let tone = "ok";
    if (none) tone = "off";                                   // niciun conector proiectat
    else if (hotPrio) tone = (hotPrio.score ?? 0) >= 70 ? "bad" : "warn";
    else if (noneFullyConnected) tone = "warn";              // surse există dar niciuna completă → atenție, nu „OK"
    // parțial-dar-cu-cel-puțin-o-sursă-completă rămâne calm (nu țipăm)
    return {
      key, label: { CASH: "CASH", SALES: "VÂNZĂRI", PROJECTS: "PROIECTE", PEOPLE: "OAMENI", MARKETING: "MARKETING", FINANCING: "FINANȚARE", OPERATIONS: "OPERAȚIUNI" }[key],
      tone, coverage: states.length ? `${connected}/${states.length} surse complete` : "neconectat",
      route: "#/company/" + key.toLowerCase(),
    };
  });
}

/* Relatii reale pentru animatia orbitala: gap → owner / prioritate → domeniu. */
export function orbitLinks({ today, organism } = {}) {
  const links = [];
  const add = (k) => { if (!links.includes(k)) links.push(k); };
  const txt = [
    ...(today?.gaps || []),
    ...((organism?.what_i_need || []).map((n) => n.title || "")),
    ...((organism?.what_i_asked || []).map((a) => a.title || "")),
  ].join(" ").toLowerCase();
  if (/cash|sold|lichid|incas/.test(txt)) add("CASH");
  if (/lead|vanz|rezerv/.test(txt)) add("SALES");
  if (/proiect|santier|furnizor/.test(txt)) add("PROJECTS");
  if (/dana|nelu|mihaela|task/.test(txt)) add("PEOPLE");
  if (/trafic|market/.test(txt)) add("MARKETING");
  if (/finant|credit/.test(txt)) add("FINANCING");
  return links.slice(0, 3); // maxim 3 relatii animate — precizie, nu zgomot
}

/* ───────────── DataGap[] pentru ORGANISM ───────────── */
export function dataGaps(gapsApi) {
  return (gapsApi?.gaps || []).map((g) => ({
    what: g.data_gap || g.what || "?",
    domain: g.domain || null,
    why: g.why || null,
    severity: g.severity || null,
    owner: g.information_request?.to || null,
    ask: g.information_request?.ask || null,
    sourcesChecked: g.sources_checked || null,
    temporary: g.temporary_solution || g.temporary || null,
    permanent: g.permanent_solution || g.permanent || null,
  }));
}

/* ───────────── Starea de "10 secunde" pentru mobil ───────────── */
export function mobileHeadline(today) {
  const cs = companyState(today);
  const n = (today?.priorities || []).length;
  const needs = (today?.needs_decision || []).length;
  if (cs.tone === "ok" && !needs) return { tone: "ok", title: "TOTUL SUB CONTROL", sub: cs.summary };
  if (needs) return { tone: cs.tone, title: `${needs} ${needs === 1 ? "DECIZIE LA TINE" : "DECIZII LA TINE"}`, sub: cs.summary };
  return { tone: cs.tone, title: n ? `${n} ${n === 1 ? "LUCRU" : "LUCRURI"} AZI` : cs.status, sub: cs.summary };
}
