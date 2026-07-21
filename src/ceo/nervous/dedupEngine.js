// NERVOUS SYSTEM V1 §12 — DEDUP ENGINE.
// Inainte ca o nevoie sa devina task, verificam ca NU exista deja: un task CEO
// creat/propus (idempotenta), un task Operational deschis similar, o cerere de
// informatie deja trimisa, un cooldown activ sau informatia insasi. Aceeasi
// nevoie nu produce doua task-uri si aceeasi intrebare nu se pune de doua ori
// intr-o zi de lucru.
// MODUL PUR: functii deterministe peste argumente — ZERO IO, zero stare.
// Toate datele (registru, task-uri, propuneri, cooldown-uri) vin ca argumente.
import { idempotencyKey, textSimilarity, OPERATIONAL_CLOSED_STATUSES, CLOSED_LIFECYCLES } from "./contract.js";

// ── CONSTANTE INTERNE ───────────────────────────────────────────────────

// Prefixul cheilor de propuneri de tip "cerere de informatie" (dict extern).
const INFOREQ_PREFIX = "prop:inforeq:";
// Statusuri de livrare care inseamna "cererea e inca pe drum" — nu repetam.
const OPEN_DELIVERY_STATUSES = ["SENT", "AWAITING_RESPONSE"];

// ── HELPERI INTERNI ─────────────────────────────────────────────────────

/** Construieste raspunsul de duplicat. PUR. */
function dup(reason, matched) {
  return { duplicate: true, reason, matched };
}

/** Momentul pana la care tine un cooldown. Accepta forma canonica {until}
 *  si forma bruta {ts, hours}. Returneaza Date sau null daca nu se poate. */
function cooldownUntil(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (entry.until) {
    const d = new Date(entry.until);
    return isNaN(d) ? null : d;
  }
  if (entry.ts) {
    const d = new Date(entry.ts);
    if (isNaN(d)) return null;
    const h = Number(entry.hours);
    return new Date(d.getTime() + (Number.isFinite(h) ? h : 0) * 3_600_000);
  }
  return null;
}

/** Momentul "acum": din nowISO daca e valid, altfel ceasul curent. */
function resolveNow(nowISO) {
  const d = nowISO ? new Date(nowISO) : new Date();
  return isNaN(d) ? new Date() : d;
}

// ── VERIFICAREA DE DUPLICAT (§12) ───────────────────────────────────────

/**
 * Verifica IN ORDINE daca nevoia e deja acoperita:
 *  1) cheia de idempotenta exista in registrul de task-uri CEO;
 *  2) exista task Operational DESCHIS suficient de similar cu nevoia;
 *  3) exista o cerere de informatie (inforeq) deja trimisa pe acelasi domeniu;
 *  4) exista un cooldown activ pe aceeasi cheie de idempotenta;
 *  5) nevoia e marcata deja satisfacuta (informatia exista).
 * Returneaza { duplicate, reason, matched } — matched e {kind, id, title?}
 * (plus assignee/similarity la potrivirea cu task Operational) sau null.
 */
