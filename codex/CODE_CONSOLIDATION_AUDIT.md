# CODE CONSOLIDATION AUDIT (Faza — Code Consolidation)

Data: 23 iul 2026 · HEAD la audit: post-external-intel + straturi cognitive V1
Regula: NU stergere riscanta. Clasificare: KEEP / MERGE / DEPRECATE / REMOVE_AFTER_MIGRATION.

## Tinta arhitecturala (invarianta)
- ONE COGNITIVE KERNEL — `brain.js` e hub-ul; grounding-ul (sourceTruth + evidencePacket + actionLedger + externalIntel) e unificat in system prompt.
- ONE TRUTH ABSTRACTION — `ceo/sourceTruth.js` + `ceo/dataTrust.js` (incredere) + `ceo/dataContract.js` (semantica surselor).
- ONE EVENT MODEL — `ceo/changeEvents.js` (vocabular canonic) + `nervous/reactiveWatch.js` (detectie).
- ONE COMMAND BUS — `nervous/operationalWrite.js` (SINGURA suprafata de scriere, TASKS-ONLY, cu receipts).
- ONE MANAGEMENT LOOP — `nervous/cycle.js` (observe→need→owner→task→followup→verify→close).

## Clasificare

| Zona | Fisiere | Verdict | Nota |
|---|---|---|---|
| Cognitive kernel | brain.js | KEEP | 671 linii — hub legitim; grounding unificat, gated de `wantsGrounded` |
| Truth layer | sourceTruth, dataTrust, dataContract, companyDataMap | KEEP | complementare, fara suprapunere (conectivitate / incredere / semantica / mapare) |
| Event layer | changeEvents, reactiveWatch, nervous/cycle | KEEP | changeEvents = canonicalizare pura; reactiveWatch = detectie IO; nu se dubleaza |
| Write surface | nervous/operationalWrite | KEEP | unica cale; garzi A-Z in ceoNervousV1.test |
| Model routing | modelRouter (routeModel + selectTier) | KEEP | pur, inert; tier-uri explicite adaugate (nu mai decid rutele vechi accidental) |
| Trace | executionTrace (buildTrace, pur) + cognitiveTrace (persistenta) | KEEP | separare corecta forma/persistenta |
| Canned routes | ceoHome, riskReport, operationalFastPath | KEEP (gated) | interceptate DOAR cand `!wantsGrounded`; nu mai fura intrebarile manageriale |
| Self-evolution | ceo/evolution/* (18 fisiere) | KEEP | state machine completa DETECTED→...→COMPLETED; no self-deploy |
| Decision engines | decisionEngine (vechi) vs decisionEngineV2 | MERGE candidat | V2 e sursa curenta; vechiul ramane pt. compat — de consolidat cand rutele se reorganizeaza (Faza 43) |
| Flags config | ~23 flag-uri *_ENABLED/_SHADOW | KEEP | toate consumate (verificat grep); shadow-first intentionat |

## De urmarit (nu blocant acum)
- `decisionEngine.js` vs `decisionEngineV2.js`: MERGE dupa reorganizarea rutelor (Faza 43), cu regresii.
- Rutele canned (ceoHome/risk/operationalFast): DEPRECATE_AFTER_MIGRATION cand evidencePacket acopera 100% din intentii (acum acopera cele manageriale).
- 191 fisiere src/ — sanatos pentru scopul actual; fara cod shadow neconsumat detectat.

## Verdict
Arhitectura e deja convergenta spre "one kernel / one truth / one event / one command bus / one loop". Zero stergeri necesare acum. Doua consolidari (decisionEngine, canned routes) sunt sigure DOAR dupa reorganizarea rutelor cu regresii — programate pentru Faza 43, nu premature.
