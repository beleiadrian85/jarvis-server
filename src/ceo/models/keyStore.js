// KEY STORE (§13) — cheile API ale providerilor se stocheaza CRIPTAT (AES-256-GCM),
// niciodata in text clar in jarvis_state si niciodata afisate inapoi in UI. Cheia de
// criptare se deriva din APP_SECRET (scrypt). Se poate seta, verifica (test API), sterge
// — dar NU citi valoarea in clar prin API. JARVIS nu cere parola contului ChatGPT.
import crypto from "node:crypto";
import { config } from "../../config.js";
let _state = null;
async function getState(k, f) { if (!_state) _state = await import("../../state.js"); return _state.getState(k, f); }
async function setState(k, v) { if (!_state) _state = await import("../../state.js"); return _state.setState(k, v); }
const KEY = "ceo:models:keys";
// Cache sincron al providerilor cu cheie stocata (providerEnabled e sync).
const _keyed = new Set();
export function hasKeyCached(provider) { return _keyed.has(provider); }
/** Incarca la boot ce chei sunt stocate (fara a le decripta). */
export async function primeKeyCache({ store } = {}) {
  try { const s = store || { get: getState }; const db = (await s.get(KEY, null)) || { keys: {} };
    _keyed.clear(); for (const k of Object.keys(db.keys || {})) _keyed.add(k); } catch { /* best-effort */ }
  return [..._keyed];
}

function deriveKey(salt) {
  const secret = config.appSecret || "jarvis-fallback-secret";
  return crypto.scryptSync(String(secret), salt, 32);
}

/** Cripteaza o cheie API. @returns record fara plaintext. */
export function encryptSecret(plaintext) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = deriveKey(salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { alg: "aes-256-gcm", salt: salt.toString("base64"), iv: iv.toString("base64"), tag: tag.toString("base64"), ct: ct.toString("base64"), fingerprint: sha8(plaintext), created_at: new Date().toISOString() };
}

function decryptSecret(rec) {
  const key = deriveKey(Buffer.from(rec.salt, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(rec.iv, "base64"));
  decipher.setAuthTag(Buffer.from(rec.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(rec.ct, "base64")), decipher.final()]).toString("utf8");
}
function sha8(s) { return crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 8); }

/** Salveaza cheia unui provider (criptat). NU o afiseaza inapoi. */
export async function setProviderKey(provider, plaintext, { store } = {}) {
  if (!plaintext || String(plaintext).length < 8) return { ok: false, reason: "cheie prea scurta / lipsa" };
  const s = store || { get: getState, set: setState };
  const db = (await s.get(KEY, null)) || { keys: {} };
  db.keys[provider] = encryptSecret(String(plaintext).trim());
  await s.set(KEY, db);
  _keyed.add(provider);
  return { ok: true, provider, fingerprint: db.keys[provider].fingerprint, stored_encrypted: true };
}

/** Are provider cheie stocata? (fara a o dezvalui) */
export async function hasProviderKey(provider, { store } = {}) {
  const s = store || { get: getState };
  const db = (await s.get(KEY, null)) || { keys: {} };
  return !!db.keys[provider];
}

/** Obtine cheia in clar DOAR pentru apel intern (nu prin API). */
export async function getProviderKey(provider, { store } = {}) {
  const s = store || { get: getState };
  const db = (await s.get(KEY, null)) || { keys: {} };
  const rec = db.keys[provider];
  if (!rec) return null;
  try { return decryptSecret(rec); } catch { return null; }
}

/** Sterge cheia unui provider. */
export async function deleteProviderKey(provider, { store } = {}) {
  const s = store || { get: getState, set: setState };
  const db = (await s.get(KEY, null)) || { keys: {} };
  delete db.keys[provider];
  await s.set(KEY, db);
  _keyed.delete(provider);
  return { ok: true };
}

/** Metadate cheie (fara valoare): fingerprint + data — pentru UI. */
export async function keyMeta({ store } = {}) {
  const s = store || { get: getState };
  const db = (await s.get(KEY, null)) || { keys: {} };
  const out = {};
  for (const [prov, rec] of Object.entries(db.keys)) out[prov] = { fingerprint: rec.fingerprint, created_at: rec.created_at, stored_encrypted: true };
  return out;
}
