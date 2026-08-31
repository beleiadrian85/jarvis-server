// CLOSEOUT Faza 5 (model managerial Adrian) + Faza 6 (bucla feedback). node test/closeoutPhase56.test.mjs
process.env.ANTHROPIC_API_KEY = "dummy";
process.env.TELEGRAM_BOT_TOKEN = "dummy";
process.env.TELEGRAM_OWNER_CHAT_ID = "1";
const { classifyManagerialFeedback, recordManagerialFeedback, managerialFeedbackForPrompt, MANAGERIAL_THINKING_PROMPT } = await import("../src/ceo/founderModel.js");

let failed = 0, n = 0;
const ok = (c, m) => { n++; console.log(`${c ? "✅" : "❌"} ${n}. ${m}`); if (!c) failed++; };
const mkStore = () => { const mem = {}; return { get: async (k, f) => (k in mem ? mem[k] : f), set: async (k, v) => { mem[k] = v; }, _mem: () => mem }; };

// FAZA 5: gandire manageriala + separare FACT/INFERENCE/RECOMMENDATION.
ok(/1\)/.test(MANAGERIAL_THINKING_PROMPT) && /11\)/.test(MANAGERIAL_THINKING_PROMPT) && /Impact financiar/.test(MANAGERIAL_THINKING_PROMPT), "11 pasi de gandire manageriala prezenti");
ok(/FAPT/.test(MANAGERIAL_THINKING_PROMPT) && /INFERENȚĂ/.test(MANAGERIAL_THINKING_PROMPT) && /RECOMANDARE/.test(MANAGERIAL_THINKING_PROMPT), "separare FACT/INFERENCE/RECOMMENDATION");
ok(/Nu prezenta inferentele ca fapte/.test(MANAGERIAL_THINKING_PROMPT), "regula: inferentele NU se prezinta ca fapte");

// FAZA 6: clasificare feedback.
ok(classifyManagerialFeedback("da, de acord, asa facem").type === "accepted", "accepted");
ok(classifyManagerialFeedback("nu, nu facem asa").type === "rejected", "rejected");
ok(classifyManagerialFeedback("nu e corect, de fapt ai presupus").type === "corrected", "corrected (bate reject)");
ok(classifyManagerialFeedback("mai bine schimba, prefer sa facem altfel").type === "modified", "modified");
ok(classifyManagerialFeedback("cat e ora azi").type === null, "mesaj neutru → niciun feedback");

// FAZA 6: inregistrare + calibrare.
{
  const store = mkStore();
  await recordManagerialFeedback({ recommendation: "RECOMANDARE: amana plata furnizor X", userMessage: "nu, resping", store });
  await recordManagerialFeedback({ recommendation: "RECOMANDARE: cere avans 30%", userMessage: "da, de acord", store });
  const fb = store._mem()["ceo:managerial-feedback"];
  ok(fb.counts.rejected === 1 && fb.counts.accepted === 1 && fb.items.length === 2, "feedback inregistrat cu recomandare+decizie+timestamp+counts");
  ok(fb.items[0].at && fb.items[0].recommendation && fb.items[0].type, "fiecare intrare: recomandare + tip + timestamp");
  const p = managerialFeedbackForPrompt(fb);
  ok(/CALIBRARE/.test(p) && /respins 1/.test(p) && /acceptat 1/.test(p), "calibrare in prompt (ce accepta/respinge Adrian)");
  ok(managerialFeedbackForPrompt({ counts: {}, items: [] }) === "", "fara istoric → fara zgomot in prompt");
}

console.log(`\n${n} verificari · ${failed === 0 ? "TOATE TRECUTE" : failed + " ESUATE"} — closeout faza 5+6`);
process.exit(failed === 0 ? 0 : 1);
