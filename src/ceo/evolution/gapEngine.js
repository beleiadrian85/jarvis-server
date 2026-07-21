// SELF-EVOLUTION V1 — GAP ENGINE (§1, §2, §19).
// Rolul: inainte de a cere software nou, sistemul urca OBLIGATORIU scara
// REUSE BEFORE BUILD (§1) treapta cu treapta; abia daca nicio treapta nu
// rezolva complet nevoia se confirma un capability gap si se clasifica
// tipul lui (§2). Problemele de PROCES nu primesc software (§19) — primesc
// recomandare de fix de proces.
// MODUL PUR: functii deterministe peste argumente — ZERO IO, zero stare.
// Toate datele (manifest, sanatatea surselor, feature-uri de sistem,
// parsere, conectori) vin ca argumente. Date lipsa = UNKNOWN explicit in
// evidence, niciodata inventate.
//
// Conventii de campuri pe NEVOIE (aditive, toate optionale — lipsa = UNKNOWN):
//   requires_file, file_format, required_capability|capability, source|domain,
//   api_available, api_directly_usable, solvable_by_configuration,
//   config_option_available, config_evidence, human_can_provide,
//   requires_human_input, input_channel_exists, gap_hint, process_problem,
//   missing_parser, requires_parser, parser_available, missing_connector,
//   data_exists, data_unreadable, cannot_read_data, missing_authorized_path,
//   authorized, requires_ui, missing_interface, cannot_verify_result,
//   unobservable, missing_rule, missing_definition, policy_blocked,
//   missing_policy, type, reasoning.q15_worth_a_task
import { REUSE_LADDER, GAP_TYPES, PROCESS_FIX_RECOMMENDED, slug } from "./contract.js";

// ── CONSTANTE INTERNE ───────────────────────────────────────────────────

// Gap-uri care NU cer cod (§2): regula/definitia si politica se scriu, nu se programeaza.
const NO_CODE_GAPS = ["KNOWLEDGE_GAP", "POLICY_GAP"];

// O sursa e considerata "persistent stale" de la acest numar de zile in sus
// (folosit doar cand semnalul vine cu zile, nu cu flag explicit).
const STALE_PERSISTENT_DAYS = 3;

// ── HELPERI INTERNI ─────────────────────────────────────────────────────

/** Normalizare text pentru comparatii (lowercase + fold diacritice ro). PUR. */
function norm(s) {
  return String(s || "").toLowerCase()
    .replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t")
    .trim();
}

/** Normalizeaza o colectie (array de stringuri/obiecte sau dict) la lista de nume. PUR. */
function listNames(x) {
  if (!x) return [];
  if (Array.isArray(x)) {
    return x.map((e) => (typeof e === "string" ? e : e?.name || e?.id || "")).filter(Boolean);
  }
  if (typeof x === "object") return Object.keys(x);
  return [];
}

/** Lista fara duplicate, pastrand ordinea primei aparitii. PUR. */
function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

/** O intrare de sanatate a sursei e "sanatoasa"? Forme acceptate:
 *  {ok:true} | {status:"OK"/"HEALTHY"/"FRESH"} | {stale:false}.
 *  Orice altceva = NU se poate confirma (nu inventam sanatate). */
function sourceIsHealthy(h) {
  if (!h || typeof h !== "object") return false;
  if (h.ok === true) return true;
  const st = String(h.status || "").toUpperCase();
  if (["OK", "HEALTHY", "FRESH"].includes(st)) return true;
  if (h.stale === false) return true;
  return false;
}

// ── EVALUATORII CELOR 7 TREPTE (§1) ─────────────────────────────────────
// Fiecare evaluator returneaza { verdict, evidence, resolution? }.
// resolution se seteaza DOAR pe verdict SOLVES.

/** Treapta 1 — REUSE_EXISTING_CAPABILITY: un modul existent acopera nevoia?
 *  Parserele disponibile conteaza ca o capabilitate existenta PARTIALA
 *  (acopera analiza, nu si obtinerea fisierului). */
