// Teste Master Phase 4 — LEVEL 2 acceptance A-L. node test/ceoLevel2.test.mjs
process.env.ANTHROPIC_API_KEY ||= "dummy";
process.env.TELEGRAM_BOT_TOKEN ||= "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID ||= "1";
delete process.env.CEO_INFOREQUEST_DELIVERY_ENABLED;

const { config } = await import("../src/config.js");
const { allowedLevelFor, deliverApprovedRequest, correlateResponse, composeRequestMessage } = await import("../src/ceo/requestDelivery.js");
const { computeMinimumCash } = await import("../src/ceo/cashIntelligence.js");
const { buildReconciliationReport } = await import("../src/ceo/nervousSystem.js");
const { FORECAST_POLICY, confirmedForCash } = await import("../src/ceo/receivablesEngine.js");
const { validateBalanceEntry } = await import("../src/ceo/balanceStore.js");

let failed = 0;
const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failed++; };

// Politica de autonomie impusa in cod (§15).
ok(config.inforeqDelivery === false, "CEO_INFOREQUEST_DELIVERY_ENABLED implicit OFF");
ok(allowedLevelFor("information_request", { inforeqDelivery: false }) === 1, "flag OFF → chiar inforeq = LEVEL 1");
ok(allowedLevelFor("information_request", { inforeqDelivery: true }) === 2, "EXCEPTIA UNICA: inforeq + flag = LEVEL 2");
for (const t of ["task", "system_improvement", "decision", "data_connection"])
  ok(allowedLevelFor(t, { inforeqDelivery: true }) === 1, `${t} ramane LEVEL 1 chiar cu flag ON`);

// Store injectat pentru A-D.
const mkStore = (init) => { const db = { "ceo:proposals": init }; return { get: async (k, f) => db[k] ?? f, set: async (k, v) => { db[k] = v; }, db }; };
const PROP = (state = "approved", delivery = null) => ({
  "prop:inforeq:cash": {
    proposal_id: "prop:inforeq:cash", state, source: "data-gap-engine",
    problem: "Sold bancar", recommendation: "Cere: Introdu soldurile pana la 09:00.",
    task_proposal: { assignee: "Dana", sent: false }, ...(delivery ? { delivery } : {}),
  },
});
const CFG_ON = { inforeqDelivery: true };
let sent = [];
const send = async (chat, text) => { sent.push({ chat, text }); return { message_id: 42 }; };
process.env.TG_DANA_TEST = "555001"; // mapping simulat prin env? — nu: identityFor citeste config; simulam prin state-mapping imposibil fara DB → test D intai.

// D. Fara identity mapping → 0 outbound + blocked.
let st = mkStore(PROP("approved"));
const rD = await deliverApprovedRequest("prop:inforeq:cash", { send, cfg: CFG_ON, store: st });
ok(rD.status === "DELIVERY_BLOCKED_NO_IDENTITY" && sent.length === 0, "D. fara mapping → blocat, 0 outbound");

// Simulam mapping prin env pe persoana (companyConfig: adrian are telegram_env).
// Pentru Dana in teste: folosim assignee Adrian (env TELEGRAM_OWNER_CHAT_ID=1).
const PROPA = (state = "approved", delivery = null) => ({
  "prop:inforeq:cash": { ...PROP(state, delivery)["prop:inforeq:cash"], task_proposal: { assignee: "Adrian", sent: false } },
});

// A. Propus, neaprobat → 0 outbound.
sent = []; st = mkStore(PROPA("draft"));
const rA = await deliverApprovedRequest("prop:inforeq:cash", { send, cfg: CFG_ON, store: st });
ok(rA.status === "FAILED" && sent.length === 0, "A. neaprobat → 0 outbound");

// Flag OFF → 0 outbound chiar aprobat.
sent = []; st = mkStore(PROPA("approved"));
const rOff = await deliverApprovedRequest("prop:inforeq:cash", { send, cfg: { inforeqDelivery: false }, store: st });
ok(rOff.status === "FAILED" && sent.length === 0, "flag OFF → 0 outbound chiar cu APPROVE");

// B. Aprobat + flag → EXACT 1 outbound.
sent = []; st = mkStore(PROPA("approved"));
const rB = await deliverApprovedRequest("prop:inforeq:cash", { send, cfg: CFG_ON, store: st });
ok(rB.status === "SENT" && sent.length === 1 && rB.message_id === 42, "B. aprobat → EXACT 1 outbound (cu message_id)");
ok(st.db["ceo:proposals"]["prop:inforeq:cash"].delivery.status === "AWAITING_RESPONSE", "starea → AWAITING_RESPONSE");

