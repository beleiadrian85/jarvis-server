# PROACTIVE CEO PIPELINE — Arhitectură (Faza 4.2)

> **STARE: PROIECTAT — implementat GATED, flag implicit OFF, validare exclusiv în Shadow Mode.**
> `PROACTIVE_CEO_PIPELINE_ENABLED=false` · `PROACTIVE_CEO_SHADOW_MODE=true` · `PROACTIVE_CEO_NOTIFICATIONS_ENABLED=false` · `PROACTIVE_CEO_BOARD_EXECUTION_ENABLED=false`

> **Poziționare:** acest capitol este continuarea directă a capitolului [21 — Observation Engine](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) și consumatorul controlat al capitolului [04 — Executive Board](../04-executive-board/BOARD_ARCHITECTURE.md). Nu înlocuiește niciunul dintre ele.

---

## 1. Scop

Observation Engine răspunde la întrebarea *„ce se întâmplă în companie?"*. Proactive CEO Pipeline răspunde la întrebarea următoare: *„ce ar trebui să ajungă pe masa fondatorului, în ce formă și când?"*.

JARVIS nu se mai limitează la a observa: **transformă observațiile relevante în inițiative executive utile** — episoade coerente de business, cu o pre-analiză a modului în care Executive Board le-ar trata și cu un brief scurt, decis, pentru fondator.

Trei fraze definesc întregul capitol:

1. **Observation Engine este sursa semnalelor.** Nimic nu intră în pipeline decât prin observațiile deterministe ale motorului din capitolul 21.
2. **Executive Board este motorul de analiză.** Pipeline-ul pregătește terenul pentru Board ([BOARD_ROLES](../04-executive-board/BOARD_ROLES.md)), dar în această fază **nu îl convoacă** — doar simulează convocarea.
3. **Adrian este decizia.** Capătul lanțului este întotdeauna fondatorul. Nimic nu se execută automat, nimic nu se notifică până la validarea explicită a fiecărei trepte.

Obiectivul operațional: **zero spam, zero acțiuni autonome** — puține episoade, bine formulate, doar când există valoare reală de decizie.

---

## 2. Lanțul complet — cele 5 trepte

```
┌────────────────────────────┐
│ 1. OBSERVATION ENGINE      │  ciclu la 30 min (shadow), capitolul 21
│    observationRunner       │  → observații deterministe, cu severitate,
└─────────────┬──────────────┘    confidence, data_quality, unknowns
              │ observațiile ciclului curent (apel GATED, flag implicit OFF)
              ▼
╔═════════════╪══════════════════════ pipelineRunner.js (orchestrare) ═╗
║             ▼                                                        ║
║ ┌────────────────────────────┐                                       ║
║ │ 2. SIGNAL TRIAGE           │  decizie deterministă per observație: ║
║ │    signalTriage.js (PUR)   │  ignore · audit_only · group ·        ║
║ └─────────────┬──────────────┘  board_candidate · founder_attention  ║
║               │ semnale relevante                                    ║
║               ▼                                                      ║
║ ┌────────────────────────────┐                                       ║
║ │ 3. EXECUTIVE EPISODES      │  grupare pe seturi de corelare +      ║
║ │    executiveEpisodes.js    │  reconciliere cu starea anterioară:   ║
║ │    (PUR)                   │  open / worsening / stable /          ║
║ └─────────────┬──────────────┘  improving / resolved + cooldown      ║
║               │ DOAR episoadele eligibile (după anti-spam)           ║
║               ▼                                                      ║
║ ┌────────────────────────────┐                                       ║
║ │ 4. BOARD ESCALATION        │  simulare, NU convocare: ce directori ║
║ │    PREVIEW                 │  AR fi convocați, de ce, ce întrebări,║
║ │    boardPreview.js (PUR)   │  ce surse, ce lipsește                ║
║ └─────────────┬──────────────┘                                       ║
║               │ preview + contextul episodului                       ║
║               ▼                                                      ║
║ ┌────────────────────────────┐                                       ║
║ │ 5. CEO BRIEF               │  5 secțiuni fixe, max ~900 caractere, ║
║ │    ceoBrief.js (PUR)       │  determinist, FĂRĂ LLM                ║
║ └─────────────┬──────────────┘                                       ║
╚═══════════════╪══════════════════════════════════════════════════════╝
                ▼
         ADRIAN (decizia finală)
         ── în Shadow Mode: doar audit + jarvis_state, ZERO notificări
```

