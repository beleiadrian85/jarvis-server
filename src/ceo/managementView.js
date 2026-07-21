// CEO AI — MANAGEMENT VIEW (D1+D2). PUR. "Cine trebuie sa faca ce" (max 3 pt
// fondator; NO EXECUTIVE ACTION REQUIRED cand chiar nu e nimic) + viziunea
// "daca nu facem nimic 30 de zile" cu dovezi si confidence. Zero inventii.

export const NO_ACTION = "NO EXECUTIVE ACTION REQUIRED";

/** Cine / ce azi. PUR peste raspunsurile CEO deja fundamentate. */
export function whoNeedsToDoWhat({ answers, systemFailing = [] } = {}) {
  const cap = (arr, n) => {
    const real = (arr || []).filter((x) => !/^Nimic urgent|^Zi fara/.test(x));
    return real.length ? real.slice(0, n) : [NO_ACTION];
  };
  return {
    ADRIAN: cap(answers?.q5_adrian, 3),
    DANA: cap(answers?.q3_dana, 4),
    NELU: cap(answers?.q4_nelu, 4),
    SYSTEM: systemFailing.length
      ? systemFailing.slice(0, 4).map((f) => `Repara/reconecteaza: ${f}`)
      : (answers?.q8_sisteme_de_imbunatatit || []).slice(0, 2),
  };
}

/** IF WE DO NOTHING FOR 30 DAYS — max 5 riscuri, 3 oportunitati pierdute,
 *  3 decizii care devin urgente; fiecare cu evidence + confidence. PUR. */
export function forward30({ answers, liquidity, episodes = [] } = {}) {
  const out30 = liquidity?.horizons?.[30]?.outflows?.total_known;
  const risks = [];
  if (typeof out30 === "number") risks.push({
    text: `Iesiri certe de ${Math.round(out30).toLocaleString("ro-RO")} lei fara vizibilitate pe acoperire`,
    evidence: "[cashIntelligence] orizont 30z", confidence: 90,
  });
  for (const r of (answers?.q10_riscuri_30_zile || []).slice(0, 4)) {
    if (!risks.some((x) => x.text === r)) risks.push({ text: r, evidence: "[ceo] q10", confidence: 70 });
  }
  const lost = (answers?.q9_top3_oportunitati || []).slice(0, 3).map((o) => ({
    text: `Pierduta daca nu actionam: ${o.split(" · ")[0]}`,
    evidence: o.split(" · ")[1] || "", confidence: 65,
  }));
  const urgent = [
    ...episodes.filter((e) => e._minUrgencyDays != null && e._minUrgencyDays <= 30 && e.status !== "resolved")
      .map((e) => ({ text: `${e.title} — devine scadenta in fereastra`, evidence: `[episode] ${e.episode_id}`, confidence: 80 })),
  ].slice(0, 3);

  return { risks: risks.slice(0, 5), lost_opportunities: lost, decisions_becoming_urgent: urgent };
}
