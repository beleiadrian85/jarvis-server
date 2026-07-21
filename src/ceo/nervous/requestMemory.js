// NERVOUS SYSTEM — EXTENSIE: MEMORIA PERSISTENTA A CERERILOR (§1-5, §13-15, §22-24).
// O cerere nu e "trimisa si uitata": fiecare intrare din registrul CEO
// (jarvis_state, cheia ceo:nervous:tasks) ESTE memoria cererii. Modulul NU
// tine stocare paralela — DERIVA vederea de memorie, buclele deschise, scara
// de follow-up si scorul de insistenta direct din registrul primit ca argument.
// O cerere ramane OPEN LOOP pana cand rezultatul e primit, VERIFICAT si gap-ul
// inchis (§2: TASK COMPLETED fara gap inchis = tot OPEN).
//
// Modul PUR: functii deterministe peste argumente, ZERO IO, zero nume de
// oameni sau companii. Persistenta e treaba stratului de IO (cycle.js).
// Date lipsa = null/gap explicit, niciodata inventate.
import { CLOSED_LIFECYCLES, daysBetween, slug } from "./contract.js";

// ── CONSTANTE DETERMINISTE ──────────────────────────────────────────────
// Lantul complet al unei cereri (§2): fiecare veriga trebuie sa existe.
export const LOOP_STAGES = ["NEED", "REQUEST", "TASK", "RESPONSE", "VERIFY", "REASSESS"];
// Faze in care un raspuns/rezultat a fost trimis de owner.
const RESPONSE_LIFECYCLES = new Set(["RESULT_SUBMITTED", "VERIFICATION", "COMPLETED"]);
// Inchideri "prin decizie" — nevoia a disparut sau a fost oprita explicit;
// bucla nu mai are ce astepta. FAILED NU e aici: un esec fara gap inchis
// cere REASSESS, deci bucla ramane deschisa pana la reevaluare.
const CLOSED_BY_DECISION = new Set(["NO_LONGER_NEEDED", "EXPIRED"]);
// Praguri scara de follow-up (§22-24): nivelul urca doar cu zile de intarziere.
const LADDER_DAYS = { L1: 1, L2: 3, L3: 5, L4: 7 };
// Praguri insistenta (§5).
const TIER_CRITICAL = 75, TIER_HIGH = 55, TIER_NORMAL = 30;
// §16: acelasi tip de cerere de >= atatea ori = candidat de automatizare.
const AUTOMATION_MIN_REQUESTS = 3;
// Tipar de intarziere repetata: acelasi tip de task cu follow-up de >= 2 ori.
const DELAY_PATTERN_MIN = 2;
// Prea mult follow-up pe o singura cerere (§13).
const TOO_MUCH_FOLLOWUP_PER_REC = 3;

// ── HELPERI INTERNI (puri) ──────────────────────────────────────────────

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

/** Follow-up-urile unei intrari, ca lista sigura. */
function followupsOf(rec) { return Array.isArray(rec?.followups) ? rec.followups : []; }

/** Cate remindere s-au trimis (actiunea REMINDER din istoric). */
function remindersOf(rec) {
  return followupsOf(rec).filter((f) => String(f?.action || "").toUpperCase() === "REMINDER").length;
}

/** Timestampul ultimului follow-up, sau null. */
function lastFollowupAt(rec) {
  const fu = followupsOf(rec);
  return fu.length ? (fu[fu.length - 1]?.at || null) : null;
}

/** Titlul cererii — din date, niciodata inventat. */
function whatOf(rec) { return rec?.human?.title || rec?.internal?.task_title || null; }

/** Termenul cererii — human are prioritate (e ce a vazut omul). */
function deadlineOf(rec) { return rec?.human?.deadline || rec?.internal?.deadline || null; }

/** A venit un raspuns/rezultat de la owner? */
function hasResponse(rec) {
  return RESPONSE_LIFECYCLES.has(rec?.lifecycle) || rec?.outcome != null;
}