| Treaptă | Întrebarea la care răspunde | Rezultat |
|---|---|---|
| 1. Observation Engine | Ce se întâmplă în companie? | Observații deterministe (capitolul 21) |
| 2. Signal Triage | Care observații merită atenție executivă? | Verdict per observație (5 rute) |
| 3. Executive Episodes | Ce poveste de business formează semnalele împreună? | Episoade corelate, cu status și cooldown |
| 4. Board Escalation Preview | Cum ar trata Boardul acest episod? | Preview de convocare (directori, întrebări, surse, lipsuri) |
| 5. CEO Brief | Ce trebuie să știe Adrian ca să decidă? | Brief determinist în 5 secțiuni fixe |

---

## 3. Principii de guvernanță

1. **Observation Engine = sursa semnalelor.** Pipeline-ul nu culege date proprii, nu interoghează sisteme și nu inventează observații. Consumă exclusiv ce produce motorul din capitolul 21, inclusiv declarațiile lui de incertitudine (`data_quality`, `unknowns`).
2. **Executive Board = motorul de analiză.** Logica de selecție a directorilor este **reutilizată** din Board (`selectDirectors`/`ROLES`), nu duplicată. Pipeline-ul pregătește dosarul; Boardul, când va fi activat, analizează.
3. **Adrian = decizia.** Fiecare brief se încheie la fondator. Pipeline-ul nu recomandă execuții, nu declanșează acțiuni, nu ocolește lanțul de decizie.
4. **Zero acțiuni automate.** Niciun modul nu are efecte în lumea reală. Singurele ieșiri sunt audit și stare internă.
5. **Zero notificări până la validare.** Nicio notificare (Telegram, email sau alt canal) nu pleacă până când Shadow Mode nu este validat de Adrian, treaptă cu treaptă — același protocol ca la [validarea în shadow a Observation Engine](../21-observation-engine/OBSERVATION_SHADOW_VALIDATION.md).
6. **Determinism.** Toate cele patru module de logică sunt funcții pure. CEO Brief-ul se generează **fără LLM** — același episod produce întotdeauna același brief.
7. **Anti-spam ca regulă de arhitectură, nu ca opțiune.** Cooldown-ul și criteriile de re-emitere sunt la nivel de episod (vezi §6); tăcerea este comportamentul implicit.

---

## 4. Cele 5 module (`src/proactiveCeo/`)

| Modul | Tip | Responsabilitate |
|---|---|---|
| `signalTriage.js` | PUR | Decide determinist, per observație, una din rutele: `ignore`, `audit_only`, `group`, `board_candidate`, `founder_attention`. Criterii: severitate, confidence, `data_quality` (poor reduce confidence ×0.7), impact financiar, urgență, persistență, worsening, sisteme afectate, reversibilitate, risc juridic/reputațional/operațional, dependența de fondator. |
| `executiveEpisodes.js` | PUR | Grupează semnalele pe **seturi de corelare** în episoade (vezi §5); observațiile necorelate rămân episoade separate. Reconciliază cu starea anterioară (`open` / `worsening` / `stable` / `improving` / `resolved`) și aplică cooldown la nivel de episod. |
| `boardPreview.js` | PUR | **Reutilizează `selectDirectors`/`ROLES` din executiveBoard, dar NU convoacă Boardul.** Produce doar previzualizarea: ce directori AR fi convocați, de ce, ce întrebări ar primi, ce surse de date ar folosi, ce date lipsesc. Guardian se adaugă forțat la severitate `critical`. |
| `ceoBrief.js` | PUR, fără LLM | Generează brieful determinist în cele 5 secțiuni fixe: CE TREBUIE SĂ ȘTII / CE SE POATE ÎNTÂMPLA / CE DATE LIPSESC / CE DECIZIE AR PUTEA FI NECESARĂ / URGENȚA. Maxim ~900 de caractere. |
| `pipelineRunner.js` | Orchestrare | Leagă treptele: triage → episoade → reconciliere → preview + brief **doar pentru episoadele eligibile** → audit (`ceo_pipeline`, `ceo_board_preview`, `ceo_brief`) + stare în `jarvis_state` sub cheia `proactive:episodes`. **Fără schemă DB nouă.** |

