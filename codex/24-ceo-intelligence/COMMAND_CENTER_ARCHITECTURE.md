# CEO COMMAND CENTER — Arhitectură (Master Phase: CEO AI Operational Intelligence)

> **STARE: FUNDAȚIE LIVRATĂ — API read-only `/api/ceo/*` sub PIN-ul existent; frontend-ul complet NU se construiește în această fază.**
> Zero acțiuni din interfață · read-only prin definiție · ApprovalGate rămâne singura poartă pentru efecte · plățile excluse total

> **Poziționare:** Command Center este stratul de **vizualizare** al întregului Master Phase CEO AI Operational Intelligence — fereastra prin care Adrian vede ce vede CEO-ul AI. Consumă exclusiv ce produc motoarele din `src/ceo/` și pipeline-urile existente: [Observation Engine (cap. 21)](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md), [Proactive CEO Pipeline (cap. 22)](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md), [Founder Attention Gate (cap. 23)](../23-founder-attention/FOUNDER_ATTENTION_ARCHITECTURE.md) și [Executive Board (cap. 04)](../04-executive-board/). Nu calculează nimic propriu: **afișează, nu decide; citește, nu execută.**

---

## 1. Principiul fondator — interfață de management PESTE Operational, nu dublarea lui

Operational este și rămâne **sistemul de lucru**: task-uri, jurnale, comenzi de materiale, vânzări, parteneri. Acolo lucrează Adrian, Dana și Nelu zi de zi. Command Center **nu rescrie și nu dublează** niciun ecran din Operational.

Command Center răspunde la o întrebare diferită: nu *„ce am de făcut?"* (Operational), ci **„în ce stare este compania și ce merită atenția mea de fondator?"**. Este stratul de management deasupra stratului de execuție.

| | Operational (există) | CEO Command Center (acest capitol) |
|---|---|---|
| **Utilizator** | Toată echipa | Adrian (rol Supervizor) |
| **Întrebarea** | Ce fac azi? | Ce stare are compania? |
| **Granularitate** | Task, jurnal, comandă | Semnal, tendință, decizie |
| **Acțiuni** | CRUD complet | **ZERO** — read-only prin definiție |
| **Sursa de adevăr** | Baza de date proprie | Motoarele `src/ceo/` + datele Operational, **niciodată copii paralele** |

Trei consecințe practice, nenegociabile:

1. **Nicio dublare de date.** Command Center nu are stocare proprie de business — citește prin `companyDataMap.js` (registrul celor 22 de domenii) și motoarele de inteligență. O cifră afișată în Command Center are întotdeauna o sursă unică, trasabilă.
2. **Nicio acțiune din interfață în această fază.** Niciun buton nu produce efecte. Când zona DECISIONS va permite APPROVE/MODIFY/REJECT pe propuneri, acel flux va trece exclusiv prin ApprovalGate — dar acel pas e o fază viitoare, gated separat.
3. **Datele lipsă se afișează ca lipsă.** Diferența ZERO vs. NU AM DATE (stările CONNECTED / PARTIAL / NOT_CONNECTED) este vizibilă în interfață, nu ascunsă. Un panou gol cu „NU AM DATE + de ce + cum se repară" e mai valoros decât un grafic frumos pe date inventate.

---

## 2. Cele 12 zone

Command Center este organizat în **12 zone fixe**. Fiecare zonă răspunde la o singură întrebare de fondator și are un motor-sursă unic în `src/ceo/` sau în capitolele deja live. Zonele nu se amestecă: o informație trăiește într-o singură zonă.

