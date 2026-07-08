// L3 — Company Health Score 0-100. Funcție PURĂ, transparentă și explicabilă:
// fiecare componentă contribuie X puncte, cu notă care spune DE CE.
// Semnalele vin din connectori (cash, vânzări, task-uri, fiscal).

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const r = Math.round;

/**
 * @param s.restante        nr obligații restante (din cash_report)
 * @param s.vanzari         { total, vandut, rezervat, avansIncasat }
 * @param s.tasks           { blocate, azi, intarziate, ok }  (din taskparse)
 * @param s.soldCunoscut    bool — dacă știm soldul din bancă
 * @param s.deficit         bool — dacă forecast-ul arată sold negativ (când soldCunoscut)
 */
export function computeHealth(s = {}) {
  const comp = [];

  // 1) Lichiditate (30) — restanțe + (dacă știm soldul) deficit proiectat.
  let lich = 30;
  const restante = s.restante || 0;
  if (restante > 0) lich -= Math.min(20, restante * 5);
  let lichNote = restante ? `${restante} plăți restante` : "fără restanțe";
  if (s.soldCunoscut && s.deficit) { lich -= 15; lichNote += ", deficit proiectat"; }
  else if (!s.soldCunoscut) lichNote += " (sold curent neconectat)";
  comp.push({ key: "lichiditate", label: "Lichiditate", points: r(clamp(lich, 0, 30)), max: 30, note: lichNote });

  // 2) Vânzări (25) — grad de acoperire (vândut+rezervat)/total.
  const v = s.vanzari || {};
  let vanz = 12, vanzNote = "fără date vânzări";
  if (v.total) {
    const ratio = (v.vandut + v.rezervat) / v.total;
    vanz = 25 * ratio;
    vanzNote = `${v.vandut} vândute + ${v.rezervat} rezervate din ${v.total}` +
      (v.avansIncasat === 0 ? ", avans încasat 0" : "");
  }
  comp.push({ key: "vanzari", label: "Vânzări", points: r(clamp(vanz, 0, 25)), max: 25, note: vanzNote });

  // 3) Execuție task-uri (25) — penalizează blocate/întârziate.
  const t = s.tasks || {};
  const totalT = (t.blocate || 0) + (t.azi || 0) + (t.intarziate || 0) + (t.ok || 0);
  let exec, execNote;
  if (!totalT) { exec = 20; execNote = "fără task-uri active"; }
  else {
    exec = 25 - (t.blocate || 0) * 3 - (t.intarziate || 0) * 2 - (t.azi || 0) * 1;
    execNote = `${t.ok || 0} ok, ${t.intarziate || 0} întârziate, ${t.blocate || 0} blocate`;
  }
  comp.push({ key: "executie", label: "Execuție", points: r(clamp(exec, 0, 25)), max: 25, note: execNote });

  // 4) Disciplină fiscală/plăți (20) — fără restanțe fiscale = plin.
  const fisc = restante > 0 ? clamp(20 - restante * 4, 0, 20) : 20;
  comp.push({ key: "fiscal", label: "Fiscal/plăți", points: r(fisc), max: 20, note: restante ? "restanțe de plată" : "la zi" });

  const score = clamp(r(comp.reduce((a, c) => a + c.points, 0)), 0, 100);
  const grade = score >= 80 ? "🟢 bun" : score >= 60 ? "🟡 atenție" : "🔴 critic";
  return { score, grade, components: comp };
}
