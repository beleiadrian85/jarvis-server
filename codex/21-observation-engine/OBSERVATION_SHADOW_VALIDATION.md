# OBSERVATION SHADOW VALIDATION — Protocolul de validare în Shadow Mode

> Ce se verifică — și în ce ordine — înainte ca Observation Engine să primească
> orice formă de activare dincolo de Shadow. Nicio notificare, nicio escaladare
> reală și nicio expunere către Adrian nu se aprobă fără trecerea completă a
> acestui protocol.
>
> **Stare:** PROIECTAT — implementat GATED, flag implicit OFF, prima rulare
> exclusiv în Shadow Mode. `approvalGate` rămâne singura poartă pentru efecte.
> Plățile sunt excluse total.

---

## 1. Principiul validării

Shadow Mode nu este o formalitate — este **proba că motorul poate exista fără să
schimbe nimic**. Un motor proactiv care observă compania are un singur mod
acceptabil de a greși în prima fază: în tăcere, în audit, fără niciun efect
vizibil. Validarea răspunde la o singură întrebare:

> Dacă Observation Engine rulează zile întregi în Shadow, poate cineva din
> afara audit-ului să demonstreze că există? Răspunsul corect este **nu**.

Doar după ce răspunsul este dovedit „nu" pe toate invariantele de mai jos se
poate discuta (separat, prin Change Control) despre notificări sau escaladare
reală către Executive Board.

---

## 2. Invariantele Shadow — ce se verifică înainte de orice activare

Fiecare invariant este o condiție **binară**: trecut sau picat. Un singur
invariant picat = protocolul picat.

| # | Invariant | Ce înseamnă concret | Cum se verifică |
|---|---|---|---|
| S1 | **Scriere doar în audit / jarvis_state** | Motorul persistă exclusiv în `audit_log` și în `jarvis_state` (stare dedup, ultimul ciclu, fingerprint cache). Zero tabele noi, zero scrieri în Operational, Gmail, Calendar, task-uri, decizii. | Inspecția `observationRunner` + verificarea că nu există migrări/scheme noi; audit-ul rulărilor conține doar aceste destinații. |
| S2 | **Zero notificări** | Niciun mesaj Telegram, email, push sau orice canal către Adrian sau altcineva. `safe_to_notify=false` pe fiecare observație în Shadow, indiferent de severitate — inclusiv `critical`. | `OBSERVATION_NOTIFICATIONS_ENABLED=false` implicit; nicio cale de cod din `observationEngine/` nu atinge canalele de notificare. |
| S3 | **Zero acțiuni** | Motorul nu creează task-uri, nu trimite emailuri, nu modifică date, nu convoacă Boardul. Escaladarea este exclusiv **marcaj** (`requires_board_review=true` în observație + motiv în audit). | `OBSERVATION_BOARD_ESCALATION_ENABLED=false`; `observationEscalation` doar marchează; nicio importare a căilor cu efect. |
| S4 | **Răspunsurile vizibile neschimbate** | Conversațiile cu JARVIS, rapoartele de dimineață, comenzile Telegram — identice byte-cu-byte cu comportamentul de dinaintea activării Shadow. | Comparație before/after pe rutele uzuale; motorul nu injectează nimic în fluxul de răspuns. |
| S5 | **Erori izolate** | O eroare în orice detector, în colectarea surselor sau în apelul LLM de sinteză nu blochează boot-ul serverului și nu afectează alte job-uri programate (raport dimineață, predicții, reminders). Eșecul LLM nu anulează rezultatul determinist. | Toate căile din `observationRunner` sunt în try/catch cu logare; boot-ul pornește identic cu `ENABLED=off` și cu module intenționat sabotate în test. |
| S6 | **Rulări concurente prevenite** | Două cicluri de observație nu pot rula simultan (rapid la 30–60 min + zilnic 06:45 + săptămânal luni 06:30 se pot suprapune). Lock-ul din `observationRunner` refuză a doua rulare și scrie refuzul în audit. | Declanșare deliberată a două rulări suprapuse → exact un ciclu complet + un refuz auditat. |
| S7 | **Cost LLM zero fără observații semnificative** | LLM-ul se apelează **doar** pentru sinteză și **doar** dacă există observații semnificative după scoring + dedup. Date identice (fingerprint neschimbat în `observationCache`) sau zero observații peste prag → zero apeluri LLM. | Rulări consecutive pe date neschimbate → contorul de apeluri LLM rămâne 0; audit-ul consemnează `skipped: unchanged data` / `no significant observations`. |
| S8 | **Determinismul înaintea LLM-ului** | Severitatea, scorul, dedup-ul și marcajul de escaladare sunt calculate determinist înainte de orice apel LLM; LLM-ul nu poate modifica severitatea și nu poate inventa observații. | Aceleași date de intrare → aceleași observații, aceleași scoruri, aceleași chei de dedup, la fiecare rulare. |

