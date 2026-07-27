// MANAGERIAL DECISION ENVELOPE — structured-first, cod determinist construieste
// carduri/tokenuri/receipts. node test/envelope.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";
process.env.APP_SECRET ||= "test-secret-1234567890";

import { config } from "../src/config.js";
config.appSecret = "test-secret-1234567890";
import { buildEnvelope, envelopeToCards, finalizeEnvelope, MANAGERIAL_ACTION_FIELDS } from "../src/ceo/actions/envelope.js";
import { verifyActionToken } from "../src/ceo/actions/actionToken.js";

let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(`${c ? "✅" : "❌"} ${n}. ${m}`); if (!c) failed++; };
const mkStore = () => { const mem = {}; return { get: async (k, f) => (k in mem ? mem[k] : f), set: async (k, v) => { mem[k] = v; } }; };
const busCalls = [];
const spyBus = async (kind, pl) => { busCalls.push({ kind, pl }); return { ok: true, operational_id: "OP900" }; };

// ══ Envelope din output structurat de model (NU regex pe proza) ══
const modelOut = {
  narrative: "Extrasele nu sunt observabile in sursele verificate. Ultimul sold 9 iulie.",
  facts: ["ultimul sold 9 iulie"], unknowns: ["locatia uploadului"],
  actions: [
    { intent: "search_sources", action_kind: "search_source", title: "Verifica sursele accesibile", tasks_only: true, permission_basis: "role_allowed", reversibility: "reversible", risk_level: "low", preferred_execution_mode: "AUTO_EXECUTE" },
    { intent: "create_clarification", action_kind: "create_internal_task", title: "Solicitare pentru Dana", owner: "dana", tasks_only: true, permission_basis: "tasks_only", payload: { title: "Importa extrasele si reconciliaza", assignee: "dana" } },
  ],
  information_requests: [
    { intent: "ask_location", title: "In ce interfata ai incarcat extrasele?", alternatives: [{ label: "Operational" }, { label: "Google Drive" }, { label: "Email" }] },
  ],
};
const env = buildEnvelope(modelOut, { user_id: "adrian", conversation_id: "c1" });
ok(env.actions.length === 3 && env.information_requests.length === 1, "envelope: actions + information_requests separate structural");
ok(MANAGERIAL_ACTION_FIELDS.includes("preferred_execution_mode") && MANAGERIAL_ACTION_FIELDS.includes("founder_reason"), "schema ManagerialAction completa");

// ══ envelopeToCards: clasificare DETERMINISTA + AUTO_EXECUTE prin CommandBus ══
{ const store = mkStore(); busCalls.length = 0;
  const built = await envelopeToCards({ envelope: env, ctx: { user_id: "adrian", conversation_id: "c1" }, commandBus: spyBus, store });
  const autoExec = built.cards.filter((c) => c.card.status === "EXECUTED");
  ok(autoExec.length >= 1, "AUTO_EXECUTE (search) executat singur, cu receipt");
  ok(built.receipts.length >= 1, "receipts produse pentru AUTO_EXECUTE");
  ok(busCalls.every((b) => b.kind === "task"), "executie DOAR prin CommandBus kind='task'");
  // Cardul catre Dana (create_internal_task) e AUTO (tasks_only) → executat.
  // Cardul INFORMATION_REQUIRED ramane interactiv cu butoane.
  const info = built.cards.find((c) => c.card.action_type === "INFORMATION_REQUIRED");
  ok(info && info.buttons.length >= 3, "INFORMATION_REQUIRED → card interactiv cu butoane");
  ok(info.token_map[info.buttons[0].action_id], "fiecare buton are token semnat"); }

// ══ Token generat de cod, legat de card (nu de model) ══
{ const store = mkStore();
  const built = await envelopeToCards({ envelope: buildEnvelope({ actions: [{ action_kind: "reschedule_debt", title: "Reesalonare", alternatives: [{ label: "Negociere" }, { label: "Amanare" }], financial_impact: true }] }, { user_id: "adrian" }), ctx: { user_id: "adrian" }, commandBus: spyBus, store });
  const card = built.cards[0];
  ok(card.card.action_type === "CHOICE_REQUIRED", "reesalonare + alternative → CHOICE_REQUIRED (nu auto)");
  const tk = card.token_map[card.buttons[0].action_id];
  const v = verifyActionToken(tk, { card_id: card.card.id, action_id: card.buttons[0].action_id, user_id: "adrian" });
  ok(v.valid, "tokenul semnat de cod verifica corect"); }

// ══ finalizeEnvelope: structura completa + rendering_hints + management by exception ══
{ const store = mkStore(); busCalls.length = 0;
  const many = buildEnvelope({ narrative: "Situatie.", actions: [
    { action_kind: "payment", title: "Plata furnizor", financial_impact: true, founder_required: true, founder_reason: "angajament financiar" },
    { action_kind: "search_source", title: "Cauta", tasks_only: true, permission_basis: "role_allowed" },
    { action_kind: "create_internal_task", title: "Task A", tasks_only: true, permission_basis: "tasks_only", payload: { title: "A" } },
    { action_kind: "create_internal_task", title: "Task B", tasks_only: true, permission_basis: "tasks_only", payload: { title: "B" } },
    { action_kind: "reschedule_debt", title: "Reesalonare", alternatives: [{ label: "x" }, { label: "y" }] },
  ] }, { user_id: "adrian", conversation_id: "c2" });
  const fin = await finalizeEnvelope({ envelope: many, ctx: { user_id: "adrian", conversation_id: "c2" }, commandBus: spyBus, store, channel: "chat" });
  ok("message" in fin && "action_cards" in fin && "execution_receipts" in fin && "policy_references" in fin && "rendering_hints" in fin, "finalizeEnvelope → {message, action_cards, execution_receipts, policy_references, rendering_hints}");
  ok(fin.action_cards.length <= 3, "management by exception: max 3 carduri principale");
  ok(fin.rendering_hints.founder_attention_required === true, "rendering_hints: founder_attention pt plata/founder");
  ok(fin.action_cards[0].founder_required === true, "prioritizare: decizia Founder Only prima");
  ok(fin.execution_receipts.length >= 1, "AUTO (search/task) executate → receipts atasate");
  // Cardurile publice NU expun payload/token in obiectul cardului (doar in buttons.token opac).
  ok(fin.action_cards.every((c) => !("execution_payload" in c) && !("permission_basis" in c)), "cardurile publice nu expun payload/permission internals"); }

// ══ Fara actiuni ascunse: actiunile sunt STRUCTURALE (nu in proza) ══
{ const store = mkStore();
  const fin = await finalizeEnvelope({ envelope: buildEnvelope({ narrative: "Creez taskul pentru Dana.", actions: [{ action_kind: "create_internal_task", title: "Task Dana", tasks_only: true, permission_basis: "tasks_only", payload: { title: "t" } }] }, { user_id: "adrian" }), ctx: { user_id: "adrian" }, commandBus: spyBus, store });
  ok(fin.hidden_actions.ok, "actiune in narrative + card structural → NU e ascunsa (hidden guard ok)"); }

console.log(`\n${n} verificari · ${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — envelope`);
process.exit(failed === 0 ? 0 : 1);
