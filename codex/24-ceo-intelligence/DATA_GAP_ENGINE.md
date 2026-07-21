# DATA GAP ENGINE — Motorul de Lacune de Date (CEO AI Operational Intelligence)

> **STARE: INFRASTRUCTURĂ + SHADOW.** `src/ceo/dataGapEngine.js` detectează, structurează
> și prioritizează lacunele de date ale companiei și **pregătește** Information Requests —
> dar **NU trimite nimic**. Orice cerere de informații către un om rămâne în starea
> **PREPARED / NETRIMIS** până când trece prin **ApprovalGate** și Adrian aprobă explicit.
> Principii absolute moștenite din MASTER PHASE: **date lipsă ≠ zero**, **propunere ≠ execuție**,
> **ZERO acțiuni autonome**. Motorul nu inventează niciodată o valoare pentru a umple un gol.

---

## 1. Principiu

Un CEO care nu știe **ce nu știe** ia decizii proaste cu încredere mare — cel mai
periculos mod de a greși. Data Gap Engine este organul prin care CEO AI își cunoaște
propria ignoranță: pentru fiecare din cele **22 de domenii** din
[`COMPANY_DATA_MAP.md`](./COMPANY_DATA_MAP.md) (CASH, BANK, ACCOUNTING, PAYABLES,
RECEIVABLES, SALES, LEADS, BELL_INVENTORY, PROJECTS, CONSTRUCTION, SUPPLIERS,
CONTRACTS, PEOPLE, TASKS, WEBSITE_TRAFFIC, MARKETING, EMAIL, CALENDAR, LEGAL,
ASSETS, FINANCING, DECISIONS), motorul transformă stările `PARTIAL` și
`NOT_CONNECTED` în obiecte **DATA GAP** explicite, auditabile și prioritizabile.

Distincția fundamentală pe care o apără acest motor:

| Situație | Interpretare corectă | Interpretare INTERZISĂ |
|---|---|---|
| Sursa raportează valoarea 0 | **ZERO** — știm și e zero | — |
| Sursa nu există / nu e conectată | **NU AM DATE** → DATA GAP | „probabil zero" / valoare estimată prezentată ca fapt |
| Sursa există dar e veche (freshness depășit) | **DATE ÎNVECHITE** → DATA GAP de prospețime | „ultima valoare e valabilă și azi" |
| Sursa există dar acoperă parțial | **PARTIAL** → DATA GAP de acoperire | extrapolare tăcută la întreg |

Consumatorii din aval respectă aceeași disciplină:
[`CASH_INTELLIGENCE.md`](./CASH_INTELLIGENCE.md) marchează componentele lipsă drept
**UNKNOWN** (niciodată inventate), iar Decision Engine V2 refuză recomandarea finală
și emite **DATA_REQUIRED** când un gap atinge o dată critică pentru decizie.

---

## 2. Ce ESTE / ce NU ESTE

| Data Gap Engine ESTE | Data Gap Engine NU ESTE |
|---|---|
| Un registru structurat al lacunelor, derivat din Company Data Map | Un generator de estimări care umple golurile |
| Un motor care pregătește Information Requests **NETRIMISE** | Un canal de mesagerie către Dana / Nelu / oricine |
| Un mecanism de prioritizare după ROI | O listă de dorințe tehnice fără impact business |
| Un furnizor de `unknowns` pentru Cash / Decision / Board | O scuză pentru a amâna decizii care se pot lua cu datele existente |
| Artefacte de audit (`jarvis_state` + audit) | Cod care se auto-modifică sau conectori instalați automat |

---

## 3. Structura canonică a unui DATA GAP

Fiecare gap este un obiect complet — fără câmpuri opționale la nivel conceptual.
Un gap căruia îi lipsește WHY sau PROPOSED IMPLEMENTATION nu este un gap valid,
ci o observație nefinisată.

| Câmp | Întrebarea la care răspunde |
|---|---|
| `id` | Identificator stabil, auditabil |
| `domain` | Din ce domeniu al Company Data Map provine |
| `what_is_missing` | Ce anume nu știm (precis, nu vag) |
| `why` | **De ce contează** — ce decizie / calcul / risc blochează |
| `best_source` | Sursa ideală de adevăr (sistem, integrare, om) |
| `temporary_solution` | Cum acoperim MÂINE dimineață, cu efort uman minim |
| `permanent_solution` | Cum dispare gap-ul definitiv (conector, proces, automatizare) |
| `proposed_implementation` | Pașii concreți, cine, ce efort, ce risc |
| `owner` | Omul responsabil de sursa datelor (din Company Data Map) |
| `business_impact` | Impactul absenței: cash, profit, risc, timp fondator |
| `decisions_blocked` | Deciziile active care au emis DATA_REQUIRED pe acest gap |
| `roi_score` | Scorul de prioritizare (vezi §5) |
| `status` | `OPEN` → `REQUEST_PREPARED` → `REQUEST_APPROVED` → `REQUEST_SENT` → `DATA_RECEIVED` → `VERIFIED` → `CLOSED` (sau `RECURRING`) |