---

## 3. Precondiții — înainte de a atinge Railway

Toate, local sau în test, înainte de orice variabilă schimbată în producție:

1. **Flag-urile implicite verificate**: `OBSERVATION_ENGINE_ENABLED=false`,
   `OBSERVATION_ENGINE_SHADOW_MODE=true`, `OBSERVATION_NOTIFICATIONS_ENABLED=false`,
   `OBSERVATION_BOARD_ESCALATION_ENABLED=false`. Cu ENABLED=off, serverul
   pornește și se comportă **identic cu azi** — motorul nu există la runtime.
2. **Testele de acceptanță trec**: validator (schema canonică din
   `/codex/schemas/observation.schema.json`), scoring determinist (praguri
   severitate), dedup (cooldown pe severitate, tranziții new → repeated →
   worsening/improving → resolved), plafonul de max 10 observații per rulare,
   filtrarea semnalelor slabe (scor < 15, persistență < 3 rulări).
3. **Sursele sunt read-only dovedit**: `observationSources` citește
   predictionState, cashForecast, riskEngine, healthScore, reminders, decizii,
   `audit_log` și `jarvis_state` fără nicio scriere în afara S1.
4. **Lipsa datelor se declară, nu se inventează**: fără date bancare → cash cu
   `data_quality` declarat, nu solduri inventate; fără date de trafic → „perioadă
   fără date", nu „trafic zero".

---

## 4. Pașii de validare live (pe Railway, în Shadow)

Ordinea este obligatorie. Fiecare pas are un criteriu de trecere explicit.

| Pas | Acțiune | Criteriu de trecere |
|---|---|---|
| 1 | Setează `OBSERVATION_ENGINE_ENABLED=on` **cu** `OBSERVATION_ENGINE_SHADOW_MODE=on` (notificări și escaladare rămân off). Redeploy. | Boot-ul reușește; niciun alt job sau rută nu se schimbă; capabilities raportează motorul ca „shadow". |
| 2 | Observă liniile `[observation]` în railway logs la primul ciclu programat (interval implicit 45 min) și la ciclul zilnic 06:45 Europe/Bucharest. | Ciclul pornește și se încheie curat: colectare → detecție → scoring → dedup → (sinteză doar dacă e cazul) → persistare; fără stack trace-uri neprinse. |
| 3 | Verifică `audit_log` cu `action=observation_cycle`. | Fiecare rulare are exact o intrare de ciclu: durata, numărul de observații emise/suprimate, sursele indisponibile declarate, motivele de escaladare (doar marcaj), dacă LLM-ul a fost apelat sau sărit și de ce. |
| 4 | Verifică dedup-ul la rulări consecutive pe date neschimbate. | A doua rulare NU re-emite aceleași observații ca „new": fie `repeated` sub cooldown (suprimat, consemnat în audit), fie ciclu sărit pe fingerprint identic (`observationCache`). Zero apeluri LLM la date identice (S7). |
| 5 | Verifică tranzițiile de status pe minim un caz real: o observație care se agravează → `worsening` iese din cooldown; una care dispare → `resolved` emis o singură dată. | Tranzițiile apar corect în `jarvis_state` și în audit; `resolved` nu se repetă. |
| 6 | Provoacă suprapunerea rulărilor (declanșare manuală în timpul unui ciclu activ). | Lock-ul refuză a doua rulare; refuzul e auditat; niciun ciclu corupt (S6). |
| 7 | Verifică izolarea erorilor: o sursă indisponibilă (ex. Operational nedisponibil temporar) în timpul unui ciclu. | Ciclul continuă cu `data_quality` degradat și `unknowns` declarate sau se încheie curat cu eroarea auditată; boot-ul și celelalte job-uri neafectate (S5). |
| 8 | Rulează Shadow **minim 7 zile calendaristice** (acoperă cicluri rapide, zilnice și unul săptămânal de luni 06:30). | Toate invariantele S1–S8 rămân verzi pe toată perioada; observațiile din audit sunt citibile, ancorate în evidence cu surse prefixate și fără spam. |
| 9 | Revizuirea calității de către Adrian: citirea observațiilor din audit — sunt reale, relevante, formulate neutru (inclusiv categoria `founder`), fără observații emise doar ca motorul „să arate că rulează"? | Adrian confirmă explicit valoarea semnalului. Fără această confirmare, motorul rămâne în Shadow pe termen nelimitat. |

