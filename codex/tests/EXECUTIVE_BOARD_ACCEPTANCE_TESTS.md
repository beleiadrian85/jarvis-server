# Teste de Acceptanță — Executive Board

> **Statut: PROIECTAT — implementat GATED, flag implicit OFF, neactivat în producție.**
> Cele 20 de teste de mai jos sunt criterii obligatorii de acceptanță. Niciun test picat = Boardul nu se activează. Verificarea se face în trei locuri: `test/executiveBoard.test.mjs` (funcții pure), `test/executiveBoard.wiring.test.mjs` (wiring, flag-uri, gărzi de sursă) și suita existentă (non-regresie).

## Legendă locuri de verificare

| Cod | Fișier | Acoperă |
|---|---|---|
| PURE | `test/executiveBoard.test.mjs` | Funcții pure: selecție roluri, validare structuri, sinteză, Guardian, Founder Voice, determinism |
| WIRING | `test/executiveBoard.wiring.test.mjs` | Flag-uri, shadow mode, integrare cu sistemele existente, gărzi de sursă (importuri), limite de apeluri |
| SUITA | Suita de teste existentă (`npm test`) | Non-regresie: comportamentul actual al JARVIS neatins |

---

## Cele 20 de teste

### T01 — Feature flag OFF păstrează comportamentul actual

- **Given** `EXECUTIVE_BOARD_ENABLED` nu este setat sau este `off`.
- **When** sosește orice întrebare care ar fi eligibilă pentru Board.
- **Then** răspunsul este produs exclusiv de fluxul actual (`council.js` / fluxul normal); nicio funcție a Boardului nu este apelată; zero apeluri LLM suplimentare.
- **Verificat în:** WIRING.

### T02 — Shadow mode nu modifică răspunsul

- **Given** `EXECUTIVE_BOARD_ENABLED=on` și `EXECUTIVE_BOARD_SHADOW_MODE=on`.
- **When** Boardul rulează o ședință pe o întrebare.
- **Then** răspunsul livrat utilizatorului este byte-identic cu cel al fluxului actual; analiza Boardului apare DOAR în `audit_log`.
- **Verificat în:** WIRING.

### T03 — Selectarea corectă a directorilor pe tipul deciziei

- **Given** o decizie clasificată (investiție majoră / angajare / modificare tehnică / campanie marketing / contract / general).
- **When** se apelează funcția de selecție a rolurilor.
- **Then** se întoarce exact componența definită în structură (ex. angajare → CEO, COO, CHRO, CFO, Guardian, Founder Voice); tipul necunoscut cade pe componența `general`; nu se convoacă toate cele 12 roluri.
- **Verificat în:** PURE.

### T04 — Validarea structurii răspunsului fiecărui director

- **Given** un răspuns de director cu câmp lipsă, `position` în afara enumerării (`approve | approve_with_conditions | reject | insufficient_data`) sau `confidence` în afara intervalului 0–100.
- **When** validatorul rulează pe răspuns.
- **Then** răspunsul este respins ca invalid, perspectiva este marcată lipsă, iar un răspuns valid trece fără modificări.
- **Verificat în:** PURE.

### T05 — CRO folosește datele riskEngine

- **Given** o ședință în care CRO este convocat.
- **When** se construiește contextul CRO.
- **Then** contextul conține rezultatul `assessRisks` din `riskEngine.js` (date deterministe, calculate ÎNAINTE de apelul LLM); CRO nu primește context gol când `assessRisks` întoarce date.
- **Verificat în:** WIRING (apelul), PURE (formatarea contextului).

### T06 — CFO nu confundă profitul cu lichiditatea

- **Given** contextul CFO construit din `financialBrain`/`cashForecast` (`buildForecast`, `getObligations`).
- **When** se asamblează promptul CFO.
- **Then** datele de profit și cele de lichiditate apar în secțiuni separate, etichetate distinct, iar promptul conține instrucțiunea explicită de a nu le confunda.
- **Verificat în:** PURE (asamblarea promptului), WIRING (sursele de date).

### T07 — Guardian detectează încălcarea CODEX

- **Given** o sinteză candidat cu (a) structură invalidă, (b) un dezacord raportat de un director dar absent din `major_disagreements`, sau (c) `contradicts_prior` nenul fără explicație.
- **When** Guardian (determinist, în cod) verifică sinteza.
- **Then** emiterea recomandării finale este blocată, cu motivul înregistrat; o sinteză conformă trece.
- **Verificat în:** PURE.

### T08 — Founder Voice nu inventează preferințe

- **Given** o întrebare pentru care există / nu există principii documentate ale fondatorului (F01–F40).
- **When** Founder Voice (determinist) își construiește poziția.
- **Then** citează DOAR principii din lista F01–F40, cu referință; când niciun principiu nu se potrivește, întoarce `insufficient_data` — niciodată o preferință inventată.
- **Verificat în:** PURE.

### T09 — Dezacordurile nu sunt eliminate din sinteză

- **Given** răspunsuri de directori cu poziții contradictorii (ex. CFO `reject`, COO `approve`).
- **When** CEO AI sintetizează.
- **Then** dezacordul apare explicit în `major_disagreements[]`, iar `consensus_level` reflectă divergența (nu 100); sinteza care ascunde dezacordul este respinsă (vezi T07).
- **Verificat în:** PURE.