Exemplu de format canonic al CEO Brief-ului:

> CE TREBUIE SĂ ȘTII / În următoarele 21 de zile există presiune de cash de aproximativ X lei. / CE SE POATE ÎNTÂMPLA / Dacă încasările estimate nu intră, două obligații pot deveni critice. / CE DATE LIPSESC / Sold bancar actual + certitudinea încasărilor. / CE DECIZIE AR PUTEA FI NECESARĂ / Prioritizare plăți / accelerare încasări / finanțare temporară. / URGENȚA / RIDICATĂ

---

## 5. Episodul executiv — unitatea de lucru

Structura canonică:

```json
{
  "episode_id": "ep:<grup sau cheie>",
  "title": "…",
  "category": "…",
  "observations": ["<chei dedup membre>"],
  "combined_severity": "max dintre membri",
  "combined_confidence": "0-100, medie ponderată, redusă de data_quality poor",
  "business_impact": [],
  "unknowns": [],
  "requires_board_review": false,
  "requires_founder_attention": false,
  "status": "open | worsening | stable | improving | resolved"
}
```

Seturile de corelare (episoadele tematice):

| Set de corelare | Membri | Episod |
|---|---|---|
| `lichiditate_executie` | cash + rezervări fără avans + task-uri în risc | „Presiune de lichiditate și execuție Bell Residence" |
| `oameni` | people + founder | „Capacitate și responsabilitate în echipă" |
| `decizii` | observații de coerență decizională | „Coerența deciziilor" |
| `ops` | sănătatea sistemelor | „Sănătatea sistemelor" |
| `piata` | traffic + restul sales | „Piața și vânzări" |
| — (necorelat) | observație singulară | episod separat, de sine stătător |

`episode_id` este **stabil** între rulări: același grup produce același episod, ceea ce face posibile reconcilierea de status și cooldown-ul.

---

## 6. Anti-spam executiv (nivel episod)

Un **nou** CEO Brief pentru același episod se emite **doar** dacă:

- severitatea combinată **crește**;
- apare **informație nouă relevantă** (setul de observații membre se schimbă);
- statusul devine **worsening**;
- un termen se apropie **semnificativ**;
- problema se **rezolvă** (o singură dată, ca închidere);
- apare o **contradicție semnificativă**.

În orice alt caz: **cooldown** (implicit 24h) și doar audit — episodul continuă să fie urmărit în tăcere. Politica este aliniată cu [politica de notificare a Observation Engine](../21-observation-engine/OBSERVATION_NOTIFICATION_POLICY.md), dar se aplică la nivel de **episod**, nu de observație.

---

## 7. Moduri de funcționare: OFF / SHADOW

| Mod | Condiție | Comportament |
|---|---|---|
| **OFF** (implicit) | `PROACTIVE_CEO_PIPELINE_ENABLED=false` | Pipeline-ul **nu rulează deloc**. Apelul din `observationRunner` se întoarce imediat — zero schimbare față de comportamentul actual al motorului din capitolul 21. |
| **SHADOW** | `PROACTIVE_CEO_PIPELINE_ENABLED=true` + `PROACTIVE_CEO_SHADOW_MODE=true` | Pipeline-ul rulează complet, dar ieșirile merg **exclusiv** în `audit` și `jarvis_state`. Zero notificări, zero convocare Board, zero efecte. Este singurul mod în care se face validarea. |

Toate flag-urile sunt implicit pe valoarea sigură:

| Flag | Implicit | Efect |
|---|---|---|
| `PROACTIVE_CEO_PIPELINE_ENABLED` | `false` | Pipeline-ul nu rulează |
| `PROACTIVE_CEO_SHADOW_MODE` | `true` | Când rulează: doar audit/jarvis_state, zero notificări |
| `PROACTIVE_CEO_NOTIFICATIONS_ENABLED` | `false` | Nicio notificare către Adrian |
| `PROACTIVE_CEO_BOARD_EXECUTION_ENABLED` | `false` | Boardul NU se convoacă live — doar preview |

