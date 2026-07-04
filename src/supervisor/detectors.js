/**
 * DETECTORS (reguli DETERMINISTE) — F1: D1–D4.
 * Fiecare flag = {tip, taskId, severitate, dovada, title, assignee}.
 * LLM-ul doar formuleaza dupa; detectia e cod, nu ghicit.
 */

const JUNK = new Set(["executat", "gata", "facut", "făcut", "rezolvat", "ok", "done", "-", "."]);
const UNFINISHED = ["saptamana viitoare", "săptămâna viitoare", "urmeaza", "urmează", "o sa", "o să", "maine", "mâine", "ramane", "rămâne", "voi ", "trebuie sa", "trebuie să", "in curs", "în curs"];

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function todayStr() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
}
function daysSince(ts) {
  if (!ts) return 0;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000);
}

export function runDetectors(snapshot) {
  if (!snapshot) return [];
  const flags = [];
  const today = todayStr();

  for (const t of snapshot.tasks) {
    const base = { taskId: t.id, title: t.title, assignee: t.assigneeName };
    const rn = norm(t.report);
    const crit = t.criteria ? ` Criteriu de acceptare: „${t.criteria}”.` : "";

    // D1 — Raport gol
    if (t.status === "rezolvat" && (JUNK.has(rn) || rn.length < 15)) {
      flags.push({ ...base, type: "D1_raport_gol", severity: "RIDICAT",
        evidence: `raport: „${t.report || "(gol)"}”.${crit}` });
    }
    // D2 — Munca neterminata raportata ca gata
    if (t.status === "rezolvat" && UNFINISHED.some((k) => rn.includes(norm(k)))) {
      flags.push({ ...base, type: "D2_neterminat", severity: "RIDICAT",
        evidence: `raportul mentioneaza munca viitoare.${crit}` });
    }
    // D12 — Livrat partial (status nou din Codul de Disciplina): nu poate fi inchis.
    if (t.status === "rezolvat_partial") {
      flags.push({ ...base, type: "D12_rezolvat_partial", severity: "RIDICAT",
        evidence: `livrat partial — nu poate fi acceptat ca inchis.${crit}` });
    }
    // D3 — Termen depasit
    if (t.deadline && t.deadline < today && !["acceptat", "respins"].includes(t.status)) {
      flags.push({ ...base, type: "D3_termen_depasit", severity: "RIDICAT",
        evidence: `termen ${t.deadline}, status ${t.status}` });
    }
    // D4 — Validare restanta (TU esti bottleneck)
    if (t.status === "rezolvat" && daysSince(t.updatedAt) > 2) {
      flags.push({ ...base, type: "D4_validare_restanta", severity: "MEDIU",
        evidence: `rezolvat de ${daysSince(t.updatedAt)} zile, neacceptat` });
    }
  }
  return flags;
}
