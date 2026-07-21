// CEO AI — PEOPLE + TASK INTELLIGENCE (P1). PUR. Model CONTEXTUAL — niciodata
// evaluare simplista dupa numarul de task-uri. Regula Founder DNA (F11): prima
// greseala = invatare; aceeasi greseala repetata = problema de capacitate /
// proces / disciplina DE ANALIZAT. Propune interventii, nu doar critica.
// Formulare neutra; fiecare concluzie are dovezi; fara dovezi → "necunoscut".

const FACTORS = [
  "result", "timeliness", "complexity", "dependencies", "quality",
  "repeated_errors", "self_correction", "initiative", "business_impact", "learning",
];

/**
 * Profilul contextual al unei persoane. PUR.
 * @param p.person   {name, role}
 * @param p.tasks    task-urile persoanei [{status, deadline, updatedAt, title}]
 * @param p.flags    semnalele de disciplina ale persoanei (D1-D12)
 * @param p.asOf     data de referinta
 */
export function buildPersonProfile({ person, tasks = [], flags = [], asOf } = {}) {
  const open = tasks.filter((t) => !["acceptat", "oprit"].includes(t.status));
  const done = tasks.filter((t) => ["rezolvat", "acceptat"].includes(t.status));
  const overdue = open.filter((t) => t.deadline && t.deadline < asOf);
  const byType = {};
  for (const f of flags) byType[f.type] = (byType[f.type] || 0) + 1;
  const repeatedTypes = Object.entries(byType).filter(([, n]) => n >= 2);

  const factors = {
    result: done.length ? { value: `${done.length} finalizate`, evidence: `[operational] ${done.length} task-uri rezolvate/acceptate` } : { value: "necunoscut", evidence: null },
    timeliness: open.length ? { value: `${overdue.length}/${open.length} peste termen`, evidence: `[operational] ${overdue.length} din ${open.length} deschise au termen depasit` } : { value: "necunoscut", evidence: null },
    complexity: { value: "necunoscut", evidence: null },     // fara sursa — NU se ghiceste
    dependencies: { value: "necunoscut", evidence: null },
    quality: byType.D1_raport_gol || byType.D2_neterminat
      ? { value: "rapoarte incomplete semnalate", evidence: `[supervisor] D1=${byType.D1_raport_gol || 0}, D2=${byType.D2_neterminat || 0}` }
      : { value: "fara semnale negative", evidence: "[supervisor] zero D1/D2" },
    repeated_errors: repeatedTypes.length
      ? { value: repeatedTypes.map(([t, n]) => `${t}×${n}`).join(", "), evidence: `[supervisor] tipare repetate: ${repeatedTypes.map(([t]) => t).join(", ")}` }
      : { value: "nu", evidence: null },
    self_correction: { value: "necunoscut", evidence: null },
    initiative: { value: "necunoscut", evidence: null },
    business_impact: { value: "necunoscut", evidence: null },
    learning: { value: "necunoscut", evidence: null },
  };

  // Regula F11 + interventii propuse (nu critica).
  const interventions = [];
  if (repeatedTypes.length) {
    interventions.push({
      type: "analiza_cauza",
      note: "Greseala REPETATA — de separat: capacitate / proces / claritate / disciplina / resurse / date (F11, F22). Discutie 1:1, nu sanctiune directa.",
    });
    if (byType.D1_raport_gol >= 2) interventions.push({ type: "clarificare_proces", note: "Criteriu de acceptare + exemplu de raport bun la fiecare task." });
    if (byType.D3_termen_depasit >= 2) interventions.push({ type: "redistribuire_sau_termene", note: "Termene realiste sau redistribuire — de verificat intai incarcarea." });
  } else if (Object.keys(byType).length) {
    interventions.push({ type: "invatare", note: "Prima aparitie a unei greseli = invatare (F11). Feedback scurt, fara escaladare." });
  }
  if (overdue.length >= 3) interventions.push({ type: "coaching_prioritizare", note: `${overdue.length} task-uri peste termen — sesiune de prioritizare.` });

  return {
    person: person?.name || "necunoscut", role: person?.role || "",
    factors,
    task_count_note: "Numarul de task-uri NU este masura performantei — factorii de mai sus sunt.",
    interventions,
    known_factors: FACTORS.filter((f) => factors[f].value !== "necunoscut").length,
    unknown_factors: FACTORS.filter((f) => factors[f].value === "necunoscut"),
  };
}

/** Profiluri pentru toata echipa. PUR. */
export function buildTeamProfiles({ people = [], tasks = [], flags = [], asOf } = {}) {
  return people.map((person) => {
    const match = (s) => s && (String(s).toLowerCase().includes(person.name.toLowerCase()) ||
      (person.aliases || []).some((a) => String(s).toLowerCase().includes(a)));
    return buildPersonProfile({
      person,
      tasks: tasks.filter((t) => match(t.assignee) || match(t.assigneeName)),
      flags: flags.filter((f) => match(f.assignee)),
      asOf,
    });
  });
}