---

## 5. Criteriile de rollback

Rollback = `OBSERVATION_ENGINE_ENABLED=off` **imediat**, fără dezbatere, fără
„mai observăm o zi". Oprirea flag-ului readuce sistemul exact la comportamentul
de dinainte — acesta este întregul motiv pentru care motorul e gated.

Se face rollback la **oricare** dintre următoarele:

| Semnal de regresie | De ce e descalificant |
|---|---|
| Orice scriere în afara `audit_log` / `jarvis_state` | Încălcare S1 — motorul a produs efecte. |
| Orice notificare trimisă, pe orice canal | Încălcare S2 — Shadow înseamnă tăcere totală. |
| Orice acțiune cu efect (task creat, email, convocare Board) | Încălcare S3 — motorul observă, nu execută. |
| Orice schimbare în răspunsurile vizibile ale JARVIS | Încălcare S4 — utilizatorul nu trebuie să simtă nimic. |
| Boot eșuat sau job existent blocat/întârziat din cauza motorului | Încălcare S5 — erorile nu sunt izolate. |
| Cicluri suprapuse sau stare de dedup coruptă | Încălcare S6 — lock-ul nu ține. |
| Apeluri LLM pe date neschimbate sau fără observații semnificative | Încălcare S7 — cost fără valoare. |
| Spam de observații (același semnal re-emis sub cooldown, > 10/rulare) | Anti-spamul e parte din contract, nu opțiune. |
| Severitate sau observații provenite din LLM, nu din scoring | Încălcare S8 — determinismul e fundația încrederii. |
| Solduri, trafic sau vânzări inventate în lipsa datelor | Încălcarea regulii „lipsa datelor se declară, nu se umple". |

După rollback: cauza se documentează în audit și în
`/codex/21-observation-engine/`, corecția trece prin testele de acceptanță, iar
protocolul se reia **de la Pasul 1**. Nu există validare parțială reportată.

---

## 6. Ce NU validează acest protocol

Explicit în afara scopului — fiecare cere propriul Change Control ulterior:

- **Activarea notificărilor** (`OBSERVATION_NOTIFICATIONS_ENABLED=on`) — altă
  etapă, alt protocol, după confirmarea calității semnalului de către Adrian.
- **Escaladarea reală către Executive Board**
  (`OBSERVATION_BOARD_ESCALATION_ENABLED=on`) — fluxul Observation Engine →
  Validator → Board → CEO Recommendation → Adrian rămâne proiectat, nu activat.
- **Orice acțiune automată** derivată din observații — interzisă prin
  arhitectură; `approvalGate` rămâne singura poartă pentru efecte.

Shadow Mode validat ≠ motor aprobat pentru producție vizibilă. Validează doar
că motorul **poate observa fără să atingă nimic** — condiția minimă de
existență pentru orice pas următor.
