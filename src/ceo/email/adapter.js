// EMAIL ADAPTER — interfata provider-agnostica READ-ONLY peste sursa Gmail existenta
// (src/sources/gmail.js). Permisiuni verificate in COD. Atasamentele = UNTRUSTED.
// Minimizarea datelor: pastreaza doar fragmentul probatoriu, nu corpul integral.
// NU modifica inboxul. Draft DOAR la cerere explicita (creare, nu trimitere).
import { canEmail } from "./permissions.js";
import { fenceUntrusted } from "../untrustedInput.js";
import { audit } from "../../audit.js";

const arr = (v) => (Array.isArray(v) ? v : []);

// Clase de evidenta (distinctia semantica ceruta).
export const EMAIL_EVIDENCE = ["FOUND_IN_EMAIL", "DECLARED_BY_SENDER", "EXTRACTED_FROM_ATTACHMENT", "UNKNOWN", "NOT_OBSERVED"];

/**
 * Construieste un PLAN de cautare limitat (nu descarca tot inboxul). PUR.
 * @returns { intent, email_queries, evidence_required }
 */
export function buildSearchPlan({ intent, relevant_people = [], terms = [], has_attachment = null, date_window = "contextual", evidence_required = [] } = {}) {
  return {
    intent: intent || "GENERIC",
    email_queries: [{ people: arr(relevant_people), terms: arr(terms), has_attachment, date_window }],
    evidence_required: arr(evidence_required),
  };
}

/** Cauta email-uri dupa plan (read-only). Injectabil `gmail` pentru teste. */
export async function searchEmail(plan, { gmail = null, ctx = {}, store = null } = {}) {
  const perm = canEmail("EMAIL_SEARCH", ctx);
  if (!perm.allowed) return { ok: false, reason: perm.reason, results: [] };
  const g = gmail || (await import("../../sources/gmail.js"));
  const q = arr(plan?.email_queries)[0] || {};
  const query = [...arr(q.people), ...arr(q.terms), q.has_attachment ? "has:attachment" : ""].filter(Boolean).join(" ");
  let threads = [];
  try { threads = (await g.searchThreads?.(query)) || []; } catch (e) { return { ok: false, reason: e.message, results: [] }; }
  await audit("email_search", `intent=${plan?.intent} q=${query.slice(0, 80)}`, `${arr(threads).length} rezultate`, true).catch(() => {});
  // Minimizare: pastram doar metadate + fragment.
  const results = arr(threads).slice(0, 10).map((t) => ({
    thread_ref: t.id || t.threadId || null, sender: t.from || null, subject: t.subject || null,
    timestamp: t.date || t.timestamp || null, snippet: String(t.snippet || "").slice(0, 200),
    has_attachment: !!t.hasAttachment, evidence_class: "FOUND_IN_EMAIL",
  }));
  return { ok: true, results, query };
}

/** Citeste un thread (read-only). Continutul = UNTRUSTED (fenced). */
export async function readEmailThread(threadRef, { gmail = null, ctx = {} } = {}) {
  const perm = canEmail("EMAIL_READ", ctx);
  if (!perm.allowed) return { ok: false, reason: perm.reason };
  const g = gmail || (await import("../../sources/gmail.js"));
  let thread;
  try { thread = await g.readThread?.(threadRef); } catch (e) { return { ok: false, reason: e.message }; }
  // readThread poate intoarce: (a) o LISTA de mesaje [{from,subject,date,body,...}],
  // (b) un obiect {body/text}, (c) null/[]/incomplet. Normalizam robust in toate cazurile.
  const messages = Array.isArray(thread) ? thread
    : Array.isArray(thread?.messages) ? thread.messages
    : (thread && typeof thread === "object") ? [thread] : [];
  if (!messages.length) return { ok: true, thread_ref: threadRef, fenced: fenceUntrusted("(thread gol sau inaccesibil)", `email:${threadRef}`).fenced, injection: false, message_count: 0, evidence_class: "FOUND_IN_EMAIL", empty: true };
  const body = messages.map((m, i) => {
    const hdr = [m?.from && `De la: ${m.from}`, m?.date && `Data: ${m.date}`, m?.subject && `Subiect: ${m.subject}`].filter(Boolean).join(" · ");
    const text = String(m?.body || m?.text || m?.snippet || "").trim();
    return `— Mesaj ${i + 1}${hdr ? " — " + hdr : ""} —\n${text || "(fara continut text)"}`;
  }).join("\n\n").slice(0, 8000);
  await audit("email_read", `thread=${threadRef} msgs=${messages.length}`, "read-only", true).catch(() => {});
  const fenced = fenceUntrusted(body, `email:${threadRef}`);
  return { ok: true, thread_ref: threadRef, message_count: messages.length, fenced: fenced.fenced, injection: !fenced.scan.safe, evidence_class: "FOUND_IN_EMAIL" };
}

/** Citeste un atasament permis. UNTRUSTED. Necesita EMAIL_READ_ATTACHMENTS. */
export async function readAttachment(att, { ctx = {}, extractText = null } = {}) {
  const perm = canEmail("EMAIL_READ_ATTACHMENTS", ctx);
  if (!perm.allowed) return { ok: false, reason: perm.reason };
  // Reguli de securitate: tip/dimensiune + fara resurse remote/macro.
  const mime = String(att?.mime || "").toLowerCase();
  const allowed = /pdf|sheet|excel|csv|text|image|word|document/.test(mime) || !mime;
  if (!allowed) return { ok: false, reason: `tip atasament neacceptat: ${mime}` };
  if (att?.size && att.size > 25 * 1024 * 1024) return { ok: false, reason: "atasament prea mare (>25MB)" };
  const text = typeof extractText === "function" ? await extractText(att) : String(att?.text || "");
  const fenced = fenceUntrusted(String(text).slice(0, 12000), `attachment:${att?.filename || "fisier"}`);
  await audit("email_attachment", `${att?.filename}`, `${mime} ${att?.size || "?"}`, true).catch(() => {});
  return { ok: true, filename: att?.filename, mime, fenced: fenced.fenced, injection: !fenced.scan.safe, evidence_class: "EXTRACTED_FROM_ATTACHMENT" };
}

/**
 * Creeaza un DRAFT — DOAR la cerere explicita (ctx.explicitRequest=true). Nu trimite.
 * @returns { ok, draft_id (receipt real), reason }
 */
export async function createEmailDraft({ to, subject, body, threadId = null }, { gmail = null, ctx = {} } = {}) {
  const perm = canEmail("EMAIL_CREATE_DRAFT", { ...ctx, explicitRequest: ctx.explicitRequest });
  if (!perm.allowed) return { ok: false, reason: perm.reason };
  const g = gmail || (await import("../../sources/gmail.js"));
  let res;
  try { res = await g.createDraft?.({ to, subject, body, threadId }); } catch (e) { return { ok: false, reason: e.message }; }
  // Receipt REAL de la provider — fara el NU spunem ca draftul a fost creat.
  const draftId = res?.draftId || res?.id || res?.draft?.id || null;
  if (!draftId) return { ok: false, reason: "providerul nu a returnat un id de draft — nu confirm crearea" };
  await audit("email_draft", `to=${to} subj=${String(subject).slice(0, 60)}`, `draft=${draftId} (NEtrimis)`, true).catch(() => {});
  return { ok: true, draft_id: draftId, sent: false, note: "Draft creat. NU a fost trimis (SEND dezactivat)." };
}
