# CASH INTELLIGENCE — Modelul Unificat de Lichiditate al CEO AI

> **STARE: IMPLEMENTAT — `src/ceo/cashIntelligence.js`, validare exclusiv în SHADOW.**
> Modelul calculează lichiditatea proiectată **doar din componente conectate**; orice
> componentă lipsă devine **UNKNOWN + Data Gap** — niciodată o cifră inventată.
> Zero acțiuni autonome. Cash ≠ profit. Date lipsă ≠ zero. Nicio recomandare
> finală de cash nu se emite cu componente critice în stare UNKNOWN
> (`DATA_REQUIRED`, conform [DECISION_ENGINE_V2.md](DECISION_ENGINE_V2.md)).

---

## 1. Principiu

Prima întrebare la care un CEO trebuie să poată răspunde oricând este:
*„câți bani am, câți bani voi avea și când rămân fără?"* Cash Intelligence este
organul prin care CEO AI răspunde la această întrebare **fără să confunde vreodată
conceptele** (cash, profit, venit, contractat, așteptat, disponibil) și **fără să
inventeze vreodată o componentă lipsă**.

Modelul este **GENERIC** — nucleul nu hardcodează Profi Concept. Compania este
COMPANY INSTANCE #1, configurată în `src/ceo/companyConfig.js`, iar sursele de
date vin exclusiv din registrul celor 22 de domenii
([COMPANY_DATA_MAP.md](COMPANY_DATA_MAP.md), `src/ceo/companyDataMap.js`).

| Cash Intelligence ESTE | Cash Intelligence NU ESTE |
|---|---|
| Un model unificat de lichiditate pe 7 componente | Un raport contabil sau un bilanț |
| O proiecție pe orizonturi fixe, din date conectate | O prognoză „optimistă" cu goluri umplute din estimări |
| Un producător de Data Gaps când lipsesc surse | Un motor care tratează lipsa datelor ca zero |
| Material de analiză pentru SEE → UNDERSTAND → THINK | O poartă de execuție sau de plată (plățile sunt excluse total) |

---

## 2. Formula unificată — cele 7 componente

```
  BANK BALANCE
+ CONFIRMED RECEIVABLES
+ PROBABLE RECEIVABLES
− PAYABLES
− DEBT SERVICE
− PAYROLL / TAX
− PROJECT COMMITMENTS
= PROJECTED LIQUIDITY
```

| # | Componentă | Semn | Definiție | Domeniu sursă (Data Map) | Stare la Profi Concept |
|---|---|---|---|---|---|
| 1 | **BANK BALANCE** | + | Soldul real, la zi, al conturilor bancare | `BANK` | **NOT_CONNECTED → UNKNOWN** |
| 2 | **CONFIRMED RECEIVABLES** | + | Încasări certe: facturi emise/contracte semnate, cu termen și sumă ferme | `RECEIVABLES` | **NOT_CONNECTED → UNKNOWN** |
| 3 | **PROBABLE RECEIVABLES** | + | Încasări probabile: rezervări, avansuri anunțate, pipeline cu probabilitate explicită — raportate separat, niciodată amestecate cu cele certe | `RECEIVABLES` + `SALES` | **NOT_CONNECTED → UNKNOWN** |
| 4 | **PAYABLES** | − | Obligații de plată către furnizori, cu scadențe | `PAYABLES` | **CONNECTED** (Operational — obligații de plată) |
| 5 | **DEBT SERVICE** | − | Rate de credit, dobânzi, leasing — serviciul datoriei pe orizont | `FINANCING` | **CONNECTED** (Operational) |
| 6 | **PAYROLL / TAX** | − | Salarii, contribuții, taxe și impozite recurente cu scadențe legale | `PEOPLE` + `ACCOUNTING` | **CONNECTED** (Operational) |
| 7 | **PROJECT COMMITMENTS** | − | Angajamente de proiect deja asumate (comenzi de materiale, contracte de execuție) care VOR consuma cash, chiar dacă nu sunt încă facturate | `PROJECTS` + `SUPPLIERS` | **PARTIAL** (comenzi materiale în Operational) |

Reguli de compunere:

- Fiecare componentă se calculează **per orizont** (§3), nu ca total unic.
- Componentele pozitive și negative **nu se compensează în tăcere**: rezultatul
  raportează întotdeauna și componentele individuale, nu doar suma.
