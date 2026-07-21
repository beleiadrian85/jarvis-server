// NERVOUS SYSTEM V1 §7/§9 — DELEGATION ENGINE (motorul de delegare).
// Traduce o NEVOIE (forma canonica din contract) intr-o tinta de delegare,
// cu regula de aur REDUCE FOUNDER DEPENDENCY (§9): intai sistemul, apoi
// owner-ul natural non-fondator, apoi managerul; fondatorul primeste DOAR
// ce ii cere autoritatea (DECISION_NEED / requires_founder) sau ce e
// strategic SI material, iar deciziile peste pragul de guvernanta urca la
// Board. Nevoie fara owner identificabil → RESPONSIBILITY_UNKNOWN cu
// motivare onesta (nu ghicim si nu incarcam fondatorul implicit, §8).
// PUR: zero IO, zero nume hardcodate — persoanele vin prin harta (§7).

import { DELEGATION_TARGETS } from "./contract.js";
import { ownerForDomain, personInMap } from "./responsibilityMap.js";

// ── PRAGURI SI HELPERI INTERNI ──────────────────────────────────────────

// Scor total de valoare (TASK_VALUE) de la care o nevoie e "materiala" —
// aliniat cu pragul "ridicat" din priorityToOperational (contract).
const MATERIAL_SCORE = 55;

// Limitele de incredere raportata (nu afirmam nici certitudine, nici zero).
const clampConf = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

// Starea de incarcare a unei persoane din loads (accepta "OVERLOADED" direct
// sau { state: "OVERLOADED" }); lipsa datelor = necunoscut, nu supraincarcat.
function loadStateFor(loads, id) {
  if (!loads || typeof loads !== "object" || id == null) return null;
  const v = loads[id] ?? loads[String(id)] ?? null;
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && typeof v.state === "string") return v.state;
  return null;
}
function isOverloaded(loads, id) {
  return loadStateFor(loads, id) === "OVERLOADED";
}

// Primul manager neblocat din harta (autoritate de decizie "manager").
function firstManager(map) {
  if (!map || !Array.isArray(map.people)) return null;
  return map.people.find((p) => p.decision_authority === "manager" && !p.blocked) || null;
}

// Alternativa competenta la un owner supraincarcat: alta persoana neblocata,
// non-fondator, ne-supraincarcata, care detine domeniul sau a mai facut
// tipul de task (observat, nu presupus).
function peerAlternative(map, need, excludeId, loads) {
  if (!map || !Array.isArray(map.people)) return null;
  const dom = String(need.domain == null ? "" : need.domain).trim().toUpperCase();
  const tt = need.task_type || null;
  return map.people.find((p) =>
    p.id !== excludeId && !p.blocked && p.decision_authority !== "founder" &&
    !isOverloaded(loads, p.id) &&
    ((dom && (p.known_responsibilities || []).some((k) => String(k).toUpperCase() === dom)) ||
     (tt && (p.observed_responsibilities || []).includes(tt)))
  ) || null;
}

// Ajusteaza increderea cu fiabilitatea istorica a persoanei pe tipul de task
// (doar cu minim 3 observatii — sub atat nu tragem concluzii din date putine).
function adjustByReliability(base, person, taskType) {
  const r = taskType ? person?.reliability?.[taskType] : null;
  if (!r || !(Number(r.total) >= 3) || !Number.isFinite(Number(r.rate))) return base;
  return base + Math.round((Number(r.rate) - 0.5) * 20);
}

// ── OWNER NATURAL (§7) ──────────────────────────────────────────────────

/**
 * Owner-ul natural NON-fondator al unei nevoi: hint-ul din date
 * (suggested_owner_hint) validat in harta, altfel owner-ul domeniului.
 * Persoana trebuie sa existe, sa nu fie blocata si sa nu fie fondatorul.
 * Returneaza { person, via: "hint"|"domain" } sau null. PUR.
 */
