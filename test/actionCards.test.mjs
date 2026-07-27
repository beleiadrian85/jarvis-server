// ACTION CARDS — propuneri executabile, token semnat, executie idempotenta TASKS-only,
// invatare, autonomie controlata. node test/actionCards.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";
process.env.APP_SECRET ||= "test-secret-1234567890";

import { classifyActionType, buildActionCard, renderCard, buttonsFor, NEVER_AUTONOMOUS } from "../src/ceo/actions/actionCard.js";
import { signActionToken, verifyActionToken, payloadHash } from "../src/ceo/actions/actionToken.js";
import { saveCard, transitionCard, canTransition } from "../src/ceo/actions/actionStore.js";
import { executeAction } from "../src/ceo/actions/executor.js";
import { situationFingerprint, updatePreferences, buildDecisionExample, shouldAskReason } from "../src/ceo/actions/decisionLearning.js";
import { proposeRuleFromPreference, decidePolicy, canActivate } from "../src/ceo/actions/autonomyPolicy.js";
import { assertNoHiddenActions, finalizeManagerialOutput } from "../src/ceo/managerialFinalizer.js";
import { config } from "../src/config.js";
config.appSecret = "test-secret-1234567890"; // config citeste APP_SECRET la import (hoisting)

let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(`${c ? "✅" : "❌"} ${n}. ${m}`); if (!c) failed++; };
const mkStore = () => { const mem = {}; return { get: async (k, f) => (k in mem ? mem[k] : f), set: async (k, v) => { mem[k] = v; }, _mem: mem }; };

// ══ CLASIFICARE ══
ok(classifyActionType({ kind: "payment", transfers_money: true }).action_type === "APPROVAL_REQUIRED" || classifyActionType({ kind: "payment", transfers_money: true }).action_type === "FORBIDDEN", "plata (bani) → NU auto (aprobare/forbidden)");
ok(classifyActionType({ kind: "create_internal_task", tasks_only: true, reversibility: "reversible", risk_level: "low", permission_basis: "tasks_only" }).action_type === "AUTO_EXECUTE", "task intern reversibil TASKS-only → AUTO_EXECUTE");
ok(classifyActionType({ kind: "search_source", tasks_only: true, permission_basis: "role_allowed" }).action_type === "AUTO_EXECUTE", "cautare in sursa accesibila → AUTO_EXECUTE");
ok(classifyActionType({ kind: "reschedule_debt", alternatives: [{ label: "Negociere" }, { label: "Amanare" }] }).action_type === "CHOICE_REQUIRED", "reesalonare cu alternative → CHOICE_REQUIRED");
ok(classifyActionType({ needs_founder_info: true }).action_type === "INFORMATION_REQUIRED", "cere info doar Adrian → INFORMATION_REQUIRED");
ok(classifyActionType({ forbidden: true, permission_basis: "denied", kind: "contract" }).action_type === "FORBIDDEN", "interzis → FORBIDDEN");
// Never-autonomous NICIODATA AUTO_EXECUTE.
let allSafe = true;
for (const k of NEVER_AUTONOMOUS) if (classifyActionType({ kind: k, tasks_only: true, reversibility: "reversible", risk_level: "low", permission_basis: "tasks_only" }).action_type === "AUTO_EXECUTE") allSafe = false;
ok(allSafe, `cele ${NEVER_AUTONOMOUS.length} tipuri never-autonomous → NICIUNUL AUTO_EXECUTE`);

// ══ RANDARE (fara JSON/payload) ══
{ const card = buildActionCard({ title: "Extrasele nu sunt observabile", summary: "Ultimul sold 9 iulie.", kind: "create_internal_task", tasks_only: true, alternatives: [], needs_founder_info: true });
  const r = renderCard(card, { channelSupportsButtons: true });
  ok(!/execution_payload|\{|\}/.test(r.text), "randarea nu contine JSON/payload");
  ok(r.buttons.length >= 1, "randarea are butoane");
  const num = renderCard(card, { channelSupportsButtons: false });
  ok(/1\./.test(num.text), "fallback: optiuni numerotate pt canale fara butoane"); }

// ══ TOKEN SEMNAT ══
const exp = new Date(Date.now() + 3600_000).toISOString();
const payload = { title: "Import extrase", assignee: "dana" };
const tok = signActionToken({ card_id: "card:1", action_id: "a0", user_id: "adrian", conversation_id: "c1", payload, version: 1, expires_at: exp });
ok(verifyActionToken(tok, { card_id: "card:1", action_id: "a0", user_id: "adrian", payload, version: 1 }).valid, "token valid → acceptat");
ok(!verifyActionToken(tok + "x", {}).valid, "token modificat → respins (semnatura)");
ok(!verifyActionToken(tok, { user_id: "nelu" }).valid, "user diferit → respins");
ok(!verifyActionToken(tok, { payload: { title: "ALTCEVA" } }).valid, "payload schimbat → respins");
ok(!verifyActionToken(signActionToken({ card_id: "c", action_id: "a", user_id: "u", payload, expires_at: new Date(Date.now() - 1000).toISOString() }), {}).valid, "token expirat → respins");

