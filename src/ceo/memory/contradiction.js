// DETECTIE CONTRADICTII (§6) — semnaleaza cand doua memorii despre aceeasi entitate
// spun lucruri opuse (ex. platit vs neplatit). Euristic dar determinist. NU alege una;
// doar semnaleaza, ca JARVIS sa nu prezinte o certitudine falsa. PUR.
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Perechi de polaritate (afirmativ ↔ negativ) frecvente in operare.
const POLARITY = [
  ["platit", "neplatit"], ["platita", "neplatita"], ["semnat", "nesemnat"], ["semnata", "nesemnata"],
  ["aprobat", "respins"], ["aprobata", "respinsa"], ["trimis", "netrimis"], ["primit", "neprimit"],
  ["finalizat", "nefinalizat"], ["confirmat", "infirmat"], ["valabil", "expirat"], ["activ", "inactiv"],
  ["disponibil", "indisponibil"], ["complet", "incomplet"],
];

function polarity(text) {
  const t = norm(text);
  const tags = new Set();
  for (const [pos, neg] of POLARITY) {
    // negativul intai (ca "neplatit" sa nu bifeze si "platit")
    if (new RegExp(`\\b${neg}\\b`).test(t)) tags.add(`NEG:${pos}`);
    else if (new RegExp(`\\b${pos}\\b`).test(t)) tags.add(`POS:${pos}`);
  }
  // negatie explicita "nu ... platit"
  return tags;
}

function sharedEntity(a, b) {
  const ea = new Set((a.entities || []).map((x) => norm(x)));
  for (const x of b.entities || []) if (ea.has(norm(x))) return norm(x);
  // fallback: acelasi stem de titlu
  const sa = norm(a.title).slice(0, 8), sb = norm(b.title).slice(0, 8);
  return sa && sa === sb ? sa : null;
}

/** @returns [{ a, b, entity, conflict }] perechi contradictorii. */
export function detectContradictions(items = []) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      const ent = sharedEntity(A, B);
      if (!ent) continue;
      const pa = polarity(`${A.title} ${A.content}`), pb = polarity(`${B.title} ${B.content}`);
      for (const t of pa) {
        const [sign, key] = t.split(":");
        const opp = (sign === "POS" ? "NEG" : "POS") + ":" + key;
        if (pb.has(opp)) out.push({ a: A.id, b: B.id, entity: ent, conflict: key, detail: `"${A.title}" vs "${B.title}"` });
      }
      // status explicit CONTRADICTED
      if (A.verification_status === "CONTRADICTED" || B.verification_status === "CONTRADICTED")
        out.push({ a: A.id, b: B.id, entity: ent, conflict: "verification_status", detail: "marcat CONTRADICTED" });
    }
  }
  // dedup
  const seen = new Set();
  return out.filter((c) => { const k = [c.a, c.b, c.conflict].sort().join("|"); if (seen.has(k)) return false; seen.add(k); return true; });
}