export function resolveNaturalOwner(need = {}, map = null) {
  const hinted = personInMap(map, need.suggested_owner_hint);
  if (hinted && !hinted.blocked && hinted.decision_authority !== "founder") {
    return { person: hinted, via: "hint" };
  }
  const owner = personInMap(map, ownerForDomain(need.domain, map));
  if (owner && !owner.blocked && owner.decision_authority !== "founder") {
    return { person: owner, via: "domain" };
  }
  return null;
}

/**
 * Managerul poate prelua DOAR daca are o responsabilitate relevanta reala
 * (§8 — nu inventam): tipul de task in istoric/observat sau domeniul in
 * responsabilitatile cunoscute. PUR.
 */
export function managerHasRelevantResponsibility(mgr, need = {}) {
  if (!mgr) return false;
  const tt = need.task_type || null;
  const dom = String(need.domain || "").toUpperCase();
  if (tt && (mgr.observed_responsibilities || []).includes(tt)) return true;
  if (tt && (mgr.historical_task_types || {})[tt] > 0) return true;
  if (dom && (mgr.known_responsibilities || []).map((d) => String(d).toUpperCase()).includes(dom)) return true;
  return false;
}

// ── COMPATIBILITATE TINTE (§7) ──────────────────────────────────────────

/**
 * Tinta de delegare pentru o persoana reala — GENERICA (§29): rolul, nu numele.
 * person_id ramane intotdeauna id-ul REAL primit prin argumente. PUR.
 * opts.founderId / opts.map (pentru decision_authority) rafineaza eticheta.
 */
export function targetForPerson(personId, opts = {}) {
  const id = String(personId == null ? "" : personId);
  if (!id) return "OTHER_ROLE";
  if (opts.founderId && id === opts.founderId) return "FOUNDER";
  const prof = opts.map?.people?.find?.((p) => p.id === id);
  if (prof?.decision_authority === "manager") return "MANAGER";
  return DELEGATION_TARGETS.includes("PERSON") ? "PERSON" : "OTHER_ROLE";
}

/**
 * Lantul de escaladare construit din harta: persoana → escalation_manager →
 * founderId ultimul, fiecare o singura data. Daca lantul porneste chiar de la
 * fondator, nu coboara inapoi la manager — fondatorul e capatul liniei. PUR.
 */
export function escalationChain(map, startPersonId = null, founderId = null) {
  const out = [];
  const push = (v) => { const s = v == null ? "" : String(v); if (s && !out.includes(s)) out.push(s); };
  if (startPersonId != null) {
    push(startPersonId);
    const startsAtFounder = founderId != null && String(startPersonId) === String(founderId);
    const p = personInMap(map, startPersonId);
    if (!startsAtFounder && p && p.escalation_manager != null) push(p.escalation_manager);
  }
  push(founderId);
  return out;
}

// ── FOUNDER CHECK (§9) ──────────────────────────────────────────────────

/**
 * Verificarea determinista "chiar e nevoie de fondator?" pentru o nevoie:
 * can_system (system_resolvable sau SYSTEM_NEED), can_employee/can_manager
 * (exista oameni non-fondator capabili in harta), founder_authority_required
 * (DOAR DECISION_NEED sau requires_founder), is_strategic, is_material
 * (value.total >= prag "ridicat" sau cash_impactRON >= thresholds.bigPaymentRON)
 * si if_founder_does_nothing (consecinta onesta; fara date → "UNKNOWN"). PUR.
 */