function evalReuseExisting(need, manifest, parsers) {
  if (!manifest) return { verdict: "NO", evidence: "UNKNOWN — manifest de capabilitati indisponibil" };
  const target = norm(need.required_capability || need.capability);
  const mods = listNames(manifest.modules);
  if (target) {
    const hit = mods.find((m) => norm(m) === target);
    if (hit) {
      return { verdict: "SOLVES", evidence: `modul existent acopera nevoia: ${hit}`, resolution: "USE_EXISTING" };
    }
  }
  const fmt = norm(need.file_format || need.format);
  if (fmt) {
    const p = (Array.isArray(parsers) ? parsers : []).find((x) => norm(x?.format) === fmt);
    if (p && p.available === true) {
      return { verdict: "PARTIAL", evidence: `parser existent pentru formatul '${p.format}' — acopera analiza, nu si obtinerea datei` };
    }
    if (p && p.available === false) {
      return { verdict: "NO", evidence: `parser pentru formatul '${p.format}' declarat dar INDISPONIBIL` };
    }
  }
  if (!target) return { verdict: "NO", evidence: "nevoia nu declara o capabilitate tinta (UNKNOWN)" };
  return { verdict: "NO", evidence: `niciun modul existent nu acopera '${target}' (module verificate: ${mods.length})` };
}

/** Treapta 2 — EXISTING_COMPANY_DATA: data exista deja intr-o sursa interna sanatoasa? */
function evalCompanyData(need, sourcesHealth) {
  if (need.requires_file === true) {
    return { verdict: "NO", evidence: "nevoia cere un fisier din exterior — datele interne existente nu o acopera" };
  }
  const target = norm(need.source || need.domain);
  const keys = Object.keys(sourcesHealth || {});
  if (!target) return { verdict: "NO", evidence: "nevoia nu declara o sursa/domeniu de date (UNKNOWN)" };
  const key = keys.find((k) => norm(k) === target);
  if (!key) return { verdict: "NO", evidence: `nicio sursa interna pentru '${target}' (surse verificate: ${keys.length})` };
  if (sourceIsHealthy(sourcesHealth[key])) {
    return { verdict: "SOLVES", evidence: `sursa interna sanatoasa acopera nevoia: ${key}`, resolution: "USE_EXISTING" };
  }
  return { verdict: "PARTIAL", evidence: `sursa interna '${key}' exista dar nu e sanatoasa/actuala` };
}

/** Treapta 3 — EXISTING_CONNECTOR: exista adaptor pentru sursa?
 *  Conectat → USE_EXISTING. Existent dar neconectat → CONNECT_SOURCE
 *  (conectarea e operatiune, nu software nou — rezolva complet intrebarea
 *  "construim ceva?"). */
function evalConnector(need, connectors) {
  const target = norm(need.source || need.domain);
  const list = Array.isArray(connectors) ? connectors : [];
  if (!target) return { verdict: "NO", evidence: "nevoia nu declara o sursa pentru conector (UNKNOWN)" };
  const hit = list.find((c) => norm(c?.name) === target);
  if (!hit) return { verdict: "NO", evidence: `niciun conector pentru '${target}' (conectori verificati: ${list.length})` };
  if (hit.connected === true) {
    return { verdict: "SOLVES", evidence: `conector deja conectat: ${hit.name}`, resolution: "USE_EXISTING" };
  }
  return { verdict: "SOLVES", evidence: `conector existent dar neconectat: ${hit.name} — necesita conectare, nu software nou`, resolution: "CONNECT_SOURCE" };
}

/** Treapta 4 — OFFICIAL_API: sursa are API oficial? API fara adaptor = PARTIAL
 *  (dovada ramane pentru clasificarea CONNECTOR_GAP). */
function evalOfficialApi(need, manifest) {
  const target = norm(need.source || need.domain);
  const sources = listNames(manifest?.sources);
  const apiKnown = need.api_available === true || (target && sources.some((s) => norm(s) === target));
  if (!apiKnown) return { verdict: "NO", evidence: "niciun API oficial identificat pentru nevoie" };
  if (need.api_directly_usable === true) {
    return { verdict: "SOLVES", evidence: "API oficial direct utilizabil — necesita doar conectarea sursei", resolution: "CONNECT_SOURCE" };
  }
  return { verdict: "PARTIAL", evidence: "exista API oficial pentru sursa, dar lipseste adaptorul de sistem" };
}

/** Treapta 5 — CONFIGURATION: nevoia se rezolva dintr-o optiune de configurare? */
function evalConfiguration(need) {
  if (need.solvable_by_configuration === true || need.config_option_available === true) {
    return {
      verdict: "SOLVES",
      evidence: need.config_evidence || "optiune de configurare existenta rezolva nevoia",
      resolution: "CONFIGURATION",
    };
  }
  return { verdict: "NO", evidence: "nicio optiune de configurare identificata pentru nevoie" };
}

