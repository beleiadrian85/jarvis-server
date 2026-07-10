/**
 * Cache in-memory (prompt cache / reasoning cache). Factory pur; instanta cu stare
 * locala (Map), FARA IO/DB/fetch/persistenta/egress. LRU + TTL optional.
 * Un singur modul, folosit pentru ambele scopuri (fara duplicare).
 */
export function createCache({ maxEntries = 500, ttlMs = 0 } = {}) {
  const store = new Map(); // key → { value, exp, hits }
  let hits = 0, misses = 0;

  function get(key) {
    const e = store.get(key);
    if (!e) { misses++; return undefined; }
    if (e.exp && e.exp < Date.now()) { store.delete(key); misses++; return undefined; }
    e.hits++; hits++;
    store.delete(key); store.set(key, e); // LRU touch
    return e.value;
  }
  function set(key, value) {
    if (store.has(key)) store.delete(key);
    store.set(key, { value, exp: ttlMs ? Date.now() + ttlMs : 0, hits: 0 });
    while (store.size > Math.max(1, maxEntries)) store.delete(store.keys().next().value);
    return value;
  }
  function has(key) { return get(key) !== undefined; }
  function clear() { store.clear(); hits = 0; misses = 0; }
  function stats() {
    const total = hits + misses;
    return { size: store.size, hits, misses, hitRate: total ? Math.round((hits / total) * 100) / 100 : 0 };
  }
  return { get, set, has, clear, stats };
}