/** Blocajul cunoscut al cererii — doar din date, nu dedus. */
function blockerOf(rec) {
  if (rec?.blocked) return String(rec.blocked);
  if (rec?.blocker) return String(rec.blocker);
  if (rec?.lifecycle === "BLOCKED" || rec?.ops_status === "blocat") {
    return "task blocat in Operational (motivul concret e pe task)";
  }
  return null;
}

/** Impact material? Doar din semnale declarate (§17): prioritate/severitate/dependente. */
function isMaterial(rec) {
  const it = rec?.internal || {};
  const p = String(it.priority || "").toLowerCase();
  if (p === "critic" || p === "ridicat") return true;
  const s = Number(it.severity);
  if (Number.isFinite(s) && s >= 55) return true;
  const d = it.dependencies;
  if (Array.isArray(d) && d.length) return true;
  if (typeof d === "string" && d.trim()) return true;
  return false;
}

/** Etapa e prezenta in lantul NEED→REQUEST→TASK→RESPONSE→VERIFY→REASSESS? */
function stagePresent(rec, stage) {
  switch (stage) {
    case "NEED": return !!rec?.need_id;
    case "REQUEST": return !!whatOf(rec);
    case "TASK": return rec?.operational_id != null;
    case "RESPONSE": return hasResponse(rec);
    case "VERIFY": return rec?.verification?.verified === true;
    case "REASSESS": return rec?.gap_closed === true;
    default: return false;
  }
}

/**
 * Bucla e deschisa? (§2) Inchisa DOAR daca: rezultat + gap inchis, SAU
 * lifecycle inchis prin decizie (nevoia a disparut/a fost oprita).
 * COMPLETED fara gap_closed === true ramane OPEN; FAILED cere REASSESS.
 */
function isOpenLoop(rec = {}) {
  if (rec.outcome != null && rec.gap_closed === true) return false;
  if (CLOSED_BY_DECISION.has(rec.lifecycle)) return false;
  return true;
}

/** Calitatea rezultatului — derivata strict din verificare (§14), fara pareri. */
function resultQualityOf(rec) {
  if (rec?.outcome != null && rec?.gap_closed === true) return "VERIFIED_GAP_CLOSED";
  const v = rec?.verification;
  if (!v) return null; // niciun rezultat nu a trecut inca prin verificare
  if (v.verified === true) return "VERIFIED";
  if (v.verified === false) return "NOT_DEMONSTRATED";
  return "UNKNOWN";
}

/** Lectia se scrie DOAR la final, din fapte — nu pe drum, nu din impresii. */
function lessonOf(rec) {
  const fu = followupsOf(rec).length;
  if (rec?.outcome != null && rec?.gap_closed === true) {
    return fu === 0
      ? "livrat si verificat fara niciun follow-up — formatul cererii a functionat"
      : `livrat si verificat dupa ${fu} follow-up-uri — termen explicit + motiv in cerere reduc insistenta`;
  }
  if (rec?.lifecycle === "FAILED") return "cererea a esuat — de analizat cauza inainte de a repeta aceeasi formula";
  if (rec?.lifecycle === "EXPIRED") return "cererea a expirat/a fost oprita fara rezultat — de reevaluat daca nevoia mai exista";
  if (rec?.lifecycle === "NO_LONGER_NEEDED") return "nevoia a disparut inainte de rezultat — de verificat daca cererea era necesara de la inceput";
  return null; // bucla e inca in mers — lectia ar fi o presupunere
}

/** Sortare determinista: dupa data cererii, apoi dupa id. */
function byAskedAt(a, b) {
  return String(a.asked_at || "").localeCompare(String(b.asked_at || "")) ||
    String(a.request_id || "").localeCompare(String(b.request_id || ""));
}

// ── EXPORTURI ───────────────────────────────────────────────────────────

/**
 * Vederea de memorie a cererilor (§1-5): TOATE campurile derivate din
 * registrul existent — substratul E registrul, nu o stocare paralela.
 * response_received_at: registrul nu tine timestampul exact al raspunsului,
 * asa ca updated_at e cel mai onest proxy cand lifecycle arata rezultat.
 * @param {object} registry  registrul CEO (ceo:nervous:tasks)
 * @returns {Array<object>} intrari sortate determinist dupa asked_at
 */
