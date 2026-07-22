# CONSOLIDATION PLAN — JARVIS (jarvis-server)

> Audit read-only, 22 iul 2026. Doar constatări REALE din cod (importuri, grep pe flag-uri, chei jarvis_state, cron-uri). Nimic nu se șterge acum — fiecare punct e clasificat SAFE_TO_MERGE / NEEDS_PROPOSAL / KEEP.

## 1. Module paralele / suprapuse

### 1.1 `ceo/nervousSystem.js` (vechi) vs `ceo/nervous/` (nou) — **NU se suprapun funcțional, dar numele induce în eroare** → NEEDS_PROPOSAL
- Vechiul `nervousSystem.js` = motoare PURE Master Phase 3 (bank intelligence, atribuire, detecții receivables, registre, memoria deciziilor). Noul `nervous/` = organismul managerial V1 (ciclu, delegare, task-uri).
- Folosit REAL din vechiul fișier: `detectReceivableIssues` (nervous/cycle.js:20), `analyzeBankFlows`, `buildAttribution`, `buildReconciliationReport`, `getRegister`, `AUTONOMY_LEVELS` (toate din ceo/api.js).
- **MORT în vechiul fișier** (zero apelanți): `matchBankToObligations`, `debtServiceWindows`, `bootstrapRegisters`, `buildDecisionRecord`, `rememberDecision`, `findSimilarDecisions` (memoria deciziilor CEO — construită, necablată).
- Propunere: redenumire în `ceo/pureEngines.js` (sau mutarea funcțiilor vii lângă consumatori) + decizie explicită pe memoria deciziilor (cablează în decisionEngineV2 sau marchează OBSOLETE). Risc: mediu (importuri în api + cycle).

### 1.2 Două scări de autonomie — **duplicat real** → SAFE_TO_MERGE
- `ceo/nervousSystem.js` exportă `AUTONOMY_LEVELS` + `activeAutonomyLevel(cfg)`; `ceo/autonomyLadder.js` exportă `AUTONOMY_LADDER` + `activeAutonomyLevel(cfg)` (PARTEA XVII, mai completă, cu Level 3 readiness).
- `GET /api/ceo/source-health` folosește versiunea VECHE cu `active_level: 1` **hardcodat** — minte când autonomia reală e Level 2 (info+verif tasks ON).
- Merge: `source-health` să importe `activeAutonomyLevel` din `autonomyLadder.js` și să șteargă duplicatul din nervousSystem.js. Efort: ~30 min + teste.

### 1.3 `council.js` (5 experți) vs `executiveBoard/` (Board 6+1) — **două organe consultative pe aceeași rută** → NEEDS_PROPOSAL
- Ruta „consiliu" în brain.js: cu `EXECUTIVE_BOARD_ENABLED=off` răspunde council-ul vechi, iar `maybeShadowBoard` rulează Boardul ÎN PLUS, doar în audit → **dublu cost LLM la fiecare „consiliu", iar analiza Board-shadow n-o citește nimeni sistematic**.
- Council-ul e chemat și automat la decizii >50k EUR (`impactOver50k`).
- Propunere (decizia lui Adrian): fie `EXECUTIVE_BOARD_ENABLED=on` și council devine fallback, fie `EXECUTIVE_BOARD_SHADOW_MODE=off` până la activare (economisește tokeni). Nu șterge council.js — e fallback-ul natural și singura cale auto->50k.

### 1.4 `guardian.js` × 2 (`executiveBoard/guardian.js` vs `ceo/evolution/guardian.js`) → KEEP
- Domenii diferite (conformitate CODEX la board vs review de build simulat). Doar numele coincide. Niciun risc.

### 1.5 `sources/operational.js` → OBSOLETE, candidat ștergere → NEEDS_PROPOSAL
- Zero importuri în tot `src/`. Funcția (listare task-uri prin Claude+MCP) e acoperită de `mcp.js` + `supervisor/collector.js`. Ștergerea e sigură tehnic, dar rămâne propunere (nimic sensibil nu se șterge fără aprobare).

## 2. Flag-uri moarte / inerte (definite în config, dar fără efect real)

