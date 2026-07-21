# CEO BRIEF FORMAT — Formatul Canonic al Briefului către Fondator

> **STARE: PROIECTAT — implementat GATED, flag implicit OFF, validare exclusiv în Shadow Mode.**
> `PROACTIVE_CEO_PIPELINE_ENABLED=false` · `PROACTIVE_CEO_SHADOW_MODE=true` · `PROACTIVE_CEO_NOTIFICATIONS_ENABLED=false` · `PROACTIVE_CEO_BOARD_EXECUTION_ENABLED=false`

---

## 1. Ce este CEO Brief

CEO Brief este **ultima verigă** a Proactive CEO Pipeline (Faza 4.2):

**Observation Engine → Signal Triage → Executive Episodes → Board Escalation Preview → CEO Brief → Adrian.**

Rolul lui: să transforme un **episod executiv eligibil** într-un text scurt, fix și predictibil, pe care Adrian îl poate citi în sub 30 de secunde și pe baza căruia **doar el** decide. Brieful nu propune execuție automată, nu convoacă Boardul (vede doar preview-ul), nu trimite nicio notificare până la validarea în Shadow Mode.

Generarea are loc în `src/proactiveCeo/ceoBrief.js` — funcție **PURĂ, deterministă, FĂRĂ LLM** în această fază: același episod la intrare → exact același brief la ieșire.

| Brieful ESTE | Brieful NU ESTE |
|---|---|
| O sinteză deterministă a unui episod executiv | Un text generat de LLM |
| O informare + o decizie posibilă din meniu canonic | O decizie luată sau o acțiune executată |
| Un artefact de audit (`action=ceo_brief`) | O notificare (în Shadow Mode nu pleacă nimic) |

## 2. Cele 5 secțiuni fixe

Ordinea și denumirile secțiunilor sunt **canonice și imuabile** (etichete ASCII, exact cum le emite codul):

| # | Secțiune | La ce răspunde | Sursa din episod |
|---|---|---|---|
| 1 | `CE TREBUIE SA STII` | Starea de fapt, într-o frază | `title` + `business_impact` + `combined_severity` |
| 2 | `CE SE POATE INTAMPLA` | Consecința plauzibilă dacă nu se intervine | `business_impact` + `status` (worsening) |
| 3 | `CE DATE LIPSESC` | Ce nu știm și ne-ar schimba concluzia | `unknowns` — **obligatorie** când `unknowns` nu e gol |
| 4 | `CE DECIZIE AR PUTEA FI NECESARA` | Opțiunile de decizie, din meniul canonic | grupul de corelare al episodului |
| 5 | `URGENTA` | Un singur cuvânt, derivat strict | `combined_severity` |

## 3. Exemplu canonic complet

```
CE TREBUIE SA STII
In urmatoarele 21 de zile exista presiune de cash de aproximativ X lei.

CE SE POATE INTAMPLA
Daca incasarile estimate nu intra, doua obligatii pot deveni critice.

CE DATE LIPSESC
Sold bancar actual + certitudinea incasarilor.

CE DECIZIE AR PUTEA FI NECESARA
Prioritizare plati / accelerare incasari / finantare temporara.

URGENTA
RIDICATA
```

## 4. Reguli de generare

| Regulă | Detaliu |
|---|---|
| **Determinist, fără LLM** | Brieful se construiește exclusiv din câmpurile episodului. Niciun apel de model în această fază. |
| **Maxim ~900 caractere** | Ce nu încape se taie determinist (impacturile și unknowns se ordonează, se păstrează primele). |
| **Un singur episod per brief** | Niciodată agregare de episoade în același brief. Episoade multiple eligibile → briefuri separate. |
| **Urgența = strict din `combined_severity`** | Vezi maparea de mai jos. Nicio altă intrare nu poate modifica urgența. |
| **`CE DATE LIPSESC` obligatorie când există `unknowns`** | Lipsa datelor se declară, nu se maschează — aceeași regulă ca la Observation Engine (`data_quality`, `unknowns`). |
| **Decizia posibilă = doar din meniul canonic** | Formulările sunt fixe per grup de corelare (vezi 4.2). |