export function requestMemoryView(registry = {}, { nowISO = null } = {}) {
  void nowISO; // rezervat pentru derivate viitoare dependente de ceas
  const view = Object.values(registry || {}).map((rec) => {
    const closed = CLOSED_LIFECYCLES.includes(rec?.lifecycle);
    return {
      request_id: rec?.id || rec?.idempotency_key || null,
      need_id: rec?.need_id || null,
      task_id: rec?.operational_id ?? null,
      owner: rec?.owner || null,
      what: whatOf(rec),
      why: rec?.human?.why || rec?.internal?.why || null,
      asked_at: rec?.created_at || null,
      deadline: deadlineOf(rec),
      expected_result: rec?.human?.expected_result || rec?.internal?.expected_result || null,
      verification_method: rec?.internal?.verification_method || null,
      status: rec?.lifecycle || null,
      reminders_sent: remindersOf(rec),
      last_followup_at: lastFollowupAt(rec),
      response_received_at: hasResponse(rec) ? (rec?.updated_at || null) : null,
      result_validated: rec?.verification?.verified === true,
      result_quality: resultQualityOf(rec),
      blocker: blockerOf(rec),
      escalation_level: Array.isArray(rec?.escalation_steps) ? rec.escalation_steps.length : 0,
      closed_at: closed ? (rec?.updated_at || null) : null,
      lesson: lessonOf(rec),
      open_loop: isOpenLoop(rec),
    };
  });
  return view.sort(byAskedAt);
}

/**
 * Buclele deschise (§2): cereri care NU si-au inchis lantul
 * NEED→REQUEST→TASK→RESPONSE→VERIFY→REASSESS. missing_stage = prima veriga
 * lipsa din lant — spune exact UNDE s-a oprit bucla, nu doar ca e deschisa.
 * age_days_hint = data cererii (consumatorul calculeaza varsta cu ceasul lui).
 * @returns {Array<{request_id, what, owner, age_days_hint, missing_stage}>}
 */
export function openLoops(registry = {}) {
  const out = [];
  for (const rec of Object.values(registry || {})) {
    if (!isOpenLoop(rec)) continue;
    out.push({
      request_id: rec?.id || rec?.idempotency_key || null,
      what: whatOf(rec),
      owner: rec?.owner || null,
      age_days_hint: rec?.created_at || null,
      missing_stage: LOOP_STAGES.find((s) => !stagePresent(rec, s)) || "REASSESS",
    });
  }
  return out.sort((a, b) =>
    String(a.age_days_hint || "").localeCompare(String(b.age_days_hint || "")) ||
    String(a.request_id || "").localeCompare(String(b.request_id || "")));
}

/**
 * Scara de follow-up (§22-24). Niveluri:
 *   0 = task creat / raspuns primit — nimic de urmarit (MONITOR/VERIFY_RESULT);
 *   1 = termen depasit fara raspuns → reminder SCURT dar CU CONTEXT (§22):
 *       ce lipseste, de ce conteaza, termenul, ce sa faca daca e blocat;
 *   2 = fara raspuns dupa reminder → cere explicit DONE/BLOCKED/NEED MORE TIME;
 *   3 = persista → analiza de cauza (extinde/clarifica/imparte/alt owner/SYSTEM);
 *   4 = impact material nerezolvat → escaladare justificata (altfel ramane 3).
 * Nivelul creste DOAR cu follow-up-uri deja consumate (rec.followups.length)
 * SI cu zile de intarziere — nu sarim trepte si nu presam fara motiv.
 * @returns {{level: number, next_action: string, message_template: string|null}}
 */
