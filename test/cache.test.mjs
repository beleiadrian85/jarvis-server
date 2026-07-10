import assert from "node:assert/strict";
import fs from "node:fs";
import { createCache } from "../src/cache.js";

const c = createCache({ maxEntries: 2 });
assert.equal(c.get("a"), undefined);        // miss
c.set("a", 1); c.set("b", 2);
assert.equal(c.get("a"), 1);                // hit
assert.equal(c.has("b"), true);
console.log("✅ get/set/has (hit/miss)");

// LRU pe cache separat: 'a' atins recent → la 'c' se evacueaza 'b' (cel mai vechi).
const lru = createCache({ maxEntries: 2 });
lru.set("a", 1); lru.set("b", 2);
lru.get("a");                               // a most recent, b oldest
lru.set("c", 3);                            // size 3 > 2 → evacueaza b
assert.equal(lru.has("b"), false);          // b evacuat
assert.equal(lru.has("a"), true);           // a supravietuieste
assert.equal(lru.stats().size, 2);
console.log("✅ LRU eviction (maxEntries)");

// TTL.
const t = createCache({ ttlMs: 1 });
t.set("k", 9);
await new Promise((r) => setTimeout(r, 5));
assert.equal(t.get("k"), undefined);        // expirat
console.log("✅ TTL expiry");

// stats + clear.
const s = createCache();
s.set("x", 1); s.get("x"); s.get("y");
const st = s.stats();
assert.equal(st.hits, 1); assert.equal(st.misses, 1); assert.equal(st.hitRate, 0.5);
s.clear();
assert.equal(s.stats().size, 0);
console.log("✅ stats + clear");

// izolare: doua instante nu impart starea.
const a = createCache(), b = createCache();
a.set("k", 1);
assert.equal(b.has("k"), false);
console.log("✅ instante izolate");

const src = fs.readFileSync(new URL("../src/cache.js", import.meta.url), "utf8");
assert.ok(!/\bfetch\s*\(/.test(src) && !/https?:\/\//.test(src) && !/^\s*import\s/m.test(src) && !/\brequire\s*\(/.test(src));
console.log("✅ EGRESS=NU (in-memory, fara IO)\nTOATE TRECUTE — cache");
