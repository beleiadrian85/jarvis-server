// QUALITY GATE (§13) — evaluator PUR al portilor de calitate.
// Rol: un build ajunge in fata fondatorului DOAR daca fiecare poarta din
// QUALITY_GATES e demonstrata in raportul de build. Gate lipsa si ne-optional
// = picat ("nedemonstrat = picat — CEO AI nu cosmetizeaza"). Doar
// OPTIONAL_GATES pot fi N/A, si doar cu motiv explicit. ZERO IO.

import { QUALITY_GATES, OPTIONAL_GATES } from "./contract.js";

const MISSING_NOTE = "nedemonstrat = picat — CEO AI nu cosmetizeaza";

// ── Derivari din raportul de build (cand gate-ul explicit lipseste) ─────
function deriveGate(gate, buildReport) {
  if (gate === "unit_tests" && buildReport?.tests && typeof buildReport.tests === "object") {
    const failed = Number(buildReport.tests.failed) || 0;
    const passed = Number(buildReport.tests.passed) || 0;
    if (failed > 0) return { ok: false, note: `${failed} teste picate` };
    if (passed > 0) return { ok: true, note: `${passed} teste trecute, 0 picate` };
    return null; // zero teste rulate = nedemonstrat
  }
  return null;
}

// ── §13 — Evaluarea tuturor portilor ────────────────────────────────────

export function evaluateQualityGates(buildReport = {}) {
  const declared = buildReport?.gates && typeof buildReport.gates === "object" ? buildReport.gates : {};

  const gates = QUALITY_GATES.map((gate) => {
    const explicit = declared[gate];
    if (explicit && typeof explicit === "object") {
      // Anti-cosmetizare: un gate declarat trecut nu poate contrazice datele.
      if (gate === "unit_tests" && explicit.ok === true && (Number(buildReport?.tests?.failed) || 0) > 0) {
        return { gate, ok: false, note: "contradictie: gate declarat trecut dar tests.failed > 0 — CEO AI nu cosmetizeaza" };
      }
      if (explicit.ok === "N/A") {
        if (!OPTIONAL_GATES.includes(gate)) {
          return { gate, ok: false, note: `N/A nepermis pentru gate obligatoriu — ${MISSING_NOTE}` };
        }
        return { gate, ok: "N/A", note: explicit.note || "N/A fara motiv declarat — gate optional (§13)" };
      }
      const ok = explicit.ok === true;
      return { gate, ok, note: explicit.note ?? (ok ? "trecut" : "picat") };
    }

    const derived = deriveGate(gate, buildReport);
    if (derived) return { gate, ...derived };

    if (OPTIONAL_GATES.includes(gate)) {
      return { gate, ok: "N/A", note: "fara cale de shadow declarata — gate optional (§13)" };
    }
    return { gate, ok: false, note: MISSING_NOTE };
  });

  const verdict = gates.every((g) => g.ok === true || g.ok === "N/A") ? "PASS" : "BUILD_FAILED";
  return { gates, verdict };
}
