# BOARD_OUTPUT_SCHEMA — Structurile canonice de date ale Executive Board

> **Status: PROIECTAT — implementat GATED, flag implicit OFF, neactivat în producție.**
> Acest document este referința umană a structurilor de date. Sursele mașină sunt `/codex/schemas/board-meeting.schema.json` și `/codex/schemas/board-recommendation.schema.json`. Validatorul `boardValidator.js` impune aceste structuri în cod: o structură invalidă este oprită de Guardian/validator și recomandarea finală NU se emite.

Boardul este consultativ. Niciuna dintre structurile de mai jos nu declanșează execuție — `approvalGate` rămâne singura poartă pentru acțiuni cu efect, iar decizia finală aparține exclusiv fondatorului (Adrian Belei).

---

## 1. DirectorOutput

Perspectiva individuală a unui director convocat. Fiecare director relevant emite exact un obiect `DirectorOutput` per ședință. Un director eșuat (timeout, structură invalidă) nu blochează ședința: perspectiva sa este marcată lipsă în `BoardMeeting.missing_perspectives`.

| Câmp | Tip | Valori permise | Semantică |
|---|---|---|---|
| `role` | string | `CEO`, `CFO`, `COO`, `CRO`, `CLO`, `CHRO`, `CMO`, `CSO`, `CTO`, `INNOVATION`, `GUARDIAN`, `FOUNDER_VOICE` | Identificatorul unic al rolului. Exact unul dintre cele 12 id-uri canonice. `GUARDIAN` și `FOUNDER_VOICE` sunt implementate determinist (în cod, nu LLM). |
| `position` | string | `approve` \| `approve_with_conditions` \| `reject` \| `insufficient_data` | Poziția formală a directorului. `insufficient_data` este obligatorie când datele esențiale pentru rolul respectiv lipsesc — un director nu ghicește. |
| `confidence` | number | 0–100 | Încrederea directorului în propria poziție. Nu este pondere de vot; servește sintezei CEO AI și calculului `consensus_level`. |
| `arguments` | string[] | — | Argumentele care susțin poziția. Concise, verificabile, fără umplutură. |
| `evidence` | string[] | fiecare intrare prefixată cu sursa între paranteze drepte | Dovezi factuale din sistemele deterministe. Format obligatoriu: `"[sursă] afirmație"`. Exemplu: `"[operational] 7 obligații scadente în 14 zile"`. Surse tipice: `[operational]`, `[cashForecast]`, `[riskEngine]`, `[healthScore]`, `[memory]`, `[codex]`. Zero cifre inventate — orice cifră fără sursă etichetată invalidează intrarea. |
| `risks` | string[] | — | Riscurile identificate din perspectiva rolului. |
| `conditions` | string[] | — | Condițiile sub care poziția devine (sau rămâne) `approve`. Obligatoriu nevid la `approve_with_conditions`. |
| `alternatives` | string[] | — | Alternative la opțiunea analizată. Innovation Officer este responsabil principal, dar orice director poate propune. |
| `unanswered_questions` | string[] | — | Întrebări la care directorul nu a găsit răspuns în datele disponibile. Alimentează `BoardMeeting.data_missing`. |

---

## 2. BoardRecommendation

Sinteza CEO AI. Nu este un vot simplu: dezacordurile se păstrează explicit, nu se falsifică prin mediere. Recomandarea este consultativă — nu execută nimic și nu obligă fondatorul.

| Câmp | Tip | Valori permise | Semantică |
|---|---|---|---|
| `consensus_level` | number | 0–100 | Gradul de aliniere între directorii convocați. 100 = unanimitate; valorile mici obligă la popularea `major_disagreements`. |
| `major_disagreements` | object[] | `{ role, position, reason }` | Dezacordurile majore, nominal. `role` = id-ul directorului, `position` = poziția sa divergentă, `reason` = motivul, pe scurt. CEO AI nu are voie să omită un dezacord pentru a rotunji consensul. |
| `recommendation` | string | `DA` \| `NU` \| `AMANA` \| `DATE_INSUFICIENTE` | Recomandarea sintetizată. `DATE_INSUFICIENTE` este obligatorie când datele esențiale lipsesc; `AMANA` când decizia este validă dar prematură. |
| `conditions` | string[] | — | Condițiile de aprobare (punctul 18 din protocol). Agregate din `conditions` ale directorilor, deduplicate, fără diluare. |
| `risk_limits` | string[] | — | Limite de capital, timp și risc atașate recomandării. Obligatorii când fondatorul decide `DA` contra unei recomandări unanime `NU`. |
| `stop_conditions` | string[] | — | Criteriile de oprire (punctul 19): condiții măsurabile care, odată atinse, impun oprirea sau reevaluarea. |
| `founder_decision_required` | boolean | mereu `true` la emitere | Boardul nu decide. Orice recomandare emisă cere explicit decizia fondatorului. Câmpul există ca garanție structurală, nu ca opțiune. |
| `codex_compliance` | object | `{ compliant: boolean, issues: string[] }` | Verdictul Guardian asupra conformității cu CODEX. `compliant: false` cu `issues` nevid blochează emiterea recomandării finale. |
| `data_quality` | string | `completa` \| `partiala` \| `slaba` | Calitatea datelor pe care se sprijină analiza. `slaba` împinge recomandarea către `DATE_INSUFICIENTE`. |
| `confidence` | number | 0–100 | Încrederea agregată a sintezei (punctul 17 din protocol). Nu poate depăși ce justifică `data_quality`. |
| `contradicts_prior` | null \| object | `null` sau `{ ref: string, explanation: string }` | Coerență istorică. Dacă recomandarea contrazice o decizie aprobată anterior (`ref` = identificatorul deciziei din `memory.js` / `listDecisions`), contradicția TREBUIE explicată prin informații noi, context nou sau revizuire explicită. Contradicție neexplicată = structură invalidă. |
| `founder_override` | object (opțional) | `{ decision, rationale, applied }` | Se completează doar când fondatorul decide contra recomandării. `decision` = decizia fondatorului, `rationale` = argumentele cu care a demontat poziția Boardului, `applied` = confirmarea că limitele (`risk_limits`) și criteriile de oprire (`stop_conditions`) au fost atașate obligatoriu. |

