# BOARD ESCALATION POLICY — Politica de Escaladare către Executive Board (Proactive CEO Pipeline)

> **Stare: PROIECTAT — implementat GATED, flag implicit OFF, validare exclusiv în
> Shadow Mode.** În Faza 4.2, „escaladarea către Board" înseamnă un singur lucru:
> un **PREVIEW determinist salvat în audit** — ce directori AR fi convocați, de
> ce, cu ce întrebări, din ce surse și ce lipsește. Boardul **NU se convoacă**.
> Convocarea LIVE rămâne gated pe `PROACTIVE_CEO_BOARD_EXECUTION_ENABLED=false`
> și se activează doar după validarea preview-urilor în Shadow Mode și aprobarea
> explicită a lui Adrian.

---

## 1. Principiu

Proactive CEO Pipeline transformă observațiile în **episoade executive** și, pentru
cele eligibile, răspunde la întrebarea: *„dacă am convoca Boardul pentru această
problemă, cum ar arăta ședința?"* — fără să o convoace.

Răspunsul este produs de `src/proactiveCeo/boardPreview.js`: modul **PUR,
determinist, zero LLM, zero IO**. El **REUTILIZEAZĂ** matricea oficială de
selecție și definițiile rolurilor din Executive Board — `selectDirectors` /
`SELECTION` (`src/executiveBoard/boardRouter.js`) și `ROLES`
(`src/executiveBoard/boardRoles.js`) — și **NU** apelează `boardSession`,
niciun director LLM și niciun motor cu efect. O singură sursă de adevăr pentru
componență: dacă matricea din
[`BOARD_MEETING_PROTOCOL.md`](../04-executive-board/BOARD_MEETING_PROTOCOL.md)
se schimbă, preview-ul se schimbă odată cu ea, fără duplicare.

| Ce ESTE escaladarea în această fază | Ce NU este |
|---|---|
| Un preview determinist per episod eligibil | O ședință de Board |
| O înregistrare `ceo_board_preview` în audit | O notificare către Adrian |
| Reutilizarea matricei de selecție existente | O matrice paralelă, duplicată |
| Material de validare pentru Shadow Mode | O acțiune, o decizie sau o execuție |

---

## 2. Când se generează un preview

Preview-ul se generează **la nivel de episod** (nu per observație), exclusiv
pentru episoadele eligibile:

1. `requires_board_review = true` pe episod — moștenit din triaj
   (`signalTriage.js`: membri `board_candidate` / `founder_attention`) și din
   flag-urile Observation Engine, conform
   [`OBSERVATION_ESCALATION_PROTOCOL.md`](../21-observation-engine/OBSERVATION_ESCALATION_PROTOCOL.md);
2. episodul trece de regulile anti-spam de la nivel de episod (severitate în
   creștere, membri noi, `worsening`, termen apropiat, rezolvare, contradicție)
   — altfel episodul rămâne în cooldown (implicit 24h) și se scrie doar audit;
3. pipeline-ul rulează (`PROACTIVE_CEO_PIPELINE_ENABLED=true`) — implicit
   **false**, deci implicit nu se generează nimic.

Un episod fără `requires_board_review` nu primește preview de Board — cel mult
CEO Brief și/sau `requires_founder_attention`, pe traseele lor separate.

---

## 3. Structura preview-ului

Pentru fiecare episod eligibil, preview-ul răspunde determinist la cinci
întrebări:

| Câmp | Conținut | Sursă deterministă |
|---|---|---|
| **Ce directori AR fi convocați** | Lista de roluri pentru tipul de decizie mapat (§4), plus Guardian forțat la `critical` (§5) | `selectDirectors(type)` din `boardRouter.js` |
| **De ce fiecare** | Ce apără rolul (`protects`) legat de categoria și impactul episodului | `ROLES` din `boardRoles.js` + episodul |
| **Ce întrebări ar primi** | Întrebarea canonică a rolului (`question`), contextualizată cu titlul și conținutul episodului (ex. CFO la „Presiune de lichiditate și execuție Bell Residence": „Ne permitem și ce sacrificăm?" aplicat pe golul de cash estimat) | `ROLES[id].question` + episod |
| **Ce surse ar folosi** | Sursele deterministe ale rolului: `cashForecast`/`financialBrain` (CFO), `predictionState` (COO), `riskEngine` (CRO), `healthScore` (CEO), `FOUNDER_DNA`+`memory` (Founder Voice), datele ședinței pentru restul — conform [`BOARD_ROLES.md`](../04-executive-board/BOARD_ROLES.md) | tabelul sinoptic al rolurilor |
| **Ce lipsește** | `unknowns[]` ale episodului + datele esențiale rolului indisponibile la momentul preview-ului; **zero cifre inventate** — ce lipsește se declară, nu se completează | episod + regulile de date din Board |