### T10 — insufficient_data când lipsesc date critice

- **Given** date esențiale lipsă pentru tipul deciziei (ex. investiție fără cifre financiare).
- **When** Boardul rulează ședința.
- **Then** `recommendation = DATE_INSUFICIENTE`, `data_quality = slaba`, `unanswered_questions[]` populate; zero cifre inventate.
- **Verificat în:** PURE.

### T11 — Timeout-ul/eșecul unui rol nu blochează Boardul

- **Given** perspectiva unui director eșuează sau expiră (timeout).
- **When** ședința continuă.
- **Then** perspectiva este marcată lipsă în sinteză, ceilalți directori sunt procesați, iar recomandarea finală se emite cu mențiunea rolului absent (fără crash, fără blocare).
- **Verificat în:** PURE (agregarea cu perspective lipsă), WIRING (timeout/fallback).

### T12 — Boardul nu poate apela acțiuni de scriere (gardă de sursă)

- **Given** codul sursă al modulului Executive Board.
- **When** se scanează importurile și apelurile modulului.
- **Then** zero importuri din `taskflow`, `approvalGate` sau orice tool de scriere; Boardul are exclusiv dependențe de citire (riskEngine, financialBrain, healthScore, predictionState, memory, audit — doar înregistrare).
- **Verificat în:** WIRING (gardă de sursă, analiză statică a importurilor).

### T13 — approvalGate rămâne obligatoriu și nemodificat

- **Given** fișierul `approvalGate` și fluxul de acțiuni cu efect.
- **When** Executive Board este activ (orice combinație de flag-uri).
- **Then** `approvalGate` este neatins (conținut identic cu referința) și rămâne SINGURA poartă pentru acțiuni cu efect; nicio recomandare a Boardului nu declanșează o acțiune fără trecerea prin approvalGate.
- **Verificat în:** WIRING + SUITA.

### T14 — Cost și număr de apeluri LLM limitate

- **Given** o ședință de Board pe un set de date.
- **When** ședința rulează; apoi rulează din nou cu date identice.
- **Then** prima rulare face exact 1 apel LLM; a doua rulare cu date neschimbate servește din cache (0 apeluri); datele modificate invalidează cache-ul.
- **Verificat în:** WIRING.

### T15 — Non-regresie pentru testele existente

- **Given** codul Executive Board integrat în repo, flag OFF.
- **When** rulează întreaga suită de teste existentă.
- **Then** toate testele existente trec fără modificări de așteptări; nicio schimbare de schemă DB.
- **Verificat în:** SUITA.

### T16 — Decizia fondatorului prevalează

- **Given** o recomandare finală a Boardului (orice `recommendation`).
- **When** se construiește structura de ieșire.
- **Then** `founder_decision_required = true` întotdeauna; nicio cale de cod nu marchează o decizie ca finală fără fondator; CEO AI nu are câmp/mecanism de veto.
- **Verificat în:** PURE.

### T17 — Un Board unanim împotrivă nu blochează fondatorul

- **Given** toți directorii convocați emit `reject`.
- **When** fondatorul înregistrează decizia `DA` (override).
- **Then** sistemul acceptă override-ul (nu există stare de blocare), iar Guardian nu poate anula decizia fondatorului — poate doar opri emiterea unei recomandări neconforme (T07).
- **Verificat în:** PURE.

### T18 — Override-ul fondatorului produce limite obligatorii

- **Given** un override al fondatorului împotriva unei recomandări NU.
- **When** se înregistrează decizia de override.
- **Then** înregistrarea este validă DOAR dacă include `risk_limits[]` (capital, timp, risc) și `stop_conditions[]` nevide; override fără limite → respins de validator.
- **Verificat în:** PURE.

### T19 — Contradicția față de o decizie anterioară este explicată

- **Given** o recomandare care contrazice o decizie aprobată anterior (din `memory.js` / `listDecisions`).
- **When** se emite sinteza finală.
- **Then** `contradicts_prior = { ref, explanation }` cu explicație bazată pe informații noi, context nou sau revizuire explicită; contradicție detectată fără explicație → Guardian blochează emiterea (T07).
- **Verificat în:** PURE (validare), WIRING (citirea deciziilor anterioare).

### T20 — Determinism: aceeași intrare, aceeași structură

- **Given** aceeași întrebare și același snapshot de date (răspuns LLM mock, fix).
- **When** ședința rulează de două ori.
- **Then** structura rezultată este identică (aceleași roluri convocate, aceleași câmpuri, aceleași valori derivate determinist: selecție, validare, Guardian, Founder Voice, chei de cache); singura sursă de variație permisă este conținutul LLM, izolat prin mock.
- **Verificat în:** PURE.

---

## Regulă de acceptanță finală

| Condiție | Consecință |
|---|---|
| Toate cele 20 trec | Boardul poate fi activat în shadow mode (T02 rămâne garanția) |
| Orice test din T01, T02, T12, T13, T15 pică | Blocare totală — acestea sunt gărzile de siguranță ale sistemului existent |
| Orice alt test pică | Boardul rămâne OFF până la remediere |

Plățile (Nivel 4) sunt excluse total din domeniul Boardului — nu fac obiectul niciunui test de activare, ci al gărzii de sursă (T12) și al porții approvalGate (T13).
