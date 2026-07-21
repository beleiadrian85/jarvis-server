# SIGNAL_TRIAGE_RULES — Regulile deterministe de triaj al semnalelor

> **Stare:** PROIECTAT — implementat GATED, flag implicit OFF, validare exclusiv în Shadow Mode
> (`PROACTIVE_CEO_PIPELINE_ENABLED=false`, `PROACTIVE_CEO_SHADOW_MODE=true`,
> `PROACTIVE_CEO_NOTIFICATIONS_ENABLED=false`, `PROACTIVE_CEO_BOARD_EXECUTION_ENABLED=false`).

Triajul semnalelor este **primul pas** al Proactive CEO Pipeline: primește observațiile deja
scorate și clasificate de Observation Engine și decide, **determinist, per observație**, ce se
întâmplă cu fiecare în lanțul executiv. Este implementat în `src/proactiveCeo/signalTriage.js`
ca modul **PUR**: fără LLM, fără rețea, fără timp implicit, fără aleator.

Triajul **nu re-scorează nimic**. El este un **router**, nu un judecător: consumă rezultatele
motorului din [`/codex/21-observation-engine`](../21-observation-engine/OBSERVATION_SCORING.md)
și le traduce într-una dintre cele cinci decizii de mai jos.

---

## 1. Cele 5 decizii de triaj

