# CHANGE CONTROL — Controlul Schimbării

> Fluxul obligatoriu prin care orice regulă, funcționalitate sau aliniere CODEX
> ajunge (sau nu ajunge) în producție. Nimic nu ocolește acest flux.

---

## Fluxul obligatoriu

```
Observare → Problemă → Date → Propunere → Impact → Riscuri → Alternative
   → Aprobare Adrian → Implementare Claude Code → Testare → Deploy controlat
   → Audit → Învățare
```

Fiecare etapă are un rol clar și nu poate fi sărită:

| # | Etapă | Ce se produce | Cine |
|---|---|---|---|
| 1 | **Observare** | Un semnal: un simptom, o repetiție, o pierdere de timp | Sistem / Adrian |
| 2 | **Problemă** | Formularea problemei conform [Regula Zero](../00-governance/RULE_ZERO.md) | Propunător |
| 3 | **Date** | Dovezi din cod, DB, OPERATIONAL, istoric — nu presupuneri | Propunător |
| 4 | **Propunere** | Soluția concretă, cu fișiere/module atinse | Claude Code |
| 5 | **Impact** | Ce se schimbă în arhitectură; verificarea non-regresiei | Claude Code |
| 6 | **Riscuri** | Ce poate merge prost + plan de rollback | Claude Code |
| 7 | **Alternative** | Cel puțin o alternativă considerată și de ce a fost respinsă | Claude Code |
| 8 | **Aprobare Adrian** | DA / NU / AMÂNĂ explicit | **Adrian** |
| 9 | **Implementare** | Cod gated (flag implicit off), reversibil | Claude Code |
| 10 | **Testare** | Teste care trec + validare pe comportament real | Claude Code |
| 11 | **Deploy controlat** | Activare graduală, cu kill-switch pregătit | Claude Code |
| 12 | **Audit** | Verificare post-deploy: funcționează? regresie? | Claude Code + Adrian |
| 13 | **Învățare** | Ce am învățat → înapoi în CODEX (memorie/evoluție) | CODEX |

Nicio etapă cu efect (9–11) nu începe fără etapa 8.

---

## Reguli obligatorii (linii roșii ale acestei etape)

Următoarele sunt **interzise** în etapa curentă și nu se ating fără o aprobare
explicită, separată, per-caz, de la Adrian:

- ❌ Nu modifica schema bazei de date.
- ❌ Nu modifica autentificarea.
- ❌ Nu modifica permisiunile.
- ❌ Nu modifica integrările existente (MCP Operational, Google, Telegram, Railway).
- ❌ Nu redenumi JARVIS în CODEX (nici proiectul, repo, servicii, DB, variabile, rute).
- ❌ Nu crea agenți activi.
- ❌ Nu implementa automatizări care pot scrie în OPERATIONAL.
- ❌ Nu face deploy.
- ❌ Nu presupune ce face proiectul — verifică repository-ul.
- ❌ Nu declara ceva funcțional fără dovadă în cod și teste.
- ❌ Nu șterge cod vechi.
- ❌ Nu refactoriza în afara scopului.

---

## Principii de implementare (când se ajunge la etapa 9)

Preluate din practica deja stabilită în JARVIS (flag-uri gated, reversibilitate):

1. **Gated by default.** Orice comportament nou intră în spatele unui flag de
   mediu, implicit **oprit** (ex. modelul `PREDICTION_ENGINE=off`, `STRATEGY_ROUTING=off`,
   `DECISION_ENGINE=off`). Activarea e o decizie separată.
2. **Reversibil.** Fiecare schimbare are un kill-switch clar și un commit ușor de revertit.
3. **Non-regresie dovedită.** Cu flag-ul oprit, comportamentul e identic cu cel dinainte.
4. **Testat înainte de activare.** Teste care trec + o probă pe comportament real.
5. **Un pas o dată.** O zonă migrată pe rând, nu rescriere completă.

---

## Ce se întâmplă la conflict CODEX ↔ cod

Dacă un document CODEX descrie un comportament diferit de ce face codul:

1. **Nu** modifica codul ca să se potrivească documentului.
2. **Nu** modifica documentul ca să scuze codul.
3. Deschide o intrare în [`../decisions/DECISION_LOG.md`](../decisions/DECISION_LOG.md)
   care descrie conflictul, cu dovezi.
4. Prezintă-l lui Adrian. El decide direcția.

Conflictul este informație valoroasă, nu un bug de ascuns.
