import { config, hasGoogle } from "../config.js";
import { gapi } from "../google.js";
import { addReminder } from "../reminders.js";

/**
 * Gmail: clasificare rule-based (fara tokeni) + drafturi (Nivel 2).
 * Important = expeditor-cheie SAU cuvant critic in subiect/snippet.
 */

const CRITICAL_WORDS = [
  "scadenta", "scadență", "somatie", "somație", "reziliere", "licitatie", "licitație",
  "instanta", "instanță", "executare", "penalitati", "penalități", "termen limita",
  "termen limită", "urgent", "notificare de plata", "poprire",
];

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const CRITICAL_NORM = CRITICAL_WORDS.map(norm);

function classify(from, subject, snippet) {
  const f = norm(from);
  if (config.keySenders.some((k) => f.includes(norm(k)))) return "important";
  const text = norm(subject + " " + snippet);
  if (CRITICAL_NORM.some((w) => text.includes(w))) return "important";
  return "normal";
}

function header(msg, name) {
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value || "";
}

/**
 * Emailurile importante din inbox (ultimele 2 zile, max 15 verificate).
 * Cele importante intra si in reminders (dedupe pe gmail:<id>).
 */
export async function getImportantEmails() {
  if (!hasGoogle) return null;
  try {
    const list = await gapi(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?" +
        new URLSearchParams({ q: "in:inbox newer_than:2d", maxResults: "15" })
    );
    const out = [];
    for (const m of list.messages || []) {
      const msg = await gapi(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`
      );
      const from = header(msg, "from");
      const subject = header(msg, "subject");
      if (classify(from, subject, msg.snippet || "") === "important") {
        out.push({ id: m.id, from, subject, snippet: (msg.snippet || "").slice(0, 140) });
        await addReminder({
          kind: "email",
          title: `Email important: „${subject}” de la ${from.replace(/<.*>/, "").trim()}`,
          source: `gmail:${m.id}`,
        });
      }
    }
    return out;
  } catch (e) {
    console.error("[gmail]", e.message);
    return null;
  }
}

/** Threaduri trimise de mine, fara raspuns de >3 zile lucratoare (max 15 threaduri verificate). */
export async function getUnansweredSent() {
  if (!hasGoogle) return null;
  try {
    const cutoff = businessDaysAgo(3);
    const list = await gapi(
      "https://gmail.googleapis.com/gmail/v1/users/me/threads?" +
        new URLSearchParams({ q: "in:sent newer_than:10d", maxResults: "15" })
    );
    const out = [];
    for (const t of list.threads || []) {
      const th = await gapi(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=To`
      );
      const msgs = th.messages || [];
      const last = msgs[msgs.length - 1];
      const lastFromMe = (last.labelIds || []).includes("SENT");
      const lastDate = Number(last.internalDate);
      if (lastFromMe && lastDate < cutoff.getTime()) {
        out.push({
          subject: header(last, "subject") || "(fara subiect)",
          to: header(last, "to").replace(/<.*>/, "").trim(),
          days: Math.round((Date.now() - lastDate) / 86_400_000),
        });
      }
    }
    return out;
  } catch (e) {
    console.error("[gmail.sent]", e.message);
    return null;
  }
}

function businessDaysAgo(n) {
  const d = new Date();
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

/** Creeaza un draft de raspuns (Nivel 2 — nu trimite nimic). */
export async function createDraft({ to, subject, body, threadId = null }) {
  if (!hasGoogle) throw new Error("Google neconfigurat.");
  const mime = [
    `To: ${to}`,
    `Subject: ${subject.startsWith("Re:") ? subject : "Re: " + subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].join("\r\n");
  const raw = Buffer.from(mime, "utf8").toString("base64url");
  const payload = { message: { raw, ...(threadId ? { threadId } : {}) } };
  const d = await gapi("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return d.id;
}

/** Cauta fire dupa query Gmail (search_threads). Intoarce lista cu id+snippet+from+subject. */
export async function searchThreads(query, pageSize = 25) {
  if (!hasGoogle) return null;
  const list = await gapi(
    "https://gmail.googleapis.com/gmail/v1/users/me/threads?" +
      new URLSearchParams({ q: query, maxResults: String(Math.min(40, Math.max(5, pageSize))) })
  );
  const out = [];
  for (const t of (list.threads || []).slice(0, pageSize)) {
    const th = await gapi(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
    );
    const last = (th.messages || [])[th.messages.length - 1] || {};
    out.push({
      threadId: t.id,
      from: header(last, "from"),
      subject: header(last, "subject") || "(fara subiect)",
      date: header(last, "date"),
      snippet: th.messages?.[0]?.snippet || "",
    });
  }
  return out;
}

/** Continutul COMPLET al unui fir (get_thread FULL_CONTENT) — corp, telefoane, atasamente. */
export async function readThread(threadId) {
  if (!hasGoogle) return null;
  const th = await gapi(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`
  );
  return (th.messages || []).map((m) => ({
    from: header(m, "from"),
    to: header(m, "to"),
    subject: header(m, "subject"),
    date: header(m, "date"),
    body: extractBody(m.payload).slice(0, 6000),
    attachments: collectAttachments(m.payload),
  }));
}

// Extrage text/plain din payload (recursiv); fallback la snippet-ul mesajului.
function extractBody(payload) {
  if (!payload) return "";
  const decode = (d) => { try { return Buffer.from(d, "base64url").toString("utf8"); } catch { return ""; } };
  if (payload.mimeType === "text/plain" && payload.body?.data) return decode(payload.body.data);
  if (payload.parts) {
    const plain = payload.parts.find((p) => p.mimeType === "text/plain" && p.body?.data);
    if (plain) return decode(plain.body.data);
    for (const p of payload.parts) { const sub = extractBody(p); if (sub) return sub; }
  }
  if (payload.body?.data) return decode(payload.body.data).replace(/<[^>]+>/g, " ");
  return "";
}
function collectAttachments(payload, acc = []) {
  if (!payload) return acc;
  if (payload.filename) acc.push(payload.filename);
  (payload.parts || []).forEach((p) => collectAttachments(p, acc));
  return acc.filter(Boolean);
}

/** Ultimul email care se potriveste unei cautari — pentru "draft raspuns la ...". */
export async function findEmail(searchText) {
  if (!hasGoogle) return null;
  const list = await gapi(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?" +
      new URLSearchParams({ q: `in:inbox ${searchText}`, maxResults: "1" })
  );
  const m = (list.messages || [])[0];
  if (!m) return null;
  const msg = await gapi(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`
  );
  return {
    id: m.id,
    threadId: msg.threadId,
    from: header(msg, "from"),
    subject: header(msg, "subject"),
    snippet: msg.snippet || "",
  };
}