### Exemplul canonic: SOLD BANCAR

| Câmp | Valoare |
|---|---|
| `domain` | BANK |
| `what_is_missing` | Soldurile curente ale conturilor bancare ale companiei |
| **WHY** | Fără sold real, **forecast-ul de cash este fictiv**: PROJECTED LIQUIDITY din Cash Intelligence pornește de la BANK BALANCE; fără el, orizonturile 7/14/30/60/90 zile sunt UNKNOWN, iar orice decizie de plată / angajament devine un pariu |
| **BEST SOURCE** | Integrare bancară directă (API / PSD2) → import extras (MT940/CSV) → introducere manuală de către Dana, în această ordine a calității |
| **TEMPORARY** | Dana introduce soldurile conturilor manual, la un moment fix al zilei (formularul deja pregătit) |
| **PERMANENT** | Conector automat la bancă (sau import programat de extrase), cu freshness zilnic garantat și verificare de consistență |
| **PROPOSED IMPLEMENTATION** | (1) Activăm soluția temporară: Information Request către Dana, aprobat de Adrian; (2) în paralel, evaluăm conectorul bancar: efort, cost, acces, risc; (3) System Improvement Proposal prin Improvement Engine, aprobare Adrian; (4) după conectare, soluția temporară devine verificare de rezervă, nu sursă primară |
| `owner` | Dana |
| `business_impact` | CRITIC — blochează întregul model de cash și toate deciziile dependente de lichiditate |
| `roi_score` | Maxim: cost mic de închidere (temporar = minute/zi), valoare mare (deblochează forecast-ul real) |

Acest exemplu este **etalonul**: orice gap nou se scrie la același nivel de precizie.

---

## 4. Information Request — pregătit, NETRIMIS

Când soluția temporară a unui gap cere o acțiune umană, motorul **pregătește** un
Information Request complet — dar **nu îl trimite**. Trimiterea este un efect, iar
**ApprovalGate este singura poartă pentru efecte** (vezi
[`PROPOSAL_ENGINE.md`](./PROPOSAL_ENGINE.md)).

### Structura cererii

| Câmp | Exemplu canonic |
|---|---|
| `to` | Dana |
| `request` | „Introdu soldurile conturilor bancare până la **09:00**" |
| `format` | Formularul convenit (câmp per cont, valută, dată) |
| `deadline` | 09:00, zilnic (sau punctual, după caz) |
| `why_for_human` | O frază, pe înțelesul destinatarului: „fără sold, forecast-ul de cash al zilei nu e real" |
| `linked_gap` | Gap-ul pe care îl închide / reduce |
| `status` | **PREPARED — NETRIMIS** |

### Ciclul de viață

```
PREPARED (netrimis) ──ApprovalGate──▶ APPROVED de Adrian ──▶ SENT ──▶ RECEIVED ──▶ VERIFIED ──▶ gap CLOSED / RECURRING
        │
        └── REJECTED / MODIFIED de Adrian → cererea se rescrie sau se abandonează
```

Reguli:

1. **Nicio cerere nu pleacă fără ApprovalGate.** Nici măcar una „evident utilă".
2. **Consolidare, nu bombardament** — cererile către același om se grupează într-un
   singur formular / mesaj (o cerere consolidată către Dana, nu zece separate).
   Ritmul respectă politicile din
   [`NOTIFICATION_POLICY.md`](../23-founder-attention/NOTIFICATION_POLICY.md) și
   [`QUIET_HOURS_POLICY.md`](../23-founder-attention/QUIET_HOURS_POLICY.md).
3. **RECEIVED ≠ VERIFIED** — datele primite se validează (complet? plauzibil? proaspăt?)
   înainte ca gap-ul să-și schimbe starea; verificarea urmează bucla din
   [`CLOSED_LOOP.md`](./CLOSED_LOOP.md): aprobat → executat → verificat → învățat.
4. Cererile recurente (ex. sold zilnic) se aprobă **o dată ca regulă** de Adrian,
   explicit ca regulă recurentă — nu se deduce recurența dintr-o aprobare punctuală.
5. Neonorarea repetată a unei cereri aprobate nu declanșează critică automată — se
   tratează contextual prin People Intelligence (primă dată = învățare; repetat =
   problemă de proces/capacitate, cu propunere de coaching sau simplificare a cererii).

---

## 5. Prioritizarea gap-urilor după ROI

Nu toate gap-urile merită închise, și niciodată toate deodată. Ordinea o dă ROI-ul:

**ROI = Valoarea deblocată / Costul închiderii**

