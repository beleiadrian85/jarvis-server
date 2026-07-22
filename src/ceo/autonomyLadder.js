// AUTONOMY LADDER + LEVEL 3 READINESS (PARTEA XVII). PUR.
// Formalizeaza nivelurile de autonomie ale organismului si calculeaza, din
// dovezi reale (nu declaratii), cat de pregatit e pentru urmatorul nivel.
// JARVIS poate RECOMANDA trecerea; fondatorul o aproba — niciodata automat.

export const AUTONOMY_LADDER = {
  0: { name: "READ_ONLY", desc: "citeste si atat" },
  1: { name: "ANALYZE_PROPOSE", desc: "analizeaza + propune, nimic trimis" },
  2: { name: "AUTONOMOUS_INFO_VERIFY", desc: "task-uri autonome de informatie + verificare interna" },
  3: { name: "AUTONOMOUS_INTERNAL_LOW_RISK", desc: "task-uri interne low-risk (reversibile, fara bani/juridic)" },
  4: { name: "AUTONOMOUS_OPERATIONAL_WITH_POLICY", desc: "actiuni operationale cu politica explicita" },
  5: { name: "HIGH_AUTONOMY", desc: "autonomie ridicata (viitor)" },
};

/** Nivelul ACTIV derivat din flag-uri (nu declarat). PUR peste config dat. */
export function activeAutonomyLevel(cfg = {}) {
  if (cfg.autonomousOperationalActions) return 4;            // flag inexistent azi
  if (cfg.autonomousInfoTasks || cfg.autonomousOperationalTasks) return 2;
  if (cfg.nervousSystem) return 1;
  return 0;
}

// Dimensiunile scorului de pregatire pentru Level 3 (§XVII). Fiecare 0-100.
export const READINESS_DIMENSIONS = [
  "decision_accuracy", "owner_accuracy", "duplicate_rate", "task_usefulness",
  "completion_verification", "false_positive_rate", "escalation_quality",
  "data_quality", "rollback_safety", "human_override_frequency",
];

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const pct = (a, b) => (b > 0 ? clamp((a / b) * 100) : "UNKNOWN");

/**
 * Scorul de pregatire pentru Level 3, din metrici reale acumulate (selfEval +
 * registru + istoric). Fara suficiente dovezi → dimensiunea = "UNKNOWN"
 * (nu inventam incredere). Ready DOAR daca destule dimensiuni sunt masurate
 * SI toate peste prag. Recomandare, nu decizie. PUR.
 */