/** Treapta 6 — STRUCTURED_HUMAN_INPUT: un om poate furniza inputul printr-un
 *  task structurat — DOAR daca omul ARE canalul necesar. Pentru fisiere,
 *  canalul obligatoriu e feature-ul task_attachments al instantei. */
function evalHumanInput(need, systemFeatures) {
  if (need.requires_file === true) {
    const ch = systemFeatures?.task_attachments;
    if (ch?.exists === true) {
      return {
        verdict: "SOLVES",
        evidence: ch.evidence || "canal de atasare fisiere existent — omul poate incarca fisierul intr-un task",
        resolution: "HUMAN_TASK",
      };
    }
    return { verdict: "NO", evidence: "omul NU are canal de atasare fisiere — lipseste canalul de input" };
  }
  if (need.human_can_provide === true || need.requires_human_input === true) {
    return { verdict: "SOLVES", evidence: "omul poate furniza informatia printr-un task structurat", resolution: "HUMAN_TASK" };
  }
  return { verdict: "NO", evidence: "nevoia nu e marcata ca rezolvabila prin input uman structurat" };
}

/** Treapta 7 — NEW_SOFTWARE: doar daca nimic de deasupra nu a rezolvat. */
function evalNewSoftware(alreadyResolved) {
  if (alreadyResolved) {
    return { verdict: "NO", evidence: "nu e necesar software nou — o treapta anterioara rezolva nevoia" };
  }
  return { verdict: "SOLVES", evidence: "nicio treapta de reuse nu rezolva complet — capability gap confirmat", resolution: "CAPABILITY_GAP" };
}

// ── ANALIZA DE REUSE (§1 — PRIME DIRECTIVE) ─────────────────────────────

/**
 * Urca scara REUSE_LADDER IN ORDINE. Prima treapta care rezolva COMPLET
 * fixeaza rezolutia; verdictele PARTIAL nu opresc urcarea dar dovada lor
 * se pastreaza in evidence. Toate cele 7 trepte apar in ladder, verificate.
 * Returneaza { ladder, resolution, evidence, sources_checked,
 *              existing_capabilities_checked }.
 */
export function runReuseAnalysis(need = {}, { manifest = null, sourcesHealth = {}, systemFeatures = {}, parsers = [], connectors = [] } = {}) {
  const ladder = [];
  const evidence = [];
  let resolution = null;

  const evaluators = {
    REUSE_EXISTING_CAPABILITY: () => evalReuseExisting(need, manifest, parsers),
    EXISTING_COMPANY_DATA: () => evalCompanyData(need, sourcesHealth),
    EXISTING_CONNECTOR: () => evalConnector(need, connectors),
    OFFICIAL_API: () => evalOfficialApi(need, manifest),
    CONFIGURATION: () => evalConfiguration(need),
    STRUCTURED_HUMAN_INPUT: () => evalHumanInput(need, systemFeatures),
    NEW_SOFTWARE: () => evalNewSoftware(resolution !== null),
  };

  for (const rung of REUSE_LADDER) {
    const r = evaluators[rung]();
    ladder.push({ rung, checked: true, verdict: r.verdict, evidence: r.evidence || null });
    // Pastram dovezile treptelor care aduc ceva (SOLVES/PARTIAL) — §1.
    if (r.verdict !== "NO" && r.evidence) evidence.push(`${rung}: ${r.evidence}`);
    if (!resolution && r.verdict === "SOLVES" && r.resolution) resolution = r.resolution;
  }

  const sources_checked = uniq([
    ...Object.keys(sourcesHealth || {}),
    ...listNames(manifest?.sources),
  ]);
  const existing_capabilities_checked = uniq([
    ...listNames(manifest?.modules),
    ...(Array.isArray(connectors) ? connectors : []).map((c) => c?.name).filter(Boolean),
    ...(Array.isArray(parsers) ? parsers : []).map((p) => (p?.format ? `parser:${p.format}` : null)).filter(Boolean),
  ]);

  return {
    ladder,
    resolution: resolution || "CAPABILITY_GAP",
    evidence,
    sources_checked,
    existing_capabilities_checked,
  };
}

