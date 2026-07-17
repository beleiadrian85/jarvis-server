# BOARD IMPLEMENTATION PLAN — Planul de implementare Executive Board

> Cum se construiește Executive Board-ul în etape, **fără rescriere** a sistemelor
> existente. Fiecare etapă este reversibilă și nu strică nimic din ce funcționează.
>
> **Stare:** PROIECTAT — implementat GATED, flag implicit OFF, neactivat în producție.
> `approvalGate` rămâne singura poartă pentru acțiuni cu efect. Plățile (Nivel 4)
> sunt excluse total.

---

## 1. Principiul planului

Board-ul nu înlocuiește nimic dintr-o dată. Se construiește **în paralel** cu
Consiliul AI existent (`src/council.js`), în spatele unui flag implicit oprit,
și preia rolul Consiliului doar după paritate dovedită. În orice moment,
oprirea flag-ului readuce sistemul exact la comportamentul actual.

| Etapă | Conținut | Cod în producție afectat | Reversibil |
|---|---|---|---|
| 0 | Documentație + scheme | Zero | — |
| 1 | Module gated în `src/executiveBoard/` + flag OFF | Zero comportament schimbat (flag OFF) | Da (flag) |
| 2 | Teste de acceptanță | Zero | — |
| 3 | Activare SHADOW pe Railway | Răspunsul utilizatorului neschimbat | Da (variabilă) |
| 4 | Activare controlată ACTIVE | Ruta „consiliu" răspunde cu raportul Board | Da (kill-switch) |
| 5 | Migrare graduală council → Board | Retragerea council doar după paritate | Da (flag) |
| 6 | Evoluții ulterioare | Doar prin Change Control | Per propunere |

---

## 2. Etapa 0 — Documentație + scheme (acest set)

Livrabile — fără nicio linie de cod:

- [`BOARD_ARCHITECTURE.md`](BOARD_ARCHITECTURE.md) — ce este, ce nu este, legătura cu JARVIS/OPERATIONAL.
- [`BOARD_ROLES.md`](BOARD_ROLES.md) — cele 12 roluri și mandatul fiecăruia.
- [`BOARD_DECISION_PROTOCOL.md`](BOARD_DECISION_PROTOCOL.md) — convocare, mecanism de decizie, sinteză.
- `BOARD_IMPLEMENTATION_PLAN.md` — acest document.
- Schemele structurilor (poziția directorului, recomandarea finală) — documentate în protocol,
  **fără nicio schemă nouă în baza de date**.

Criteriu de ieșire: setul documentat este coerent cu
[`EXECUTIVE_CONSTITUTION`](../00-governance/EXECUTIVE_CONSTITUTION.md) și
[`FOUNDER_DNA`](../02-founder-dna/FOUNDER_DNA.md), iar Adrian aprobă trecerea la Etapa 1.

---

## 3. Etapa 1 — Module gated în `src/executiveBoard/`

Cod nou, izolat într-un singur folder. **Niciun modul existent nu se rescrie** —
se reutilizează prin import: `riskEngine.js`, `financialBrain/cashForecast`,
`healthScore.js`, `predictionState.js`, `decisionEngine.js`, `memory.js`,
`audit.js`, `approvalGate` (neatins), `council.js` (neatins).

### 3.1 Cele 9 module

| Modul | Responsabilitate |
|---|---|
| `index.js` | API-ul public al Board-ului + determinarea modului (OFF / SHADOW / ACTIVE) din flag-uri. Singurul punct de intrare. |
| `boardRouter.js` | Clasificarea tipului de decizie + selecția directorilor convocați. Funcție pură, fără I/O. |
| `boardRoles.js` | Definițiile celor 12 roluri (mandat, întrebări obligatorii, surse de date). Date pure, fără logică. |
| `boardSession.js` | Orchestrarea ședinței: colectarea datelor deterministe (riskEngine, cashForecast, healthScore, predictionState, memory) + **UN singur apel LLM**, cu timeout și fallback. |
| `boardSynthesis.js` | Sinteza deterministă pură a pozițiilor: consensus_level, major_disagreements, recomandarea agregată. Nu falsifică dezacordurile. |
| `boardValidator.js` | Validarea pură a structurilor (poziție director, recomandare finală). Structură invalidă → nu se emite recomandare. |
| `founderVoice.js` | Founder Voice DETERMINIST: citează doar principiile documentate F01–F40 din FOUNDER_DNA. Nu inventează, nu extrapolează. |
| `guardian.js` | Guardian DETERMINIST: protecția CODEX în cod, nu LLM. Blochează emiterea recomandărilor incomplete sau neconforme. |
| `prompts.js` | Construcția prompturilor per rol și per tip de decizie. Fără apeluri de rețea. |

