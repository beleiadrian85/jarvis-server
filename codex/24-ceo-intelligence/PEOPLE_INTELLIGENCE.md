# PEOPLE INTELLIGENCE — Modelul contextual de performanță umană

> **STARE: PROIECTAT — parte din MASTER PHASE „CEO AI OPERATIONAL INTELLIGENCE"; implementare GATED (`src/ceo/peopleIntelligence.js`), exclusiv SHADOW.**
> Nicio evaluare nu este comunicată vreunei persoane, nicio intervenție nu se execută autonom. Orice intervenție propusă trece prin `proposalEngine` → **ApprovalGate → Adrian**. Modelul produce analiză pentru fondator, nu verdicte pentru oameni.

> **Poziționare:** acest document face parte din capitolul 24 și se sprijină pe lanțul deja construit: semnalele de disciplină intră ca observații `people` în [Observation Engine (cap. 21)](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md), sunt corelate în episoade de [Proactive CEO Pipeline (cap. 22)](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md), filtrate de [Founder Attention Gate (cap. 23)](../23-founder-attention/FOUNDER_ATTENTION_ARCHITECTURE.md) și pot fi analizate în shadow de rolul CHRO din [Executive Board (cap. 04)](../04-executive-board/BOARD_ROLES.md). Busola de interpretare este [FOUNDER DNA (cap. 02)](../02-founder-dna/FOUNDER_DNA.md).

---

## 1. Principiul fundamental

**Performanța umană ≠ număr de task-uri.** Aceasta este regulă absolută a Master Phase-ului, nu preferință de design.

Un om care închide 10 task-uri triviale nu a produs mai mult decât unul care a rezolvat o singură problemă grea, cu dependențe externe, la timp și fără reveniri. Un contor de task-uri măsoară activitate; CEO AI trebuie să înțeleagă **contribuție**. De aceea modelul este **contextual**: fiecare semnal despre un om se citește prin 10 factori, nu printr-o cifră.

Două consecințe directe:

1. **JARVIS nu publică clasamente și nu compară oameni pe volume.** Comparațiile brute pe număr de task-uri sunt interzise ca output.
2. **Date lipsă ≠ zero.** Un factor fără sursă conectată este `NOT_CONNECTED` / `UNKNOWN`, nu „scor 0". Un om nu poate fi penalizat de absența unui senzor (regula ZERO vs NU AM DATE din `companyDataMap`).

---

## 2. Cei 10 factori ai modelului contextual

| # | Factor | Ce măsoară | Întrebarea CEO |
|---|--------|-----------|----------------|
| 1 | **REZULTAT** | Ce s-a livrat efectiv, față de criteriul de acceptare | S-a obținut rezultatul cerut, nu doar „s-a lucrat"? |
| 2 | **PUNCTUALITATE** | Livrarea față de termen; întârzieri și tiparul lor | Termenele sunt respectate sau renegociate tacit? |
| 3 | **COMPLEXITATE** | Cât de grea era sarcina (tehnic, decizional, coordonare) | Volumul mic ascunde muncă grea? Volumul mare ascunde muncă trivială? |
| 4 | **DEPENDENȚE** | De cine/ce a depins livrarea; blocaje externe reale | Întârzierea e a omului sau a lanțului din jurul lui? |
| 5 | **CALITATE** | Livrarea a trecut acceptarea fără avertismente și fără reveniri | „Gata" a însemnat gata? |
| 6 | **ERORI REPETATE** | Același tip de greșeală, la același om, în timp | Este incident sau tipar? |
| 7 | **AUTOCORECȚIE** | Recunoașterea rapidă a greșelii + venirea cu soluție (F12) | Omul își vede singur eroarea sau o ascunde? |
| 8 | **INIȚIATIVĂ** | Probleme semnalate/rezolvate nesolicitat, propuneri proprii | Omul împinge compania înainte sau doar execută? |
| 9 | **IMPACT DE BUSINESS** | Efectul livrării asupra cash/vânzări/risc, nu doar bifarea sarcinii | Task-ul închis a mișcat ceva în companie? |
| 10 | **ÎNVĂȚARE** | Evoluția în timp: erori care dispar, sarcini noi asumate | Omul de azi e mai capabil decât cel de acum 3 luni? |

Reguli de utilizare a factorilor:

- Niciun factor nu se raportează izolat ca verdict. Analiza unei persoane citește **toți factorii disponibili** + lista explicită a celor `NOT_CONNECTED`.
- Un factor fără dovadă în spate nu se completează. Estimările fără sursă sunt interzise (aceeași disciplină ca la `cashIntelligence`: componenta lipsă → `UNKNOWN` + Data Gap, niciodată inventată).
- Factorii 3, 4 și 9 sunt **contextul** care interzice citirea brută a factorilor 1, 2 și 5. Un termen depășit (factor 2) cu dependență externă dovedită (factor 4) este o problemă de proces, nu de om.

---

## 3. Regula Founder DNA — F11

> **F11.** Greșeala poate fi iertată; repetarea aceleiași greșeli arată lipsa învățării.

Aplicarea operațională în People Intelligence:

| Situație | Interpretare | Reacția sistemului |
|---|---|---|
| **Prima greșeală** | Învățare. Cost acceptat al dezvoltării (F09: competența se dezvoltă prin mentorat). | Se înregistrează factual, cu dovadă. Nu generează episod și nu urcă la fondator, decât dacă impactul de business e major. |
| **Aceeași greșeală, repetată** | Nu se mai tratează ca incident. Semnalează una din trei probleme de analizat: **capacitate** (omul nu poate), **proces** (sistemul îl împinge în greșeală), **disciplină** (omul nu respectă ce știe). | Detectorul `repeated_discipline` (cap. 21) produce observație `people` cu tiparul + dovezile. Cauza dintre cele trei **se stabilește cu persoana, nu se presupune**. |
| **Greșeală recunoscută rapid + soluție** | Încredere păstrată (F12). Autocorecția (factor 7) contează explicit în favoarea omului. | Se notează ca semnal pozitiv, cu aceeași cerință de dovadă. |
| **Ascundere, minciună, manipulare** | Linie roșie (F13) — distruge încrederea, indiferent de performanță. | Escaladare directă către Adrian, cu dovezile. Singura categorie care sare peste treptele de intervenție. |