// ── CLASIFICAREA GAP-ULUI (§2, §19) ─────────────────────────────────────

/** Construieste raspunsul de clasificare. requires_code deriva din tip. PUR. */
function gapAnswer(gapType, why) {
  return { gap_type: gapType, why, requires_code: !NO_CODE_GAPS.includes(gapType) && gapType !== PROCESS_FIX_RECOMMENDED };
}

/**
 * Clasifica gap-ul unei nevoi pe baza semnalului si a analizei de reuse.
 * REGULA §19 (prima, absoluta): o problema de PROCES sau o observatie de
 * disciplina care nu merita task NU primeste software — primeste
 * PROCESS_FIX_RECOMMENDED cu requires_code:false.
 * Returneaza { gap_type, why, requires_code }.
 */
export function classifyGap(need = {}, reuse = {}) {
  // §19 — problemele de proces nu primesc software.
  if (need.process_problem === true) {
    return gapAnswer(PROCESS_FIX_RECOMMENDED, "problema declarata de PROCES — se recomanda fix de proces/disciplina, nu software");
  }
  if (need.type === "OBSERVATION" && need.reasoning?.q15_worth_a_task === false) {
    return gapAnswer(PROCESS_FIX_RECOMMENDED, "observatie de disciplina/proces care nu merita un task — fix de proces, nu software");
  }

  // Tip declarat explicit de semnal (daca e valid) are prioritate.
  const hint = String(need.gap_hint || "").toUpperCase();
  if (GAP_TYPES.includes(hint)) {
    return gapAnswer(hint, `tip de gap declarat explicit de semnal: ${hint}`);
  }

  const ladder = Array.isArray(reuse.ladder) ? reuse.ladder : [];
  const rungOf = (name) => ladder.find((e) => e?.rung === name) || null;

  // 1) Lipsa parser/motor de analiza → ANALYSIS_GAP.
  if (need.missing_parser === true || need.requires_parser === true || (need.requires_file === true && need.parser_available === false)) {
    return gapAnswer("ANALYSIS_GAP", "datele exista sau pot fi obtinute, dar lipseste parserul/motorul de analiza");
  }

  // 2) Lipsa canal de input uman → INPUT_CAPABILITY_GAP.
  const shi = rungOf("STRUCTURED_HUMAN_INPUT");
  const channelOk = shi ? shi.verdict === "SOLVES" : need.input_channel_exists === true;
  if (need.requires_file === true && !channelOk) {
    return gapAnswer("INPUT_CAPABILITY_GAP", "omul nu are canal prin care sa furnizeze fisierul cerut (lipseste atasarea de fisiere)");
  }

  // 3) Sursa cu API oficial dar fara adaptor → CONNECTOR_GAP.
  const api = rungOf("OFFICIAL_API");
  if (need.missing_connector === true || api?.verdict === "PARTIAL") {
    return gapAnswer("CONNECTOR_GAP", "sursa exista (API oficial), dar lipseste adaptorul de sistem");
  }

  // 4) Nu pot citi o data existenta → DATA_CAPABILITY_GAP.
  const data = rungOf("EXISTING_COMPANY_DATA");
  if (need.data_unreadable === true || need.cannot_read_data === true || (need.data_exists === true && data && data.verdict !== "SOLVES")) {
    return gapAnswer("DATA_CAPABILITY_GAP", "data exista dar nu poate fi citita/obtinuta cu capabilitatile actuale");
  }

  // 5) Lipsa cale autorizata de actiune → ACTION_GAP.
  if (need.missing_authorized_path === true || (need.type === "ACTION_NEED" && need.authorized === false)) {
    return gapAnswer("ACTION_GAP", "actiunea necesara e cunoscuta, dar lipseste calea autorizata de executie");
  }

  // 6) Lipsa interfata pentru introducerea datelor → UI_GAP.
  if (need.requires_ui === true || need.missing_interface === true) {
    return gapAnswer("UI_GAP", "omul trebuie sa introduca date, dar lipseste interfata necesara");
  }

  // 7) Nu pot verifica rezultatul → OBSERVABILITY_GAP.
  if (need.cannot_verify_result === true || need.unobservable === true) {
    return gapAnswer("OBSERVABILITY_GAP", "rezultatul nu poate fi verificat — starea nu e expusa sistemului");
  }

  // 8) Lipseste o regula/definitie clara → KNOWLEDGE_GAP (fara cod).
  if (need.missing_rule === true || need.missing_definition === true) {
    return gapAnswer("KNOWLEDGE_GAP", "lipseste o regula/definitie clara — se scrie cunoastere, nu cod");
  }

  // 9) Tehnic posibil, lipseste politica → POLICY_GAP (fara cod).
  if (need.policy_blocked === true || need.missing_policy === true) {
    return gapAnswer("POLICY_GAP", "tehnic posibil, dar lipseste politica de autonomie — se decide politica, nu se scrie cod");
  }

  // Fallback explicit: nu inventam un gap care cere cod. Lipsa de claritate
  // este ea insasi un KNOWLEDGE_GAP (definitia nevoii/gap-ului lipseste).
  return gapAnswer("KNOWLEDGE_GAP", "tipul de gap nu poate fi determinat din semnal — lipseste o definitie clara a nevoii (UNKNOWN)");
}

