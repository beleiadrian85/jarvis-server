// ACTION TOKENS — fiecare buton poarta un token SEMNAT (HMAC-SHA256 cu APP_SECRET),
// legat de card_id + action_id + user_id + conversation_id + payload_hash + expiry +
// versiune. La apasare se verifica autenticitatea + expirarea + legatura. Fara token
// valid → executie refuzata. PUR (crypto). Nu expune secretul.
import crypto from "node:crypto";
import { config } from "../../config.js";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

/** Hash stabil al payload-ului (ca sa detectam schimbarea lui). */
export function payloadHash(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload ?? null)).digest("base64url").slice(0, 16);
}

/** Semneaza un token pentru un buton. @returns string opaque. */
export function signActionToken({ card_id, action_id, user_id, conversation_id, payload, version = 1, expires_at }, secret = config.appSecret) {
  if (!secret) throw new Error("APP_SECRET lipsa — nu pot semna action tokens");
  const claims = {
    c: card_id, a: action_id, u: user_id, k: conversation_id || null,
    h: payloadHash(payload), v: version, e: expires_at,
  };
  const body = b64u(JSON.stringify(claims));
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/**
 * Verifica un token. @returns { valid, claims?, reason? }
 * Verifica: semnatura (constant-time), expirarea, si — daca se dau — potrivirea
 * card/action/user/conversation/payload cu contextul curent.
 */
export function verifyActionToken(token, expected = {}, { secret = config.appSecret, nowMs = null } = {}) {
  if (!secret) return { valid: false, reason: "APP_SECRET lipsa" };
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return { valid: false, reason: "format token invalid" };
  const [body, sig] = parts;
  const expSig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { valid: false, reason: "semnatura invalida (token contrafacut)" };
  let claims;
  try { claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return { valid: false, reason: "claims corupte" }; }
  const now = nowMs || Date.now();
  if (claims.e && Date.parse(claims.e) < now) return { valid: false, reason: "token expirat", claims };
  const exp = isObj(expected) ? expected : {};
  if (exp.card_id && exp.card_id !== claims.c) return { valid: false, reason: "card_id nu se potriveste", claims };
  if (exp.action_id && exp.action_id !== claims.a) return { valid: false, reason: "action_id nu se potriveste", claims };
  if (exp.user_id && exp.user_id !== claims.u) return { valid: false, reason: "user_id nu se potriveste", claims };
  if (exp.conversation_id && claims.k && exp.conversation_id !== claims.k) return { valid: false, reason: "conversation_id nu se potriveste", claims };
  if (exp.payload !== undefined && payloadHash(exp.payload) !== claims.h) return { valid: false, reason: "payload s-a schimbat de la propunere", claims };
  if (exp.version != null && Number(exp.version) !== Number(claims.v)) return { valid: false, reason: "versiune card diferita", claims };
  return { valid: true, claims };
}
