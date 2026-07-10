/**
 * Resilience (PUR functional): timeout / retry / fallback managers.
 * Doar INFASOARA functii async date — NU cheama vreun provider, NU face fetch,
 * zero importuri/egress. Folosite la activare peste providerAdapter.
 */

/** Ruleaza fn cu timeout; la expirare cheama onTimeout() sau arunca. */
export function withTimeout(fn, ms, onTimeout) {
  return async (...args) => {
    let timer;
    const timeout = new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error("timeout")), Math.max(1, ms || 1));
      if (timer && timer.unref) timer.unref();
    });
    try {
      return await Promise.race([Promise.resolve().then(() => fn(...args)), timeout]);
    } catch (e) {
      if (e && e.message === "timeout" && typeof onTimeout === "function") return onTimeout();
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Reincearca fn de `retries` ori (implicit 2), optional gated de shouldRetry(err). */
export function withRetry(fn, { retries = 2, shouldRetry = () => true } = {}) {
  return async (...args) => {
    let last;
    for (let i = 0; i <= Math.max(0, retries); i++) {
      try { return await fn(...args); }
      catch (e) { last = e; if (i === retries || !shouldRetry(e)) throw e; }
    }
    throw last;
  };
}

/** Ruleaza fn; la esec cheama fallbackFn(err, ...args). */
export function withFallback(fn, fallbackFn) {
  return async (...args) => {
    try { return await fn(...args); }
    catch (e) { if (typeof fallbackFn === "function") return fallbackFn(e, ...args); throw e; }
  };
}