---

## 3. BoardMeeting

Înregistrarea completă a unei ședințe — cele 22 de puncte obligatorii ale protocolului, ca obiect. Se scrie integral în `audit_log` (prin `audit.js`, fără schimbare de schemă DB). Punctele 20–22 se completează ulterior, pe măsură ce realitatea răspunde.

| Câmp | Tip | Valori permise | Semantică (punct protocol) |
|---|---|---|---|
| `id` | string | — | Identificator unic al ședinței. Referențiabil din `contradicts_prior.ref` al ședințelor viitoare. |
| `asOf` | string | timestamp ISO 8601 | Momentul de referință al datelor. Analiza este valabilă pentru starea sistemelor la acest moment; cache-ul se invalidează când datele se schimbă. |
| `type` | string | `investment` \| `hiring` \| `technical` \| `marketing` \| `contract` \| `general` | Tipul deciziei. Determină selecția directorilor convocați (vezi structura oficială a Boardului). |
| `question` | string | — | Întrebarea exactă adresată Boardului, așa cum a fost pusă. |
| `problem` | string | — | Problema reală din spatele întrebării. *(punctul 1)* |
| `purpose` | string | — | Scopul deciziei — ce trebuie să obțină firma. *(punctul 2)* |
| `data_available` | string[] | intrări cu sursă etichetată | Datele disponibile, colectate determinist ÎNAINTE de apelul LLM (`predictionState`, `riskEngine`, `cashForecast`, `healthScore`, `memory`). *(punctul 3)* |
| `data_missing` | string[] | — | Datele lipsă, numite explicit. Nevid + esențial → `insufficient_data` / `DATE_INSUFICIENTE`. *(punctul 4)* |
| `assumptions` | string[] | — | Ipotezele de lucru, declarate, nu ascunse. *(punctul 5)* |
| `options` | string[] | — | Opțiunile analizate, inclusiv opțiunea „nu facem nimic" și alternativele Innovation Officer. *(punctul 6)* |
| `perspectives` | DirectorOutput[] | vezi §1 | Perspectiva fiecărui director relevant convocat. *(punctul 7)* |
| `risks` | string[] | — | Riscurile agregate ale ședinței (alimentate de CRO / `riskEngine.assessRisks`). *(punctul 8)* |
| `impact` | object | `{ financial, operational, human, legal, brand_sales }` — fiecare string | Impactul pe cele cinci dimensiuni: financiar *(9)*, operațional *(10)*, uman *(11)*, legal *(12)*, brand și vânzări *(13)*. |
| `reversibility` | string | `reversibila` \| `partial_reversibila` \| `ireversibila` \| `necunoscuta` | Cât de ușor se poate reveni asupra deciziei. `ireversibila` ridică automat pragul de prudență. *(punctul 14)* |
| `scenarios` | object | `{ success: string, failure: string }` | Scenariul de succes și scenariul de eșec, ambele obligatorii. *(punctul 15)* |
| `recommendation` | BoardRecommendation \| null | vezi §2 | Recomandarea sintetizată. `null` când ședința este blocată de Guardian/validator. *(punctele 16–19 prin câmpurile interne)* |
| `blocked` | null \| object | `null` sau `{ by: string, issues: string[] }` | Motivul blocării emiterii, când există. `by` = cine a blocat (ex. `GUARDIAN`, `validator`), `issues` = neconformitățile. `blocked` nevid ⇔ `recommendation: null`. |
| `missing_perspectives` | string[] | id-uri de rol | Directorii convocați care nu au produs un `DirectorOutput` valid (timeout, eroare, structură invalidă). Ședința continuă, lipsa se declară. |
| `founder_decision` | null \| string | `null` până decide Adrian | Decizia fondatorului. Se completează exclusiv de fondator, ulterior emiterii. *(punctul 20)* |
| `outcome` | null \| string | `null` la emitere | Rezultatul ulterior, observat în realitate. *(punctul 21)* |
| `lesson` | null \| string | `null` la emitere | Lecția învățată, extrasă după rezultat; alimentează `memory.js` pentru ședințele viitoare. *(punctul 22)* |

---

## Reguli de validare (impuse de `boardValidator.js`)

| Regulă | Consecință la încălcare |
|---|---|
| `role` în afara celor 12 id-uri canonice | `DirectorOutput` respins; rolul trece în `missing_perspectives` |
| `evidence` fără prefix de sursă `[...]` | intrarea respinsă; cifrele fără sursă nu intră în analiză |
| `approve_with_conditions` cu `conditions` gol | `DirectorOutput` invalid |
| `codex_compliance.compliant: false` | recomandarea NU se emite; `blocked` se populează |
| `contradicts_prior` prezent fără `explanation` | structură invalidă; recomandarea NU se emite |
| `founder_decision_required` ≠ `true` la emitere | structură invalidă |
| date esențiale lipsă | `position: insufficient_data` / `recommendation: DATE_INSUFICIENTE` — niciodată estimare inventată |

Guardian poate opri emiterea unei recomandări incomplete sau neconforme, dar NU poate anula decizia fondatorului. Plățile (Nivel 4) sunt excluse total din perimetrul Boardului.
