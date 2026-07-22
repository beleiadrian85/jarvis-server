// EFFECTIVENESS METRICS + ORGANISM HEALTH (PARTEA 22-23). PUR.
// Masura succesului = NEVOI REZOLVATE, nu numar de task-uri. Toate metricile se
// deriva din registrul de task-uri CEO + selfEval + memoria organizationala —
// zero IO. Detecteaza si simptomele de organism nesanatos (nevoi create mai
// repede decat inchise, bucle care imbatranesc, cineva devine bottleneck).

const DAY = 86_400_000;
const CLOSED = ["COMPLETED", "FAILED", "EXPIRED", "NO_LONGER_NEEDED"];

/**
 * Metricile de eficacitate din registrul de task-uri CEO. PUR.
 * registry: dict {id: rec} cu operational_id, lifecycle, created_at, updated_at,
 * verification, followups, reopened, owner. selfEval: contoarele de ciclu.
 */
export function buildEffectiveness({ registry = {}, selfEval = {}, nowMs = null } = {}) {
  const now = nowMs ?? Date.parse("2026-07-22T00:00:00Z");
  const recs = Object.values(registry);
  const created = recs.filter((r) => r.operational_id);
  const closed = created.filter((r) => CLOSED.includes(r.lifecycle));
  const completed = created.filter((r) => r.lifecycle === "COMPLETED");
  const verified = created.filter((r) => r.verification?.verified === true);
  const reopened = created.filter((r) => r.reopened === true || (r.followups || []).some((f) => f.action === "REOPEN"));

  // Timpul mediu de bucla: create → inchise (doar cele inchise cu ambele repere).
  const loopTimes = closed
    .map((r) => (r.created_at && r.updated_at) ? (Date.parse(r.updated_at) - Date.parse(r.created_at)) / DAY : null)
    .filter((x) => x != null && x >= 0);
  const avgLoop = loopTimes.length ? Math.round((loopTimes.reduce((a, b) => a + b, 0) / loopTimes.length) * 10) / 10 : "UNKNOWN";

  const followupsNeeded = created.filter((r) => (r.followups || []).length > 0).length;

  return {
    NEEDS_DETECTED: selfEval.TASKS_PROPOSED != null ? (selfEval.TASKS_PROPOSED + (selfEval.TASKS_CREATED ?? created.length) + (selfEval.TASKS_DUPLICATE_PREVENTED ?? 0)) : created.length,
    TASKS_CREATED: created.length,
    LOOPS_CLOSED: closed.length,
    LOOPS_COMPLETED: completed.length,
    AVERAGE_LOOP_TIME_DAYS: avgLoop,
    TASKS_VERIFIED: verified.length,
    TASKS_REOPENED: reopened.length,
    DUPLICATES_PREVENTED: selfEval.TASKS_DUPLICATE_PREVENTED ?? 0,
    NOISE_REJECTED: selfEval.TASKS_REJECTED ?? 0,
    FOUNDER_INTERRUPTION_RATE: selfEval.FOUNDER_INTERRUPTION_RATE ?? (created.length ? Math.round((created.filter((r) => r.target === "FOUNDER" || r.delegated_to === "FOUNDER").length / created.length) * 100) : 0),
    HUMAN_FOLLOWUPS_REQUIRED: followupsNeeded,
    CAPABILITIES_AUTOMATED: selfEval.CAPABILITIES_AUTOMATED ?? 0,
    // Masura reala: rata de rezolvare (bucle inchise cu rezultat / create).
    RESOLUTION_RATE: created.length ? Math.round((completed.length / created.length) * 100) : "UNKNOWN",
    note: "Succesul = nevoi rezolvate, nu task-uri create.",
  };
}

/**
 * Sanatatea organismului (§23) — simptome operationale, nu tehnice. PUR.
 * Returneaza { status: OK|WATCH|DEGRADED, symptoms:[{key,severity,detail}] }.
 */
export function assessOrganismHealth({ registry = {}, effectiveness = null, peopleLoad = [], staleDocuments = [], parserFailures = 0, nowMs = null } = {}) {
  const now = nowMs ?? Date.parse("2026-07-22T00:00:00Z");
  const recs = Object.values(registry);
  const open = recs.filter((r) => r.operational_id && !CLOSED.includes(r.lifecycle));
  const symptoms = [];

  // Nevoi create mai repede decat inchise (backlog care creste).
  const eff = effectiveness || buildEffectiveness({ registry, nowMs: now });
  if (eff.TASKS_CREATED >= 4 && eff.LOOPS_CLOSED === 0)
    symptoms.push({ key: "loops_not_closing", severity: "watch", detail: `${eff.TASKS_CREATED} task-uri create, 0 bucle inchise — organismul deschide mai repede decat inchide` });

  // Bucle care imbatranesc (deschise > 5 zile).
  const aging = open.filter((r) => r.created_at && (now - Date.parse(r.created_at)) > 5 * DAY);
  if (aging.length) symptoms.push({ key: "aging_loops", severity: "watch", detail: `${aging.length} bucle deschise de peste 5 zile: ${aging.slice(0, 3).map((r) => r.human?.title || r.task_title).join(", ")}` });

  // Follow-up excesiv (un task cu >=3 follow-up-uri).
  const overFollowed = recs.filter((r) => (r.followups || []).length >= 3);
  if (overFollowed.length) symptoms.push({ key: "excessive_followups", severity: "watch", detail: `${overFollowed.length} task-uri cu 3+ follow-up-uri — insistenta fara rezultat, analizeaza cauza` });

  // Aceeasi cerere recurenta (candidat de automatizare).
  const byType = {};
  for (const r of recs) { const t = r.task_type; if (t) byType[t] = (byType[t] || 0) + 1; }
  const recurring = Object.entries(byType).filter(([, n]) => n >= 3);
  if (recurring.length) symptoms.push({ key: "recurring_requests", severity: "info", detail: `cereri repetitive (candidati de automatizare): ${recurring.map(([t, n]) => `${t}×${n}`).join(", ")}` });

  // O persoana devine bottleneck.
  for (const d of peopleLoad) {
    if (d.key === "overloaded" || d.key === "overdue_cluster")
      symptoms.push({ key: "person_bottleneck", severity: "watch", detail: `${d.person_id}: ${d.finding || d.key}` });
    if (d.key === "founder_bottleneck")
      symptoms.push({ key: "founder_bottleneck", severity: "high", detail: `fondatorul devine bottleneck: ${d.finding || ""}` });
  }

  // Documente stale + parsere care esueaza.
  if (staleDocuments.length) symptoms.push({ key: "stale_documents", severity: "info", detail: `${staleDocuments.length} documente stale — nu confunda cu situatia actuala` });
  if (parserFailures > 0) symptoms.push({ key: "parser_failures", severity: "watch", detail: `${parserFailures} esecuri de parsare — candidat de capability gap` });

  const high = symptoms.some((s) => s.severity === "high");
  const watch = symptoms.some((s) => s.severity === "watch");
  return { status: high ? "DEGRADED" : watch ? "WATCH" : "OK", symptoms };
}
