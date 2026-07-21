# PROACTIVE CEO SHADOW VALIDATION — Protocolul de validare în Shadow Mode

> Ce se verifică — și în ce ordine — înainte ca Proactive CEO Pipeline să
> primească orice formă de activare dincolo de Shadow. Niciun CEO Brief nu
> ajunge la Adrian, nicio notificare nu pleacă și niciun Board nu se convoacă
> până când acest protocol nu este trecut integral.
>
> **Stare:** PROIECTAT — implementat GATED, flag implicit OFF, validare
> exclusiv în Shadow Mode. Adrian decide; nimic nu se execută automat.

---

## 1. Principiul validării

Pipeline-ul (Observation Engine → Signal Triage → Executive Episodes → Board
Escalation Preview → CEO Brief) este un strat **peste** un motor deja validat
în Shadow ([21-observation-engine/OBSERVATION_SHADOW_VALIDATION.md](../21-observation-engine/OBSERVATION_SHADOW_VALIDATION.md)).
Asta nu îl scutește de propriul protocol — dimpotrivă: un strat care
**agregă și escaladează** poate greși în moduri noi (grupări false, duplicate,
severitate umflată, brief-uri irelevante, spam executiv). Validarea răspunde
la două întrebări:

> 1. Dacă pipeline-ul rulează zile întregi în Shadow, poate cineva din afara
>    audit-ului să demonstreze că există? Răspunsul corect este **nu**.
> 2. Sunt episoadele și brief-urile din audit **utile** — ar fi meritat
>    fiecare atenția lui Adrian? Răspunsul corect este **da, fiecare**.

Prima întrebare este binară și se verifică tehnic. A doua este calitativă și
are un singur judecător: Adrian. Fără „da" la ambele, pipeline-ul rămâne în
Shadow pe termen nelimitat.

---

## 2. Starea de pornire — flag-urile

Toate implicit sigure. Cu `PROACTIVE_CEO_PIPELINE_ENABLED=false`, apelul din
`observationRunner` nu se execută — **zero schimbare** față de comportamentul
de azi.

| Flag | Implicit | În validare | Semnificație |
|---|---|---|---|
| `PROACTIVE_CEO_PIPELINE_ENABLED` | `false` | `on` (Pasul 1) | Pipeline-ul rulează după ciclul de observație. |
| `PROACTIVE_CEO_SHADOW_MODE` | `true` | `true` (obligatoriu) | Doar `audit_log` + `jarvis_state`; zero notificări. |
| `PROACTIVE_CEO_NOTIFICATIONS_ENABLED` | `false` | `false` (obligatoriu) | Niciun canal către Adrian. Etapă ulterioară, gated separat (§8). |
| `PROACTIVE_CEO_BOARD_EXECUTION_ENABLED` | `false` | `false` (obligatoriu) | Boardul NU se convoacă live — doar preview. Etapă ulterioară, gated separat (§8). |

Orice combinație în care shadow e off sau notificările/Boardul sunt on în
timpul acestui protocol = protocol invalidat, reluare de la zero.

---

## 3. Materialul de validare — observațiile REALE existente

Validarea se face pe semnalele reale deja produse de Observation Engine în
Shadow, nu pe date sintetice. Setul **minim** obligatoriu:

| Semnal real | Categorie | Așteptare de grupare (set de corelare) |
|---|---|---|
| Presiune de cash / obligații de plată scadente | cash | `lichiditate_executie` → episodul „Presiune de lichiditate și execuție Bell Residence" |
| Rezervări fără avans încasat | sales | `lichiditate_executie` (același episod — corelat, nu duplicat) |
| Task-uri în risc / întârziate | tasks | `lichiditate_executie` (același episod) |
| Semnale repetate pe oameni (responsabilitate, capacitate) | people | `oameni` → „Capacitate și responsabilitate în echipă" |
| Dependența de fondator (decizii blocate pe Adrian) | founder | `oameni` (același episod cu people) |