| Decizie | Semnificație | Ce se întâmplă mai departe |
|---|---|---|
| `ignore` | Semnal fără valoare executivă în această rulare | Nu intră în episoade. Rămâne doar în urma de audit a rulării (`ceo_pipeline`), cu motivul deciziei. |
| `audit_only` | Semnal real, dar sub pragul executiv | Se auditează cu motiv complet. Nu intră în episoade, nu poate genera Brief. |
| `group` | Semnal eligibil pentru corelare | Intră în `executiveEpisodes.js` și poate forma sau alimenta un episod (ex. „Presiune de lichiditate și execuție Bell Residence"). |
| `board_candidate` | Semnal care ar merita analiza Executive Board | Intră în episoade și marchează episodul `requires_board_review = true` → episodul primește **Board Escalation Preview** (`boardPreview.js` — doar preview, Boardul NU se convoacă). |
| `founder_attention` | Semnal pe care Adrian trebuie să îl vadă personal | Intră în episoade și marchează episodul `requires_founder_attention = true` → episodul este eligibil pentru **CEO Brief** (`ceoBrief.js`), sub regulile anti-spam de la nivel de episod. |

Deciziile sunt **exclusive**: o observație primește exact una. Ordinea de forță este
`founder_attention > board_candidate > group > audit_only > ignore` — cascada din §3 garantează
că se alege întotdeauna cea mai puternică decizie ale cărei condiții sunt îndeplinite.

---

## 2. Intrările triajului — ce se refolosește, ce se calculează

Triajul consumă structura canonică a observației, deja validată de Observation Engine
(`/codex/schemas/observation.schema.json`):

| Câmp consumat | Produs de | Triajul are voie să îl modifice? |
|---|---|---|
| `severity` (`info`…`critical`) | `observationScoring` (tabelul de factori + multiplicator calitate date) | **NU** |
| `confidence` (0–100) | `observationScoring` | **NU** — dar derivă o valoare de lucru `confidence_adj` (§2.1) |
| `data_quality` (`complete`/`partial`/`poor`) | detectori + reguli de vechime a datelor | **NU** |
| `requires_board_review`, `requires_founder_attention`, `requires_immediate_action` | `observationEscalation` ([protocolul de escaladare](../21-observation-engine/OBSERVATION_ESCALATION_PROTOCOL.md)) | **NU** — triajul le respectă, nu le recalculează |
| `status` (`open`/`repeated`/`worsening`/…) | `observationDeduplicator` | **NU** |
| `category` + `metrics` (impact financiar, orizont de timp, sisteme afectate, ireversibilitate, riscuri) | detectori | **NU** |

### 2.1. Singura valoare calculată: `confidence_adj`

```
confidence_adj = data_quality === 'poor' ? confidence × 0.7 : confidence
```

- `poor` → **confidence × 0.7** (rotunjit în jos, plafonat la [0, 100]);
- `complete` și `partial` → confidence neschimbat.

Precizare de arhitectură: aceasta **nu este o dublă penalizare a severității**. Multiplicatorul
de calitate a datelor din `observationScoring` (×0.60 pentru `poor`) a redus deja **scorul**,
deci severitatea. Triajul reduce suplimentar **încrederea folosită în porțile de triaj**:
o observație pe date proaste poate rămâne gravă ca severitate, dar are nevoie de mai multă
certitudine ca să urce pe scara executivă. Cele două mecanisme acționează pe dimensiuni diferite
(severitate vs. încredere) și nu se re-ating reciproc.

---

## 3. Cascada deterministă de decizie

Regulile se evaluează **strict în ordinea de mai jos; prima regulă care se potrivește câștigă**.
Toate comparațiile folosesc `confidence_adj` din §2.1.

### R0 — Invariant de siguranță (înaintea oricărei reguli)

> O observație cu **oricare** dintre `requires_board_review`, `requires_founder_attention`,
> `requires_immediate_action` setat pe `true` **nu poate primi niciodată decizia `ignore`**.
> Cel mai jos nivel posibil pentru ea este `audit_only`.

### R1 — `ignore`

`ignore` dacă **toate** flag-urile `requires_*` sunt `false` **și** oricare dintre:

| # | Condiție |
|---|---|
| 1 | `severity = info` |
| 2 | `severity = low` **și** `confidence_adj < 20` **și** `status ≠ repeated` **și** `status ≠ worsening` |

Nota de persistență: condiția `status ≠ repeated / worsening` păstrează comportamentul din
Observation Engine — un semnal slab dar **persistent** (deduplicat pe ≥ 3 rulări) nu se aruncă,
ci coboară la `audit_only`, unde rămâne vizibil în istoric.

### R2 — `founder_attention`

`founder_attention` dacă `requires_founder_attention = true` **și** oricare dintre:

| # | Condiție |
|---|---|
| 1 | `requires_immediate_action = true` (fereastra ≤ 3 zile sau consecință ireversibilă înainte de următoarea rulare) |
| 2 | `severity = critical` |
| 3 | `confidence_adj ≥ 30` |

Dacă `requires_founder_attention = true` dar niciuna dintre condiții nu e îndeplinită
(adică încredere ajustată sub 30, fără urgență, sub `critical`), observația **coboară** și se
evaluează în continuare la R3 — flag-ul nu se pierde, se re-testează la nivel de episod după
corelare (o încredere combinată mai mare poate re-ridica episodul).

### R3 — `board_candidate`

`board_candidate` dacă oricare dintre:

| # | Condiție |
|---|---|
| 1 | `requires_board_review = true` **și** `confidence_adj ≥ 30` |
| 2 | `requires_board_review = true` **și** observația atinge un simptom F31 **și** `data_quality ≥ partial` **și** `confidence_adj ≥ 20` — pragul de probă coborât pentru F31, în oglindă cu regula de prudență din [protocolul de escaladare §2.1](../21-observation-engine/OBSERVATION_ESCALATION_PROTOCOL.md) |
| 3 | `severity = critical` (plasă de siguranță: `critical` implică `requires_board_review` încă din scoring; dacă flag-ul lipsește, e o eroare de amonte care se auditează, dar triajul tot escaladează) |
| 4 | `severity = high` **și** `confidence_adj ≥ 60` **și** oricare dintre: consecință **ireversibilă**; impact financiar estimat ≥ **100.000 lei**; **risc juridic** prezent |

La severitate `critical`, `boardPreview.js` adaugă **forțat Guardian** în componența
previzualizată (vezi [`/codex/04-executive-board/BOARD_ROLES.md`](../04-executive-board/BOARD_ROLES.md)).

### R4 — `group`

`group` dacă oricare dintre:

| # | Condiție |
|---|---|
| 1 | `category` aparține unui **set de corelare** definit în `executiveEpisodes.js` (`lichiditate_executie`, `oameni`, `decizii`, `ops`, `piata`) **și** `severity ≥ low` **și** `confidence_adj ≥ 25` |
| 2 | `status = worsening` **și** `severity ≥ medium` — o problemă care se agravează intră în episoade chiar necorelată, ca episod propriu |
| 3 | Observația a coborât din R2/R3 (avea flag `requires_*` dar nu a trecut porțile de încredere) — intră în corelare pentru re-testare la nivel de episod |

### R5 — `audit_only` (implicit)

Tot ce nu s-a potrivit la R1–R4 primește `audit_only`. Aceasta este **decizia implicită**:
în caz de dubiu, semnalul se păstrează în audit, nu se amplifică și nu se pierde.

---

## 4. Tabelul criteriilor de triaj

Toate criteriile folosite de cascadă, cu rolul exact și sursa fiecăruia:

| Criteriu | Rol în triaj | Sursă (nu se recalculează) |
|---|---|---|
| **Severity** | Praguri pe scară: `info` → ignore; `critical` → board_candidate garantat; `high` + condiții → board_candidate | maparea scor → severitate din [OBSERVATION_SCORING §4](../21-observation-engine/OBSERVATION_SCORING.md) |
| **Confidence** | Poartă de acces pe fiecare treaptă: ≥ 20 (F31 / anti-ignore), ≥ 25 (group), ≥ 30 (founder_attention, board_candidate), ≥ 60 (promovare `high` la board) | `observationScoring` |
| **Data quality** | `poor` → `confidence_adj = confidence × 0.7`; `complete`/`partial` → neschimbat; F31 cere minim `partial` | detectori + regulile de vechime a datelor |
| **Impact financiar** | ≥ 100.000 lei contribuie la promovarea `high` → board_candidate (R3.4) | `metrics`, aceleași praguri ca factorul 1 din scoring |
| **Urgență** | Fereastră ≤ 3 zile → `requires_immediate_action` → trece direct poarta founder_attention (R2.1) | factorul de urgență + `observationEscalation` |
| **Persistență** | `status = repeated` blochează `ignore` pentru semnale slabe (R1.2) | `observationDeduplicator` |
| **Worsening** | `status = worsening` + `severity ≥ medium` → intră în episoade chiar necorelat (R4.2); la nivel de episod, `worsening` este motiv valid de nou CEO Brief (anti-spam) | `observationDeduplicator` |
| **Sisteme afectate** | ≥ 3 sisteme → deja inclus în `requires_board_review` de escaladare; triajul îl respectă prin R3.1 | factorul 5 din scoring + escaladare |
| **Reversibilitate** | Consecință ireversibilă + `severity = high` + `confidence_adj ≥ 60` → board_candidate (R3.4) | factorul de ireversibilitate |
| **Risc juridic** | Prezent + `high` + încredere → board_candidate (R3.4) | `metrics` / detectori |
| **Risc reputațional** | Alimentează simptomul F31 „lipsa credibilității" → prag de probă coborât (R3.2) | detectori + escaladare F31 |
| **Risc operațional** | Contribuie la scor în amonte; în triaj direcționează categoria `ops` spre setul de corelare „Sănătatea sistemelor" (R4.1) | detectori |
| **Dependența de fondator** | Categoria `founder` → `requires_founder_attention` din escaladare → R2 | criteriul 3 din [escaladare §3](../21-observation-engine/OBSERVATION_ESCALATION_PROTOCOL.md) |

---

## 5. Principiul „niciun LLM în triaj"

Triajul este **integral determinist și testabil** — aceeași disciplină ca scoringul din
Observation Engine, aplicată la nivelul de deasupra:

1. **Aceeași intrare → aceeași decizie.** Apelul repetat al `signalTriage.js` pe aceleași
   observații produce exact aceleași 5 decizii, cu aceleași motive, la fiecare rulare.
2. **Fără surse de nedeterminism.** Fără `Math.random`, fără timp curent implicit (timpul de
   referință se primește ca parametru), fără apeluri de rețea, fără LLM.
3. **Motiv auditabil per decizie.** Fiecare decizie scrie în audit regula exactă declanșată
   (ex. `R3.4: high + confidence_adj 72 + ireversibil`) și valorile care au declanșat-o.
   O decizie fără motiv auditat este o încălcare de protocol.
4. **LLM-ul nu există în acest strat.** Niciun model nu poate ridica, coborî sau anula o decizie
   de triaj. Singurul loc unde un LLM ar putea apărea în pipeline este redactarea narativă din
   amonte (`observationSummary`) — iar CEO Brief-ul însuși (`ceoBrief.js`) este de asemenea
   determinist, fără LLM.

### Cerințe de test (obligatorii înainte de orice activare de flag)

| Cerință | Test |
|---|---|
| Determinism | rulare dublă pe același set → decizii identice byte-cu-byte |
| Exclusivitate | fiecare observație primește exact o decizie |
| Invariant R0 | orice `requires_* = true` → decizia nu este niciodată `ignore` |
| Multiplicator confidence | aceeași observație cu `data_quality` `complete` vs `poor` → `confidence_adj` în raport exact 1.0 / 0.7 |
| Praguri exacte | valori de graniță (`confidence_adj` exact 20, 25, 30, 60) trec poarta (`≥`) |
| Ordinea cascadei | o observație care satisface simultan R2 și R3 primește `founder_attention`, nu `board_candidate` |
| Degradare, nu pierdere | flag `requires_*` cu încredere sub prag coboară la `group`/`audit_only`, niciodată la `ignore` |

---

## 6. Relația cu 21-observation-engine: refolosire, nu re-scorare

Granița dintre motoare este strictă și într-un singur sens:

| Observation Engine (amonte) | Signal Triage (acest document) |
|---|---|
| Detectează, scorează (factori + multiplicator calitate date), mapează severitatea | Consumă severitatea ca atare — **nu re-scorează** |
| Setează `requires_board_review` / `requires_founder_attention` / `requires_immediate_action` conform protocolului de escaladare | Respectă flag-urile ca atare — **nu le recalculează**; adaugă doar porți de încredere peste ele |
| Deduplichează și stabilește `status` | Folosește `status` ca intrare |
| Scrie observațiile în audit / `jarvis_state` | Scrie deciziile de triaj în audit (`ceo_pipeline`), fără schemă DB nouă |

Dacă triajul pare să aibă nevoie de un criteriu care nu există în structura canonică a
observației, criteriul se adaugă **în Observation Engine** (detector / scoring / escaladare),
nu se improvizează în triaj. Un singur loc scorează; un singur loc rutează.

---

## 7. Poziția în pipeline și gating

```
Observation Engine (shadow, 30 min)
        │
        ▼
  Signal Triage  ←──────────── acest document
        │  ignore / audit_only ──► audit și stop
        │  group / board_candidate / founder_attention
        ▼
  Executive Episodes (grupare + reconciliere + cooldown)
        ▼
  Board Escalation Preview (doar preview — Boardul NU se convoacă)
        ▼
  CEO Brief (determinist, 5 secțiuni, ≤ ~900 caractere)
        ▼
      Adrian (decide; nimic nu se execută automat)
```

Triajul rulează **doar** dacă `PROACTIVE_CEO_PIPELINE_ENABLED=true` (implicit `false` — apelul
din `observationRunner` este gated, zero schimbare de comportament cu flag-ul OFF). În Shadow
Mode (`PROACTIVE_CEO_SHADOW_MODE=true`) toate deciziile ajung exclusiv în audit și
`jarvis_state` (`proactive:episodes`), fără nicio notificare — `PROACTIVE_CEO_NOTIFICATIONS_ENABLED`
rămâne `false` până la validarea explicită a lui Adrian.

---

*Documente înrudite: [OBSERVATION_SCORING](../21-observation-engine/OBSERVATION_SCORING.md) ·
[OBSERVATION_ESCALATION_PROTOCOL](../21-observation-engine/OBSERVATION_ESCALATION_PROTOCOL.md) ·
[BOARD_ROLES](../04-executive-board/BOARD_ROLES.md) ·
[BOARD_AUTHORITY_MATRIX](../04-executive-board/BOARD_AUTHORITY_MATRIX.md) ·
restul capitolului `22-proactive-ceo` (episoade executive, board preview, CEO Brief).*