- PROBABLE RECEIVABLES intră în proiecție **doar marcate explicit ca probabile**,
  cu proveniența lor din funnel ([SALES_INTELLIGENCE.md](SALES_INTELLIGENCE.md));
  o proiecție „fără probabile" este întotdeauna disponibilă alături.
- Dacă **oricare** componentă este UNKNOWN, `PROJECTED LIQUIDITY` pe acel orizont
  este **UNKNOWN**, cu enumerarea exactă a componentelor lipsă (§5).

---

## 3. Orizonturile de proiecție

Proiecția se calculează pe **7 orizonturi fixe**: AZI · 7 · 14 · 21 · 30 · 60 · 90 zile.

| Orizont | Întrebarea la care răspunde | Utilizare tipică |
|---|---|---|
| **AZI** | Câți bani avem acum, efectiv? | Starea de fapt; baza tuturor proiecțiilor |
| **7 zile** | Trecem de săptămâna asta? | Scadențe imediate, salarii, urgențe |
| **14 zile** | Există o coliziune de scadențe în 2 săptămâni? | Ordonarea plăților propuse (doar propuneri) |
| **21 zile** | Se acumulează un deficit înainte de finalul lunii? | Semnal timpuriu pentru încasări de accelerat |
| **30 zile** | Cum arată luna, cap-coadă? | Ritm lunar: taxe, rate, payroll complet |
| **60 zile** | Următoarele 2 luni susțin angajamentele de proiect? | Decizii de angajare a unor comenzi noi |
| **90 zile** | Care este tendința structurală a lichidității? | Strategie: finanțare, prețuri, ritm vânzări |

- Orizonturile sunt **cumulative** (proiecția la 30 include tot ce e până la 30).
- Un deficit proiectat pe orice orizont produce o **observație** pentru
  [Observation Engine](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md)
  și poate deveni episod executiv în
  [Proactive CEO Pipeline](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md) —
  care ajunge la Adrian doar prin regulile
  [Founder Attention](../23-founder-attention/FOUNDER_ATTENTION_ARCHITECTURE.md).
- Pragurile de alertă (minim de siguranță, deficit critic) sunt **configurate per
  companie** în `companyConfig.js`, nu hardcodate în motor.

---

## 4. Separarea strictă a celor 6 concepte

Regula absolută **CASH ≠ PROFIT** se aplică prin separarea explicită a șase
concepte pe care limbajul curent le amestecă. CEO AI le folosește **doar** cu
sensurile de mai jos și **nu substituie niciodată unul cu altul**.

| Concept | Definiție | Ce NU este | Sursa |
|---|---|---|---|
| **CASH** | Bani efectiv existenți în bancă/casă, acum | Nu e profit, nu e facturat, nu e „de încasat" | `BANK` |
| **PROFIT** | Rezultat contabil: venituri minus cheltuieli pe o perioadă | Nu garantează niciun leu în cont; poți fi profitabil și fără cash | `ACCOUNTING` |
| **REVENUE** | Venit recunoscut/facturat pe o perioadă | Nu e încasare; o factură emisă nu e cash | `ACCOUNTING` + `SALES` |
| **CONTRACTED REVENUE** | Valoare totală contractată (ex. antecontracte/contracte pe unități Bell) | Nu e venit recunoscut și nu e cash; se poate întinde pe ani | `CONTRACTS` + `SALES` |
| **EXPECTED CASH** | Încasări viitoare estimate: certe (confirmed) + probabile (probable), fiecare marcată distinct | Nu e sold; e o proiecție cu grade de certitudine diferite | `RECEIVABLES` + `SALES` |
| **AVAILABLE CASH** | Cash-ul utilizabil DUPĂ rezervarea obligațiilor apropiate (payables scadente, rate, payroll/taxe) | Nu e soldul din bancă; soldul brut minte dacă marțea vin salariile | model derivat (`cashIntelligence.js`) |

Consecință practică: orice raport sau recomandare a CEO AI care conține o sumă
**numește explicit conceptul** („AVAILABLE CASH la 14 zile", nu „bani"). O
formulare ambiguă este tratată ca defect de raportare, nu ca stil.

---

## 5. Regula UNKNOWN — componenta lipsă nu se inventează NICIODATĂ

Regula de fier a modelului, derivată din principiul **date lipsă ≠ zero**:

1. O componentă fără sursă conectată sau cu date expirate (freshness depășită)
   primește valoarea **UNKNOWN** — nu `0`, nu o medie istorică, nu o estimare LLM.
