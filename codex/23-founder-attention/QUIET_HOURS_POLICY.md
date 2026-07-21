# QUIET HOURS POLICY — Politica Orelor de Liniște (Founder Attention Gate)

> **Stare: PROIECTAT — implementat GATED, flag implicit OFF, validare exclusiv în
> Shadow Mode; NICIO notificare reală în această fază.** Politica de quiet hours
> este implementată și testată ca logică **PURĂ** în `notificationPolicy.js`,
> dar efectul ei este exclusiv **marcarea candidaților** în audit și
> `jarvis_state`. `safe_to_send` rămâne **întotdeauna `false`** — inclusiv
> pentru candidații care AR trece de quiet hours. Nimic nu ajunge la Adrian.

---

## 1. Principiu

Timpul de odihnă al fondatorului este o resursă a firmei, nu un canal liber de
notificare. Founder Attention Gate există ca să elimine zgomotul — iar zgomotul
la ora 23:40 este de două ori mai scump decât zgomotul la ora 11:00.

Regula de bază este simplă și deterministă:

> **Între 22:00 și 07:00 (Europe/Bucharest), nimic nu întrerupe fondatorul.**
> Ce era destinat trimiterii se amână și intră în digestul de dimineață.
> Există o singură excepție, definită restrictiv, verificabilă în audit.

Politica se aplică **după** ce gate-ul a stabilit nivelul de atenție
(`attention_level`) conform criteriilor din capitolul 23 și **după** regulile
anti-spam (cooldown, limite zilnice, grupare). Quiet hours este ultimul filtru
înainte ca un candidat să devină — într-o fază viitoare, activată explicit —
o notificare reală.

| Ce ESTE quiet hours | Ce NU este |
|---|---|
| Un filtru determinist de timp, pur, testabil | O suprimare a informației |
| O amânare către digestul de dimineață | O ștergere a candidatului |
| O marcare explicită în candidat + audit | O decizie ascunsă, nejurnalizată |
| O regulă cu O SINGURĂ excepție, strict definită | O regulă cu excepții „după caz" |

---

## 2. Fereastra implicită

| Parametru | Valoare implicită | Observații |
|---|---|---|
| Interval | **22:00 – 07:00** | fereastră care traversează miezul nopții |
| Fus orar | **Europe/Bucharest** | inclusiv tranzițiile DST; niciodată UTC brut |
| Zile | toate zilele săptămânii | diferențiere weekend = doar prin Change Control (§6) |
| Sursa orei | ceasul rulării `founderGateRunner` | evaluat determinist la momentul rulării |

Evaluarea este pură: funcția primește timestamp-ul rulării și configurația
ferestrei, întoarce `in_quiet_hours: true/false`. Fără IO, fără LLM, fără
stare ascunsă — aceeași intrare produce întotdeauna aceeași ieșire, ceea ce
face politica testabilă unitar (inclusiv pe cazurile-limită 21:59 / 22:00 /
06:59 / 07:00 și pe zilele de schimbare a orei).

---

## 3. Ce se întâmplă în quiet hours

Comportamentul depinde de nivelul de atenție stabilit de gate
(vezi `ATTENTION_LEVELS.md` din acest capitol):

| `attention_level` | În quiet hours | Marcare pe candidat |
|---|---|---|
| `IGNORE` | neschimbat — nu era candidat oricum | — |
| `AUDIT_ONLY` | neschimbat — doar audit, ca de obicei | — |
| `DAILY_DIGEST` | neschimbat — digestul e oricum de dimineață | — |
| `INTERRUPTIVE_ALERT` (non-critical) | **retrogradat** în digestul de dimineață | `quiet_deferred` |
| `FOUNDER_DECISION_REQUIRED` | **retrogradat** în digestul de dimineață | `quiet_deferred` |
| `DATA_REQUIRED_BEFORE_DECISION` | **retrogradat** în digestul de dimineață | `quiet_deferred` |
| `INTERRUPTIVE_ALERT` **critical + risc confirmat determinist** | singura excepție — AR trece (vezi §4) | `quiet_override` |

Retrogradarea NU pierde informație: candidatul rămâne integral în
`jarvis_state`, cu tot conținutul lui (`title`, `why_now`, `what_changed`,
`business_impact`, `deadline`, `missing_data` etc.), și este preluat de
`dailyDigest.js` în prima secțiune relevantă a digestului de dimineață —
de regulă „CE NECESITĂ ATENȚIA TA" sau „CE S-A AGRAVAT", conform
`DAILY_CEO_DIGEST.md`.

Regulile anti-spam rămân în vigoare și peste noapte: un episod care ar fi
generat trei alerte între 22:00 și 07:00 nu produce trei intrări în digest,
ci una singură, deduplicată pe `deduplication_key`, cu istoricul complet în
audit.

---

## 4. Excepția unică: critical cu risc real confirmat determinist

O singură categorie de candidat poate — conceptual — traversa quiet hours:

1. `attention_level = INTERRUPTIVE_ALERT` cu severitate **critical**; **ȘI**
2. riscul este **confirmat determinist**: probabilitate certă, calculată pe
   **date complete** (`data_quality` cel puțin `good`, `missing_data` gol
   pentru câmpurile esențiale ale riscului); **ȘI**
3. riscul este **real și imediat** — de tipul: risc sever de cash, decizie
   ireversibilă iminentă, risc juridic/reputațional major cu termen în
   interiorul ferestrei de liniște.