### 3.2 Flag-uri (implicit OFF)

| Variabilă | Implicit | Efect |
|---|---|---|
| `EXECUTIVE_BOARD_ENABLED` | OFF | OFF → Board-ul nu există la runtime; comportament identic cu azi. |
| `EXECUTIVE_BOARD_SHADOW_MODE` | OFF | ON (cu ENABLED on) → Board-ul analizează în fundal, rezultatul merge **doar în audit_log**; răspunsul utilizatorului rămâne cel al `council.js`. |

`capabilities.js` declară starea Board-ului (activ / shadow / inactiv) — o linie
de raportare, nu de comportament.

### 3.3 Hook minim gated în `brain.js`, pe ruta „consiliu"

Singura atingere a codului existent: un hook minim, cu trei comportamente,

| Mod | Comportament |
|---|---|
| OFF | Identic cu azi. `council.js` neatins, Board-ul nu rulează. |
| SHADOW | `council.js` răspunde utilizatorului; Board-ul analizează în paralel și scrie **doar în audit_log**. |
| ACTIVE | Ruta „consiliu" returnează raportul Board-ului. `council.js` rămâne în cod, disponibil la revert. |

Criteriu de ieșire: cu ambele flag-uri OFF, întreaga suită existentă de comportament
este identică bit cu bit; codul nou nu este importat pe nicio cale caldă.

---

## 4. Etapa 2 — Teste

Testele de acceptanță sunt definite separat, în
[`/codex/tests/EXECUTIVE_BOARD_ACCEPTANCE_TESTS.md`](../tests/EXECUTIVE_BOARD_ACCEPTANCE_TESTS.md).
Ele acoperă cel puțin: non-regresia cu flag OFF, izolarea SHADOW (răspuns neschimbat),
validarea structurilor, comportamentul Guardian și Founder Voice determinist,
`insufficient_data` la date lipsă, timeout/fallback, zero cifre inventate.

Nicio etapă ulterioară nu începe fără trecerea testelor etapei curente.

---

## 5. Etapa 3 — Activare SHADOW pe Railway

- Activarea se face **doar prin variabilă de mediu** pe Railway
  (`EXECUTIVE_BOARD_ENABLED=on`, `EXECUTIVE_BOARD_SHADOW_MODE=on`), **fără nicio
  modificare de cod** și fără deploy nou.
- Perioadă de observare: analizele Board apar exclusiv în `audit_log`
  (prin `audit.js`, fără schimbare de schemă DB).
- Se compară manual: recomandarea Board vs. răspunsul `council.js`, calitatea datelor,
  costul (un apel LLM per ședință), rata de `insufficient_data`, blocările Guardian.

Criteriu de ieșire: un set convenit de ședințe shadow fără structuri invalide
nescoase de validator, fără cifre inventate și cu cost per ședință în limitele constituției.

---

## 6. Etapa 4 — Activare controlată ACTIVE

- Se pornește doar cu aprobarea explicită a lui Adrian.
- **Kill-switch:** oprirea `EXECUTIVE_BOARD_ENABLED` (variabilă pe Railway) readuce
  instantaneu ruta „consiliu" la `council.js`, fără deploy.
- **Protocol de rollback:** la ORICE regresie observată (răspuns greșit, structură
  invalidă emisă, cost anormal, latență inacceptabilă, contradicție neexplicată cu o
  decizie anterioară) → flag OFF imediat, analiza cauzei în audit, fix, re-testare
  (Etapa 2), abia apoi re-activare.
- `council.js` NU se șterge în această etapă — este plasa de siguranță.

---

## 7. Etapa 5 — Migrare graduală council → Board