2. Orice UNKNOWN **contaminează** agregatul: `PROJECTED LIQUIDITY` pe orizontul
   afectat devine UNKNOWN, cu lista exactă a componentelor lipsă și a orizonturilor
   afectate.
3. Fiecare UNKNOWN produce un **Data Gap** în
   [DATA_GAP_ENGINE.md](DATA_GAP_ENGINE.md) (`src/ceo/dataGapEngine.js`): DE CE
   contează, care e cea mai bună sursă, fix temporar vs. permanent, propunere de
   implementare — iar Information Request-ul rezultat rămâne **pregătit dar
   NETRIMIS** fără ApprovalGate.
4. O decizie de cash cu componente critice UNKNOWN se oprește în starea
   **DATA_REQUIRED** ([DECISION_ENGINE_V2.md](DECISION_ENGINE_V2.md)) — CEO AI
   spune „nu pot recomanda fără X", nu „probabil e în regulă".
5. Diferența **ZERO vs. NU AM DATE** este vizibilă în orice ieșire: `0` înseamnă
   „sursa conectată raportează zero"; `UNKNOWN` înseamnă „nu există sursă sau
   datele nu sunt de încredere". Cele două nu se afișează niciodată la fel.

---

## 6. Starea actuală — COMPANY INSTANCE #1: Profi Concept

Fotografia curentă a celor 7 componente, conform
[COMPANY_DATA_MAP.md](COMPANY_DATA_MAP.md):

| Componentă | Stare | Sursă actuală | Consecință |
|---|---|---|---|
| PAYABLES | **CONNECTED** | Operational (obligații de plată, scadențe) | Partea de ieșiri e vizibilă |
| DEBT SERVICE | **CONNECTED** | Operational | Ratele intră corect în proiecție |
| PAYROLL / TAX | **CONNECTED** | Operational | Scadențele recurente intră corect în proiecție |
| PROJECT COMMITMENTS | **PARTIAL** | Operational (comenzi materiale) | Angajamente de execuție incomplete → subestimare posibilă a ieșirilor |
| BANK BALANCE | **NOT_CONNECTED** | — (soldurile reale sunt la Dana; formular Excel în curs) | **UNKNOWN** — fără punct de plecare |
| CONFIRMED RECEIVABLES | **NOT_CONNECTED** | — | **UNKNOWN** — intrările certe invizibile |
| PROBABLE RECEIVABLES | **NOT_CONNECTED** | — (funnel-ul de vânzări nu are stagiile de încasare conectate) | **UNKNOWN** — intrările probabile invizibile |

**Concluzia sinceră a modelului, azi:** Profi Concept are vizibilă doar latura de
**ieșiri** (payables, rate, payroll/taxe). Fără `BANK` și `RECEIVABLES`,
`PROJECTED LIQUIDITY` este **UNKNOWN pe toate orizonturile** — iar CEO AI
raportează exact asta, plus Data Gap-urile corespunzătoare cu propunerile de
conectare (formularul Danei pentru solduri și încasări estimate fiind cel mai
scurt drum). Nu există și nu va exista o „estimare de lucru" care să mascheze
golul.

---

## 7. Legături

- [COMPANY_DATA_MAP.md](COMPANY_DATA_MAP.md) — registrul celor 22 de domenii; stările CONNECTED/PARTIAL/NOT_CONNECTED folosite aici
- [DATA_GAP_ENGINE.md](DATA_GAP_ENGINE.md) — cum devin componentele UNKNOWN cereri de date pregătite (netrimise fără ApprovalGate)
- [SALES_INTELLIGENCE.md](SALES_INTELLIGENCE.md) — sursa PROBABLE RECEIVABLES din funnel, fără stagii simulate
- [DECISION_ENGINE_V2.md](DECISION_ENGINE_V2.md) — regula 6+1 și starea DATA_REQUIRED pentru decizii cu componente lipsă
- [../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) — deficitele proiectate devin observații
- [../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md) — episoade executive din semnale de lichiditate
- [../23-founder-attention/FOUNDER_ATTENTION_ARCHITECTURE.md](../23-founder-attention/FOUNDER_ATTENTION_ARCHITECTURE.md) — singurul canal prin care un semnal de cash ajunge la Adrian
- [../04-executive-board/BOARD_ROLES.md](../04-executive-board/BOARD_ROLES.md) — perspectiva CFO din Board consumă același model, aceleași definiții
