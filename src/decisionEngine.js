import {
  isOperationalTopic, extractEntity, isProjectTopic, isRiskTopic, isCeoHomeTopic,
  isCashForecastTopic, isEmailTopic, isCalendarTopic, needsWeb, isStrategicTopic,
} from "./intents.js";
import { norm } from "./lib/text.js";
import { getCapabilities } from "./capabilities.js";

/**
 * D1 — decisionEngine: clasificator PUR si SINCRON al caii de rutare.
 * Fara efecte, fara LLM, fara DB, fara MCP. NU executa nimic.
 *
 * Reproduce deciziile actuale din brain.js si le centralizeaza. Nu e inca folosit
 * in brain.js (integrarea = D4, separat). ChatGPT ramane INACTIV: strategy/council
 * se rezolva pe Claude cat timp ctx.hasStrategy este false.
 *
 * classify(text, ctx) → Decision
 *   ctx: { hasOperational, hasGoogle, hasStrategy, hasPending }  (toate optionale)
 *   Decision: { route, kind, provider, active, requiresApproval, reason }
 *
 * Rute: confirm · report(+kind) · operational_read · strategy · council ·
 *       action_propose(+kind, requiresApproval) · email · drive · memory ·
 *       clarify · simple
 */

const YESNO = ["da", "confirm", "confirma", "ok", "nu", "anuleaza", "stop"];

function decision(route, extra = {}) {
  return {
    route,
    kind: extra.kind || null,
    provider: extra.provider || "claude",
    active: extra.active !== undefined ? extra.active : true,
    requiresApproval: !!extra.requiresApproval,
    reason: extra.reason || route,
  };
}

export function classify(text, ctx = {}, opts = {}) {
  const n = norm(text);
  const caps = opts.capabilities || getCapabilities();
  const hasOp = !!ctx.hasOperational;
  const hasGoogle = !!ctx.hasGoogle;
  const hasStrategy = !!ctx.hasStrategy;

  // 0) Confirmare/anulare a unei actiuni in asteptare (doar daca exista una).
  if (ctx.hasPending && YESNO.includes(n)) {
    return decision("confirm", { reason: "raspuns da/nu la o actiune in asteptare" });
  }

  // 1) Rapoarte deterministe „de comanda".
  if (/^\/?(supervizor|briefing|brief|ce probleme)\b/.test(n) || n === "ce e cu operational")
    return decision("report", { kind: "briefing", reason: "comanda briefing" });
  if (/^\/?(raport\s+)?(vanzari|v[aâ]nz[aă]ri|parteneri|spion)\b/.test(n))
    return decision("report", { kind: "sales", reason: "raport vanzari/parteneri" });
  if (n === "raport" || n === "/raport" || /buna dimineata/.test(n))
    return decision("report", { kind: "morning", reason: "raport de dimineata" });

  // 2) Rapoarte deterministe pe date Operational (fara LLM pentru cifre).
  if (hasOp && isCashForecastTopic(text)) return decision("report", { kind: "cash", reason: "cash forecast" });
  if (hasOp && isCeoHomeTopic(text)) return decision("report", { kind: "ceo", reason: "CEO Home" });
  if (hasOp && isRiskTopic(text)) return decision("report", { kind: "risk", reason: "risk engine" });
  if (hasOp && isProjectTopic(text)) return decision("report", { kind: "project", reason: "project intelligence" });
  if (hasOp && extractEntity(text)) return decision("report", { kind: "entity", reason: "entity 360" });

  // 3) Consiliu (decizie structurata). ChatGPT ca Director doar cand e activ.
  if (/\bconsiliu\b/.test(n))
    return decision("council", { provider: hasStrategy ? "chatgpt" : "claude", active: hasStrategy, reason: "consiliu" });

  // 4) Actiuni cu efect → approvalGate (propune → confirma). NICIODATA executie directa.
  if (/creeaz[aă]\s+task/.test(n))
    return decision("action_propose", { kind: "create_task", requiresApproval: true, reason: "creare task" });
  if (isCalendarTopic(text)) {
    if (!hasGoogle) return decision("clarify", { reason: "calendar neconectat" });
    return decision("action_propose", { kind: "calendar", requiresApproval: true, reason: "eveniment calendar" });
  }

  // 5) Memorie / registru decizii / remindere (fara efect extern, fara approvalGate).
  if (/[tț]ine minte[:\s]/.test(n) || /noteaz[aă] decizia[:\s]/.test(n) || /^(rezolvat|amana|ignora)\s*#?\d+/.test(n))
    return decision("memory", { reason: "memorie/decizie/reminder" });

  // 6) Email si Drive (read-only Google).
  if (isEmailTopic(text)) {
    if (!hasGoogle) return decision("clarify", { reason: "email neconectat" });
    return decision("email", { reason: "cautare/citire email" });
  }
  if (/caut[aă]\s+[iî]n\s+drive[:\s]/.test(n))
    return decision("drive", { reason: "cautare in drive" });

  // 6.5) Draft raspuns email (Nivel 2 — creeaza draft in Gmail, ca in brain.js step 7).
  if (/draft(?:\s+raspuns)?(?:\s+la)?[:\s]/.test(n))
    return decision("draft", { reason: "draft raspuns email" });

  // 7) Strategie. Gata pe CAPABILITY: ChatGPT doar daca strategy e disponibila;
  //    altfel ruta ramane "strategy" dar inactiva → fallback Claude (ChatGPT INACTIV).
  if (isStrategicTopic(text))
    return decision("strategy", caps.strategy
      ? { provider: "chatgpt", active: true, reason: "intrebare strategica" }
      : { provider: "claude", active: false, reason: "strategy_disabled" });

  // 8) Operational read-only (chat cu MCP de citire — cf. A1).
  if (hasOp && isOperationalTopic(text))
    return decision("operational_read", { reason: "intrebare operationala (read-only)" });

  // 8.5) Capabilitati cerute EXPLICIT dar indisponibile → clarificare (nu inventa).
  //      Plasat DUPA toate rutele existente → pur aditiv, zero regresii pe deciziile de sus.
  if (!caps.railwayLogs && /(railway|loguri|logurile|\blogs?\b)/.test(n))
    return decision("clarify", { reason: "capability_missing:railwayLogs" });
  if (!caps.ga4 && /(google analytics|\banalytics\b|\bga4\b)/.test(n))
    return decision("clarify", { reason: "capability_missing:ga4" });
  if (!caps.searchConsole && /search console/.test(n))
    return decision("clarify", { reason: "capability_missing:searchConsole" });
  if (!caps.banking && /(\bbanking\b|extras(e|ul)? bancar)/.test(n))
    return decision("clarify", { reason: "capability_missing:banking" });

  // 9) Chat simplu (fara tool-uri). Web search se decide in handler.
  return decision("simple", { reason: needsWeb(text) ? "chat + web" : "chat simplu" });
}