Dacă vreunul dintre aceste semnale lipsește din observațiile reale în perioada
de validare, se așteaptă apariția lui — **nu se injectează artificial** în
producție. Alternativa acceptată: rulare locală/test a `pipelineRunner` pe un
snapshot al observațiilor reale din `audit_log`.

Observațiile care nu aparțin niciunui set de corelare trebuie să rămână
**episoade separate** — verificat explicit (nicio grupare forțată).

---

## 4. Invariantele Shadow — ce se verifică

Fiecare invariant este o condiție **binară**: trecut sau picat. Un singur
invariant picat = protocolul picat.

| # | Invariant | Ce înseamnă concret | Cum se verifică |
|---|---|---|---|
| P1 | **Gruparea corectă** | Observațiile corelate (cash + rezervări fără avans + task-uri în risc) formează UN episod; people + founder formează UN episod; necorelatele rămân separate. | Compararea episoadelor din audit (`ceo_pipeline`) cu tabelul din §3; niciun episod „umbrelă" care amestecă seturi diferite. |
| P2 | **Lipsa duplicatelor** | Aceeași observație (cheie dedup) apare într-un singur episod; același episod are `episode_id` stabil (`ep:<grup sau cheie>`) între rulări — nu se re-creează sub alt id. | Inspecția `proactive:episodes` din `jarvis_state` la rulări consecutive: aceleași id-uri, membri dedup-uiți. |
| P3 | **Severitatea combinată corectă** | `combined_severity` = max-ul membrilor; `combined_confidence` = medie ponderată 0–100, redusă de `data_quality` poor (×0.7). Nicio umflare peste max, nicio inventare de certitudine. | Recalcul manual pe 2–3 episoade reale din audit vs. valorile emise. |
| P4 | **Triage determinist** | Aceleași observații → aceleași decizii de triage (ignore / audit_only / group / board_candidate / founder_attention), aceleași episoade, același brief. Fără LLM nicăieri în lanț. | Două rulări pe date identice → rezultate identice byte-cu-byte în audit (mai puțin timestamp-urile). |
| P5 | **Directorii propuși sunt plauzibili** | Board Preview REUTILIZEAZĂ `selectDirectors`/`ROLES` din Executive Board ([04-executive-board/BOARD_ROLES.md](../04-executive-board/BOARD_ROLES.md)); directorii propuși corespund categoriei episodului; Guardian apare **obligatoriu** la severitate `critical`. | Verificarea fiecărui `ceo_board_preview` din audit: episod de lichiditate → CFO prezent; episod de oameni → People prezent; critical → Guardian prezent. |
| P6 | **Întrebările pentru Board sunt concrete** | Preview-ul conține ce întrebări ar primi Boardul, ce surse ar folosi și ce lipsește — nu formulări generice reutilizabile la orice episod. | Citire umană: fiecare întrebare este specifică episodului și acționabilă. |
| P7 | **Datele lipsă declarate, nu umplute** | `unknowns[]` și secțiunea „CE DATE LIPSESC" reflectă lipsurile reale (ex. sold bancar actual, certitudinea încasărilor); nicio valoare inventată. | Compararea `unknowns` cu `data_quality` al observațiilor membre. |
| P8 | **Brief scurt și relevant** | CEO Brief are exact cele 5 secțiuni fixe (CE TREBUIE SĂ ȘTII / CE SE POATE ÎNTÂMPLA / CE DATE LIPSESC / CE DECIZIE AR PUTEA FI NECESARĂ / URGENȚA), maxim ~900 caractere, generat DOAR pentru episoadele eligibile. | Inspecția fiecărui `ceo_brief` din audit: structură, lungime, eligibilitate (nu există brief pentru episoade sub prag sau în cooldown). |
| P9 | **Zero notificări, zero acțiuni** | Niciun mesaj pe niciun canal; niciun task creat, niciun email, nicio convocare de Board, nicio scriere în afara `audit_log` / `jarvis_state` (`proactive:episodes`). Fără schemă DB nouă. | Verificarea canalelor + a destinațiilor de scriere pe toată perioada; nicio migrare. |
| P10 | **Răspunsurile JARVIS neschimbate** | Conversațiile, raportul de dimineață, comenzile Telegram — identice cu comportamentul de dinaintea activării. Pipeline-ul nu injectează nimic în fluxul vizibil. | Comparație before/after pe rutele uzuale. |
| P11 | **Erori izolate** | O eroare în triage/episoade/preview/brief nu afectează ciclul de observație, boot-ul serverului sau alte job-uri. Apelul din `observationRunner` este gated și înconjurat de try/catch. | Boot identic cu flag off; eroare provocată în test → ciclul de observație se încheie curat, eroarea doar auditată. |