### 4.1 Maparea urgenței

| `combined_severity` | `URGENTA` |
|---|---|
| `critical` | `CRITICA` |
| `high` | `RIDICATA` |
| `medium` | `MEDIE` |
| `low` | `SCAZUTA` |

### 4.2 Meniul canonic de decizii per grup de corelare

| Grup de corelare | Episod-tip | Decizii posibile (formulări fixe) |
|---|---|---|
| `lichiditate_executie` | „Presiune de lichiditate și execuție Bell Residence" | prioritizare plati / accelerare incasari / finantare temporara |
| `oameni` | „Capacitate și responsabilitate în echipă" | realocare / mentorat / decizie de personal |
| `decizii` | „Coerența deciziilor" | revizuire explicita |
| `ops` | „Sănătatea sistemelor" | reparare job / reconectare sursa |
| `piata` | „Piața și vânzări" | ajustare campanii / pret |

Episoadele necorelate (observații singulare) primesc decizia posibilă din meniul grupului cel mai apropiat de categoria observației; dacă nu există potrivire, secțiunea 4 rămâne la formularea minimă „necesita evaluare de catre fondator".

## 5. Anti-spam la nivel de episod

Un episod **nu produce câte un brief la fiecare rulare**. Un **nou** CEO Brief pentru același `episode_id` se generează DOAR dacă cel puțin una dintre cele 6 condiții este îndeplinită:

| # | Condiție de regenerare |
|---|---|
| 1 | **Severitatea crește** (`combined_severity` urcă față de brieful anterior) |
| 2 | **Apare informație nouă relevantă** — setul de observații membre (`observations`) se schimbă |
| 3 | **Status `worsening`** la reconcilierea episodului |
| 4 | **Termenul se apropie semnificativ** de o obligație/deadline din episod |
| 5 | **Problema se rezolvă** (`status=resolved`) — un singur brief de închidere, o singură dată |
| 6 | **Apare o contradicție semnificativă** față de datele pe care s-a bazat brieful anterior |

În toate celelalte cazuri: **cooldown la nivel de episod (implicit 24h)** și doar înregistrare în audit — fără brief nou, fără zgomot către Adrian.

## 6. Shadow Mode — unde ajunge brieful

Cât timp `PROACTIVE_CEO_SHADOW_MODE=true` (implicit), brieful se salvează **DOAR în audit**, cu `action=ceo_brief` — alături de intrările `ceo_pipeline` (rularea) și `ceo_board_preview` (preview-ul de Board), iar starea episoadelor persistă în `jarvis_state` sub cheia `proactive:episodes`. **Zero notificări, zero email, zero Telegram.** Validarea formatului și a anti-spamului se face exclusiv citind auditul, la fel ca la validarea în shadow a Observation Engine și a Executive Board.

## 7. Legături

- Capitolul 22 (Proactive CEO Pipeline): triajul semnalelor (`src/proactiveCeo/signalTriage.js`), episoadele executive (`src/proactiveCeo/executiveEpisodes.js`), preview-ul de Board (`src/proactiveCeo/boardPreview.js`), orchestrarea (`src/proactiveCeo/pipelineRunner.js`) — documentate în celelalte fișiere ale acestui capitol.
- [Observation Engine — Arhitectură](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) — sursa observațiilor care intră în pipeline.
- [Protocolul de escaladare a observațiilor](../21-observation-engine/OBSERVATION_ESCALATION_PROTOCOL.md) — de unde vin `requires_board_review` și `requires_founder_attention`.
- [Politica de notificare](../21-observation-engine/OBSERVATION_NOTIFICATION_POLICY.md) — principiul „nicio notificare până la validare" pe care brieful îl moștenește.
- [Rolurile Executive Board](../04-executive-board/BOARD_ROLES.md) și [Arhitectura Board](../04-executive-board/BOARD_ARCHITECTURE.md) — directorii pe care Board Escalation Preview i-ar selecta (Guardian adăugat forțat la `critical`), fără convocare live.
