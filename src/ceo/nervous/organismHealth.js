// CEO AUTONOMOUS MANAGEMENT NERVOUS SYSTEM V1 — ORGANISM HEALTH (§24).
// Sistemul nervos isi masoara PROPRIA sanatate: sursele de date, citirea si
// scrierea catre Operational, registrul de task-uri, scheduler-ul de cicluri.
// Daca sistemul nervos nu functioneaza, CEO AI trebuie SA STIE — de-aia
// exista modulul: o avarie tacuta (sursa picata, task orfan, bucla neinchisa)
// e mai periculoasa decat una raportata, pentru ca deciziile continua sa se
// ia pe date moarte fara ca cineva sa observe.
//
// PUR: functii deterministe peste argumente. Timpul vine DOAR prin nowMs;
// fara reper de timp NU inventam vechimi (detectiile temporale se sar).
// ZERO IO — probele (sourcesHealth, registry, opsTasksAvailable etc.) sunt
// culese de apelant si pasate ca argumente.

// ── CONSTANTE ───────────────────────────────────────────────────────────

// Cheile canonice de detectie (§24) — vocabular inchis, parsabil.
export const DETECTION_KEYS = [
  "SOURCE_DOWN", "STALE_DATA", "TASK_WRITE_FAILED", "RESULT_SYNC_FAILED",
  "ORPHAN_TASK", "BROKEN_OWNER_MAPPING", "DUPLICATE_TASK", "LOOP_NOT_CLOSED",
  "NERVOUS_CYCLE_STALE",
];

// Praguri temporale (ore). 26h la ciclu = un ciclu zilnic + marja, nu fix 24.
export const HEALTH_LIMITS = {
  stale_data_hours: 24,
  orphan_task_hours: 48,
  cycle_stale_hours: 26,
};

// Cat scade scorul per detectie, dupa severitate.
const SEVERITY_PENALTY = { high: 25, medium: 12, low: 5 };

const HOUR_MS = 3_600_000;

// ── HELPERI INTERNI ─────────────────────────────────────────────────────

/** Ore trecute de la un ISO pana la nowMs; null daca lipseste vreun capat. */
function hoursSince(iso, nowMs) {
  if (!iso || !Number.isFinite(nowMs)) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : (nowMs - t) / HOUR_MS;
}

/** Tri-state explicit: true / false / null (null = UNKNOWN, nu inventam). */
function tri(v) {
  return v === true ? true : v === false ? false : null;
}

/** Intrarile registrului ca array, indiferent daca vine obiect sau array. */
function regEntries(registry) {
  if (Array.isArray(registry)) return registry.filter(Boolean);
  return Object.values(registry && typeof registry === "object" ? registry : {}).filter(Boolean);
}

/** Eticheta scurta pentru o intrare de registru (pt. note-uri). */
function regLabel(e) {
  return e?.operational_id || e?.idempotency_key || e?.ceo_need_id || "?";
}

// ── EVALUARE (§24) ──────────────────────────────────────────────────────

/**
 * Evalueaza sanatatea sistemului nervos peste probele date de apelant.
 * @returns {{ status: "OK"|"DEGRADED"|"DOWN", score: number,
 *             detections: Array<{key: string, severity: string, note: string}>,
 *             checks: Array<{name: string, ok: boolean|null, note: string}> }}
 * status: DOWN daca citirea Operational pica (opsTasksAvailable===false) sau
 * apelantul scrie scenariul de kill-switch / cale de scriere picata
 * (writePathOk===false); DEGRADED la orice detectie medie sau mare; altfel OK
 * (detectiile "low" scad doar scorul).
 */