Activarea oricărui flag dincolo de Shadow este **decizia exclusivă a lui Adrian**, după validarea rezultatelor din audit — același model de guvernanță ca la Executive Board (SHADOW validat, ENABLED decis de fondator).

---

## 8. Integrări

| Integrare | Mecanism |
|---|---|
| **Observation Engine → pipeline** | Apel **gated** din `observationRunner` (2 linii): dacă `PROACTIVE_CEO_PIPELINE_ENABLED=false`, apelul e inert. Motorul din capitolul 21 rămâne neatins funcțional. |
| **Executive Board** | Reutilizarea directă a `selectDirectors`/`ROLES` din `executiveBoard` — o singură sursă de adevăr pentru componența Boardului ([BOARD_ROLES](../04-executive-board/BOARD_ROLES.md)); nicio duplicare de logică. |
| **Stare** | `jarvis_state`, cheia `proactive:episodes` — episoadele cu status și timestamp-uri de cooldown. **Fără schemă DB nouă.** |
| **Audit** | Toate ieșirile pipeline-ului sunt evenimente de audit: `ceo_pipeline` (rularea), `ceo_board_preview` (previzualizarea de convocare), `ceo_brief` (brieful generat). Auditul este singura „fereastră" a pipeline-ului în Shadow Mode. |

---

## 9. Ce NU face acest pipeline

| NU face | De ce |
|---|---|
| **NU convoacă Executive Board live** | `PROACTIVE_CEO_BOARD_EXECUTION_ENABLED=false`; treapta 4 este exclusiv preview. Convocarea reală rămâne guvernată de capitolul [04](../04-executive-board/BOARD_MEETING_PROTOCOL.md) și de decizia lui Adrian. |
| **NU notifică** | `PROACTIVE_CEO_NOTIFICATIONS_ENABLED=false`; nicio notificare până la validarea Shadow. |
| **NU scrie în Operational, Gmail sau Calendar** | Pipeline-ul nu are niciun efect în sistemele operaționale — doar audit și `jarvis_state`. |
| **NU atinge approvalGate** | approvalGate rămâne singura poartă pentru efecte în lumea reală, exact ca în capitolul 21. Pipeline-ul nu îi adaugă și nu îi ocolește nicio regulă. |
| **NU ia decizii și NU execută acțiuni** | Capătul lanțului este întotdeauna Adrian; pipeline-ul pregătește decizia, nu o ia. |
| **NU folosește LLM pentru brief** | `ceoBrief.js` este determinist — costul, latența și variabilitatea sunt zero. |

---

## 10. Documente conexe

| Document | Rol |
|---|---|
| [21 — OBSERVATION_ENGINE_ARCHITECTURE](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) | Sursa semnalelor: cum se produc observațiile |
| [21 — OBSERVATION_ESCALATION_PROTOCOL](../21-observation-engine/OBSERVATION_ESCALATION_PROTOCOL.md) | Marcajele `requires_board_review` pe care triage-ul le consumă |
| [21 — OBSERVATION_NOTIFICATION_POLICY](../21-observation-engine/OBSERVATION_NOTIFICATION_POLICY.md) | Politica anti-spam la nivel de observație, extinsă aici la nivel de episod |
| [21 — OBSERVATION_SHADOW_VALIDATION](../21-observation-engine/OBSERVATION_SHADOW_VALIDATION.md) | Modelul de validare în Shadow, replicat pentru acest pipeline |
| [04 — BOARD_ARCHITECTURE](../04-executive-board/BOARD_ARCHITECTURE.md) | Motorul de analiză pe care treapta 4 îl previzualizează |
| [04 — BOARD_ROLES](../04-executive-board/BOARD_ROLES.md) | Cei 12 directori; sursa `selectDirectors`/`ROLES` reutilizată de `boardPreview.js` |
| [04 — BOARD_MEETING_PROTOCOL](../04-executive-board/BOARD_MEETING_PROTOCOL.md) | Protocolul convocării reale — în afara scopului acestei faze |

*Documentele dedicate ale capitolului 22 (triage, episoade, preview, brief, validare shadow) detaliază fiecare treaptă descrisă aici.*