export function followUpLadder(rec = {}, { nowISO = null } = {}) {
  const what = whatOf(rec) || "cererea";
  const deadline = deadlineOf(rec);
  const expected = rec?.human?.expected_result || rec?.internal?.expected_result || "rezultatul cerut";
  const why = rec?.human?.why || rec?.internal?.why || "e o veriga din lantul de decizie";
  const fuCount = followupsOf(rec).length;

  // Bucla si-a incheiat treaba sau a primit raspuns → scara nu se aplica.
  if (CLOSED_LIFECYCLES.includes(rec?.lifecycle)) {
    return { level: 0, next_action: "NO_ACTION", message_template: null };
  }
  if (hasResponse(rec)) {
    return { level: 0, next_action: "VERIFY_RESULT", message_template: null };
  }

  // Fara ceas sau fara termen nu masuram intarzierea — gap explicit, nivel 0.
  const dOver = nowISO && deadline ? daysBetween(deadline, nowISO) : null;
  if (dOver == null || dOver <= 0) {
    return { level: 0, next_action: "MONITOR", message_template: null };
  }

  // Nivelul din zile si nivelul din follow-up-uri consumate — cel MIC castiga.
  const byDays = dOver >= LADDER_DAYS.L4 ? 4 : dOver >= LADDER_DAYS.L3 ? 3 : dOver >= LADDER_DAYS.L2 ? 2 : 1;
  const byFollowups = Math.min(fuCount + 1, 4);
  let level = Math.min(byDays, byFollowups);
  // Treapta 4 e rezervata impactului material nerezolvat (§24).
  if (level === 4 && !isMaterial(rec)) level = 3;

  if (level === 1) {
    return {
      level: 1,
      next_action: "REMINDER",
      message_template: `Reminder: "${what}" avea termen ${deadline}. Lipseste inca: ${expected}. Conteaza pentru ca ${why}. Daca e un blocaj, noteaza-l pe task ca sa il rezolvam impreuna.`,
    };
  }
  if (level === 2) {
    return {
      level: 2,
      next_action: "REQUEST_STATUS",
      message_template: `"${what}" e in urma si nu a venit raspuns dupa reminder. Raspunde te rog cu una din: DONE (cu dovada), BLOCKED (ce anume blocheaza) sau NEED MORE TIME (pana cand).`,
    };
  }
  if (level === 3) {
    return {
      level: 3,
      next_action: "ROOT_CAUSE_ANALYSIS",
      message_template: `"${what}" ramane fara raspuns dupa ${fuCount} follow-up-uri (${dOver} zile peste termen). Inainte de alt mesaj, analiza de cauza: termen nerealist → extinde; cerere neclara → clarifica; sarcina prea mare → imparte; owner nepotrivit → realoca; lipseste o unealta → SYSTEM.`,
    };
  }
  return {
    level: 4,
    next_action: "ESCALATE",
    message_template: `Escaladare justificata: "${what}" are impact material si e nerezolvata (${dOver} zile peste termen, ${fuCount} follow-up-uri consumate, rezultat asteptat: ${expected}). Propun escaladarea pe lantul de escaladare, pas cu pas.`,
  };
}

/**
 * Scorul de insistenta 0-100 (§5): cat de tare "apasa" organismul pe aceasta
 * cerere. Derivat DOAR din date: impact de business (priority/severity),
 * urgenta (zile peste termen), varsta cererii, dependente blocate, remindere
 * fara raspuns si intarzieri repetate. Fara semnale = scor mic, nu ghicit.
 * @returns {{score: number, tier: "low"|"normal"|"high"|"critical", why: string}}
 */
