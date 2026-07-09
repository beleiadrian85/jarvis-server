/**
 * S5 — Rate-limiting minimal in-memory + lockout la chei gresite.
 * Mono-instanta (JARVIS ruleaza intr-un singur proces) — suficient pentru
 * un singur utilizator. Fara dependente externe.
 *
 * - rateLimit({windowMs,max,prefix}) → middleware Express (429 la depasire).
 * - isLockedOut / noteAuthFail / clearAuthFail → lockout pe IP dupa chei gresite.
 */

const buckets = new Map();   // key → { count, resetAt }
const lockouts = new Map();  // ip  → { fails, until }

const MAX_FAILS = 5;              // chei gresite pana la blocare
const LOCK_MS = 15 * 60_000;      // durata blocarii

function hit(key, windowMs, max) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt < now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  return b.count <= max;
}

/** Middleware Express: limiteaza numarul de cereri per IP pe o fereastra. */
export function rateLimit({ windowMs, max, prefix = "rl" }) {
  return (req, res, next) => {
    const key = `${prefix}:${req.ip || "?"}`;
    if (!hit(key, windowMs, max)) {
      res.set("retry-after", String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: "Prea multe cereri. Reincearca mai tarziu." });
    }
    next();
  };
}

/** true daca IP-ul e blocat acum (prea multe chei gresite). */
export function isLockedOut(ip) {
  const l = lockouts.get(ip);
  if (!l) return false;
  if (l.until > Date.now()) return true;
  // curata DOAR un lockout expirat; NU sterge un contor de esecuri in acumulare (until===0).
  if (l.until !== 0 && l.until <= Date.now()) lockouts.delete(ip);
  return false;
}

/** Inregistreaza o cheie gresita; intoarce true daca IP-ul tocmai a fost blocat. */
export function noteAuthFail(ip) {
  const now = Date.now();
  let l = lockouts.get(ip);
  if (!l) l = { fails: 0, until: 0, ts: now };
  else if (l.until !== 0 && l.until <= now) l = { fails: 0, until: 0, ts: now }; // lockout expirat → reset
  else if (now - l.ts > LOCK_MS) l = { fails: 0, until: 0, ts: now };            // esecuri prea vechi → reset
  l.fails++;
  l.ts = now;
  if (l.fails >= MAX_FAILS) l.until = now + LOCK_MS;
  lockouts.set(ip, l);
  return l.until > now;
}

/** Reset dupa o autentificare reusita. */
export function clearAuthFail(ip) {
  lockouts.delete(ip);
}

// Igienizare periodica ca hartile sa nu creasca la infinit.
const gc = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
  for (const [k, l] of lockouts) {
    const locked = (l.until || 0) > now;
    if (!locked && now - (l.ts || 0) > LOCK_MS) lockouts.delete(k);
  }
}, 5 * 60_000);
gc.unref?.();
