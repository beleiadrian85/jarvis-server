# CODEX VERSIONING — Versionarea și Evoluția CODEX

> Cum evoluează CODEX-ul însuși: cum se numerotează versiunile, ce declanșează o
> versiune nouă și cum rămâne trasabilă istoria guvernanței.

---

## 1. Schema de versiuni

CODEX folosește versionare semantică adaptată: **MAJOR.MINOR.PATCH**.

| Componentă | Crește când… | Exemplu |
|---|---|---|
| **MAJOR** | se schimbă o lege fundamentală (Manifest, Constituție, ierarhia de priorități) | `1.0.0` |
| **MINOR** | se adaugă un engine/zonă nouă sau un capitol nou de guvernanță | `0.2.0` |
| **PATCH** | corecții, clarificări, completări fără schimbare de comportament | `0.1.1` |

Versiunea curentă a scheletului: **`0.1.0`**.

## 2. Ce declanșează o versiune nouă

- Un document nou de guvernanță intră în vigoare (după aprobare) → MINOR.
- Se activează controlat un comportament CODEX în producție → MINOR + intrare în
  [`DECISION_LOG`](../decisions/DECISION_LOG.md).
- Se amendează Constituția sau Manifestul → MAJOR.
- Se clarifică/corectează un document fără efect pe comportament → PATCH.

## 3. Reguli de evoluție

1. **Nicio versiune nu sare Change Control.** O versiune nouă reflectă o schimbare
   care a trecut deja prin [flux](../15-security-engine/CHANGE_CONTROL.md).
2. **Istoria nu se rescrie.** Documentele vechi nu se șterg; se marchează
   „înlocuit de …" și se păstrează pentru trasabilitate.
3. **Fiecare bump are o urmă** în DECISION_LOG: ce s-a schimbat, de ce, cine a aprobat.
4. **Versiunea CODEX ≠ versiunea aplicației.** `package.json` versionează JARVIS
   (motorul). CODEX își versionează separat guvernanța. Nu se confundă.

## 4. Jurnalul de versiuni

| Versiune | Dată | Schimbare | Aprobat |
|---|---|---|---|
| `0.1.0` | 2026-07-17 | Schelet inițial: structură foldere + documente de guvernanță de bază (Manifest, Constituție Executivă, Regula Zero, Board proiectat, Decision Engine documentat, Change Control, Founder DNA schelet). Niciun cod activ. | în așteptarea ratificării de către Adrian |

## 5. Relația cu evoluția companiei

CODEX evoluează odată cu compania. Ce învață sistemul (etapa „Învățare" din Change
Control) se întoarce aici ca versiune nouă de guvernanță — astfel încât regulile
de mâine să fie mai bune decât cele de azi, dar niciodată pe ascuns.
