import { pool, query } from "./db.js";
import { callClaude } from "./claude.js";

/**
 * Istoric conversational persistent, comun Telegram + HUD.
 * Trunchiat: ultimele N schimburi + un sumar rulant (constitutie, regula 7).
 */

const KEEP_RECENT = 12;     // mesaje trimise in context
const SUMMARIZE_AFTER = 40; // mesaje nesumarizate care declanseaza plierea

export async function appendMessage(channel, role, content) {
  if (!pool) return;
  await query(
    `INSERT INTO conversations (channel, role, content) VALUES ($1,$2,$3)`,
    [channel, role, String(content).slice(0, 8000)]
  );
}

export async function getContext() {
  if (!pool) return { summary: "", recent: [] };
  const [state] = await query(`SELECT summary, last_summarized_id FROM conv_state WHERE id = 1`);
  const recent = await query(
    `SELECT role, content FROM conversations ORDER BY id DESC LIMIT $1`, [KEEP_RECENT]
  );
  return { summary: state?.summary || "", recent: recent.reverse() };
}

/**
 * Pliaza mesajele vechi in sumar cand se aduna prea multe (1 apel Claude).
 * Ruleaza async, nu blocheaza raspunsul.
 */
export async function maybeSummarize() {
  if (!pool) return;
  try {
    const [state] = await query(`SELECT summary, last_summarized_id FROM conv_state WHERE id = 1`);
    const pending = await query(
      `SELECT id, role, content FROM conversations WHERE id > $1 ORDER BY id ASC`,
      [state.last_summarized_id]
    );
    if (pending.length <= SUMMARIZE_AFTER) return;

    const toFold = pending.slice(0, pending.length - KEEP_RECENT);
    const text = toFold.map((m) => `${m.role === "user" ? "Adi" : "JARVIS"}: ${m.content}`).join("\n");
    const summary = await callClaude({
      system:
        "Actualizeaza sumarul conversatiei dintre Adi (dezvoltator imobiliar) si JARVIS. " +
        "Pastreaza: subiecte discutate, fapte, sume, termene, decizii, actiuni promise. " +
        "Concis, in romana, maxim 300 de cuvinte. Raspunzi doar cu sumarul.",
      messages: [{
        role: "user",
        content: `SUMAR EXISTENT:\n${state.summary || "(gol)"}\n\nMESAJE NOI:\n${text.slice(0, 8000)}`,
      }],
      maxTokens: 600,
    });
    await query(
      `UPDATE conv_state SET summary = $1, last_summarized_id = $2, updated_at = now() WHERE id = 1`,
      [summary, toFold[toFold.length - 1].id]
    );
    console.log("[history] sumar actualizat, pliat pana la id", toFold[toFold.length - 1].id);
  } catch (e) {
    console.error("[summarize]", e.message);
  }
}
