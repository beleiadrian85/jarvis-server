// AI RECOMMENDATION (ETAPA 2, obiectiv 5+7) — la un task nou, din experiente similare
// produce o RECOMANDARE: executant/documente/pasi/timp estimat/riscuri. DOAR recomanda,
// NU decide. Recomandarea se prezinta ca Action Card (INFORMATION/CHOICE) — omul alege.
// PUR (produce structura; cardul se construieste prin envelope existent).
import { findSimilar } from "./similar.js";
import { experienceFor } from "./experience.js";

const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * Construieste o Recommendation pentru un task nou. @returns Recommendation|null
 * null daca nu exista experienta relevanta (nu inventeaza).
 */
export function recommendForTask(newTask = {}, { records = [], experiences = [], minConfidence = 40 } = {}) {
  const sim = findSimilar(newTask, records);
  if (!sim.similar_tasks.length) return null; // fara baza → nicio recomandare
  const exp = experienceFor(sim.problem_type, experiences);
  const suggested_executant = sim.similar_people[0]?.name || exp?.typical_owner || null;
  const estimated = exp?.is_pattern ? exp.avg_resolution_min : null;
  const confidence = exp?.is_pattern ? exp.confidence : Math.min(45, sim.similar_tasks.length * 12);
  if (confidence < minConfidence && !suggested_executant) return null;
  return {
    new_task_title: newTask.title || null, problem_type: sim.problem_type,
    suggested_executant, suggested_documents: sim.similar_documents.length ? sim.similar_documents : arr(exp?.documents_pattern),
    suggested_steps: buildSteps(sim.problem_type),
    estimated_time_min: estimated,
    risks: buildRisks(sim, exp),
    based_on_task_ids: sim.similar_tasks.map((s) => s.task_id),
    confidence, is_pattern: !!exp?.is_pattern,
    disclaimer: "Recomandare bazata pe experienta trecuta — decizia ramane a ta.",
  };
}

function buildSteps(ptype) {
  const map = {
    extras_bancar: ["Identifica contul si perioada", "Obtine extrasul de la banca/Dana", "Reconciliaza cu Operational"],
    autorizatie: ["Verifica documentele necesare", "Depune cererea la autoritate", "Urmareste raspunsul + termen"],
    materiale: ["Confirma necesarul", "Cere oferta furnizorului", "Plaseaza comanda dupa aprobare"],
    factura: ["Verifica factura in SmartBill/Operational", "Confirma statusul platii", "Reconciliaza"],
  };
  return map[ptype] || ["Clarifica cerinta", "Executa actiunea", "Confirma rezultatul cu dovada"];
}
function buildRisks(sim, exp) {
  const risks = [];
  if (!exp || !exp.is_pattern) risks.push("experienta limitata pe acest tip — recomandare cu incredere scazuta");
  if (exp?.avg_resolution_min && exp.avg_resolution_min > 60) risks.push("istoric: dureaza (>1h) — planifica din timp");
  if (!sim.similar_documents.length) risks.push("documentele necesare nu sunt clare din istoric");
  return risks;
}

/**
 * Transforma o Recommendation intr-un envelope de Action Cards (recomandare, nu executie).
 * Reutilizeaza buildEnvelope existent. Cardul e INFORMATION/CHOICE — omul decide.
 */
export async function recommendationEnvelope(rec, { user_id = "adrian", conversation_id = null } = {}) {
  if (!rec) return null;
  const { buildEnvelope } = await import("../actions/envelope.js");
  const summary = [
    rec.suggested_executant ? `Executant recomandat: ${rec.suggested_executant}` : "",
    rec.suggested_documents?.length ? `Documente: ${rec.suggested_documents.join(", ")}` : "",
    rec.estimated_time_min ? `Timp estimat: ~${rec.estimated_time_min} min` : "",
    rec.risks?.length ? `Riscuri: ${rec.risks.join("; ")}` : "",
  ].filter(Boolean).join(". ");
  return buildEnvelope({
    narrative: `Pe baza a ${rec.based_on_task_ids.length} taskuri similare (${rec.problem_type}): ${summary}. ${rec.disclaimer}`,
    situation: rec.new_task_title, facts: rec.based_on_task_ids.map((id) => `task similar ${id}`),
    // Recomandare = actiune de tip informatie/alegere (NU auto-executie, NU decizie).
    actions: [], information_requests: rec.suggested_executant ? [{
      intent: "confirm_recommendation", title: `Aloc taskul catre ${rec.suggested_executant}?`,
      alternatives: [{ label: `Da, ${rec.suggested_executant}` }, { label: "Alt executant" }, { label: "Nu acum" }],
    }] : [],
  }, { user_id, conversation_id });
}