| Dimensiune | Ce măsoară | Semnal de scor mare |
|---|---|---|
| **Impact business** | Cash, profit, risc, timp fondator afectate de absență | Blochează forecast-ul de cash sau o plată/încasare |
| **Decizii blocate** | Câte decizii active au DATA_REQUIRED pe acest gap | Decision Engine V2 a refuzat recomandare finală din cauza lui |
| **Frecvența nevoii** | Cât de des e nevoie de această dată | Zilnic (sold bancar) > trimestrial (raport anual) |
| **Costul greșelii** | Ce se întâmplă dacă decidem fără ea | Ireversibil / scump > cosmetic |
| **Costul închiderii** | Efort tehnic + efort uman recurent + bani + risc | Minute/zi de la Dana < integrare de săptămâni |
| **Degradare în timp** | Gap-ul se agravează dacă e ignorat? | Da (datorii care se acumulează nevăzute) |

Niveluri de prioritate:

| Nivel | Definiție | Tratament |
|---|---|---|
| **P0** | Blochează cash forecast sau o decizie activă cu termen | Information Request pregătit imediat + vizibil în Daily CEO Digest |
| **P1** | Impact business mare, fără termen imediat | Propunere de închidere în următorul ciclu de aprobare |
| **P2** | Util, cost mic, valoare moderată | Se închide oportunist, la pachet cu altceva |
| **P3** | Valoare scăzută sau cost disproporționat | Rămâne documentat; NU se cere efort uman pentru el |

Reguli de disciplină: un gap **P3 nu generează Information Request** — timpul Danei
și al lui Nelu este o resursă a companiei, nu un buffer al motorului. Scorul ROI se
recalculează când apar decizii noi blocate sau când costul închiderii scade (ex. un
conector devine disponibil). Prioritizarea alimentează **Company Data Health Score**
din Company Data Map: sănătatea datelor crește închizând gap-urile cu ROI maxim, nu
pe cele ușoare.

---

## 6. Interacțiuni cu restul sistemului

| Sistem | Relația cu Data Gap Engine |
|---|---|
| [`COMPANY_DATA_MAP.md`](./COMPANY_DATA_MAP.md) | Sursa stărilor CONNECTED / PARTIAL / NOT_CONNECTED și a owner-ilor; gap-urile sunt derivate, nu paralele |
| [`CASH_INTELLIGENCE.md`](./CASH_INTELLIGENCE.md) | Componentele UNKNOWN din modelul de lichiditate devin automat gap-uri; niciodată valori inventate |
| Decision Engine V2 | `DATA_REQUIRED` pe o decizie ridică prioritatea gap-ului legat; **decizie cu date critice lipsă ≠ recomandare finală** |
| [`PROPOSAL_ENGINE.md`](./PROPOSAL_ENGINE.md) + ApprovalGate | Singura cale prin care un Information Request sau un conector nou devine realitate |
| [`../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md`](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) | Gap-urile persistente sau în degradare pot deveni observații și urcă prin triaj |
| [`../22-proactive-ceo/CEO_BRIEF_FORMAT.md`](../22-proactive-ceo/CEO_BRIEF_FORMAT.md) | Secțiunea `CE DATE LIPSESC` a briefului se hrănește din acest registru |
| [`../23-founder-attention/DAILY_DIGEST_POLICY.md`](../23-founder-attention/DAILY_DIGEST_POLICY.md) | Gap-urile P0 apar în Daily CEO Digest — informare, nu cerere de acțiune |
| [`../04-executive-board/BOARD_MEETING_PROTOCOL.md`](../04-executive-board/BOARD_MEETING_PROTOCOL.md) | Directorii primesc `unknowns` explicite; Boardul nu deliberează pe date pretinse |
| [`CLOSED_LOOP.md`](./CLOSED_LOOP.md) | Închiderea unui gap se **verifică** (datele chiar curg?) și lecția se stochează auditabil |
| Improvement Engine | Soluțiile PERMANENT devin System Improvement Proposals — motorul **nu își instalează singur** conectori |

---

## 7. Reguli absolute

1. **Date lipsă ≠ zero.** Un gol se raportează ca gol, întotdeauna.
2. **Nicio valoare inventată** — nici ca „estimare rezonabilă" prezentată drept fapt.
3. **Information Request pregătit ≠ trimis.** Fără ApprovalGate, nimic nu pleacă.
4. **Aprobare ≠ rezultat** — gap-ul se închide doar după VERIFIED, nu după SENT.
5. **P3 nu consumă oameni.** Efortul uman se cere doar unde ROI-ul îl justifică.
6. **Totul auditabil** — fiecare gap, cerere și tranziție de stare lasă urmă în audit.
7. **Nucleul e generic** — sold bancar / Dana / 09:00 sunt configurația COMPANY
   INSTANCE #1 (Profi Concept), nu constante ale motorului.