| # | Zonă | Întrebarea la care răspunde | Motor / sursă | Stare sursă |
|---|------|------------------------------|---------------|-------------|
| 1 | **TODAY** | Ce contează azi, într-un minut? | Daily CEO Digest (cap. 23) + observații recente (cap. 21) | LIVE (digest REAL) |
| 2 | **ATTENTION** | Ce cere atenția mea acum și la ce nivel? | Founder Attention Gate — niveluri de atenție, candidați, retrogradări | SHADOW |
| 3 | **DECISIONS** | Ce decizii sunt pe masă și cu ce scenarii? | `decisionEngineV2.js` — regula 6+1: până la 6 scenarii reale + recomandarea CEO AI; `DATA_REQUIRED` când lipsesc date critice | INFRASTRUCTURĂ |
| 4 | **CASH** | Câți bani am azi și câți voi avea la 7/14/21/30/60/90 zile? | `cashIntelligence.js` — PROJECTED LIQUIDITY; separare strictă CASH / PROFIT / REVENUE; componente lipsă = UNKNOWN | INFRASTRUCTURĂ |
| 5 | **SALES** | Unde este funnel-ul, de la lead la bani încasați? | `salesIntelligence.js` — LEAD→CONTACT→VIEWING→NEGOTIATION→RESERVATION→ADVANCE→PRECONTRACT→CONTRACT→CASH RECEIVED | ADAPTOR (stagii fără sursă = NOT_CONNECTED) |
| 6 | **PROJECTS** | În ce stadiu sunt proiectele și șantierele? | Domeniile PROJECTS / CONSTRUCTION / SUPPLIERS din `companyDataMap.js` | PARTIAL |
| 7 | **PEOPLE** | Cum performează oamenii, **în context**, nu în număr de task-uri? | `peopleIntelligence.js` — model contextual + regula Founder DNA (prima greșeală = învățare) | INFRASTRUCTURĂ |
| 8 | **TASKS** | Ce e propus, delegat, și în ce stare de verificare? | `proposalEngine.js` + `closedLoop.js` peste task-urile Operational — bucla Problem→approved→delegated→verified→lesson | SHADOW (zero task-uri reale trimise) |
| 9 | **DATA HEALTH** | Cât pot avea încredere în datele de mai sus? | `companyDataMap.js` (Company Data Health Score 0–100) + `dataGapEngine.js` (gap-uri cu WHY / BEST SOURCE / PROPOSED IMPLEMENTATION) | LIVE |
| 10 | **SYSTEM HEALTH** | Funcționează JARVIS însuși? | `selfAudit.js` — surse, freshness, conectori, motoare, job-uri, erori | LIVE |
| 11 | **BOARD** | Ce spun cei 12 directori despre subiectul curent? | Executive Board (cap. 04) — Board Preview-uri, poziții per rol | SHADOW validat |
| 12 | **IMPROVEMENTS** | Cum propune sistemul să se îmbunătățească pe sine? | `improvementEngine.js` — SYSTEM IMPROVEMENT PROPOSAL cu Approval required; **nu își modifică singur codul** | INFRASTRUCTURĂ |

Ordinea 1–12 este și ordinea de prioritate vizuală: TODAY și ATTENTION deschid întotdeauna ecranul; SYSTEM HEALTH și IMPROVEMENTS închid — sunt despre JARVIS, nu despre firmă, și nu au voie să concureze vizual cu firma.

Regulile absolute ale Master Phase se văd direct în zone: **cash ≠ profit** (zona 4 le separă explicit), **performanța umană ≠ număr de task-uri** (zona 7 e contextuală), **date lipsă ≠ zero** (zona 9 există tocmai pentru asta), **recomandare ≠ aprobare ≠ rezultat verificat** (zonele 3, 8 și bucla închisă).

---

## 3. Fundația construită ACUM — API read-only `/api/ceo/*`

Singurul lucru livrat în această fază este **fundația de date**: un set de endpoint-uri read-only, protejate de **PIN-ul existent** (același mecanism de autentificare deja folosit — nu se introduce un sistem nou de auth), care expun rezultatele motoarelor `src/ceo/` în format stabil pentru orice frontend viitor.

| Endpoint | Ce servește | Zone alimentate |
|----------|-------------|-----------------|
| `GET /api/ceo/overview` | Starea agregată: digest curent, semnale de atenție, scoruri sumare pe zone | TODAY, ATTENTION |
| `GET /api/ceo/data-health` | Cele 22 de domenii cu CONNECTED/PARTIAL/NOT_CONNECTED, freshness, quality, owner + Company Data Health Score | DATA HEALTH |
| `GET /api/ceo/cash` | Modelul unificat de lichiditate pe orizonturi (azi/7/14/21/30/60/90), cu componentele UNKNOWN marcate explicit | CASH |
| `GET /api/ceo/gaps` | Gap-urile de date cu WHY / BEST SOURCE / TEMPORARY vs. PERMANENT / PROPOSED IMPLEMENTATION; Information Request-uri pregătite dar NETRIMISE | DATA HEALTH, DECISIONS |
| `GET /api/ceo/proposals` | Recommendation → Action Proposal în stare SHADOW, cu statusul ApprovalGate | DECISIONS, TASKS |

Proprietățile contractului API — acestea sunt reguli de guvernanță, nu detalii de implementare:

