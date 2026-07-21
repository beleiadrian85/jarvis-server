// CEO AUTONOMOUS MANAGEMENT NERVOUS SYSTEM V1 — ACTIVITY STREAM (§26).
// Pulsul auditabil al organismului: fiecare eveniment relevant din ciclul
// nervos (nevoie detectata, task propus/creat, bucla inchisa, problema de
// sanatate) se consemneaza ca intrare compacta, in ordine cronologica —
// cele mai noi la coada, exact cum bate pulsul. Streamul e memoria de scurta
// durata vizibila omului: arata CE a facut sistemul, nu ce crede ca ar fi
// facut. Persistenta (jarvis_state, STATE_KEYS.stream) e treaba apelantului.
//
// PUR si IMUTABIL: functii deterministe peste argumente. Timpul (at) vine de
// la apelant ca ISO — modulul NU citeste ceasul, NU face IO, NU muta arrayul
// primit; intoarce mereu un array NOU.

// ── CONSTANTE ───────────────────────────────────────────────────────────

// Vocabularul canonic de evenimente din ciclul nervos (§26). Orice modul
// care emite in stream foloseste DOAR aceste chei — streamul ramane parsabil.
export const STREAM_EVENTS = [
  "need_detected", "need_no_action", "need_audit_only", "duplicate_prevented",
  "owner_identified", "owner_unknown", "task_proposed", "task_would_create",
  "task_created", "task_blocked_limit", "task_verified", "task_not_verified",
  "follow_up_proposed", "escalation_proposed", "loop_closed", "data_received",
  "cycle_start", "cycle_end", "health_issue",
];

// Plafonul streamului: pastram DOAR cele mai noi intrari (memorie de scurta
// durata, nu arhiva — arhiva completa e audit-ul).
export const MAX_STREAM_ENTRIES = 300;

// ── HELPERI INTERNI ─────────────────────────────────────────────────────

/** Array valid din orice input (date lipsa = gol explicit, nu inventat). */
function asArray(v) {
  return Array.isArray(v) ? v : [];
}

/** Taie coada de maxim MAX_STREAM_ENTRIES — mereu un array NOU. */
function trimTail(arr) {
  return arr.slice(Math.max(0, arr.length - MAX_STREAM_ENTRIES));
}

/** HH:MM direct din ISO string (slice, fara Date/timezone). Lipsa = "--:--". */
function hhmm(at) {
  const s = String(at || "");
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? s.slice(11, 16) : "--:--";
}

// ── APPEND ──────────────────────────────────────────────────────────────

/**
 * Adauga o intrare in stream si intoarce un array NOU (max 300, cele mai noi
 * pastrate). Intrare: { at (ISO de la apelant), event, detail, need_id,
 * task_id }. Event gol = nimic de consemnat → doar copia taiata a streamului.
 */
export function appendStream(stream = [], { at = null, event = "", detail = "", need_id = null, task_id = null } = {}) {
  const base = asArray(stream);
  const ev = String(event || "").trim();
  if (!ev) return trimTail(base);
  const entry = {
    at: at || null,
    event: ev,
    detail: String(detail || ""),
    need_id: need_id ?? null,
    task_id: task_id ?? null,
  };
  return trimTail([...base, entry]);
}

/**
 * Adauga mai multe intrari deodata (fold peste appendStream) → array NOU.
 * Ordinea din entries devine ordinea cronologica din stream.
 */
export function appendMany(stream = [], entries = []) {
  return asArray(entries).reduce((acc, e) => appendStream(acc, e || {}), trimTail(asArray(stream)));
}

// ── FORMAT ──────────────────────────────────────────────────────────────

/**
 * Ultimele n intrari ca text, o linie per eveniment: "HH:MM  <event> — <detail>".
 * Ora e taiata direct din ISO (fara Date.now, fara timezone math). Cele mai
 * noi raman ultimele — ordine cronologica, ca pulsul din §26.
 */
export function formatStream(stream = [], n = 25) {
  const k = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (!k) return "";
  return asArray(stream)
    .slice(-k)
    .filter((e) => e && e.event)
    .map((e) => `${hhmm(e.at)}  ${e.event}${e.detail ? ` — ${e.detail}` : ""}`)
    .join("\n");
}