Preview-ul păstrează disciplina Boardului fără să-l pornească: aceleași roluri,
aceleași întrebări, aceleași surse etichetate — dar totul rămâne pe hârtie, în
audit.

---

## 4. Maparea grup de corelare → tip de decizie Board

Episoadele se formează pe seturile de corelare din `executiveEpisodes.js`.
Fiecare grup se mapează determinist pe un tip de decizie din
`DECISION_TYPES`, iar tipul determină componența prin matricea oficială:

| Grup de corelare | Episod tipic | Tip decizie Board | Directori previzualizați (matricea din BOARD_MEETING_PROTOCOL §3) |
|---|---|---|---|
| `lichiditate_executie` | Presiune de lichiditate și execuție Bell Residence | `general` | CEO, CFO, COO, CRO, Guardian |
| `oameni` | Capacitate și responsabilitate în echipă | `hiring` | CEO, COO, CHRO, CFO, Guardian, Founder Voice |
| `ops` | Sănătatea sistemelor | `technical` | CEO, CTO, COO, CRO, Guardian |
| `piata` | Piața și vânzări | `marketing` | CEO, CMO, CSO, CFO, CRO |
| `decizii` | Coerența deciziilor | `general` | CEO, CFO, COO, CRO, Guardian |
| *(episod necorelat)* | observație singulară rămasă episod propriu | `general` *(implicit)* | CEO, CFO, COO, CRO, Guardian |

Reguli:

- maparea este **statică și determinist testabilă** — același grup produce
  întotdeauna același tip de decizie;
- componența NU se copiază în `proactiveCeo`: se obține exclusiv prin
  `selectDirectors(type)`, ca la o ședință reală;
- un grup nou de corelare fără mapare explicită cade pe `general` — niciodată
  pe o componență inventată ad-hoc.

---

## 5. Regula Guardian la `combined_severity = critical`

Dacă episodul are `combined_severity = critical`, **Guardian se adaugă forțat**
componenței previzualizate, chiar dacă matricea tipului de decizie nu îl
include (ex. `marketing`, unde matricea standard nu conține Guardian).

Motivare: la severitate critică, orice analiză viitoare trebuie validată de
paznicul determinist al CODEX — un preview care omite Guardian la `critical` ar
promite o ședință mai puțin protejată decât cere
[`BOARD_MEETING_PROTOCOL.md`](../04-executive-board/BOARD_MEETING_PROTOCOL.md).
Guardian este cod, nu LLM ([`BOARD_ROLES.md`](../04-executive-board/BOARD_ROLES.md)
§4.11), deci adăugarea lui nu costă tokeni și nu introduce invenție.

---

## 6. Convocarea LIVE — gated, în afara acestei faze

| Poartă | Valoare implicită | Efect |
|---|---|---|
| `PROACTIVE_CEO_PIPELINE_ENABLED` | `false` | pipeline-ul (deci și preview-urile) nu rulează deloc |
| `PROACTIVE_CEO_SHADOW_MODE` | `true` | când rulează: DOAR audit + `jarvis_state`, zero notificări |
| `PROACTIVE_CEO_BOARD_EXECUTION_ENABLED` | **`false`** | Boardul NU se convoacă live din pipeline — doar preview |
| `PROACTIVE_CEO_NOTIFICATIONS_ENABLED` | `false` | niciun canal de notificare, indiferent de conținut |

Activarea `PROACTIVE_CEO_BOARD_EXECUTION_ENABLED` este o **decizie explicită a
lui Adrian**, nu o consecință a acumulării de preview-uri, și presupune, în
ordine:

1. validarea preview-urilor în Shadow Mode — componență corectă, întrebări
   relevante, zero zgomot, anti-spam funcțional;
2. aprobarea explicită a lui Adrian, consemnată;
3. chiar și atunci: ședința urmează integral
   [`BOARD_MEETING_PROTOCOL.md`](../04-executive-board/BOARD_MEETING_PROTOCOL.md)
   (cele 22 de puncte, propriile porți `EXECUTIVE_BOARD_*`), Boardul rămâne
   **consultativ**, orice efect trece exclusiv prin `approvalGate`, iar plățile
   (Nivel 4) rămân excluse total.