// ── DETECTIA DE GAP-URI DIN SEMNALE AGREGATE (§2) ───────────────────────

/**
 * Detecteaza gap-uri sistemice din semnalele ciclului: nevoi inchise pe motiv
 * de conector lipsa, parsere indisponibile cerute de nevoi cu fisier, surse
 * persistent stale. Determinist; fara duplicate pe (signal, gap_type).
 * Returneaza [{ need_id|null, signal, gap_type, why, requires_code }].
 */
export function detectGapsFromSignals({ needs = [], noAction = [], parserRegistry = [], staleSources = [] } = {}) {
  const out = [];
  const seen = new Set();
  const push = (needId, signal, gapType, why) => {
    const key = `${signal}|${gapType}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ need_id: needId ?? null, signal, gap_type: gapType, why, requires_code: !NO_CODE_GAPS.includes(gapType) });
  };

  // 1) Intrari noAction cu motiv "conector de sistem" → CONNECTOR_GAP.
  for (const e of Array.isArray(noAction) ? noAction : []) {
    const reason = norm(e?.reason || e?.why || e?.motiv || "");
    if (!reason.includes("conector de sistem")) continue;
    const scope = norm(e?.source || e?.domain) || "sistem";
    push(e?.need_id ?? null, `noaction:conector:${slug(scope, 24)}`, "CONNECTOR_GAP",
      "nevoie ramasa fara actiune pe motiv de conector de sistem lipsa");
  }

  // 2) Parsere indisponibile cerute de nevoi cu fisier → ANALYSIS_GAP.
  // Potrivirea e EXPLICITA pe format (need.file_format/format); o nevoie fara
  // format declarat nu genereaza semnal (nu inventam cerinta).
  const needsArr = Array.isArray(needs) ? needs : [];
  for (const p of Array.isArray(parserRegistry) ? parserRegistry : []) {
    if (!p || p.available !== false || !p.format) continue;
    const fmt = norm(p.format);
    const requester = needsArr.find((n) => n?.requires_file === true && norm(n.file_format || n.format) === fmt);
    if (!requester) continue;
    push(requester.need_id ?? null, `parser:${slug(fmt, 24)}`, "ANALYSIS_GAP",
      `parser indisponibil pentru formatul '${p.format}' cerut de o nevoie cu fisier`);
  }

  // 3) Surse persistent stale → CONNECTOR_GAP daca lipseste conexiunea,
  // altfel OBSERVABILITY_GAP (nu putem verifica starea sursei).
  for (const s of Array.isArray(staleSources) ? staleSources : []) {
    const name = typeof s === "string" ? s : s?.source || s?.name || "";
    if (!name) continue;
    const persistent = typeof s === "string"
      ? true // lista primita e deja de surse stale; stringul simplu nu poarta zile
      : s.persistent === true || Number(s.stale_days ?? s.days_stale ?? 0) >= STALE_PERSISTENT_DAYS;
    if (!persistent) continue;
    const noConn = typeof s === "object" && (s.connected === false || s.has_connector === false);
    if (noConn) {
      push(null, `stale:${slug(norm(name), 24)}`, "CONNECTOR_GAP",
        `sursa '${name}' persistent stale si fara conector functional`);
    } else {
      push(null, `stale:${slug(norm(name), 24)}`, "OBSERVABILITY_GAP",
        `sursa '${name}' persistent stale — prospetimea/starea ei nu poate fi verificata`);
    }
  }

  return out;
}
