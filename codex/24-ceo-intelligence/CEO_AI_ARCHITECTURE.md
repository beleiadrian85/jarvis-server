# CEO AI OPERATIONAL INTELLIGENCE — Arhitectură (Master Phase)

> **STARE: FUNDAȚIE ÎN CONSTRUCȚIE — nucleul `src/ceo/` este GENERIC, compania este configurată, nu hardcodată.**
> Toate motoarele noi rulează exclusiv în **SHADOW / infrastructură**: zero acțiuni autonome, zero task-uri reale, zero mesaje trimise. ApprovalGate rămâne singura poartă pentru efecte. Plățile sunt excluse total.

> **Poziționare:** acest capitol este stratul de sinteză de deasupra lanțului deja livrat: [21 — Observation Engine](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) → [22 — Proactive CEO Pipeline](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md) → [23 — Founder Attention](../23-founder-attention/FOUNDER_ATTENTION_ARCHITECTURE.md), și consumatorul controlat al capitolului [04 — Executive Board](../04-executive-board/BOARD_ARCHITECTURE.md). Nu înlocuiește niciunul dintre ele — le dă un cortex comun.

---

## 1. Scop

Capitolele 21–23 au învățat JARVIS să **vadă**, să **coreleze** și să **respecte atenția fondatorului**. Capitolul 24 construiește pasul următor: JARVIS devine **CEO AI operațional** — un sistem care înțelege compania ca întreg, își cunoaște limitele de date, gândește în scenarii, propune, și învață din rezultate verificate.

Trei fraze definesc întregul capitol:

1. **CEO AI vede compania, nu doar semnalele.** 22 de domenii de date, fiecare cu stare declarată (`CONNECTED / PARTIAL / NOT_CONNECTED`) — diferența dintre *„zero"* și *„nu am date"* este lege.
2. **CEO AI propune, nu execută.** Propunere ≠ execuție, recomandare ≠ aprobare, aprobare ≠ rezultat verificat. Fiecare săgeată din lanț este o treaptă separată, cu poartă separată.
3. **Adrian decide.** Rolul de Supervizor ([02 — Founder DNA](../02-founder-dna)) este capătul obligatoriu al oricărui lanț cu efecte.

---

## 2. Principiul director: SEE → … → LEARN

Lanțul complet, mapat pe componente (existente și noi):

| # | Treaptă | Întrebarea | Componenta responsabilă | Stare |
|---|---|---|---|---|
| 1 | **SEE** | Ce se întâmplă? | Observation Engine (cap. 21) + `companyDataMap.js` (registrul celor 22 de domenii) | SHADOW / NOU |
| 2 | **UNDERSTAND** | Ce înseamnă împreună? | Proactive CEO Pipeline — triage + episoade (cap. 22) + `cashIntelligence.js`, `salesIntelligence.js`, `peopleIntelligence.js` | SHADOW / NOU |
| 3 | **VERIFY** | Datele sunt reale, proaspete, complete? | `companyDataMap.js` (freshness/quality) + `dataGapEngine.js` (gap-uri explicite) + `selfAudit.js` | NOU |
| 4 | **THINK** | Ce opțiuni reale există? | `decisionEngineV2.js` — regula 6+1 (până la 6 scenarii reale) | NOU |
| 5 | **SIMULATE** | Cum ar analiza Boardul? | Board Escalation Preview (cap. 22) + Executive Board în shadow (cap. 04) | SHADOW |
| 6 | **RECOMMEND** | Ce recomandă CEO AI și de ce acum? | `decisionEngineV2.js` — scenariul 7; date critice lipsă ⇒ `DATA_REQUIRED`, nu recomandare finală | NOU |
| 7 | **ASK / PROPOSE** | Cum ajunge pe masa fondatorului? | `proposalEngine.js` (Action Proposal) + Founder Attention Gate + Daily CEO Digest (cap. 23) | SHADOW + DIGEST REAL |
| 8 | **ADRIAN APPROVES** | Aprobare / modificare / respingere | ApprovalGate — singura poartă de efecte | LEGE |
| 9 | **DELEGATE / EXECUTE** | Cine face, până când, cu ce rezultat așteptat? | `proposalEngine.js` → Task Proposal (responsabil / termen / rezultat / regulă de verificare) → Operational | INFRA, zero task-uri reale |
| 10 | **VERIFY EXECUTION** | S-a făcut cu adevărat? | `closedLoop.js` — monitored → verified → measured | NOU |
| 11 | **LEARN** | Ce reține sistemul? | `closedLoop.js` (lecții auditabile în `jarvis_state` + audit) + `improvementEngine.js` (propuneri de îmbunătățire, NU self-modifying code) | NOU |

Reguli absolute care traversează lanțul: **date lipsă ≠ zero**, **cash ≠ profit**, **performanța umană ≠ număr de task-uri**, **decizie cu date critice lipsă ≠ recomandare finală**.

---

## 3. Diagrama straturilor