Toate cele trei condiții sunt obligatorii, cumulativ. În particular:

- un „critical" dedus din date `poor` sau `partial` **NU** trece — regula
  generală din capitolul 23 (data_quality=poor blochează alertele
  interruptive) se aplică și aici, chiar mai strict;
- un „critical" fără urgență în interiorul nopții **NU** trece — dacă poate
  aștepta până la 07:00 fără cost suplimentar, așteaptă;
- o estimare probabilistică, o extrapolare de trend sau o suspiciune **NU**
  sunt „confirmate determinist", oricât de îngrijorătoare ar fi.

Candidatul care îndeplinește toate condițiile se marchează `quiet_override`,
cu justificarea completă în audit (ce condiții au fost îndeplinite, pe ce
date). **În această fază, `quiet_override` este strict o etichetă de
validare**: candidatul rămâne cu `safe_to_send=false` și nu se trimite —
scopul este să verificăm în Shadow Mode că excepția se declanșează rar și
doar când trebuie.

---

## 5. Marcarea în candidatul de notificare

Politica de quiet hours lasă urme explicite pe candidat (structura canonică
din `NOTIFICATION_CANDIDATE_SPEC.md`):

| Câmp / marcaj | Semnificație |
|---|---|
| `quiet_deferred: true` | candidatul a fost prins în quiet hours și retrogradat în digestul de dimineață; nivelul original se păstrează în audit |
| `quiet_override: true` | candidatul îndeplinește integral condițiile excepției din §4; AR fi trecut de quiet hours dacă notificările ar fi active |
| `suggested_channel` | pentru `quiet_deferred` devine `digest`; pentru `quiet_override` rămâne canalul interruptiv propus (`telegram`/`hud`) |
| `safe_to_send` | **`false`, necondiționat, în ambele cazuri** — invariant al fazei |

Cele două marcaje sunt mutual exclusive: un candidat este ori amânat, ori
excepție, niciodată ambele. Un candidat evaluat în afara ferestrei de liniște
nu poartă niciunul dintre marcaje. Fiecare marcare produce o înregistrare de
audit cu: timestamp-ul rulării, fereastra activă, nivelul original, decizia
(`deferred`/`override`) și motivarea deterministă.

---

## 6. Configurabilitate viitoare — DOAR prin Change Control

Fereastra 22:00–07:00, toate zilele, este **valoarea implicită de guvernanță**,
nu o preferință tehnică. Orice modificare trece prin procesul de Change
Control din `00-governance` (propunere → înregistrare în `decisions/` →
aprobarea explicită a lui Adrian), niciodată prin editare directă de config
sau env pe Railway.

Extensii anticipate (proiectate, neimplementate ca variație — schema de
configurare le prevede, valorile rămân cele implicite):

| Extensie | Exemplu | Statut |
|---|---|---|
| Ore diferite per zi a săptămânii | vineri 23:00–08:00 | doar prin Change Control |
| Regim de weekend | sâmbătă–duminică 22:00–09:00 | doar prin Change Control |
| Zile complet protejate | concediu, sărbători legale | doar prin Change Control |
| Modificarea fusului orar | — | doar prin Change Control (implicit rămâne Europe/Bucharest) |

Ce NU va deveni niciodată configurabil: **dezactivarea completă a quiet hours
cu excepția activă** (adică „totul trece noaptea"). Excepția din §4 este
plafonul maxim de permisivitate al acestei politici.

---

## 7. Implementare și validare în această fază

- **Modul:** `src/founderAttention/notificationPolicy.js` — **PUR**, zero IO,
  zero LLM; quiet hours coexistă cu cooldown-urile, limitele zilnice și
  gruparea, în același modul de politică.
- **Orchestrare:** `founderGateRunner.js` aplică politica la fiecare rulare și
  scrie rezultatul în audit + `jarvis_state`; apelul din
  `proactiveCeo/pipelineRunner` este GATED, cu erorile izolate (o eroare în
  gate nu oprește pipeline-ul din amonte —
  [`PROACTIVE_CEO_ARCHITECTURE.md`](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md)).
- **Flag-uri:** `FOUNDER_ATTENTION_GATE_ENABLED=false` (implicit),
  `FOUNDER_ATTENTION_SHADOW_MODE=true`, `FOUNDER_NOTIFICATIONS_ENABLED=false`.
  Cu toate cele trei în valorile implicite, politica se poate valida complet
  fără niciun efect asupra fondatorului.
- **Teste:** cazuri-limită de fereastră (21:59/22:00/06:59/07:00, DST),
  retrogradarea fiecărui nivel eligibil, declanșarea excepției doar pe
  critical + date complete + risc imediat, exclusivitatea
  `quiet_deferred`/`quiet_override`, invarianta `safe_to_send=false`.
- **Criteriu de validare în Shadow Mode:** pe parcursul validării,
  `quiet_override` trebuie să fie un eveniment **rar**; dacă apare frecvent,
  problema este în amonte (triaj/severitate —
  [`SIGNAL_TRIAGE_RULES.md`](../22-proactive-ceo/SIGNAL_TRIAGE_RULES.md),
  pe semnalele Observation Engine din
  [`21-observation-engine`](../21-observation-engine/)), nu în politica de
  quiet hours.

Activarea trimiterii reale de notificări — cu quiet hours ca gardian activ —
este o decizie separată, viitoare, exclusiv a lui Adrian, după validarea
completă a gate-ului în Shadow Mode.