export function insistenceScore(rec = {}, { nowISO = null } = {}) {
  const it = rec?.internal || {};
  const parts = [];
  let score = 0;

  // Impact de business: severitate numerica sau, in lipsa, prioritatea. Max 35.
  const sev = Number(it.severity);
  const prio = String(it.priority || "").toLowerCase();
  const impact = Number.isFinite(sev) ? clamp(sev, 0, 100)
    : prio === "critic" ? 85 : prio === "ridicat" ? 65 : prio === "normal" ? 40 : prio === "scazut" ? 15 : null;
  if (impact != null) { score += Math.round(impact * 0.35); parts.push(`impact ${impact}/100`); }

  // Urgenta: zile peste termen (plafonat la 14). Max 25.
  const deadline = deadlineOf(rec);
  const dOver = nowISO && deadline ? daysBetween(deadline, nowISO) : null;
  if (dOver != null && dOver > 0) {
    score += Math.round((Math.min(dOver, 14) / 14) * 25);
    parts.push(`${dOver} zile peste termen`);
  }

  // Varsta cererii (plafonata la 30 de zile). Max 10.
  const age = nowISO && rec?.created_at ? daysBetween(rec.created_at, nowISO) : null;
  if (age != null && age > 0) {
    score += Math.round((Math.min(age, 30) / 30) * 10);
    parts.push(`vechime ${age} zile`);
  }

  // Dependente: cererea tine pe loc alte lucrari. +10.
  const deps = it.dependencies;
  const hasDeps = (Array.isArray(deps) && deps.length > 0) || (typeof deps === "string" && deps.trim().length > 0);
  if (hasDeps) { score += 10; parts.push("blocheaza dependente"); }

  // Raspunsuri anterioare: reminder(e) trimise si tot fara raspuns. +10.
  const reminders = remindersOf(rec);
  if (reminders >= 1 && !hasResponse(rec)) { score += 10; parts.push(`${reminders} reminder(e) fara raspuns`); }

  // Intarzieri repetate: >= 2 follow-up-uri consumate pe aceeasi cerere. +10.
  const fuCount = followupsOf(rec).length;
  if (fuCount >= 2) { score += 10; parts.push(`${fuCount} follow-up-uri consumate`); }

  score = clamp(score, 0, 100);
  const tier = score >= TIER_CRITICAL ? "critical" : score >= TIER_HIGH ? "high" : score >= TIER_NORMAL ? "normal" : "low";
  return { score, tier, why: parts.length ? parts.join("; ") : "fara semnale de presiune — insistenta minima" };
}

/**
 * Inregistreaza un angajament ("promit X pana la D") — §15. IMUTABIL:
 * intoarce un obiect NOU de angajamente; id-ul e determinist (aceeasi
 * promisiune → acelasi id → zero dubluri). Fara person_id sau what = no-op.
 * Un angajament existent nu se redeschide: statusul deja notat se pastreaza.
 * @returns {object} colectia noua de angajamente, cheita pe id determinist
 */
export function recordCommitment(commitments = {}, { person_id, what, due = null, source = null, at = null } = {}) {
  const pid = String(person_id || "").trim();
  const w = String(what || "").trim();
  if (!pid || !w) return commitments; // date lipsa => nu inventam chei

  const id = `commit:${slug(pid, 20)}:${slug(w, 40)}:${due || "fara-termen"}`;
  const prev = (commitments || {})[id] || null;
  return {
    ...(commitments || {}),
    [id]: {
      id,
      person_id: pid,
      what: w,
      due: due || null,
      source: source || null,
      at: at || prev?.at || null,
      status: prev?.status || "OPEN",
    },
  };
}

/**
 * Angajamentele ajunse la termen (§15) — de VERIFICAT, nu de presupus onorate.
 * Intra doar cele OPEN cu termen valid atins (azi sau depasit); overdue = true
 * daca termenul e strict in urma. Fara ceas (nowISO lipsa) → lista goala,
 * pentru ca "la termen" nu se poate masura — gap explicit, nu ghicim.
 * @returns {Array<object>} angajamente { ...c, overdue: boolean }
 */
export function dueCommitments(commitments = {}, nowISO) {
  if (!nowISO) return [];
  const out = [];
  for (const c of Object.values(commitments || {})) {
    if (!c || c.status !== "OPEN" || !c.due) continue;
    const d = daysBetween(c.due, nowISO);
    if (d == null || d < 0) continue; // termenul nu a sosit inca
    out.push({ ...c, overdue: d > 0 });
  }
  return out.sort((a, b) =>
    String(a.due).localeCompare(String(b.due)) || String(a.id).localeCompare(String(b.id)));
}