```
┌──────────────────────────────────────────────────────────────┐
│  ADRIAN (Supervizor)                — DECIZIA                │
│  APPROVE / MODIFY / REJECT · singurul care declanșează efecte│
└──────────────────────────────▲───────────────────────────────┘
                               │ propuneri, brief-uri, digest (cap. 23)
┌──────────────────────────────┴───────────────────────────────┐
│  CODEX (acest repertoriu)           — CONSTITUȚIA            │
│  reguli, gate-uri, protocoale; capitolele 00–24 guvernează   │
│  tot ce au voie straturile de mai jos să facă                │
└──────────────────────────────▲───────────────────────────────┘
                               │ constrânge și auditează
┌──────────────────────────────┴───────────────────────────────┐
│  src/ceo/                           — CORTEXUL               │
│  companyConfig · companyDataMap · dataGapEngine ·            │
│  cashIntelligence · salesIntelligence · peopleIntelligence · │
│  decisionEngineV2 · proposalEngine · closedLoop ·            │
│  selfAudit · improvementEngine · /api/ceo/*                  │
│  (nucleu GENERIC; Profi Concept = COMPANY INSTANCE #1)       │
└──────────────────────────────▲───────────────────────────────┘
                               │ semnale, episoade, brief-uri
┌──────────────────────────────┴───────────────────────────────┐
│  JARVIS ENGINES                     — SIMȚURILE              │
│  Observation Engine (21) · Proactive CEO Pipeline (22) ·     │
│  Founder Attention + Daily Digest (23) · Executive Board (04)│
└──────────────────────────────▲───────────────────────────────┘
                               │ date operaționale (28 tool-uri MCP)
┌──────────────────────────────┴───────────────────────────────┐
│  OPERATIONAL (+ surse conectate)    — EXECUȚIA               │
│  task-uri, jurnale, vânzări, obligații de plată, marketing,  │
│  producție; aici se execută ce a aprobat Adrian              │
└──────────────────────────────────────────────────────────────┘
```

Sensul fluxului: datele urcă (execuție → simțuri → cortex), deciziile coboară (Adrian → cortex → execuție), iar CODEX constrânge fiecare traversare.

---

## 4. Modulele `src/ceo/` — responsabilități

| Modul | Responsabilitate | Ce NU face |
|---|---|---|
| `companyConfig.js` | COMPANY INSTANCE #1 = Profi Concept: nume, oameni (Adrian / Dana / Nelu), praguri, domenii. Nucleul citește configul, nu compania. | Nu hardcodează compania în motoare |
| `companyDataMap.js` | Registrul celor 22 de domenii (CASH, BANK, ACCOUNTING, PAYABLES, RECEIVABLES, SALES, LEADS, BELL_INVENTORY, PROJECTS, CONSTRUCTION, SUPPLIERS, CONTRACTS, PEOPLE, TASKS, WEBSITE_TRAFFIC, MARKETING, EMAIL, CALENDAR, LEGAL, ASSETS, FINANCING, DECISIONS): SOURCE / CONNECTED / FRESHNESS / QUALITY / OWNER / WHAT CEO KNOWS / WHAT CEO DOES NOT KNOW / BUSINESS IMPACT / HOW TO FIX + **Company Data Health Score 0–100** | Nu maschează lipsurile: `NOT_CONNECTED` rămâne vizibil |
| `dataGapEngine.js` | Gap-uri de date cu WHY / BEST SOURCE / TEMPORARY–PERMANENT / PROPOSED IMPLEMENTATION; pregătește Information Request | **Nu trimite** nimic fără ApprovalGate |
| `cashIntelligence.js` | Model unificat de lichiditate: BANK + CONFIRMED RECEIVABLES + PROBABLE RECEIVABLES − PAYABLES − DEBT SERVICE − PAYROLL/TAX − PROJECT COMMITMENTS = PROJECTED LIQUIDITY (azi/7/14/21/30/60/90). Separare strictă CASH / PROFIT / REVENUE / CONTRACTED REVENUE / EXPECTED CASH / AVAILABLE CASH | Componentele lipsă ⇒ `UNKNOWN` + Data Gap; **niciodată inventate** |
| `salesIntelligence.js` | Funnel LEAD → CONTACT → VIEWING → NEGOTIATION → RESERVATION → ADVANCE → PRECONTRACT → CONTRACT → CASH RECEIVED, ca adaptor peste datele existente | Stagiile fără sursă = `NOT_CONNECTED`, nu simulate |
| `peopleIntelligence.js` | Model contextual: RESULT / TIMELINESS / COMPLEXITY / DEPENDENCIES / QUALITY / REPEATED ERRORS / SELF-CORRECTION / INITIATIVE / BUSINESS IMPACT / LEARNING. Regula Founder DNA: prima greșeală = învățare; repetarea = problemă de capacitate/proces/disciplină. Propune coaching / clarificare / proces / automatizare / redistribuire | Nu reduce oamenii la număr de task-uri; nu doar critică |
| `decisionEngineV2.js` | Regula **6+1**: până la 6 scenarii REALE (upside / downside / cash impact / profit impact / time / risk / reversibility / people / company value / unknowns / confidence) + scenariul 7 = recomandarea CEO AI cu „DE CE ACUM". Extinde [05 — Decision Engine](../05-decision-engine) | Nu fabrică scenarii artificiale; date critice lipsă ⇒ `DATA_REQUIRED` |
| `proposalEngine.js` | Lanțul CEO detects → Recommendation → Action Proposal → ApprovalGate → Adrian → Task Proposal (responsabil / termen / rezultat așteptat / regulă de verificare) | INFRASTRUCTURĂ + SHADOW: zero task-uri reale trimise |
| `closedLoop.js` | Problem → approved → delegated → monitored → verified → measured → stored → lesson; învățare AUDITABILĂ în `jarvis_state` + audit | Fără self-modifying code |
| `selfAudit.js` | CEO SYSTEM HEALTH zilnic: surse, freshness, conectori, motoare, job-uri, erori | Notifică doar dacă e relevant (respectă cap. 23) |
| `improvementEngine.js` | SYSTEM IMPROVEMENT PROPOSAL: Problem / Evidence / Business value / Proposed change / Affected system / Risk / Complexity / Benefit / Approval required | **Nu își modifică singur codul** |
| `api /api/ceo/*` | Fundația Command Center: expunere read-only, PIN-protejată | Fără endpoint-uri de execuție |