// ══ STORE tranzitii ══
ok(canTransition("PROPOSED", "APPROVED") && !canTransition("EXECUTED", "PROPOSED"), "tranzitii de status validate");

// ══ EXECUTOR: idempotent, TASKS-only, revalidare ══
const busCalls = [];
const spyBus = async (kind, pl, opts) => { busCalls.push({ kind, pl, opts }); return { ok: true, operational_id: "OP777" }; };
{ const store = mkStore();
  const card = buildActionCard({ title: "Task Dana", kind: "create_internal_task", tasks_only: true, permission_basis: "tasks_only", owner: "dana", execution_payload: { title: "Import extrase", assignee: "dana" } });
  await saveCard(card, { store });
  const t = signActionToken({ card_id: card.id, action_id: "a0", user_id: "adrian", conversation_id: "c1", payload: card.execution_payload, version: 1, expires_at: card.expires_at });
  const r1 = await executeAction({ token: t, card_id: card.id, action_id: "a0", user_id: "adrian", conversation_id: "c1", commandBus: spyBus, store });
  ok(r1.ok && r1.status === "EXECUTED" && r1.receipt?.operational_id === "OP777", "executie → EXECUTED cu receipt");
  ok(busCalls.length === 1 && busCalls[0].kind === "task", "executie DOAR prin CommandBus kind='task'");
  const r2 = await executeAction({ token: t, card_id: card.id, action_id: "a0", user_id: "adrian", conversation_id: "c1", commandBus: spyBus, store });
  ok(r2.idempotent && busCalls.length === 1, "apasare repetata → idempotent, ZERO duplicat"); }
// Revalidare: stare schimbata → SUPERSEDED, nu executa.
{ const store = mkStore();
  const card = buildActionCard({ title: "x", kind: "create_internal_task", tasks_only: true, permission_basis: "tasks_only", execution_payload: { title: "t" } });
  await saveCard(card, { store });
  const t = signActionToken({ card_id: card.id, action_id: "a0", user_id: "adrian", payload: card.execution_payload, version: 1, expires_at: card.expires_at });
  const r = await executeAction({ token: t, card_id: card.id, action_id: "a0", user_id: "adrian", commandBus: spyBus, store, revalidate: async () => ({ changed: true, reason: "sold actualizat" }) });
  ok(!r.ok && r.status === "SUPERSEDED", "stare schimbata la revalidare → SUPERSEDED (nu executa)"); }
// Token invalid → refuz.
{ const store = mkStore();
  const card = buildActionCard({ title: "x", kind: "create_internal_task", tasks_only: true, permission_basis: "tasks_only", execution_payload: { title: "t" } });
  await saveCard(card, { store });
  const r = await executeAction({ token: "fake.token", card_id: card.id, action_id: "a0", user_id: "adrian", commandBus: spyBus, store });
  ok(!r.ok && /token/.test(r.reason), "token invalid → executie refuzata"); }
// FORBIDDEN nu se executa niciodata.
{ const store = mkStore();
  const card = buildActionCard({ forbidden: true, permission_basis: "denied", kind: "payment", execution_payload: {} });
  await saveCard(card, { store });
  const t = signActionToken({ card_id: card.id, action_id: "a0", user_id: "adrian", payload: card.execution_payload, version: 1, expires_at: card.expires_at });
  const r = await executeAction({ token: t, card_id: card.id, action_id: "a0", user_id: "adrian", commandBus: spyBus, store });
  ok(!r.ok, "FORBIDDEN → nu se executa"); }

// ══ INVATARE: context, nu situatie→buton ══
const fp1 = situationFingerprint({ action_kind: "create_task", risk_level: "low", reversibility: "reversible", owner: "dana", unknowns: [] });
const fp2 = situationFingerprint({ action_kind: "create_task", risk_level: "high", reversibility: "reversible", owner: "dana", unknowns: [] });
ok(fp1 !== fp2, "amprenta difera pe RISC (situatii aparent similare, risc diferit → distincte)");
{ // 4 exemple consistente pe aceeasi amprenta → OBSERVED_PATTERN, nu dintr-un click.
  const card = buildActionCard({ kind: "create_task", risk_level: "low", owner: "dana", title: "t" });
  const examples = [];
  for (let i = 0; i < 5; i++) examples.push(buildDecisionExample(card, { selected_action: "verifica surse intai" }, { nowISO: `2026-07-2${i}T10:00:00.000Z` }));
  const prefs = updatePreferences(examples);
  ok(prefs[0].supporting_examples === 5 && prefs[0].status === "RULE_PROPOSED", "5 exemple consistente → RULE_PROPOSED (nu dintr-un caz)");
  ok(updatePreferences([examples[0]])[0].status === "CANDIDATE", "un singur exemplu → CANDIDATE (nu pattern)"); }