export function checkDuplicate(need = {}, { opsTasks = [], registry = {}, proposals = {}, cooldowns = {}, nowISO = null, similarityThreshold = 0.55 } = {}) {
  const idemKey = idempotencyKey(need);

  // 1) Task CEO deja creat/propus — DOAR intrarile inca ACTIVE blocheaza.
  // O intrare inchisa (COMPLETED/FAILED/EXPIRED/NO_LONGER_NEEDED) NU mai
  // blocheaza o nevoie recurenta (soldul se cere din nou cand redevine stale),
  // iar o simulare shadow veche NU blocheaza crearea reala dupa activarea
  // autonomiei — dedup-ul temporal ramane treaba cooldown-ului (pasul 4).
  const nowT = resolveNow(nowISO).getTime();
  for (const [rid, entry] of Object.entries(registry || {})) {
    if (!entry || entry.idempotency_key !== idemKey) continue;
    if (CLOSED_LIFECYCLES.includes(entry.lifecycle)) continue;          // inchis → nu blocheaza
    const isShadowSim = !entry.operational_id && entry.shadow !== false; // simulare (fara task real)
    if (isShadowSim) {
      const age = entry.created_at ? nowT - new Date(entry.created_at).getTime() : Infinity;
      if (!(age < 24 * 3_600_000)) continue;                            // simulare veche → nu blocheaza
    }
    const title = entry.title || entry.task_title || entry.internal?.task_title || null;
    return dup(isShadowSim ? "nevoie deja simulata azi (shadow)" : "task CEO deja creat/propus si inca activ",
      { kind: "ceo_task", id: entry.operational_id || rid, title });
  }

  // 2) Task Operational DESCHIS similar — cel mai similar peste prag castiga.
  const text = need.title || need.summary || "";
  let best = null;
  for (const t of opsTasks || []) {
    const status = String(t?.status || "").toLowerCase();
    if (OPERATIONAL_CLOSED_STATUSES.includes(status)) continue;
    const sim = textSimilarity(t?.title, text);
    if (sim >= similarityThreshold && (!best || sim > best.sim)) best = { t, sim };
  }
  if (best) {
    return dup("task similar deja in lucru", {
      kind: "operational_task",
      id: best.t.id ?? null,
      title: best.t.title ?? null,
      assignee: best.t.assignee ?? null,
      similarity: Math.round(best.sim * 100) / 100,
    });
  }

  // 3) Informatia e deja ceruta — propunere inforeq trimisa pe acelasi domeniu.
  const domain = String(need.domain || "").toUpperCase();
  if (domain) {
    for (const [key, p] of Object.entries(proposals || {})) {
      if (!key.startsWith(INFOREQ_PREFIX)) continue;
      const keyDomain = key.slice(INFOREQ_PREFIX.length).toUpperCase();
      const propDomain = String(p?.domain || "").toUpperCase();
      const status = String(p?.delivery?.status || "").toUpperCase();
      if ((keyDomain === domain || propDomain === domain) && OPEN_DELIVERY_STATUSES.includes(status)) {
        return dup("informatie deja ceruta", { kind: "inforeq_proposal", id: key, title: p?.title || null });
      }
    }
  }

  // 4) Cooldown activ pe aceeasi cheie — nu intrebam de doua ori intr-o zi.
  const until = cooldownUntil(cooldowns?.[idemKey]);
  if (until && until.getTime() > resolveNow(nowISO).getTime()) {
    return dup("cooldown activ", { kind: "cooldown", id: idemKey });
  }

  // 5) Informatia exista deja — nevoia e marcata explicit ca satisfacuta.
  if (need.already_satisfied === true) {
    return dup("informatia exista deja", { kind: "existing_data", id: need.need_id || null });
  }

  return { duplicate: false, reason: null, matched: null };
}

// ── NOTAREA COOLDOWN-ULUI (§12) ─────────────────────────────────────────

/**
 * Returneaza un obiect NOU de cooldown-uri: intrarile inca active + intrarea
 * noua { [idemKey]: { until, need_id } } pentru nevoia data. Intrarile
 * expirate se curata; argumentul primit NU se modifica (imutabil).
 */
export function noteCooldown(cooldowns = {}, need = {}, nowISO, hours = 20) {
  const now = resolveNow(nowISO);
  const next = {};
  for (const [key, entry] of Object.entries(cooldowns || {})) {
    const until = cooldownUntil(entry);
    if (until && until.getTime() > now.getTime()) next[key] = entry;
  }
  const h = Math.max(0, Number(hours) || 0);
  next[idempotencyKey(need)] = {
    until: new Date(now.getTime() + h * 3_600_000).toISOString(),
    need_id: need.need_id || null,
  };
  return next;
}
