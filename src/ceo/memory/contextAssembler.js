// CONTEXT ASSEMBLER (§4, §6, §12-§14, §17) — construieste un pachet TEMPORAR de context
// pentru un model. Modelul NU primeste memoria completa si NU o detine. Pipeline (§6):
//   cerere → intent → entitati → filtrare permisiuni → prospetime → retrieval semantic
//   + relational + source-of-truth → detectie contradictii → buget context → redactare.
// Contextul e impartit in SECTIUNI (§6). Instructiunile NU se amesteca cu documentele.
// Nimic din ce intra la model nu devine automat memorie. PUR (fara efecte secundare).
import { list } from "./store.js";
import { semanticSearch } from "./vectorStore.js";
import { edges } from "./graph.js";
import { detectContradictions } from "./contradiction.js";
import { filterMemoriesForEgress, classifyForEgress, CLASS_ORDER } from "./dataPolicy.js";
import { redactSecrets } from "./writeGate.js";
import { provenanceOf } from "./schema.js";
import { fenceUntrusted } from "../untrustedInput.js";

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const STOP = new Set(["si","sa","la","de","cu","in","pe","un","o","este","e","are","am","ai","ce","mi","se","el","ea","ne","va","vor","pentru","din","care","dar","daca","cat","cum","cand","unde","despre","ce","stii"]);

/** Detectie intent simpla (VERIFY / DECISION_RECALL / DOCUMENT / GENERIC). */
export function detectIntent(q) {
  const t = norm(q);
  if (/(verific|avem|la zi|primit|trimis|e platit|s-a )/.test(t)) return "VERIFY";
  if (/(ce am decis|ce s-a decis|decizie|am hotarat|termen)/.test(t)) return "DECISION_RECALL";
  if (/(contract|document|factura|oferta|extras|raport)/.test(t)) return "DOCUMENT";
  return "GENERIC";
}

/** Rezolvare entitati candidate din intrebare (nume proprii / termeni-cheie). */
export function resolveEntities(q, knownEntities = []) {
  const words = norm(q).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  const known = new Set(knownEntities.map(norm));
  const matched = words.filter((w) => known.has(w));
  return { keywords: words, matched };
}

function freshnessOk(item, { maxAgeDays = null } = {}) {
  if (item.valid_until && Date.parse(item.valid_until) < Date.now()) return false; // expirat
  if (!maxAgeDays) return true;
  const age = (Date.now() - Date.parse(item.created_at || 0)) / 86400000;
  return !Number.isFinite(age) || age <= maxAgeDays;
}

/**
 * Asambleaza contextul pentru o interogare + un provider.
 * @param {object} opts { providerTrust, maxItems, types, store, extraFacts[],
 *   knownEntities[], maxAgeDays, tenant_id, operationalState[] }
 * @returns { contextText, sections, used[], dropped[], provenance[], contradictions[], instructions, foundMemory }
 */