---

## 5. Pașii de validare live (pe Railway, în Shadow)

Ordinea este obligatorie. Precondiție: Observation Engine deja rulează în
Shadow și produce observații reale.

| Pas | Acțiune | Criteriu de trecere |
|---|---|---|
| 1 | Setează `PROACTIVE_CEO_PIPELINE_ENABLED=on` **cu** `PROACTIVE_CEO_SHADOW_MODE=on` (notificări și Board execution rămân off). Redeploy. | Boot reușit; ciclul de observație neafectat; nicio rută vizibilă schimbată. |
| 2 | Așteaptă primul ciclu de observație cu observații semnificative. | Pipeline-ul rulează după ciclu: audit conține o intrare `ceo_pipeline` cu deciziile de triage per observație și episoadele rezultate. |
| 3 | Verifică `audit_log` pentru cele trei acțiuni: `ceo_pipeline`, `ceo_board_preview`, `ceo_brief`. | `ceo_pipeline` la fiecare rulare a pipeline-ului; `ceo_board_preview` + `ceo_brief` DOAR pentru episoadele eligibile (board_candidate / founder_attention), nu pentru toate. |
| 4 | Verifică episoadele față de §3 și invariantele P1–P3 pe observațiile reale (cash/obligații, rezervări fără avans, task-uri în risc, oameni, founder). | Grupare corectă, fără duplicate, severitate combinată recalculabilă manual. |
| 5 | Verifică Board Preview (P5–P6) și brief-urile (P7–P8) prin citire umană. | Directori corecți, Guardian la critical, întrebări concrete, date lipsă reale, brief-uri sub ~900 caractere cu cele 5 secțiuni. |
| 6 | **Anti-spam la rulări consecutive**: lasă minimum două cicluri pe date neschimbate. | Al doilea ciclu NU produce un nou `ceo_brief` pentru aceleași episoade — doar audit, cu motivul „cooldown" (implicit 24h). Un brief nou apare DOAR la: severitate crescută, membri noi în episod, status `worsening`, termen apropiat semnificativ, rezolvare (o singură dată) sau contradicție semnificativă. |
| 7 | Verifică reconcilierea de status pe minimum un caz real: un episod care se agravează → `worsening` (iese din cooldown); unul care dispare → `resolved` emis o singură dată, apoi tăcere. | Tranzițiile open → worsening/stable/improving → resolved apar corect în `proactive:episodes` și în audit; `resolved` nu se repetă. |
| 8 | Rulează Shadow **minimum 7 zile calendaristice**. | Toate invariantele P1–P11 rămân verzi; numărul de brief-uri per episod respectă anti-spam-ul; zero notificări, zero acțiuni pe toată perioada. |
| 9 | Revizuirea calității de către Adrian: citirea episoadelor și a brief-urilor din audit. | Adrian confirmă explicit: fiecare brief ar fi meritat atenția lui; nimic redundant, nimic inventat, nimic ratat evident. Fără această confirmare, pipeline-ul rămâne în Shadow. |

---

## 6. Criteriile de rollback

Rollback = `PROACTIVE_CEO_PIPELINE_ENABLED=off` **imediat**, fără dezbatere.
Oprirea flag-ului elimină complet pipeline-ul de la runtime — Observation
Engine continuă neafectat în Shadow-ul lui. Acesta este întregul motiv pentru
care apelul este gated în `observationRunner`.

Se face rollback la **oricare** dintre următoarele:

| Semnal de regresie | Invariant încălcat |
|---|---|
| Orice notificare trimisă, pe orice canal | P9 — Shadow înseamnă tăcere totală. |
| Orice acțiune cu efect (task, email, convocare Board live) | P9 — pipeline-ul propune, nu execută. |
| Scriere în afara `audit_log` / `jarvis_state` sau schemă DB nouă | P9 — contractul de persistență. |
| Orice schimbare în răspunsurile vizibile ale JARVIS | P10 — utilizatorul nu trebuie să simtă nimic. |
| Ciclul de observație blocat/întârziat sau boot eșuat din cauza pipeline-ului | P11 — erorile nu sunt izolate. |
| Grupări greșite sau observații duplicate între episoade | P1/P2 — agregarea e rațiunea de a exista a stratului. |
| Severitate sau confidence care nu se pot recalcula manual | P3/P4 — determinismul e fundația încrederii. |
| Brief nou pentru același episod fără un criteriu anti-spam îndeplinit | Spam executiv — exact ce trebuia să prevină. |
| Guardian absent la un episod `critical` | P5 — regula de siguranță a Board Preview. |
| Date inventate în locul declarării lipsurilor | P7 — „lipsa datelor se declară, nu se umple". |

După rollback: cauza se documentează în audit și în `/codex/22-proactive-ceo/`,
corecția trece prin teste, iar protocolul se reia **de la Pasul 1**. Nu există
validare parțială reportată.

---

## 7. Ce NU validează acest protocol

Shadow validat ≠ pipeline aprobat pentru producție vizibilă. Protocolul
dovedește doar că pipeline-ul **poate gândi executiv fără să atingă nimic**.

---

## 8. Etapele ULTERIOARE — gated separat, fiecare cu aprobarea explicită a lui Adrian

Fiecare etapă de mai jos are propriul flag, propriul protocol de validare și
**nu se activează** fără decizia explicită a lui Adrian, consemnată. Trecerea
Shadow-ului nu implică nimic din cele de mai jos.

| Etapă | Flag | Ce s-ar schimba | Condiție de intrare |
|---|---|---|---|
| 1. Notificări CEO Brief | `PROACTIVE_CEO_NOTIFICATIONS_ENABLED=on` | Brief-urile eligibile ajung efectiv la Adrian (canal de definit), sub aceleași reguli anti-spam. | Shadow trecut integral (§5, inclusiv Pasul 9) + aprobarea explicită a lui Adrian + protocol propriu de validare. |
| 2. Convocare Board live | `PROACTIVE_CEO_BOARD_EXECUTION_ENABLED=on` | Board Preview devine convocare reală a Executive Board ([04-executive-board](../04-executive-board/BOARD_MEETING_PROTOCOL.md)), cu cost LLM per rol și output către Adrian. | Etapa 1 stabilă + aprobarea explicită a lui Adrian + bugetul de tokeni per rol confirmat. |
| 3. Orice acțiune automată derivată | — (inexistent) | Nu există un asemenea flag și nu se creează. Execuția rămâne exclusiv la Adrian; `approvalGate` rămâne singura poartă pentru efecte. | Interzisă prin arhitectură. |

---

## Legături

- [21-observation-engine/OBSERVATION_SHADOW_VALIDATION.md](../21-observation-engine/OBSERVATION_SHADOW_VALIDATION.md) — protocolul-frate al motorului de observație; precondiție pentru acest protocol.
- [21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) — sursa observațiilor pe care rulează pipeline-ul.
- [04-executive-board/BOARD_ROLES.md](../04-executive-board/BOARD_ROLES.md) — rolurile reutilizate de Board Preview (`selectDirectors`/`ROLES`).
- [04-executive-board/BOARD_MEETING_PROTOCOL.md](../04-executive-board/BOARD_MEETING_PROTOCOL.md) — ce ar deveni realitate abia în Etapa 2 (§8).
- Documentele din acest capitol (`/codex/22-proactive-ceo/`) — arhitectura pipeline-ului, triage-ul, episoadele și formatul CEO Brief.