export function founderCheck(need = {}, { map = null, thresholds = {} } = {}) {
  const type = String(need.type || "");
  const can_system = need.system_resolvable === true || type === "SYSTEM_NEED";
  const founder_authority_required = type === "DECISION_NEED" || need.requires_founder === true;

  const valueTotal = Number(need.value?.total);
  const cash = Number(need.cash_impactRON);
  const bigRON = Number(thresholds?.bigPaymentRON);
  const is_material =
    (Number.isFinite(valueTotal) && valueTotal >= MATERIAL_SCORE) ||
    (Number.isFinite(cash) && Number.isFinite(bigRON) && cash >= bigRON);

  const is_strategic =
    need.is_strategic === true || need.strategic === true ||
    type === "DECISION_NEED" ||
    need.task_type === "FOUNDER_DECISION" || need.task_type === "BOARD_DECISION";

  const can_employee = !founder_authority_required && !!resolveNaturalOwner(need, map);
  const can_manager = !founder_authority_required && !!firstManager(map);

  let if_founder_does_nothing;
  if (can_system) if_founder_does_nothing = "sistemul o rezolva singur — fondatorul nu e necesar";
  else if (can_employee) if_founder_does_nothing = "owner-ul natural non-fondator o poate rezolva — fondatorul nu e necesar";
  else if (can_manager) if_founder_does_nothing = "managerul o poate prelua — fondatorul nu e necesar";
  else if (need.material_consequence) if_founder_does_nothing = String(need.material_consequence);
  else if_founder_does_nothing = "UNKNOWN";

  return { can_system, can_employee, can_manager, founder_authority_required, is_strategic, is_material, if_founder_does_nothing };
}

// ── DELEGARE (§7, §9) ───────────────────────────────────────────────────

/**
 * Delegarea determinista a unei nevoi. Ordinea stricta (§9):
 * 0) NO_ACTION/OBSERVATION → NO_ACTION; decizii >= boardThresholdRON → BOARD;
 * 1) SYSTEM daca founder_check.can_system;
 * 2) owner-ul natural non-fondator (hint validat, altfel owner-ul domeniului);
 * 3) managerul; 4) fondatorul DOAR daca autoritatea lui e ceruta sau nevoia e
 * strategica SI materiala. Fara owner identificabil → RESPONSIBILITY_UNKNOWN.
 * Returneaza { target, person_id, why, founder_check, escalation_path, confidence }. PUR.
 */