ok(shouldAskReason({ proposed_action: "A" }, { selected_action: "B" }), "alegere diferita de recomandare → cere motiv");
ok(!shouldAskReason({ proposed_action: "A" }, { selected_action: "A" }), "alegere = recomandare → NU cere motiv");

// ══ AUTONOMIE: never-autonomous nu devine ACTIVE; aprobare obligatorie ══
{ const store = mkStore();
  const pref = { id: "pref:pay", scope: "k=payment", conditions: { k: "payment", risk: "low" }, preferred_action: "plateste", supporting_examples: 9, contradicting_examples: 1, confidence: 85, status: "RULE_PROPOSED" };
  const prop = proposeRuleFromPreference(pref);
  ok(prop.forbidden_for_autonomy === true, "regula pe 'payment' → marcata forbidden_for_autonomy");
  const dec = await decidePolicy(prop.draft.id, "APPROVE", { store, draft: prop.draft });
  ok(!dec.ok, "aprobare regula never-autonomous → RESPINSA (ramane per-caz)"); }
{ const store = mkStore();
  const pref = { id: "pref:diag", scope: "k=search_source", conditions: { k: "search_source", risk: "low" }, preferred_action: "verifica surse", supporting_examples: 9, contradicting_examples: 1, confidence: 85, status: "RULE_PROPOSED" };
  const prop = proposeRuleFromPreference(pref);
  const dec = await decidePolicy(prop.draft.id, "APPROVE", { store, draft: prop.draft });
  ok(dec.ok && dec.policy.status === "SUPERVISED", "regula safe aprobata → SUPERVISED (nu direct ACTIVE)");
  const act = await decidePolicy(prop.draft.id, "ACTIVATE", { store });
  ok(!act.ok, "activare fara cazuri/rata → RESPINSA (gard de activare)"); }
ok(!canActivate({ status: "SUPERVISED", approval_source: "adrian", metrics: { cases: 3, accept_rate: 0.5 } }).ok, "canActivate: prea putine cazuri + rata mica → NU");
ok(canActivate({ status: "SUPERVISED", approval_source: "adrian", metrics: { cases: 12, accept_rate: 0.95, recent_corrections: 0 } }).ok, "canActivate: 12 cazuri + 95% + zero corectii → DA");

// ══ FINALIZER: structura + fara actiuni ascunse ══
{ const fin = await finalizeManagerialOutput({ assessment: { decision_context: "x" }, draft: "Uite situatia.", channel: "chat", actionCards: [{ id: "card:1" }], executionReceipts: [] });
  ok(Array.isArray(fin.action_cards) && "message" in fin && "execution_receipts" in fin && "policy_references" in fin, "finalizer returneaza {message, action_cards, execution_receipts, policy_references}"); }
ok(!assertNoHiddenActions("Creez task pentru Dana si trimit solicitarea.", { actionCards: [], executionReceipts: [] }).ok, "actiune in proza fara card/receipt → HIDDEN (respinsa)");
ok(assertNoHiddenActions("Pot crea un task pentru Dana daca vrei.", {}).ok, "'pot crea' (abilitate) → permis fara card");
ok(assertNoHiddenActions("Creez task pentru Dana.", { actionCards: [{ id: "c1" }] }).ok, "actiune CU action card → OK");

// ══ WIRING GUARD structural: actions scriu DOAR prin CommandBus (TASKS-only) ══
{ const { readdirSync, readFileSync } = await import("node:fs");
  const path = await import("node:path"); const { fileURLToPath } = await import("node:url");
  const dir = path.dirname(fileURLToPath(import.meta.url)); const aDir = path.join(dir, "..", "src", "ceo", "actions");
  const all = readdirSync(aDir).filter((f) => f.endsWith(".js")).map((f) => readFileSync(path.join(aDir, f), "utf8")).join("\n");
  ok(!/from\s+["'][^"']*(taskflow|approvalGate)\.js["']/.test(all), "actions NU importa executie directa (taskflow/approvalGate)");
  ok(!/(create_task|update_task|delete_task)\s*\(/.test(all), "actions NU apeleaza direct create/update/delete_task");
  ok(/operationalWrite\.js/.test(all), "actions executa DOAR prin CommandBus (operationalWrite)");
  ok(!/CREATE TABLE|ALTER TABLE/i.test(all), "actions nu creeaza schema DB (jarvis_state)"); }

console.log(`\n${n} verificari · ${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — actionCards`);
process.exit(failed === 0 ? 0 : 1);