---

## 5. Stare curentă: ACTIV / SHADOW / OFF

| Componentă | Capitol | Stare |
|---|---|---|
| Observation Engine (ciclu 30 min) | 21 | **SHADOW** — rulează, doar audit |
| Proactive CEO Pipeline (episoade executive) | 22 | **SHADOW** — flag implicit OFF pentru efecte |
| Founder Attention Gate | 23 | **SHADOW** |
| **Daily CEO Digest** (1 mesaj Telegram/zi, 07:40) | 23 | **REAL** — singurul canal live către Adrian |
| Executive Board (12 directori) | 04 | **SHADOW validat** (17 iul) · `ENABLED=off` — decide Adrian |
| Board Execution (convocare reală) | 04/22 | **OFF** |
| `src/ceo/*` (toate motoarele noi) | 24 | **INFRASTRUCTURĂ + SHADOW** — zero efecte |
| Task Proposals reale către Operational | 24 | **OFF** — condiționat de ApprovalGate + decizia lui Adrian |
| Information Requests (cereri de date) | 24 | **PREGĂTITE, NETRIMISE** — gated |
| Command Center `/api/ceo/*` | 24 | read-only, PIN — fundație |

---

## 6. Priorități

### P0 — fundația de adevăr (fără ea, orice recomandare e nesigură)
1. `companyConfig.js` + `companyDataMap.js` — cele 22 de domenii cu stări reale și Company Data Health Score.
2. `dataGapEngine.js` — gap-urile declarate explicit; Information Request pregătit, gated.
3. `cashIntelligence.js` — modelul unificat de lichiditate cu `UNKNOWN` onest.
4. `selfAudit.js` — sănătatea sistemului însuși, zilnic.

### P1 — gândire și propunere (peste fundație)
1. `decisionEngineV2.js` — regula 6+1 cu `DATA_REQUIRED`.
2. `proposalEngine.js` — lanțul complet până la Task Proposal, în shadow.
3. `salesIntelligence.js` — funnel-ul ca adaptor, stadii `NOT_CONNECTED` vizibile.
4. `/api/ceo/*` — Command Center read-only.

### P2 — buclă închisă și evoluție (după validarea P0–P1 în shadow)
1. `closedLoop.js` — verificarea execuției și lecțiile auditabile.
2. `peopleIntelligence.js` — modelul contextual de performanță umană.
3. `improvementEngine.js` — propuneri de îmbunătățire a sistemului, cu aprobare.
4. Activarea graduală a efectelor (Task Proposals reale, Information Requests) — **doar prin ApprovalGate, doar cu decizia lui Adrian**, în ordinea validării shadow, după modelul capitolelor [21](../21-observation-engine/OBSERVATION_SHADOW_VALIDATION.md), [22](../22-proactive-ceo/PROACTIVE_CEO_SHADOW_VALIDATION.md) și [23](../23-founder-attention/FOUNDER_ATTENTION_SHADOW_VALIDATION.md).

---

## 7. Legături

- [21 — Observation Engine](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) — sursa semnalelor (SEE)
- [22 — Proactive CEO Pipeline](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md) — corelarea în episoade (UNDERSTAND, SIMULATE)
- [23 — Founder Attention](../23-founder-attention/FOUNDER_ATTENTION_ARCHITECTURE.md) — canalul către Adrian (ASK/PROPOSE)
- [04 — Executive Board](../04-executive-board/BOARD_ARCHITECTURE.md) — motorul de analiză colectivă (SIMULATE)
- [05 — Decision Engine](../05-decision-engine) — predecesorul lui `decisionEngineV2.js` (THINK, RECOMMEND)
