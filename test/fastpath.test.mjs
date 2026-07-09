import assert from "node:assert/strict";

// fastPathRouter → capabilities → config; env dummy inainte (import dinamic).
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";

const { fastReply } = await import("../src/fastPathRouter.js");

// 1) Salut → raspuns instant (nu null).
for (const g of ["salut", "Buna!", "hei", "servus jarvis", "noroc"]) {
  const r = fastReply(g);
  assert.ok(r && r.length > 0, `"${g}" ar trebui sa aiba fast-reply`);
}
console.log("✅ salut/buna/hei → instant");

// 2) Multumesc/ok → instant.
for (const t of ["mersi", "multumesc", "ok", "perfect"]) {
  assert.ok(fastReply(t), `"${t}" ar trebui fast-reply`);
}
console.log("✅ multumesc/ok → instant");

// 3) "ce poti face" / ajutor → raspuns de capabilitati (mentioneaza ceva concret).
const help = fastReply("ce poti face");
assert.ok(help && /rapoarte|Operational|task/i.test(help), "help ar trebui sa listeze capabilitati");
assert.ok(fastReply("ajutor"), "ajutor → fast-reply");
console.log("✅ ce poti face / ajutor → capabilitati");

// 4) Mesaj gol → prompt instant.
assert.ok(fastReply("   "), "mesaj gol → fast-reply");
console.log("✅ mesaj gol → prompt");

// 5) NU fura mesaje cu intentie reala (salut + intrebare, operational) → null.
for (const real of [
  "salut, cum stau task-urile lui Nelu",
  "ce face Nelu",
  "cash forecast",
  "creeaza task: suna furnizorul",
  "cum merge cu vanzarile",
]) {
  assert.equal(fastReply(real), null, `"${real}" NU trebuie prins de fast-path`);
}
console.log("✅ mesaje reale/operationale → null (curg normal)");

// 6) Pur/determinist.
assert.equal(fastReply("salut"), fastReply("salut"));
console.log("✅ pur & determinist");

console.log("TOATE TRECUTE — fastPathRouter (L1)");
