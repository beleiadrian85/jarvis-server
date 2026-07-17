# OBSERVATION ESCALATION PROTOCOL — Protocolul de Escaladare a Observațiilor

> Când o observație depășește nivelul de simplă informare și trebuie **marcată**
> pentru Executive Board, pentru atenția fondatorului sau ca necesitând acțiune
> imediată — și ce înseamnă, exact, „marcată" în etapa curentă: **doar un flag
> și un motiv în audit, niciodată o convocare automată**.
>
> **Stare:** PROIECTAT — implementat GATED, flag implicit OFF, prima rulare
> exclusiv în Shadow Mode (`OBSERVATION_ENGINE_ENABLED=false`,
> `OBSERVATION_BOARD_ESCALATION_ENABLED=false`).

---

## 1. Principiu

Observation Engine **observă, nu decide**. Escaladarea nu este o acțiune —
este o **clasificare**. Motorul stabilește determinist, pe baza scorului și a
criteriilor de mai jos, dacă o observație merită analiza Executive Board,
atenția directă a fondatorului sau tratament urgent. Atât. Convocarea efectivă
a Boardului, notificarea lui Adrian și orice efect asupra lumii reale rămân
în afara acestui motor și trec, ca întotdeauna, exclusiv prin `approvalGate`.
Plățile sunt excluse total.

Trei flag-uri booleene pe structura canonică a observației
(vezi `/codex/schemas/observation.schema.json`) poartă rezultatul clasificării:

| Flag | Întrebarea la care răspunde |
|---|---|
| `requires_board_review` | Merită această problemă o analiză multi-perspectivă a Executive Board? |
| `requires_founder_attention` | Trebuie Adrian să vadă asta personal, chiar dacă nu e nevoie de Board? |
| `requires_immediate_action` | Fereastra de reacție este atât de scurtă încât amânarea = decizie implicită? |

Flag-urile sunt **independente**: o observație poate avea oricare combinație.
Toate trei sunt calculate determinist de `observationEscalation.js`, **înainte**
de orice apel LLM. Sinteza LLM (`observationSummary`) nu poate seta, ridica
sau coborî niciun flag de escaladare.

---

## 2. Criteriile `requires_board_review`

`requires_board_review = true` dacă **oricare** dintre condițiile de mai jos
este îndeplinită (evaluare OR, nu cumulativă):

| # | Criteriu | Sursă determinare |
|---|---|---|
| 1 | Severitate `critical` (scor ponderat ≥ 75) | `observationScoring` |
| 2 | Consecință **ireversibilă** cu severitate ≥ `high` | factorul de ireversibilitate + severitate |
| 3 | Impact financiar estimat ≥ **100.000 lei** | `metrics` / factorul de impact financiar |
| 4 | **Contradicție majoră de decizie** — observația contrazice o decizie aprobată anterior, fără explicație prin informații noi, context nou, ipoteze schimbate, revizuire explicită sau eroare recunoscută | categoria `decisions` + registrul de decizii |
| 5 | **≥ 3 sisteme afectate** simultan | factorul „sisteme afectate" |
| 6 | Problemă **repetată ȘI agravată** (`status = worsening` pe o cheie de deduplicare deja emisă) | `observationDeduplicator` |
| 7 | Amenință unul dintre cele **3 simptome F31** (§2.1) | detectori pe categorii |

### 2.1. Cele 3 simptome F31

F31 definește cele trei moduri în care o companie moare. O observație care
atinge oricare dintre ele escaladează automat la Board, indiferent de scor:

| Simptom | Ce înseamnă | Exemple de declanșare |
|---|---|---|
| **Lipsa cash-ului** | Compania nu-și mai poate acoperi obligațiile | gol de cash estimat, obligații critice fără acoperire, restanțe în creștere accelerată |
| **Lipsa credibilității** | Compania nu mai este crezută de clienți, parteneri, bancă | promisiuni de livrare încălcate repetat, rezervări anulate în lanț, risc reputațional confirmat |
| **Lipsa identității** | Compania nu mai știe ce este și contrazice propriul CODEX | decizii contrare COMPANY_DNA, derivă strategică nedeclarată, contradicții repetate cu principiile documentate |

Regulă de prudență: pentru simptomele F31, pragul de probă este mai jos decât
pentru restul criteriilor — o suspiciune întemeiată cu `data_quality` cel puțin
`partial` este suficientă pentru marcare. Marcarea este ieftină; ratarea unui
simptom F31 nu este.

### 2.2. Motivul escaladării

Fiecare marcare `requires_board_review = true` scrie în **audit** motivul
exact: criteriul (sau criteriile) declanșate, valorile care le-au declanșat și
`deduplication_key` a observației. O escaladare fără motiv auditat este o
încălcare de protocol și invalidează observația la `observationValidator`.

---

## 3. Criteriile `requires_founder_attention`

Marchează observațiile pe care Adrian trebuie să le vadă **personal**, chiar
dacă nu justifică o ședință de Board. `requires_founder_attention = true` dacă
**oricare**:

| # | Criteriu |
|---|---|
| 1 | `requires_board_review = true` (tot ce merge la Board ajunge, în final, la fondator) |
| 2 | Severitate ≥ `high` în categoriile `cash` sau `decisions` |
| 3 | Categoria `founder` — dependența operațională de fondator, formulată neutru („Compania depinde încă de intervenția fondatorului în X procese recurente") |
| 4 | Observația privește o decizie pe care **doar Adrian** o poate lua (autoritate nedelegată conform BOARD_AUTHORITY_MATRIX) |
| 5 | O decizie aprobată de Adrian rămâne **neexecutată** peste termenul asumat |

Acest flag **nu declanșează nicio notificare**. În Shadow Mode
(`OBSERVATION_ENGINE_SHADOW_MODE=true`) și cât timp
`OBSERVATION_NOTIFICATIONS_ENABLED=false`, `safe_to_notify` rămâne mereu
`false`, indiferent de flag-urile de escaladare.

---

## 4. Criteriile `requires_immediate_action`

Marchează observațiile în care **timpul însuși ia decizia** dacă nu se
intervine. `requires_immediate_action = true` doar dacă **ambele**:

1. Severitate ≥ `high`; **și**
2. Fereastra de reacție ≤ **3 zile** (factorul de urgență la nivel maxim) **sau**
   inacțiunea produce o consecință ireversibilă înainte de următoarea rulare
   zilnică aprofundată.

Precizare de guvernanță: „action" din numele flag-ului se referă la acțiunea
**oamenilor**, nu a motorului. Observation Engine nu execută nimic nici pentru
observațiile marcate astfel — nu trimite emailuri, nu creează task-uri, nu
modifică Operational/Gmail/Calendar. Flag-ul este un semnal de prioritizare
pentru fluxurile din aval, care rămân gated prin `approvalGate`.

---

## 5. Regula etapei curente: DOAR marcare

**În etapa curentă, escaladarea este exclusiv declarativă.**

| Ce FACE `observationEscalation` | Ce NU face |
|---|---|
| Setează cele 3 flag-uri pe observație | NU convoacă Executive Board |
| Scrie motivul escaladării în audit | NU notifică pe Adrian |
| Persistă starea în `jarvis_state` | NU creează task-uri sau decizii |
| Grupează observațiile escaladate în rezumatul rulării | NU apelează niciun director, niciun LLM de Board |

Poarta este `OBSERVATION_BOARD_ESCALATION_ENABLED`, **implicit `false`**.
Cât timp flag-ul este OFF, o observație cu `requires_board_review = true` este
doar o înregistrare în audit și în `jarvis_state` — nimic mai mult. Activarea
flag-ului este o decizie explicită a lui Adrian, nu o consecință a acumulării
de observații.

---

## 6. Fluxul viitor (etapă ulterioară, gated)

Când `OBSERVATION_BOARD_ESCALATION_ENABLED=true` (etapă viitoare, neactivată),
lanțul complet devine:

```
Observation Engine  →  Observation Validator  →  Executive Board  →  CEO Recommendation  →  Adrian
   (detectează)          (schema strictă +           (analiză           (sinteză unică,       (decizia
                          motiv de escaladare         multi-rol,          consultativă)         finală)
                          prezent în audit)           consultativă)
```

Reguli ale lanțului viitor:

1. **Nimic nu intră în Board fără validare.** O observație care nu trece de
   `observationValidator` (schemă canonică + motiv de escaladare auditat) nu
   poate constitui subiect de ședință.
2. **Ședința urmează BOARD_MEETING_PROTOCOL** (§7) — inclusiv cele 22 de
   puncte obligatorii, selecția deterministă a directorilor și cazurile de
   încheiere fără recomandare.
3. **Ieșirea Boardului este o recomandare CEO**, validată pe
   BOARD_OUTPUT_SCHEMA — niciodată o execuție.
4. **Adrian decide.** Recomandarea ajunge la fondator prin canalele aprobate;
   orice efect ulterior trece prin `approvalGate`. Plățile rămân excluse total.

---

## 7. Legătura cu BOARD_MEETING_PROTOCOL (04-executive-board)

Acest protocol este **furnizorul de intrare** al protocolului de ședință:

| Acest document (21-observation-engine) | BOARD_MEETING_PROTOCOL (04-executive-board) |
|---|---|
| Stabilește **dacă** o problemă merită Boardul | Stabilește **cum** se desfășoară ședința |
| Produce observația canonică validată + motivul escaladării | Consumă observația ca „Problema" (punctul 1 din cele 22) |
| `evidence[]`, `metrics`, `baseline`, `deviation`, `unknowns[]` | Alimentează „Datele disponibile" / „Datele lipsă" (punctele 3–4) |
| `category` a observației | Contribuie la selecția deterministă a directorilor convocați |
| `possible_causes[]`, `recommended_next_analysis[]` | Punct de plecare pentru „Ipotezele" și „Opțiunile" (punctele 5–6) |

Documente conexe:

- `/codex/04-executive-board/BOARD_MEETING_PROTOCOL.md` — procedura ședinței
- `/codex/04-executive-board/BOARD_AUTHORITY_MATRIX.md` — limitele de autoritate
- `/codex/04-executive-board/BOARD_OUTPUT_SCHEMA.md` — structura recomandării
- `/codex/schemas/observation.schema.json` — structura canonică a observației

---

## 8. Invarianți

1. Escaladarea este **determinare, nu acțiune** — flag + motiv în audit, atât.
2. LLM-ul nu setează și nu modifică flag-uri de escaladare.
3. `OBSERVATION_BOARD_ESCALATION_ENABLED=false` implicit; Boardul nu se
   convoacă automat în nicio circumstanță în etapa curentă.
4. `safe_to_notify=false` întotdeauna în Shadow Mode.
5. Orice simptom F31 (cash, credibilitate, identitate) escaladează la Board.
6. Nicio escaladare fără motiv auditat; nicio observație fără validare de schemă.
7. Orice efect asupra lumii reale trece exclusiv prin `approvalGate`; plățile
   sunt excluse total.