Nicio combinație de severitate, persistență sau urgență nu poate ocoli aceste
porți. Un episod `critical` cu totul agravat produce, în această fază, exact
același lucru ca unul banal eligibil: o înregistrare în audit.

---

## 7. Înregistrarea în audit

Fiecare preview se scrie prin `audit.js` ca eveniment `ceo_board_preview`,
**fără schemă DB nouă**, alături de `ceo_pipeline` și `ceo_brief` din
`pipelineRunner.js`:

- `episode_id`, titlul, grupul de corelare și tipul de decizie mapat;
- componența previzualizată (inclusiv Guardian forțat, cu motivul „forțat la
  critical" când e cazul);
- per director: de ce, întrebarea contextualizată, sursele, ce lipsește;
- `combined_severity`, `combined_confidence`, statusul episodului;
- motivul eligibilității (criteriul anti-spam care a permis emiterea) sau, la
  episoadele în cooldown, doar mențiunea de cooldown în `ceo_pipeline`.

În Shadow Mode, auditul și `jarvis_state` (`proactive:episodes`) sunt
**singurele** locuri unde preview-ul există.

---

## 8. Legătura cu protocoalele existente

Această politică este veriga de mijloc între escaladarea observațiilor și
procedura de ședință:

| [`OBSERVATION_ESCALATION_PROTOCOL`](../21-observation-engine/OBSERVATION_ESCALATION_PROTOCOL.md) (21) | **BOARD_ESCALATION_POLICY** (22, acest document) | [`BOARD_MEETING_PROTOCOL`](../04-executive-board/BOARD_MEETING_PROTOCOL.md) (04) |
|---|---|---|
| Marchează **observația**: `requires_board_review` + motiv în audit | Grupează în **episoade** și produce **preview-ul** ședinței | Definește **cum** s-ar desfășura ședința, dacă ar fi convocată |
| Nivel: observație individuală | Nivel: episod (dedup + corelare + cooldown) | Nivel: ședință |
| Poartă: `OBSERVATION_BOARD_ESCALATION_ENABLED=false` | Poartă: `PROACTIVE_CEO_BOARD_EXECUTION_ENABLED=false` | Poartă: `EXECUTIVE_BOARD_ENABLED=false` |
| Nu convoacă nimic | Nu convoacă nimic | Consultativ chiar și activat; `approvalGate` pentru orice efect |

Documente conexe: [`BOARD_ROLES.md`](../04-executive-board/BOARD_ROLES.md) ·
[`BOARD_DECISION_PROTOCOL.md`](../04-executive-board/BOARD_DECISION_PROTOCOL.md) ·
[`BOARD_OUTPUT_SCHEMA.md`](../04-executive-board/BOARD_OUTPUT_SCHEMA.md) ·
[`OBSERVATION_NOTIFICATION_POLICY.md`](../21-observation-engine/OBSERVATION_NOTIFICATION_POLICY.md)
· celelalte documente ale Fazei 4.2 din `22-proactive-ceo` (triaj, episoade,
CEO Brief, anti-spam).

---

## 9. Invarianți

1. În această fază, escaladarea către Board = **preview în audit**, niciodată
   convocare.
2. Componența se obține **exclusiv** din `selectDirectors`/`ROLES`
   (`executiveBoard`) — zero duplicare a matricei.
3. Maparea grup → tip decizie este statică: `lichiditate_executie`→`general`,
   `oameni`→`hiring`, `ops`→`technical`, `piata`→`marketing`,
   `decizii`→`general`; necunoscut→`general`.
4. Guardian se adaugă forțat la `combined_severity=critical`.
5. `boardPreview.js` este pur: zero LLM, zero IO, zero cifre inventate — ce
   lipsește se declară în „ce lipsește".
6. Preview doar pentru episoade eligibile (`requires_board_review` + anti-spam);
   restul rămâne în cooldown și audit.
7. `PROACTIVE_CEO_BOARD_EXECUTION_ENABLED=false` implicit; activarea cere
   validarea Shadow Mode + aprobarea explicită a lui Adrian.
8. Chiar și după activare: BOARD_MEETING_PROTOCOL integral, Board consultativ,
   `approvalGate` pentru orice efect, plățile excluse total. **Adrian decide.**