export function delegateNeed(need = {}, { map, loads = {}, thresholds = {}, founderId = null, boardThresholdRON = null } = {}) {
  const type = String(need.type || "");
  const founder_check = founderCheck(need, { map, thresholds });
  const done = (target, person_id, why, escalation_path, confidence) => ({
    target, person_id: person_id ?? null, why, founder_check, escalation_path, confidence: clampConf(confidence),
  });

  // 0) observatie sau nimic de facut — nu se deleaga nimic
  if (type === "NO_ACTION" || type === "OBSERVATION") {
    return done("NO_ACTION", null, "observatie sau nimic de facut — nu se creeaza delegare", [], 90);
  }

  // Guvernanta: decizii cu impact cash peste pragul Board urca la Board
  const cash = Number(need.cash_impactRON);
  const boardRON = boardThresholdRON == null ? null : Number(boardThresholdRON);
  if (type === "DECISION_NEED" && boardRON != null && Number.isFinite(cash) && cash >= boardRON) {
    return done("BOARD", null,
      `decizie cu impact cash ${cash} RON >= pragul Board (${boardRON} RON)`,
      escalationChain(map, null, founderId), 80);
  }

  // 1) SYSTEM: rezolvabil fara niciun om
  if (founder_check.can_system) {
    return done("SYSTEM", null,
      "rezolvabil de sistem (system_resolvable/SYSTEM_NEED) — zero oameni implicati",
      escalationChain(map, ownerForDomain(need.domain, map), founderId), 90);
  }

  // 2) + 3) oameni non-fondator — doar cand autoritatea fondatorului NU e ceruta
  if (!founder_check.founder_authority_required) {
    const nat = resolveNaturalOwner(need, map);
    if (nat) {
      const baseConf = nat.via === "hint" ? 85 : 80;
      const whyVia = nat.via === "hint"
        ? "owner sugerat de date (suggested_owner_hint) validat in harta de responsabilitati"
        : `owner-ul natural al domeniului ${String(need.domain || "UNKNOWN")}`;

      if (isOverloaded(loads, nat.person.id)) {
        // preferam o alternativa; daca nu exista, pastram owner-ul cu nota onesta
        const peer = peerAlternative(map, need, nat.person.id, loads);
        if (peer) {
          return done(targetForPerson(peer.id, { founderId, map }), peer.id,
            `owner-ul natural (${nat.person.id}) e OVERLOADED — redirijat catre alternativa competenta (${peer.id})`,
            escalationChain(map, peer.id, founderId),
            adjustByReliability(65, peer, need.task_type || null));
        }
        const mgr = firstManager(map);
        if (mgr && mgr.id !== nat.person.id && !isOverloaded(loads, mgr.id)) {
          return done(targetForPerson(mgr.id, { founderId, map }), mgr.id,
            `owner-ul natural (${nat.person.id}) e OVERLOADED — preia managerul (${mgr.id})`,
            escalationChain(map, mgr.id, founderId), 60);
        }
        return done(targetForPerson(nat.person.id, { founderId, map }), nat.person.id,
          `${whyVia}; ATENTIE: persoana e OVERLOADED si nu exista alternativa in harta`,
          escalationChain(map, nat.person.id, founderId),
          adjustByReliability(baseConf - 10, nat.person, need.task_type || null));
      }

      return done(targetForPerson(nat.person.id, { founderId, map }), nat.person.id, whyVia,
        escalationChain(map, nat.person.id, founderId),
        adjustByReliability(baseConf, nat.person, need.task_type || null));
    }

    // §8 — NU inventam responsabilitati: daca owner-ul derivat DIN DATE (hint
    // sau owner-ul domeniului) e chiar fondatorul, el E owner-ul natural —
    // nu pasam nevoia unui manager fara responsabilitate observata pe subiect.
    const dataOwner = personInMap(map, need.suggested_owner_hint) || personInMap(map, ownerForDomain(need.domain, map));
    if (dataOwner && dataOwner.decision_authority === "founder") {
      return done("FOUNDER", dataOwner.id,
        `owner-ul natural derivat din date e fondatorul (domeniul ${String(need.domain || "?")} e detinut de el) — nimeni altcineva nu are responsabilitatea observata`,
        escalationChain(map, dataOwner.id, founderId), 70);
    }

    const mgr = firstManager(map);
    if (mgr && managerHasRelevantResponsibility(mgr, need)) {
      const over = isOverloaded(loads, mgr.id);
      return done(targetForPerson(mgr.id, { founderId, map }), mgr.id,
        over
          ? "fara owner de domeniu identificabil — preia managerul (responsabilitate relevanta); ATENTIE: managerul e OVERLOADED"
          : "fara owner de domeniu identificabil — preia managerul (responsabilitate relevanta observata)",
        escalationChain(map, mgr.id, founderId), over ? 50 : 60);
    }
  }

  // 4) fondatorul — DOAR autoritate ceruta sau strategic SI material (§9)
  if (founder_check.founder_authority_required || (founder_check.is_strategic && founder_check.is_material)) {
    if (founderId != null) {
      return done(targetForPerson(founderId, { founderId, map }), founderId,
        founder_check.founder_authority_required
          ? "necesita autoritatea fondatorului (DECISION_NEED sau requires_founder)"
          : "strategic si material — nivel fondator",
        escalationChain(map, founderId, founderId), 75);
    }
    return done("RESPONSIBILITY_UNKNOWN", null,
      "necesita nivel fondator dar founderId nu a fost furnizat — nu ghicim persoana", [], 20);
  }

  // Fallback onest: nu stim cine raspunde — nu ghicim, nu incarcam fondatorul
  return done("RESPONSIBILITY_UNKNOWN", null,
    `niciun owner identificabil pentru domeniul ${String(need.domain || "UNKNOWN")} in harta — nu ghicim si nu delegam implicit fondatorului`,
    escalationChain(map, null, founderId), 20);
}
