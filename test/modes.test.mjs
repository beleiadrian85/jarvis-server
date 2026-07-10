import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveModes } from "../src/modes.js";

// Normal.
const n = resolveModes({});
assert.deepEqual(n, { shadow: false, dryRun: false, strategy: false, canSend: true, canExecute: true, describe: "normal" });
console.log("✅ normal → canSend/canExecute true");

// Shadow → NU trimite/executa.
const sh = resolveModes({ shadow: true });
assert.equal(sh.shadow, true);
assert.equal(sh.canSend, false);
assert.equal(sh.canExecute, false);
console.log("✅ shadow → canSend/canExecute false");

// Dry-run → NU executa.
const dr = resolveModes({ dryRun: true });
assert.equal(dr.canExecute, false);
console.log("✅ dry-run → canExecute false");

// Strategy on.
assert.equal(resolveModes({ strategy: true }).strategy, true);

// describe combinat.
assert.equal(resolveModes({ shadow: true, strategy: true }).describe, "shadow+strategy");
console.log("✅ describe combinat");

// determinist + input invalid.
assert.deepEqual(resolveModes({ shadow: true }), resolveModes({ shadow: true }));
for (const bad of [null, undefined, 42, "x", []]) assert.equal(resolveModes(bad).describe, "normal");
console.log("✅ determinist + rezilient");

const src = fs.readFileSync(new URL("../src/modes.js", import.meta.url), "utf8");
assert.ok(!/\bfetch\s*\(/.test(src) && !/https?:\/\//.test(src) && !/^\s*import\s/m.test(src) && !/\brequire\s*\(/.test(src));
console.log("✅ EGRESS=NU\nTOATE TRECUTE — modes");