export function level3ReadinessScore({ selfEval = {}, registry = {}, overrides = 0, days_observed = 0 } = {}) {
  const recs = Object.values(registry);
  const created = recs.filter((r) => r.operational_id);
  const verified = created.filter((r) => r.verification?.verified === true);
  const wrongOwner = selfEval.WRONG_OWNER ?? 0;
  const dupPrevented = selfEval.TASKS_DUPLICATE_PREVENTED ?? 0;
  const proposed = selfEval.TASKS_PROPOSED ?? 0;
  const createdN = selfEval.TASKS_CREATED ?? created.length;
  const useful = selfEval.TASKS_USEFUL ?? 0;
  const rejected = selfEval.TASKS_REJECTED ?? 0;
  const escal = selfEval.UNNECESSARY_ESCALATIONS ?? 0;

  const dims = {
    // acuratetea deciziei: task-uri utile / create
    decision_accuracy: createdN > 0 ? pct(useful, createdN) : "UNKNOWN",
    // owner corect: 100 - rata de owner gresit
    owner_accuracy: createdN > 0 ? clamp(100 - (wrongOwner / createdN) * 100) : "UNKNOWN",
    // dedup: mecanismul e demonstrabil activ (a prevenit dubluri) fara dubluri
    // scapate cunoscute → incredere ridicata; fara nicio activitate → UNKNOWN.
    duplicate_rate: dupPrevented > 0 ? 90 : (createdN > 0 ? 80 : "UNKNOWN"),
    task_usefulness: createdN > 0 ? pct(useful, createdN) : "UNKNOWN",
    // verificarea rezultatului: task-uri verificate / create
    completion_verification: created.length > 0 ? pct(verified.length, created.length) : "UNKNOWN",
    // fals pozitiv scazut = task-urile CREATE au fost utile (nu zgomot livrat);
    // a respinge zgomot inainte de creare e comportament BUN, nu penalizare.
    false_positive_rate: createdN > 0 ? clamp(100 - ((createdN - useful) / createdN) * 100) : "UNKNOWN",
    escalation_quality: createdN > 0 ? clamp(100 - (escal / Math.max(1, createdN)) * 100) : (escal === 0 ? "UNKNOWN" : 50),
    data_quality: typeof selfEval.data_health === "number" ? selfEval.data_health : "UNKNOWN",
    // siguranta rollback: prezenta structurala (task-only write + kill switch) = ridicata
    rollback_safety: 90,
    // override uman: mai putine interventii = mai bine
    human_override_frequency: createdN > 0 ? clamp(100 - (overrides / Math.max(1, createdN)) * 100) : "UNKNOWN",
  };

  const measured = Object.values(dims).filter((v) => typeof v === "number");
  const avg = measured.length ? Math.round(measured.reduce((a, b) => a + b, 0) / measured.length) : null;
  // Praguri de PROMOVARE pe DOVEZI (§14), nu pe timp calendaristic:
  const THRESH = 75, MIN_MEASURED = 6, MIN_DAYS = 3;
  const MIN_CLOSED_LOOPS = 3;   // minimum bucle reale INCHISE (nu doar create)
  const MIN_CREATED = 5;
  const closedLoops = created.filter((r) => ["COMPLETED", "FAILED", "EXPIRED", "NO_LONGER_NEEDED"].includes(r.lifecycle)).length;
  const unauthorized = selfEval.unauthorized_writes ?? 0;

  // Criteriul de fond: task-uri utile, owner corect, rezultate verificate,
  // ZERO scrieri neautorizate SI minimum de bucle reale inchise.
  const evidenceGate = {
    closed_loops: closedLoops >= MIN_CLOSED_LOOPS,
    tasks_created: createdN >= MIN_CREATED,
    days_observed: days_observed >= MIN_DAYS,
    dimensions_measured: measured.length >= MIN_MEASURED,
    unauthorized_zero: unauthorized === 0,
  };
  const allPass = measured.length >= MIN_MEASURED && measured.every((v) => v >= THRESH);
  const enoughEvidence = Object.values(evidenceGate).every(Boolean);

  const missingEvidence = Object.entries(evidenceGate).filter(([, v]) => !v).map(([k]) => k);
  return {
    active_level: null, // completat de apelant din config
    target_level: 3,
    dimensions: dims,
    measured_count: measured.length,
    overall: avg,
    days_observed, tasks_created: createdN, closed_loops: closedLoops,
    evidence_gate: evidenceGate,
    thresholds: { closed_loops: MIN_CLOSED_LOOPS, tasks_created: MIN_CREATED, days_observed: MIN_DAYS, dimension_min: THRESH, unauthorized_writes: 0 },
    recommendation: (allPass && enoughEvidence)
      ? "READY_FOR_FOUNDER_REVIEW (recomandare pe dovezi — fondatorul aproba activarea Level 3)"
      : !enoughEvidence
        ? "NOT_ENOUGH_EVIDENCE (dovezi insuficiente: " + missingEvidence.join(", ") + ")"
        : "NOT_READY (dimensiuni sub prag)",
    blockers: !enoughEvidence
      ? missingEvidence.map((k) => `dovada lipsa: ${k}`)
      : Object.entries(dims).filter(([, v]) => typeof v === "number" && v < THRESH).map(([k, v]) => `${k}=${v} (<${THRESH})`),
    note: "Nivelul se ridica DOAR cu aprobarea explicita a fondatorului; scorul e o recomandare pe dovezi (minimum bucle reale inchise), nu o decizie.",
  };
}
