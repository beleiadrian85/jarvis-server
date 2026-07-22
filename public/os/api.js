// JARVIS CEO OS — clientul API. Acelasi PIN (x-jarvis-key) ca HUD-ul existent.
// Nicio logica de business aici: doar transport, cache scurt si mod DEMO
// (fixtures etichetate explicit — niciodata confundabile cu realitatea).

export const DEMO = new URLSearchParams(location.search).has("demo");

const KEY_NAME = "jarvis_key";
let key = localStorage.getItem(KEY_NAME) || "";
const cache = new Map(); // path -> { at, data }
const CACHE_TTL = 60_000;

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export function hasKey() { return !!key || DEMO; }
export function setKey(k) { key = k; localStorage.setItem(KEY_NAME, k); }
export function clearKey() { key = ""; localStorage.removeItem(KEY_NAME); cache.clear(); }

async function demoFixture(path) {
  const { fixtures } = await import("./mock/fixtures.js");
  for (const [prefix, data] of Object.entries(fixtures)) {
    if (path === prefix || path.startsWith(prefix + "?")) {
      return typeof data === "function" ? data() : structuredClone(data);
    }
  }
  return { error: "DEMO: fixture lipsa pentru " + path };
}

/** GET cu cache scurt. { fresh: true } ocoleste cache-ul. */
export async function get(path, { fresh = false } = {}) {
  if (DEMO) return demoFixture(path);
  const hit = cache.get(path);
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL) return hit.data;
  const r = await fetch(path, { headers: { "x-jarvis-key": key } });
  if (r.status === 401) { onUnauthorized(); throw new Error("PIN respins"); }
  const data = await r.json().catch(() => ({ error: "raspuns invalid" }));
  if (r.ok) cache.set(path, { at: Date.now(), data });
  return data;
}

export async function post(path, body) {
  if (DEMO) {
    // POST-urile read-only (ex. Board — o „ședință" calculată) au fixture și se
    // randează în demo; scrierile reale (fără fixture) rămân blocate.
    const { fixtures } = await import("./mock/fixtures.js");
    if (Object.keys(fixtures).some((p) => path === p || path.startsWith(p + "?"))) return demoFixture(path);
    return { ok: false, error: "MOD DEMO — acțiunile reale sunt dezactivate." };
  }
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-jarvis-key": key },
    body: JSON.stringify(body || {}),
  });
  if (r.status === 401) { onUnauthorized(); throw new Error("PIN respins"); }
  const data = await r.json().catch(() => ({ error: "raspuns invalid" }));
  cache.clear(); // orice scriere poate schimba realitatea → recitim
  return data;
}

/** Verifica PIN-ul contra /api/status. */
export async function verifyKey(k) {
  if (DEMO) return true;
  const r = await fetch("/api/status", { headers: { "x-jarvis-key": k } });
  return r.ok;
}

export function invalidate() { cache.clear(); }