Limita de răbdare rămâne a fondatorului, nu a sistemului: F10 („răbdarea se termină când omul obosește sau trage compania în jos") este o **decizie a lui Adrian**, pe care JARVIS o poate documenta cu date, dar nu o poate lua.

---

## 4. Intervențiile propuse — ce face sistemul cu un tipar

Când analiza indică o problemă, People Intelligence **nu critică — propune o intervenție**, aleasă după cauza probabilă. Toate sunt *propuneri*: circuit `proposalEngine` → ApprovalGate → Adrian APPROVE/MODIFY/REJECT. Zero execuție autonomă.

| Intervenție | Când se propune | Exemplu de propunere |
|---|---|---|
| **Coaching** | Cauza probabilă = capacitate/competență (F09) | „Sesiune de lucru Adrian/Dana cu X pe întocmirea rapoartelor de recepție — 3 rapoarte respinse pe același motiv." |
| **Clarificare** | Cauza probabilă = sarcină ambiguă, criteriu de acceptare slab | „Task-urile către X să includă criteriu de acceptare măsurabil — 2 din 3 dispute au pornit de la formulare vagă." |
| **Proces** | Aceeași greșeală apare la **mai mulți oameni** — problema e sistemul | „Introducere pas de verificare la comenzile de materiale — eroarea apare și la X și la Y." |
| **Automatizare** | Sarcina e mecanică, repetitivă, cu erori de neatenție | „Generarea automată a situației săptămânale — 40 min/săptămână și sursă recurentă de scăpări." |
| **Redistribuire** | Nepotrivire om–sarcină sau supraîncărcare dovedită | „Mutarea urmăririi furnizorilor de la X la Y — X are 6 task-uri deschise cu termen, Y are 1." |
| **Task** | Problema punctuală are o rezolvare concretă, delegabilă | Task Proposal complet: responsabil, termen, rezultat așteptat, regulă de verificare (formatul `proposalEngine`). |
| **Escaladare** | Tiparul persistă după intervenții aprobate, sau atinge o linie roșie (F13) | Episod executiv către Adrian, cu istoricul intervențiilor încercate și dovezile. |

Ordinea implicită este de la intervenția cea mai ieftină și mai puțin invazivă (clarificare) către cea mai grea (escaladare). Propunerea de intervenție **nu este aprobare, aprobarea nu este rezultat verificat**: după aprobare, `closedLoop` monitorizează dacă intervenția a schimbat tiparul, iar lecția se stochează auditabil.

---

## 5. Reguli de formulare — obligatorii, fără excepție

### 5.1 Formulare neutră

- **Fapte, nu etichete.** Interzis: „leneș", „incapabil", „dezinteresat", „problematic". Permis: „task #142 marcat rezolvat cu raportul «gata» (sub 15 caractere); criteriul de acceptare cerea dovadă foto."
- **Fără judecăți de caracter.** Aceeași regulă pe care o aplică deja detectorul `people` din cap. 21: observația se emite explicit „fără judecată de caracter — cauza trebuie separată".
- **Cauzele se enumeră, nu se decid.** Lista standard de cauze posibile: lipsa competenței, lipsa resurselor, lipsa clarității sarcinii, lipsa autorității, lipsa disciplinei, **lipsa datelor pentru o concluzie**. Ultima opțiune este întotdeauna prezentă. Cauza reală se stabilește în discuție cu persoana.
- **Separarea „nu se poate"** (F22): imposibil tehnic / legal / în buget / în termen / cu metoda actuală / necunoaștere personală — niciodată amestecate într-un singur reproș.

### 5.2 Dovezi

- **Niciun semnal fără dovadă.** Fiecare afirmație poartă: task ID, titlu, citat din raport, termen vs. dată reală, criteriul de acceptare. Format identic cu `evidence` din detectorii de disciplină.
- **Dovada precede concluzia.** Dacă dovada nu poate fi citată, semnalul nu există. Nu se agregă „impresii".
- **Auditabil cap-coadă.** Orice analiză de persoană ajunsă în episod/brief trebuie să fie reconstruibilă din audit: ce detector a tras, pe ce task, cu ce evidență, la ce oră.

---

## 6. Ce este conectat azi

Domeniul `PEOPLE` din [`companyDataMap`](../24-ceo-intelligence/) este `CONNECTED` prin două surse reale:

| Sursă | Ce oferă | Stare |
|---|---|---|
| **Operational — task-uri** | Status, termen, responsabil, criteriu de acceptare obligatoriu, raport structurat (`resolution_done/proof/remaining`), blocaj cu motiv (`blocked_reason/blocked_on`), cost numeric la raport, acceptare cu avertismente | CONNECTED, timp real |
| **Detectorii de disciplină D1–D12** (`src/supervisor/detectors.js`, familia definită de Codul de Disciplină) | Semnale deterministe per task, cu dovadă atașată | CONNECTED (parțial acoperit — vezi mai jos) |

Detectorii **rulați azi determinist în JARVIS** din registrul D1–D12:

| Detector | Semnal | Severitate |
|---|---|---|
| **D1** `raport_gol` | Task „rezolvat" cu raport gol/junk (sub 15 caractere sau formulă goală) | RIDICAT |
| **D2** `neterminat` | Raportul menționează muncă viitoare, dar statusul spune „gata" | RIDICAT |
| **D3** `termen_depasit` | Termen depășit pe task deschis | RIDICAT |
| **D4** `validare_restanta` | Rezolvat de >2 zile, neacceptat — bottleneck la Supervizor, nu la executant | MEDIU |
| **D12** `rezolvat_partial` | Livrat parțial — nu poate fi acceptat ca închis | RIDICAT |

Restul regulilor din Codul de Disciplină („Comanda 1") acționează azi ca **gărzi blocante direct în Operational** (criteriu de acceptare obligatoriu la creare, raport structurat, gardă la validare, detecție duplicat, anti-spam pe schimbări de status, blocaj cu motiv), nu ca detectori raportați în JARVIS — prin design: regula blocantă previne, detectorul doar constată.

Deasupra detectorilor, observația `repeated_discipline` (cap. 21) agregă semnalele **per persoană** și detectează tiparul repetat — puntea directă către regula F11 din §3.

### Acoperirea celor 10 factori cu sursele de azi

| Factor | Sursă azi | Stare |
|---|---|---|
| 1. REZULTAT | Status + raport structurat + criteriu de acceptare | **CONNECTED** |
| 2. PUNCTUALITATE | Termen vs. închidere; D3 | **CONNECTED** |
| 3. COMPLEXITATE | — | **NOT_CONNECTED** |
| 4. DEPENDENȚE | `blocked_reason/blocked_on` (doar blocaje declarate) | PARTIAL |
| 5. CALITATE | D1/D2/D12 + acceptare cu avertismente (proxy, nu măsură directă) | PARTIAL |
| 6. ERORI REPETATE | `repeated_discipline` (doar erori de disciplină, nu erori de domeniu) | PARTIAL |
| 7. AUTOCORECȚIE | — | **NOT_CONNECTED** |
| 8. INIȚIATIVĂ | — | **NOT_CONNECTED** |
| 9. IMPACT DE BUSINESS | Cost numeric la raport (doar costul, nu efectul) | PARTIAL |
| 10. ÎNVĂȚARE | `closedLoop` (infrastructură în Master Phase, fără istoric încă) | NOT_CONNECTED |

---

## 7. Ce lipsește — Data Gaps declarate

Golurile de mai jos sunt înregistrate ca Data Gap în `dataGapEngine` (cu WHY / BEST SOURCE / PROPOSED IMPLEMENTATION); Information Request-urile aferente sunt **pregătite dar NETRIMISE** fără ApprovalGate.

| Gap | De ce contează | Cea mai bună sursă propusă |
|---|---|---|
| **Complexitate (factor 3)** | Fără ea, orice agregare degenerează în număr de task-uri — exact ce interzice §1. | Câmp `complexity` (S/M/L sau 1–5) setat de Adrian la creare sau la validare; retroactiv nu se estimează. |
| **Impact de business (factor 9)** | „Task închis" nu spune dacă a mișcat cash, vânzări sau risc. Fără impact, coaching-ul și redistribuirea se propun orb. | Legarea task-ului de domeniul afectat (CASH/SALES/CONSTRUCTION…) + efect estimat la creare, verificat la închidere prin `closedLoop`. |
| **Autocorecție (factor 7)** | F12 este principiu al fondatorului fără senzor: azi nu vedem cine își recunoaște greșeala și vine cu soluție. | Evenimente de re-deschidere + cine a semnalat problema (executantul însuși vs. validatorul). |
| **Inițiativă (factor 8)** | Se văd doar sarcinile primite, nu cele propuse. | Marcaj `initiated_by` pe task-uri create de executant + observațiile semnalate proactiv. |
| **Erori de domeniu (factor 6, dincolo de disciplină)** | D1–D12 văd disciplina raportării, nu greșelile de conținut (comandă greșită, calcul greșit). | Motivul respingerii la validare, structurat (azi text liber). |
| **Istoric de învățare (factor 10)** | Fără serie de timp per persoană, „evoluția" e impresie. | Acumulare `closedLoop` + lecții stocate în `jarvis_state` + audit (fără self-modifying code). |

Regula de citire până la închiderea gap-urilor: analiza de persoană se emite **doar cu lista factorilor lipsă atașată**. O concluzie care ar depinde critic de un factor `NOT_CONNECTED` devine `DATA_REQUIRED`, nu recomandare finală — aceeași regulă ca în `decisionEngineV2`.

---

## 8. Legături

- [FOUNDER_DNA.md](../02-founder-dna/FOUNDER_DNA.md) — F08–F19 (oameni), în special F09–F13; liniile roșii.
- [OBSERVATION_ENGINE_ARCHITECTURE.md](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) + [OBSERVATION_TYPES.md](../21-observation-engine/OBSERVATION_TYPES.md) — detectorul `people` / `repeated_discipline`, reutilizarea D1–D12 read-only.
- [PROACTIVE_CEO_ARCHITECTURE.md](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md) — cum devin tiparele de persoană episoade executive.
- [FOUNDER_ATTENTION_ARCHITECTURE.md](../23-founder-attention/FOUNDER_ATTENTION_ARCHITECTURE.md) — de ce un tipar de disciplină ajunge în digest, nu în întrerupere.
- [BOARD_ROLES.md](../04-executive-board/BOARD_ROLES.md) — rolul CHRO consumă acest model în shadow.
- `src/ceo/peopleIntelligence.js` (GATED), `src/ceo/proposalEngine.js`, `src/ceo/closedLoop.js`, `src/supervisor/detectors.js` — implementarea.

---

*Acest document descrie un instrument de înțelegere pentru fondator, nu un sistem de evaluare a angajaților. Nicio ieșire a modelului nu se comunică unei persoane evaluate fără decizia explicită a lui Adrian.*