// C. Dublu click → tot 1 outbound (idempotent).
const rC = await deliverApprovedRequest("prop:inforeq:cash", { send, cfg: CFG_ON, store: st });
ok(sent.length === 1 && /deja trimis/.test(rC.note || ""), "C. dublu APPROVE&SEND → 1 outbound total");

// E. Raspuns valid → gap inchis + COMPLETED.
const rE = await correlateResponse("cash", { valid: true, note: "sold introdus", store: st });
ok(rE.gap_closed === true && st.db["ceo:proposals"]["prop:inforeq:cash"].delivery.status === "COMPLETED", "E. raspuns valid → COMPLETED, gap inchis");

// F. Raspuns invalid/stale → gap ramane deschis.
st = mkStore(PROPA("approved", { status: "AWAITING_RESPONSE", sent: true }));
const rF = await correlateResponse("cash", { valid: false, note: "sold mai vechi de 72h", store: st });
ok(rF.gap_closed === false && st.db["ceo:proposals"]["prop:inforeq:cash"].delivery.status === "RECEIVED", "F. raspuns invalid → gap DESCHIS");

// Esec de canal → FAILED, fara stare SENT.
sent = []; st = mkStore(PROPA("approved"));
const rFail = await deliverApprovedRequest("prop:inforeq:cash", { send: async () => { throw new Error("telegram down"); }, cfg: CFG_ON, store: st });
ok(rFail.status === "FAILED" && st.db["ceo:proposals"]["prop:inforeq:cash"].delivery.status === "FAILED", "canal picat → FAILED auditat, retrimitere posibila");

// J. Sold prezent → lichiditate calculabila. K. Expirat → UNKNOWN + confidence jos.
const OB = [{ dueDate: "2026-07-30", amountRON: 416000, category: "Credit" }];
ok(typeof computeMinimumCash({ asOf: "2026-07-21", bankBalance: 500000, confirmedReceivables: [], obligations: OB }).minimum_cash === "number", "J. sold prezent → minim calculabil");
ok(computeMinimumCash({ asOf: "2026-07-21", bankBalance: null, obligations: OB }).available_now === "UNKNOWN", "K. sold lipsa/expirat → UNKNOWN (confidence scazuta)");
ok(validateBalanceEntry({ bank: "ING", account: "5013", currency: "RON", available: -12000, enteredBy: "Dana" }).valid, "overdraft (sold negativ) = REAL, acceptat si marcat");

// L. Divergenta SmartBill → raport + propunere GRUPATA, zero auto-corectie.
const rep = buildReconciliationReport({
  recResults: [
    { ref: "SB 1", client: "X", totalRON: 100, paidRON: 100, unpaidRON: 0 },
    { ref: "SB 2", client: "Y", totalRON: 200, paidRON: 0, unpaidRON: 200 },
  ],
  incomeInvoices: [{ ref: "SB 1", client: "X", amountRON: 100, remainingRON: 100 }, { ref: "SB 2", client: "Y", amountRON: 200, remainingRON: 200 }],
  bankLines: [],
});
ok(rep.divergences === 1 && rep.rows[0].needs_human_review === true, "L. divergenta detectata (SmartBill zice platit, Operational nu)");
ok(rep.grouped_review_proposal?.no_auto_correction === true && /1 facturi/.test(rep.grouped_review_proposal.ask), "L. UN request grupat, zero auto-corectie");

// Politica de forecast: nu se umfla lichiditatea.
ok(FORECAST_POLICY.PROBABLE === 0 && FORECAST_POLICY.OVERDUE < 1, "politica explicita: probable NU intra; overdue ponderat");
const cf = confirmedForCash({ items: [{ state: "OVERDUE", remainingRON: 1000, dueDate: "2026-07-01" }] });
ok(cf[0].amountRON === 600, "overdue ponderat 0.6 in forecast");

// Mesajul canonic pentru Dana.
const msg = composeRequestMessage(PROP("approved")["prop:inforeq:cash"], { formUrl: "https://x/ceo.html" });
ok(/Dana, Introdu soldurile/.test(msg) && /Formular: https/.test(msg) && /aprobată de Adrian/.test(msg), "mesaj simplu + link formular + proveniensa");

console.log(`\n${failed === 0 ? "TOATE TRECUTE" : failed + " EȘUATE"} — ceoLevel2 (A-L)`);
process.exit(failed === 0 ? 0 : 1);