- Board-ul preia gradual declanșatoarele Consiliului (comanda „consiliu", pragul
  de impact) — fiecare preluare în spatele aceluiași flag.
- **Paritate dovedită** = criteriu obligatoriu înainte de retragerea `council.js`:
  pe un set de întrebări de referință, Board-ul produce recomandări cel puțin la fel
  de bune (acoperire de perspective, calitatea argumentelor, conformitate CODEX),
  fără regresii de cost sau latență peste limitele convenite.
- Retragerea `council.js` este o propunere separată prin
  [Change Control](../15-security-engine/CHANGE_CONTROL.md), aprobată de Adrian.
  Până atunci, coexistă.

---

## 8. Etapa 6 — Evoluții ulterioare (DOAR prin Change Control)

Nimic din lista de mai jos nu se implementează în etapele 0–5. Fiecare intră
separat pe fluxul propunere → aprobare Adrian:

1. **Persistență dedicată a ședințelor** — azi ședințele trăiesc în `audit_log`,
   fără schemă nouă; o tabelă dedicată `board_sessions` este o evoluție viitoare, neaprobată.
2. **Completarea punctelor 21–22 din protocol** (rezultatul real al deciziei + lecția
   învățată) — ca flux separat de follow-up, nu în ședința inițială.
3. **Convocare automată la praguri** (impact financiar, risc, scadențe) — azi Board-ul
   se convoacă doar la cerere explicită pe ruta „consiliu".

---

## 9. Riscurile migrării și mitigări

| Risc | Mitigare |
|---|---|
| Regresie pe ruta „consiliu" în producție | Flag implicit OFF; SHADOW înainte de ACTIVE; kill-switch fără deploy; `council.js` păstrat. |
| Cost LLM crescut (Board mai amplu decât Consiliul) | Un singur apel per ședință; roluri selectate după tipul deciziei; cache — aceeași analiză nu se repetă dacă datele nu s-au schimbat. |
| LLM inventează cifre sau poziții | Date deterministe colectate ÎNAINTE de apel; surse etichetate; validator + Guardian blochează structuri neconforme; `insufficient_data` la date lipsă. |
| Un director eșuează și blochează ședința | Perspectiva se marchează lipsă; ședința continuă; sinteza notează golul. |
| Timeout sau eșec total al apelului LLM | Timeout explicit + fallback; în SHADOW eșecul e invizibil utilizatorului; în ACTIVE se degradează controlat spre răspunsul de fallback. |
| Contradicție tăcută cu decizii aprobate anterior | Câmpul obligatoriu `contradicts_prior` — orice contradicție se explică prin informații noi, context nou sau revizuire explicită (via `memory.js` / `listDecisions`). |
| Board-ul e perceput ca decident | `founder_decision_required: true` în fiecare recomandare; CEO AI fără veto asupra fondatorului; Guardian nu poate anula decizia lui Adrian. |
| Deriva de scop (Board-ul începe să execute) | Board-ul nu are acces la nicio funcție cu efect; `approvalGate` rămâne singura poartă, nemodificată; plățile excluse total. |
| Migrare prematură, council retras prea devreme | Retragerea doar după paritate dovedită și doar prin Change Control (Etapa 5). |

---

## 10. Regulile absolute ale etapei

Valabile pentru toate etapele 0–5, fără excepție:

1. **Fără schemă nouă în baza de date.** Ședințele se înregistrează în `audit_log`
   prin `audit.js`, exact ca azi.
2. **`approvalGate` nu se modifică.** Rămâne singura poartă pentru acțiuni cu efect.
   Board-ul nu execută nimic — doar recomandă.
3. **Fără push / deploy automat.** Orice deploy pe Railway se face doar la comanda
   explicită a lui Adrian; activările din Etapele 3–4 se fac prin variabile de mediu,
   nu prin cod nou.
4. **Plățile (Nivel 4) sunt excluse total** din perimetrul Board-ului, în orice mod.
5. **Adrian rămâne decidentul final.** Orice recomandare, inclusiv una unanimă de NU,
   poate fi demontată și inversată de fondator — caz în care se aplică obligatoriu
   limite de capital, timp, risc și criterii de oprire.