export async function assembleContext(query, opts = {}) {
  const providerTrust = opts.providerTrust || "external";
  // Plafonul SPECIFIC al providerului (ex. google = INTERNAL) — nu doar trust-ul.
  const providerMaxClass = opts.providerMaxClass || (providerTrust === "external" ? "CONFIDENTIAL" : "RESTRICTED");
  const maxLvl = Math.min(
    providerTrust === "external" ? CLASS_ORDER.CONFIDENTIAL : CLASS_ORDER.RESTRICTED,
    CLASS_ORDER[String(providerMaxClass).toUpperCase()] ?? CLASS_ORDER.CONFIDENTIAL,
  );

  const intent = detectIntent(query);
  const ent = resolveEntities(query, opts.knownEntities || []);

  // 1) Pool: memorii active, izolate pe tenant, filtrate pe permisiuni (sensitivity)
  //    si prospetime.
  const poolAll = await list({ includeInactive: false, limit: 4000, store: opts.store, tenant_id: opts.tenant_id || null });
  const pool = poolAll.filter((x) => (CLASS_ORDER[x.sensitivity] ?? 1) <= maxLvl && freshnessOk(x, { maxAgeDays: opts.maxAgeDays }));

  // 2) Retrieval semantic (candidate) — validate ulterior cu metadate/sursa.
  const sem = await semanticSearch(query, pool.filter((x) => !opts.types || opts.types.includes(x.memory_type)), { limit: (opts.maxItems || 8) * 2 });
  const semItems = sem.map((r) => ({ ...r.item, _score: Math.round(r.score * 100) / 100 }));

  // 3) Retrieval relational — relatii care ating entitatile din intrebare.
  let relItems = [];
  if (ent.matched.length || ent.keywords.length) {
    const es = await edges({ store: opts.store, tenant_id: opts.tenant_id || null });
    const targets = new Set([...ent.matched, ...ent.keywords]);
    relItems = es.filter((e) => targets.has(norm(e.subject)) || targets.has(norm(e.object))).slice(0, 6);
  }

  // 4) Contradictii intre candidatii semantici.
  const contradictions = detectContradictions(semItems);

  // 5) Egress: filtreaza dupa clasificarea providerului (trust + plafon specific).
  const { kept, dropped } = filterMemoriesForEgress(semItems.slice(0, opts.maxItems || 8), { providerTrust, maxClass: providerMaxClass });

  // 6) Sectiuni (§6) — instructiunile NU se amesteca cu documentele.
  const sections = { VERIFIED_FACTS: [], OPERATIONAL_STATE: [], RELEVANT_EPISODES: [], DOCUMENT_EVIDENCE: [], USER_PREFERENCES: [], RELATIONS: [], UNKNOWNS: [], CONTRADICTIONS: [] };
  const provenance = [];
  for (const it of kept) {
    const tag = it.is_inference ? "INFERENTA" : "FAPT";
    const line = `[${tag}/${it.verification_status}] ${redactSecrets(it.title || "").slice(0, 200)}${it.content ? ": " + redactSecrets(it.content).slice(0, 240) : ""} (sursa: ${it.source_type}, incredere ${Math.round((it.confidence || 0) * 100)}%)`;
    provenance.push(provenanceOf(it));
    if (["VERIFIED", "CONFIRMED", "CORRELATED"].includes(it.verification_status) && !it.is_inference) sections.VERIFIED_FACTS.push(line);
    else if (it.memory_type === "DOCUMENT") sections.DOCUMENT_EVIDENCE.push(line);
    else if (it.memory_type === "PREFERENCE") sections.USER_PREFERENCES.push(line);
    else if (it.memory_type === "EPISODIC") sections.RELEVANT_EPISODES.push(line);
    else sections.VERIFIED_FACTS.push(line);
  }
  // Stare operationala (sursa oficiala) — trece si ea prin Data Classification: un fapt
  // RESTRICTED (ex. salarii) NU ajunge la un model extern nici pe acest canal.
  const droppedOps = [];
  for (const f of opts.operationalState || []) {
    const eg = classifyForEgress({ text: String(f.text || f), sensitivity: f.sensitivity || "INTERNAL", providerTrust, maxClass: providerMaxClass });
    if (!eg.allowed) { droppedOps.push({ reason: eg.reason, sensitivity: f.sensitivity || "INTERNAL", channel: "operational_state" }); continue; }
    sections.OPERATIONAL_STATE.push(`[SURSA OFICIALA] ${eg.redactedText.slice(0, 240)}`);
  }
  // RELATII — trec si ele prin Data Classification (o relatie poate contine date
  // sensibile in subject/object). Nepermise pentru provider → dropped.
  const droppedRel = [];
  for (const e of relItems) {
    const relText = `${e.subject} ${e.predicate} ${e.object}`;
    const eg = classifyForEgress({ text: relText, sensitivity: e.sensitivity || "INTERNAL", providerTrust, maxClass: providerMaxClass });
    if (!eg.allowed) { droppedRel.push({ reason: eg.reason, channel: "relations" }); continue; }
    sections.RELATIONS.push(`${redactSecrets(String(e.subject))} —${e.predicate}→ ${redactSecrets(String(e.object))} (${Math.round((e.confidence || 0) * 100)}%)`);
  }
  for (const c of contradictions) sections.CONTRADICTIONS.push(`⚠ ${c.detail} (${c.conflict})`);

  // extraFacts verificate din Operational — trec si ele prin egress.
  const droppedFacts = [];
  for (const f of opts.extraFacts || []) {
    const eg = classifyForEgress({ text: String(f.text || ""), sensitivity: f.sensitivity || "INTERNAL", providerTrust, maxClass: providerMaxClass });
    if (!eg.allowed) { droppedFacts.push({ reason: eg.reason, sensitivity: f.sensitivity || "INTERNAL" }); continue; }
    sections.VERIFIED_FACTS.push(`[FAPT/${f.verification_status || "OBSERVED"}] ${eg.redactedText.slice(0, 300)} (sursa: ${f.source || "operational"})`);
  }

  // 7) Compunere text (buget de context: sectiuni compacte, fara umplutura).
  const parts = [];
  const emit = (title, arr) => { if (arr.length) parts.push(`### ${title}\n` + arr.slice(0, 12).map((l) => "- " + l).join("\n")); };
  emit("STARE OPERATIONALA (sursa oficiala)", sections.OPERATIONAL_STATE);
  emit("FAPTE VERIFICATE", sections.VERIFIED_FACTS);
  emit("DOVEZI DOCUMENTE", sections.DOCUMENT_EVIDENCE);
  emit("EPISOADE RELEVANTE", sections.RELEVANT_EPISODES);
  emit("RELATII", sections.RELATIONS);
  emit("PREFERINTE", sections.USER_PREFERENCES);
  emit("CONTRADICTII (nu prezenta ca certitudine)", sections.CONTRADICTIONS);

  const body = parts.length ? parts.join("\n\n") : "(fara context relevant in memorie)";
  const contextText = parts.length
    ? fenceUntrusted(body, "CONTEXT_MEMORIE_JARVIS").fenced
    : "(fara context relevant in memorie — modelul trebuie sa spuna onest daca nu stie)";

  const instructions = [
    "Acesta e context TEMPORAR furnizat de JARVIS. NU il memora, NU il trata ca sursa oficiala.",
    "Distinge FAPT de INFERENTA. Nu transforma inferentele in certitudini.",
    "Daca informatia lipseste, spune ca lipseste — nu inventa. Operational ramane sursa de adevar.",
    contradictions.length ? "EXISTA CONTRADICTII: nu alege arbitrar; semnaleaza dezacordul." : "",
  ].filter(Boolean).join(" ");

  return {
    contextText, instructions, sections, intent, entities: ent,
    used: kept.map((x) => x.id), dropped: [...dropped, ...droppedFacts, ...droppedOps, ...droppedRel], provenance, contradictions,
    foundMemory: kept.length > 0 || relItems.length > 0,
  };
}