| Regulă | Detaliu |
|--------|---------|
| **Read-only absolut** | Doar `GET`. Niciun endpoint `/api/ceo/*` nu scrie, nu aprobă, nu trimite, nu declanșează. Efectele au o singură poartă: ApprovalGate — și ea nu locuiește aici. |
| **PIN existent** | Aceeași protecție ca restul API-ului JARVIS. Fără PIN valid → nimic; API-ul expune starea companiei și e tratat ca atare. |
| **Onestitate structurală** | Răspunsurile conțin explicit stările NOT_CONNECTED și valorile UNKNOWN. API-ul nu netezește, nu interpolează, nu inventează — serializează exact ce știu motoarele, inclusiv ce NU știu. |
| **Nucleu generic** | Endpoint-urile servesc COMPANY INSTANCE #1 (Profi Concept) prin `companyConfig.js`. Nicio valoare de companie hardcodată în strat API. |
| **Contract stabil** | Formatul răspunsurilor e considerat contract pentru frontend-ul viitor: se extinde aditiv, nu se sparge. |

---

## 4. Arhitectura frontend viitoare

Frontend-ul Command Center se va construi **incremental, zonă cu zonă**, doar peste API-ul deja stabil — niciodată invers. Direcțiile arhitecturale sunt fixate acum ca frontend-ul viitor să nu le poată încălca:

| Decizie | Regulă |
|---------|--------|
| **Baza de pornire** | **HUD-ul existent** al JARVIS este fundația vizuală — se extinde, nu se aruncă. Command Center crește din HUD, nu apare ca aplicație paralelă. |
| **Responsive, mobile-first pentru citit** | Adrian citește de pe telefon și analizează de pe BIROU. Fiecare zonă trebuie să fie lizibilă pe mobil (o coloană, zonele în ordinea 1–12) și densă pe desktop (grilă multi-zonă). |
| **Ordinea de construcție** | Zonele se livrează în ordinea valorii × disponibilității datelor: întâi zonele cu surse LIVE (TODAY, DATA HEALTH, SYSTEM HEALTH), apoi CASH pe măsură ce domeniile financiare devin CONNECTED, apoi restul. O zonă fără sursă conectată se afișează ca NOT_CONNECTED, nu se simulează. |
| **Fără stare proprie** | Frontend-ul e un strat de prezentare pur peste `/api/ceo/*`. Fără cache-uri de business persistente, fără calcule financiare duplicate în client. |
| **Read-only până la faza de aprobare** | Primele iterații nu au niciun control de scriere. Butoanele APPROVE/MODIFY/REJECT din DECISIONS apar doar într-o fază viitoare, gated, exclusiv prin ApprovalGate, cu documentul lor de guvernanță propriu. |

---

## 5. Ce NU se construiește încă

Explicit, ca să nu existe ambiguitate despre perimetrul acestei faze:

- **Frontend-ul gigantic** — cele 12 zone complete, cu grafice, drill-down și istoric, NU se construiesc acum. Fundația API precede orice pixel.
- **Orice buton cu efect** — aprobare, trimitere de task, Information Request, notificare. Toate rămân în infrastructură/SHADOW, în spatele ApprovalGate.
- **Aplicație separată sau sistem de auth nou** — nu; HUD existent + PIN existent.
- **Duplicarea ecranelor Operational** — liste de task-uri editabile, jurnale, comenzi de materiale. Acelea trăiesc în Operational și doar acolo.
- **Real-time push / streaming** — nu e nevoie în această fază; zonele se alimentează la cadența motoarelor (observații la 30 min, digest zilnic).
- **Zone speculative** — nicio a 13-a zonă până când cele 12 nu au surse reale conectate.

Criteriul de extindere e mereu același: **întâi datele conectate și verificate, apoi motorul care le înțelege, abia apoi interfața care le arată.** Command Center crește exact în ritmul în care crește Company Data Health Score — nu mai repede.

---

## 6. Legături

- [21 — Observation Engine](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) — sursa observațiilor care alimentează TODAY și ATTENTION
- [22 — Proactive CEO Pipeline](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md) — episoadele executive din spatele zonelor DECISIONS și ATTENTION
- [23 — Founder Attention Gate](../23-founder-attention/FOUNDER_ATTENTION_ARCHITECTURE.md) + [Daily Digest Policy](../23-founder-attention/DAILY_DIGEST_POLICY.md) — nivelurile de atenție și digestul afișate în TODAY/ATTENTION
- [04 — Executive Board](../04-executive-board/) — cei 12 directori din zona BOARD
- Capitolul curent (`24-ceo-intelligence/`) — documentele-surori despre registrul de date, cash intelligence, gap-uri, propuneri și bucla închisă; Command Center este fereastra lor comună