| Flag (config) | Stare în cod | Clasificare |
|---|---|---|
| `proactiveCeoNotifications`, `proactiveCeoBoardExecution` | citite în `pipelineRunner.js` în obiectul `flags`, **niciodată folosite** după aceea | KEEP (schelet deliberat pt. faza următoare) — dar documentează în config că azi sunt no-op |
| `observationNotifications` | setează doar `safe_to_notify` pe observații; **niciun sender nu consumă** `safe_to_notify` | KEEP (poartă deliberată) |
| `observationBoardEscalation` | citit în `flags`, nefolosit; escaladarea doar MARCHEAZĂ (`requires_board_review`) | KEEP |
| `founderNotifications` | citit în `founderGateRunner`, dar `safe_to_send=false` e FORȚAT indiferent de flag | KEEP (invariantul fazei) |
| `founderInterruptiveAlerts` | citit DOAR de `selfAudit.js` pentru display („ATENTIE: ON") | KEEP |
| `strategyRouting` | consumat indirect prin `hasStrategy` | viu, OK |
| **Concluzie** | **Niciun flag complet mort** — dar 5 flag-uri sunt promisiuni fără cale de execuție; un comentariu „NO-OP azi" în config.js ar preveni activări degeaba | SAFE_TO_MERGE (doar comentarii) |

## 3. Cod mort / exporturi fără consumator

| Element | Constatare | Clasificare |
|---|---|---|
| `ceo/index.js#runCeoShadow` | export fără niciun apelant; fluxul echivalent trăiește în digest (`liveMaterial`) + nervous | NEEDS_PROPOSAL (șterge sau cablează într-un endpoint) |
| `predictionState.js#getPredictionAlerts` | construit pentru notifier, comentariu explicit „NU e cablată" — nefolosit | NEEDS_PROPOSAL: cablează alertele high/critical în digest (nu în notifier direct) sau șterge |
| Memoria deciziilor din nervousSystem.js (`buildDecisionRecord`/`rememberDecision`/`findSimilarDecisions`) | construită, zero apelanți | NEEDS_PROPOSAL |
| `matchBankToObligations`, `debtServiceWindows`, `bootstrapRegisters` | zero apelanți | NEEDS_PROPOSAL |
| `nervous/needEngine.js#answerFifteen` | doar re-exportat de barrel, fără consumator extern | KEEP (probabil pt. Command Center viitor) — de verificat la următoarea fază |

## 4. Stare duplicată / chei jarvis_state

- **Două istorii de vânzări**: `sales_prev` (supervisor/sales.js — diff-ul raportului) vs `sales:history` (ceo/index — baseline trend, max 60 zile). Nu se suprapun ca scop (diff vs trend), dar aceleași date sursă se persistă de două ori. → KEEP azi; candidat unificare când se stabilizează Command Center.
- **Snapshot-uri de task-uri paralele**: `task_snapshot` (scheduler 17:00) + `known_tasks` (notifier) — scopuri diferite (diff vs „văzut deja"), amândouă necesare. → KEEP.
- Restul cheilor (`observation:dedup/last`, `proactive:episodes`, `founder:digest/candidates/limits`, `ceo:nervous:*`, `ceo:evolution:*`, `ceo:documents*`, `people:telegram*`) — fiecare are exact un scriitor. Fără conflicte. → KEEP.

## 5. Cron-uri — nu duplicate, dar LANȚUL DE DIMINEAȚĂ calculează același context de 3 ori și trimite 5 mesaje

Inventar (Europe/Bucharest): 06:30 lun obs weekly · 06:45 obs daily · 07:10 ciclu cognitiv/nervous · 07:30 briefing + sales (2 msg) · 07:40 digest (1 msg) · 09:00 CEO Home + raport complet (2 msg) · 15:30 nervous midday · 17:00 diff (1 msg) · */45 obs quick · poll 7 min notifier · 03:00 backup · 03:30 prune.

- **Compute duplicat**: `collectCeoContext()` (rulat de nervous 07:10) și `liveMaterial()` (digest 07:40) re-rulează FIECARE tot lanțul observation→pipeline→gate cu `persist:false`, la ~30 min după rularea persistentă de la 06:45. Deliberat izolat, dar înseamnă 3 rulări complete ale acelorași surse în 55 de minute. → NEEDS_PROPOSAL: un snapshot partajat `ceo:context` scris la 06:45 și citit de 07:10/07:40 (cu fallback pe recalcul).
- **5 mesaje Telegram pe dimineață** (07:30 ×2, 07:40, 09:00 ×2) — briefing-ul supervisor, digestul și CEO Home povestesc parțial aceleași lucruri din aceleași surse. → NEEDS_PROPOSAL (decizie de produs a fondatorului, nu tehnică): digestul 07:40 devine mesajul unic de dimineață, restul la cerere.

## 6. Cod shadow neconsumat de nimeni

- **Board shadow** (`maybeShadowBoard` + audit `board_shadow_*`): rulează LLM la fiecare „consiliu", rezultatul ajunge doar în audit_log pe care nu-l citește niciun flux. → vezi §1.3.
- **Observațiile/episoadele/candidații shadow** SUNT consumate (digest + CEO context + nervous) → KEEP, funcționează corect.
- **Board previews** (`ceo_board_preview` în audit) — doar audit, nimeni nu le citește; e prin design „preview, nu convocare". → KEEP până la faza de escaladare.

---

## TOP 5 CONSOLIDĂRI (cu efort estimat)

| # | Consolidare | Clasa | Efort |
|---|---|---|---|
| 1 | Unifică scara de autonomie: `source-health` → `autonomyLadder.activeAutonomyLevel`, șterge duplicatul + `active_level:1` hardcodat | SAFE_TO_MERGE | ~30 min |
| 2 | Comentarii „NO-OP azi" în config.js pe cele 5 flag-uri de notificare fără cale de execuție (previne activări false) | SAFE_TO_MERGE | ~15 min |
| 3 | Snapshot de context partajat pentru lanțul de dimineață (06:45 scrie, 07:10 + 07:40 citesc; fallback recalcul) — taie 2 rulări complete/zi | NEEDS_PROPOSAL | ~½ zi + teste |
| 4 | Decizie council vs Board: ENABLED=on (board devine răspunsul) SAU SHADOW=off (oprește costul dublu de LLM pe ruta „consiliu") | NEEDS_PROPOSAL (decizie Adrian, schimbarea în sine e 1 env var) | 5 min după decizie |
| 5 | Curățenie cod mort cu aprobare: `sources/operational.js`, `runCeoShadow`, `getPredictionAlerts` (sau cablare în digest), memoria deciziilor + 3 funcții moarte din nervousSystem.js | NEEDS_PROPOSAL | ~2h |
