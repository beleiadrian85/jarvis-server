# OBSERVATION_SCORING — Scoring determinist al observațiilor

> **Stare:** PROIECTAT — implementat GATED, flag implicit OFF, prima rulare exclusiv în Shadow Mode.

Scoringul este pasul care transformă o observație detectată într-o severitate. Rulează **înainte** de orice apel LLM, este **pur determinist** (fără aleator, fără model, fără estimări subiective) și este implementat în `src/observationEngine/observationScoring.js`. Severitatea rezultată intră în structura canonică a observației (câmpul `severity`) și este validată de `observationValidator` conform `/codex/schemas/observation.schema.json`.

---

## 1. Principiu

1. Detectorii (`observationDetectors`) produc observații cu metrici bruți.
2. Scoringul calculează un **scor brut** din factori punctați, plafonat la 100.
3. Scorul brut se înmulțește cu **multiplicatorul de calitate a datelor**.
4. Scorul final se mapează determinist pe **severitate**.
5. Abia apoi, opțional, LLM-ul (`observationSummary`) redactează sinteza — fără drept de a modifica scorul sau severitatea.

```
scor_final = min(scor_brut, 100) × multiplicator_calitate_date
severitate = mapare(scor_final)
```

---

## 2. Tabelul factorilor de scoring

| # | Factor | Condiție | Puncte |
|---|--------|----------|--------|
| 1 | **Impact financiar** | ≥ 100.000 lei | **30** |
| | | ≥ 25.000 lei | **20** |
| | | ≥ 5.000 lei | **10** |
| | | > 0 lei | **5** |
| 2 | **Urgență** (orizont de timp) | ≤ 3 zile | **15** |
| | | ≤ 7 zile | **10** |
| | | ≤ 21 zile | **5** |
| 3 | **Ireversibilitate** | consecința nu mai poate fi corectată ulterior | **10** |
| 4 | **Probabilitate** | probabilitate estimată (0–1) × 10 | **0–10** |
| 5 | **Sisteme afectate** | ≥ 3 sisteme | **10** |
| | | 2 sisteme | **6** |
| | | 1 sistem | **2** |
| 6 | **Persistență / agravare** | status `worsening` | **10** |
| | | status `repeated` | **5** |
| 7 | **Risc juridic** | prezent | **5** |
| 8 | **Risc reputațional** | prezent | **5** |
| 9 | **Risc operațional** | prezent | **5** |
| 10 | **Dependență de fondator** | problema depinde de intervenția fondatorului | **5** |

Reguli de aplicare:

- În interiorul unui factor cu praguri (impact financiar, urgență, sisteme afectate, persistență) se aplică **un singur palier** — cel mai mare care se potrivește. Palierele nu se cumulează între ele.
- Factorii diferiți **se cumulează** între ei.
- **Scorul brut se plafonează la 100** înainte de aplicarea multiplicatorului.

---

## 3. Multiplicatorul de calitate a datelor

Scorul brut plafonat se înmulțește cu multiplicatorul corespunzător câmpului `data_quality` al observației:

| `data_quality` | Multiplicator | Semnificație |
|----------------|---------------|--------------|
| `complete` | **1.00** | toate sursele necesare disponibile, date proaspete |
| `partial` | **0.85** | surse lipsă parțial sau date incomplete |
| `poor` | **0.60** | date fragmentare, vechi sau nesigure |

### Vechimea datelor reduce `data_quality`

Vechimea datelor nu scade punctele factorilor direct — ea **degradează `data_quality`**, iar degradarea reduce scorul final prin multiplicator:

- date proaspete, în fereastra normală de colectare → `complete`;
- date mai vechi decât fereastra așteptată a sursei (sursa nu s-a actualizat la timp) → cel mult `partial`;
- date semnificativ învechite sau sursă indisponibilă de mai multe rulări → `poor`.

Efectul dorit: o observație construită pe date vechi **nu poate atinge aceeași severitate** ca aceeași observație pe date proaspete. Dacă vechimea datelor este ea însăși problema (sursă picată, job care nu rulează), aceasta se raportează separat ca observație `ops_risk`, nu se compensează prin umflarea scorului.

---

## 4. Maparea scor → severitate

| Scor final | Severitate |
|------------|------------|
| ≥ 75 | `critical` |
| ≥ 55 | `high` |
| ≥ 35 | `medium` |
| ≥ 15 | `low` |
| < 15 | `info` |

Note:

- Pragurile se aplică pe **scorul final** (după multiplicator), nu pe scorul brut.
- Semnalele slabe (scor < 15) sunt eliminate de `observationDeduplicator` dacă nu persistă ≥ 3 rulări consecutive.
- Severitatea `critical` marchează automat `requires_board_review = true` (vezi `observationEscalation` — doar marcare, Boardul NU este convocat în această etapă).

---

## 5. Regula „LLM-ul explică, nu inventează severitatea"

- Scorul și severitatea se calculează **exclusiv determinist**, înainte de orice apel LLM.
- LLM-ul (`observationSummary`) primește observațiile deja scorate și are voie **doar** să redacteze sinteza în limbaj natural: titlu, rezumat, explicarea contextului.
- LLM-ul **nu poate**: crește sau scădea `severity`, modifica `confidence`, adăuga sau elimina observații, schimba `requires_board_review` sau orice alt flag de escaladare.
- Eșecul apelului LLM **nu anulează** rezultatul determinist: observațiile scorate se persistă și se auditează oricum; lipsește doar sinteza narativă.

---

## 6. Determinismul — cerință de test

Determinismul este o proprietate obligatorie, verificabilă prin test:

| Cerință | Test |
|---------|------|
| Aceeași intrare → același scor | apelul repetat al funcției de scoring pe aceleași date de intrare produce exact același scor și aceeași severitate, la fiecare rulare |
| Fără surse de nedeterminism | scoringul nu folosește `Math.random`, timp curent implicit (timpul de referință se primește ca parametru), apeluri de rețea sau LLM |
| Plafonare corectă | intrări extreme (toți factorii la maxim) produc scor brut plafonat la 100 înainte de multiplicator |
| Multiplicator corect | aceeași observație cu `data_quality` `complete` / `partial` / `poor` produce scoruri în raport exact 1.00 / 0.85 / 0.60 |
| Praguri exacte | valori de graniță (ex. scor final exact 75, 55, 35, 15) se mapează pe severitatea palierului superior (`≥`) |
| Un singur palier per factor | ex. impact 120.000 lei punctează 30, nu 30+20+10+5 |

Consecință practică: `observationCache` se poate baza pe fingerprint-ul datelor de intrare — date identice înseamnă garantat același rezultat de scoring, deci reanalizarea este inutilă.
