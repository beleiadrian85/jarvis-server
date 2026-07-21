// PROACTIVE CEO — Executive Episodes. PUR, determinist, zero IO.
// Observatiile corelate NU se trimit separat: devin UN episod executiv.
// Starea episoadelor se pastreaza in jarvis_state (runner) — fara schema noua.

const SEV_RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const RANK_SEV = ["info", "low", "medium", "high", "critical"];

// Seturi de corelare: category sau category:type → grupul-episod.
export const CORRELATION_GROUPS = [
  {
    key: "lichiditate_executie",
    title: "Presiune de lichiditate și execuție Bell Residence",
    boardType: "general",
    decisions: "Prioritizare plăți / accelerare încasări / finanțare temporară",
    match: (o) => o.category === "cash" ||
      (o.category === "sales" && o.type === "rezervari_fara_avans") ||
      (o.category === "projects"),
  },
  {
    key: "oameni",
    title: "Capacitate și responsabilitate în echipă",
    boardType: "hiring",
    decisions: "Realocare sarcini / mentorat / decizie de personal",
    match: (o) => o.category === "people" || o.category === "founder",
  },
  {
    key: "decizii",
    title: "Coerența deciziilor",
    boardType: "general",
    decisions: "Revizuire explicită a deciziei vechi sau anularea celei noi",
    match: (o) => o.category === "decisions",
  },
  {
    key: "ops",
    title: "Sănătatea sistemelor JARVIS/Operational",
    boardType: "technical",
    decisions: "Reparare job / reconectare sursă / verificare integrare",
    match: (o) => o.category === "ops_risk",
  },
  {
    key: "piata",
    title: "Piața și vânzările Bell Residence",
    boardType: "marketing",
    decisions: "Ajustare campanii / preț / mesaj de vânzare",
    match: (o) => o.category === "traffic" || o.category === "sales",
  },
];

export function groupFor(o) {
  return CORRELATION_GROUPS.find((g) => g.match(o)) || null;
}

const uniq = (a) => [...new Set(a)];

/** Grupare observatii → episoade. Necorelate → episoade separate per categorie. */
export function groupIntoEpisodes(observations = []) {
  const byGroup = new Map();
  for (const o of observations) {
    if (o.status === "resolved" && !observations.some((x) => x !== o && groupFor(x) === groupFor(o))) {
      // rezolvarile singulare trec ca episod propriu (inchidere), mai jos
    }
    const g = groupFor(o);
    const key = g ? g.key : `cat_${o.category}`;
    if (!byGroup.has(key)) byGroup.set(key, { group: g, members: [] });
    byGroup.get(key).members.push(o);
  }

  const episodes = [];
  for (const [key, { group, members }] of byGroup) {
    const maxRank = Math.max(...members.map((m) => SEV_RANK[m.severity] ?? 0));
    const avgConf = members.reduce((a, m) => a + (m.confidence || 0), 0) / members.length;
    const poorMembers = members.filter((m) => m.data_quality === "poor").length;
    const combined_confidence = Math.round(avgConf * (poorMembers ? 0.8 : 1));

    const statuses = new Set(members.map((m) => m.status));
    let status = "open";
    if ([...statuses].every((s) => s === "resolved")) status = "resolved";
    else if (statuses.has("worsening")) status = "worsening";
    else if (statuses.has("improving") && !statuses.has("worsening")) status = "improving";
    else if ([...statuses].every((s) => s === "new")) status = "open";
    else status = "stable";

    episodes.push({
      episode_id: `ep:${key}`,
      title: group ? group.title : `Observații ${members[0].category}`,
      category: group ? group.key : members[0].category,
      observations: members.map((m) => m.deduplication_key).sort(),
      combined_severity: RANK_SEV[maxRank],
      combined_confidence,
      business_impact: uniq(members.flatMap((m) => m.business_impact || [])).slice(0, 4),
      unknowns: uniq(members.flatMap((m) => m.unknowns || [])).slice(0, 4),
      requires_board_review: members.some((m) => m.requires_board_review),
      requires_founder_attention: members.some((m) => m.requires_founder_attention),
      status,
      // interne (preview/brief/anti-spam) — nu fac parte din structura minima
      _members: members,
      _boardType: group ? group.boardType : "general",
      _decisions: group ? group.decisions : "Analiză suplimentară înainte de decizie",
      _minUrgencyDays: Math.min(...members.map((m) => (m._factors?.urgencyDays ?? 999))),
      _hasContradiction: members.some((m) => m._contradiction),
    });
  }
  return episodes.sort((a, b) => (SEV_RANK[b.combined_severity] ?? 0) - (SEV_RANK[a.combined_severity] ?? 0));
}

export const EPISODE_COOLDOWN_MS = 24 * 3_600_000;

/**
 * Anti-spam executiv la nivel de episod. PUR.
 * Un brief NOU pentru acelasi episod DOAR daca: severitate crescuta; membri
 * noi (informatie noua); worsening; termen apropiat semnificativ; rezolvat
 * (o data); contradictie noua. Altfel cooldown → doar audit.
 * @param p.previous { [episode_id]: {sevRank, memberKeys, lastBriefMs, minUrgencyDays, hadContradiction, resolvedBriefed} }
 * → { briefable: episodes[], quiet: [{episode, reason}], state }
 */
export function reconcileEpisodes({ previous = {}, episodes = [], nowMs = 0 } = {}) {
  const state = {};
  const briefable = [];
  const quiet = [];

  for (const ep of episodes) {
    const prev = previous[ep.episode_id];
    const sevRank = SEV_RANK[ep.combined_severity] ?? 0;
    const memberKeys = ep.observations.join("|");
    const entry = {
      sevRank, memberKeys, minUrgencyDays: ep._minUrgencyDays,
      hadContradiction: ep._hasContradiction,
      lastBriefMs: prev?.lastBriefMs || 0,
      resolvedBriefed: prev?.resolvedBriefed || false,
    };

    let reason = null;
    if (!prev) reason = "episod nou";
    else if (ep.status === "resolved" && !prev.resolvedBriefed) reason = "episod rezolvat";
    else if (ep.status === "resolved" && prev.resolvedBriefed) reason = null;
    else if (sevRank > prev.sevRank) reason = "severitate crescuta";
    else if (ep.status === "worsening") reason = "in agravare";
    else if (memberKeys !== prev.memberKeys) reason = "informatie noua (set de observatii schimbat)";
    else if (ep._hasContradiction && !prev.hadContradiction) reason = "contradictie noua";
    else if (prev.minUrgencyDays != null && ep._minUrgencyDays != null && ep._minUrgencyDays <= prev.minUrgencyDays - 3)
      reason = "termenul se apropie";

    const inCooldown = prev?.lastBriefMs && nowMs - prev.lastBriefMs < EPISODE_COOLDOWN_MS;
    if (reason && (!inCooldown || reason !== "informatie noua (set de observatii schimbat)" || sevRank >= 3)) {
      briefable.push({ ...ep, _briefReason: reason });
      entry.lastBriefMs = nowMs;
      if (ep.status === "resolved") entry.resolvedBriefed = true;
    } else {
      quiet.push({ episode: ep.episode_id, reason: reason ? `cooldown (${reason})` : "nimic nou — doar audit" });
    }
    state[ep.episode_id] = entry;
  }

  // Episoadele din starea veche care nu mai apar deloc raman in stare (istoric scurt).
  for (const [id, prev] of Object.entries(previous)) {
    if (!state[id]) state[id] = prev;
  }
  return { briefable, quiet, state };
}