/**
 * Raspunde intrebarilor de supervizare (§13) + detecteaza cereri repetitive
 * candidate la automatizare (§16): ce am cerut, ce nu a primit raspuns, unde
 * am insistat, ce e deschis/overdue, ce tipare de intarziere se repeta si
 * unde un conector ar inlocui cereri umane repetate.
 * nowISO e optional: fara ceas, overdue = null (gap explicit, nu inventam).
 * @returns {{asked, unanswered, insisted_count, open, overdue, repeated_delay_patterns, too_much_followup, automation_candidates}}
 */
export function answerSupervisionQuestions(registry = {}, { person_id = null, sinceISO = null, nowISO = null } = {}) {
  const pid = String(person_id || "").toLowerCase().trim();
  const recs = Object.values(registry || {}).filter((r) => {
    if (pid && String(r?.owner || "").toLowerCase().trim() !== pid) return false;
    // ISO se compara corect lexicografic — filtrul "de cand" e determinist.
    if (sinceISO && String(r?.created_at || "") < sinceISO) return false;
    return true;
  });

  const brief = (r) => ({
    request_id: r?.id || r?.idempotency_key || null,
    what: whatOf(r),
    asked_at: r?.created_at || null,
    deadline: deadlineOf(r),
    status: r?.lifecycle || null,
    followups: followupsOf(r).length,
  });
  const bySort = (a, b) =>
    String(a.asked_at || "").localeCompare(String(b.asked_at || "")) ||
    String(a.request_id || "").localeCompare(String(b.request_id || ""));

  const asked = recs.map(brief).sort(bySort);
  const unanswered = recs.filter((r) => isOpenLoop(r) && !hasResponse(r)).map(brief).sort(bySort);
  const insisted_count = recs.reduce((s, r) => s + followupsOf(r).length, 0);
  const open = recs.filter(isOpenLoop).length;
  const overdue = nowISO
    ? recs.filter((r) => {
        if (!isOpenLoop(r) || hasResponse(r)) return false;
        const d = deadlineOf(r);
        const days = d ? daysBetween(d, nowISO) : null;
        return days != null && days > 0;
      }).length
    : null;

  // Tipare de intarziere: acelasi tip de task care a avut nevoie de follow-up
  // in mod repetat — tiparul e al CERERII/procesului, nu o eticheta pe om.
  const delayedByType = {};
  const byType = {};
  for (const r of recs) {
    const tt = String(r?.task_type || "UNKNOWN");
    byType[tt] = (byType[tt] || 0) + 1;
    if (followupsOf(r).length >= 1) delayedByType[tt] = (delayedByType[tt] || 0) + 1;
  }
  const repeated_delay_patterns = Object.entries(delayedByType)
    .filter(([, c]) => c >= DELAY_PATTERN_MIN)
    .map(([task_type, count]) => ({ task_type, count }))
    .sort((a, b) => b.count - a.count || a.task_type.localeCompare(b.task_type));

  // Prea mult follow-up: o cerere bombardata SAU in medie >= 1 follow-up/cerere.
  const too_much_followup =
    recs.some((r) => followupsOf(r).length >= TOO_MUCH_FOLLOWUP_PER_REC) ||
    (asked.length >= 2 && insisted_count >= asked.length);

  // §16: informatie ceruta repetitiv → nu mai cere unui om, construieste un
  // conector/automatizare care o aduce singura.
  const automation_candidates = Object.entries(byType)
    .filter(([, c]) => c >= AUTOMATION_MIN_REQUESTS)
    .map(([task_type, count]) => ({
      task_type,
      count,
      why: `${count} cereri de acelasi tip — informatie ceruta repetitiv; candidat de conector/automatizare in loc de task uman repetat`,
    }))
    .sort((a, b) => b.count - a.count || a.task_type.localeCompare(b.task_type));

  return { asked, unanswered, insisted_count, open, overdue, repeated_delay_patterns, too_much_followup, automation_candidates };
}