export function assessNervousHealth({ sourcesHealth = {}, systemHealth = null, registry = {}, opsTasksAvailable = null, usersAvailable = null, lastCycleAt = null, nowMs = null, writePathOk = null, mappingIssues = [] } = {}) {
  const detections = [];
  const add = (key, severity, note) => detections.push({ key, severity, note });

  // ── Detectii pe surse: SOURCE_DOWN + STALE_DATA ──
  const sources = sourcesHealth && typeof sourcesHealth === "object" ? sourcesHealth : {};
  let srcTotal = 0, srcError = 0;
  for (const [name, s] of Object.entries(sources)) {
    srcTotal++;
    const st = String(s?.status || "").toUpperCase();
    if (st === "ERROR" || st === "NOT_CONNECTED") {
      if (st === "ERROR") srcError++;
      // ERROR = avarie reala (medie); NOT_CONNECTED = gap cunoscut de proiectare (low).
      add("SOURCE_DOWN", st === "ERROR" ? "medium" : "low", `${name}: ${st}${s?.error ? ` (${String(s.error).slice(0, 60)})` : ""}`);
      continue; // deja jos — nu o numaram si ca stale (dubla penalizare).
    }
    // STALE_DATA doar daca as_of EXISTA si avem reper de timp — nu inventam vechimi.
    const age = hoursSince(s?.as_of, nowMs);
    if (age != null && age > HEALTH_LIMITS.stale_data_hours) {
      add("STALE_DATA", "medium", `${name}: as_of vechi de ${Math.round(age)}h (prag ${HEALTH_LIMITS.stale_data_hours}h)`);
    }
  }

  // ── TASK_WRITE_FAILED: calea de scriere picata (sau kill-switch, scris de apelant) ──
  if (writePathOk === false) add("TASK_WRITE_FAILED", "high", "calea de scriere task-uri catre Operational a picat");

  // ── Detectii pe registrul de task-uri CEO ──
  const entries = regEntries(registry);
  const idsByIdem = new Map(); // idempotency_key → set de operational_id distincte
  for (const e of entries) {
    // RESULT_SYNC_FAILED: task creat in Operational dar fara ops_status la ultimul ciclu.
    if (e.operational_id && e.sync_ok === false) {
      add("RESULT_SYNC_FAILED", "medium", `${regLabel(e)}: statusul Operational nu s-a putut sincroniza la ultimul ciclu`);
    }
    // ORPHAN_TASK: creat, dar lifecycle ramas CREATED peste prag, fara update.
    if (e.operational_id && String(e.lifecycle || "") === "CREATED") {
      const age = hoursSince(e.created_at, nowMs);
      if (age != null && age > HEALTH_LIMITS.orphan_task_hours) {
        add("ORPHAN_TASK", "medium", `${regLabel(e)}: CREATED de ${Math.round(age)}h fara update (prag ${HEALTH_LIMITS.orphan_task_hours}h)`);
      }
    }
    // LOOP_NOT_CLOSED: task terminat dar bucla nevoie→rezultat neinchisa (§16).
    if (String(e.lifecycle || "") === "COMPLETED" && e.gap_closed !== true) {
      add("LOOP_NOT_CLOSED", "low", `${regLabel(e)}: COMPLETED dar gap_closed=false — nevoia nu e confirmata acoperita`);
    }
    // Pregatire DUPLICATE_TASK: aceeasi cheie de idempotenta → task-uri Operational diferite.
    if (e.idempotency_key && e.operational_id) {
      if (!idsByIdem.has(e.idempotency_key)) idsByIdem.set(e.idempotency_key, new Set());
      idsByIdem.get(e.idempotency_key).add(e.operational_id);
    }
  }
  for (const [key, ids] of idsByIdem) {
    if (ids.size >= 2) add("DUPLICATE_TASK", "high", `${key}: ${ids.size} task-uri Operational pentru aceeasi nevoie (${[...ids].join(", ")})`);
  }

  // ── BROKEN_OWNER_MAPPING: harta de responsabilitati nu se mai potriveste ──
  const issues = Array.isArray(mappingIssues) ? mappingIssues.filter(Boolean) : [];
  if (issues.length) {
    add("BROKEN_OWNER_MAPPING", "medium", `${issues.length} probleme de mapare owner: ${issues.slice(0, 3).map(String).join("; ").slice(0, 140)}`);
  }

  // ── NERVOUS_CYCLE_STALE: scheduler-ul nu a mai rulat un ciclu ──
  const cycleAge = hoursSince(lastCycleAt, nowMs);
  if (cycleAge != null && cycleAge > HEALTH_LIMITS.cycle_stale_hours) {
    add("NERVOUS_CYCLE_STALE", "high", `ultimul ciclu acum ${Math.round(cycleAge)}h (prag ${HEALTH_LIMITS.cycle_stale_hours}h)`);
  }

  // ── Checks: probele individuale (ale noastre + derivate din systemHealth) ──
  const checks = [];
  const check = (name, ok, note) => checks.push({ name, ok: tri(ok), note });

  check("read_operational", opsTasksAvailable,
    opsTasksAvailable === true ? "task-urile Operational se citesc"
      : opsTasksAvailable === false ? "citirea task-urilor Operational A PICAT"
      : "UNKNOWN — neprobat in acest ciclu");
  check("read_users", usersAvailable,
    usersAvailable === true ? "lista de utilizatori se citeste"
      : usersAvailable === false ? "citirea utilizatorilor a picat"
      : "UNKNOWN — neprobat in acest ciclu");
  check("write_path", writePathOk,
    writePathOk === true ? "calea de scriere functionala"
      : writePathOk === false ? "scriere picata / kill-switch"
      : "neprobat (shadow nu scrie)");
  check("scheduler", cycleAge == null ? null : cycleAge <= HEALTH_LIMITS.cycle_stale_hours,
    cycleAge != null ? `ultimul ciclu acum ${Math.round(cycleAge)}h`
      : lastCycleAt ? "UNKNOWN — fara reper de timp (nowMs)"
      : "UNKNOWN — niciun ciclu inregistrat");
  check("sources", srcTotal ? srcError === 0 : null,
    srcTotal ? `${srcTotal - srcError}/${srcTotal} surse fara ERROR` : "UNKNOWN — nicio sursa probata");
  check("owner_mapping", issues.length === 0, issues.length ? `${issues.length} probleme de mapare` : "maparea owner e coerenta");
  check("task_registry", !detections.some((d) => ["RESULT_SYNC_FAILED", "ORPHAN_TASK", "DUPLICATE_TASK", "LOOP_NOT_CLOSED"].includes(d.key)),
    entries.length ? `${entries.length} intrari in registru` : "registru gol (niciun task CEO inca)");

  // Probele stratului CEO existent (observation/need/delegation etc.), daca
  // apelantul le da — prefixate ca sa nu se bata cu ale noastre.
  for (const c of (systemHealth?.checks || [])) {
    if (c && c.name) check(`sys:${c.name}`, !!c.ok, String(c.note || ""));
  }

  // ── Status + scor ──
  // DOWN: citirea Operational pica sau apelantul a scris scenariul kill-switch
  // (writePathOk===false). DEGRADED: orice detectie medie/mare. Low-only = OK.
  let status = "OK";
  if (opsTasksAvailable === false || writePathOk === false) status = "DOWN";
  else if (detections.some((d) => d.severity === "high" || d.severity === "medium")) status = "DEGRADED";

  let score = 100;
  for (const d of detections) score -= SEVERITY_PENALTY[d.severity] || SEVERITY_PENALTY.low;
  if (status === "DOWN") score = Math.min(score, 20); // organism nefunctional ≠ scor cosmetic
  score = Math.max(0, Math.min(100, Math.round(score)));

  return { status, score, detections, checks };
}

// ── FORMAT ──────────────────────────────────────────────────────────────

/**
 * Raport text compact: status + scor, apoi 🟢🟡🔴 per check (🟡 = UNKNOWN),
 * apoi detectiile (🔴 mari, 🟡 medii/mici). PUR.
 */
export function formatNervousHealth(h) {
  if (!h || !h.status) return "NERVOUS HEALTH: UNKNOWN — nicio evaluare";
  const head = h.status === "OK" ? "🟢" : h.status === "DEGRADED" ? "🟡" : "🔴";
  const L = [`${head} NERVOUS HEALTH: ${h.status} — ${h.score}/100`];
  for (const c of h.checks || []) {
    const icon = c.ok === true ? "🟢" : c.ok === false ? "🔴" : "🟡";
    L.push(`${icon} ${c.name}${c.note ? ` — ${c.note}` : ""}`);
  }
  const det = h.detections || [];
  if (det.length) {
    L.push(`Detectii (${det.length}):`);
    for (const d of det) L.push(`${d.severity === "high" ? "🔴" : "🟡"} ${d.key}${d.note ? ` — ${d.note}` : ""}`);
  } else {
    L.push("Fara detectii.");
  }
  return L.join("\n");
}
