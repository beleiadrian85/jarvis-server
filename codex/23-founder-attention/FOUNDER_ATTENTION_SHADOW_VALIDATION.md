# FOUNDER ATTENTION SHADOW VALIDATION — Protocolul de validare în Shadow Mode

> Ce se verifică — și în ce ordine — înainte ca Founder Attention Gate să
> primească orice formă de activare dincolo de Shadow. Gate-ul decide CE
> merită să ajungă la Adrian și CÂND; tocmai de aceea validarea lui este cea
> mai strictă din tot lanțul: un gate care greșește fie îl îneacă pe fondator
> în zgomot, fie îi ascunde exact semnalul care conta.
>
> **Stare:** PROIECTAT — implementat GATED, flag implicit OFF, validare
> exclusiv în Shadow Mode; NICIO notificare reală în această fază.

---

## 1. Principiul validării

Gate-ul este ultimul strat al lanțului deja validat în Shadow:

```
Observation → Triage → Episode → Board Preview → CEO Brief
    → FOUNDER ATTENTION GATE → Notification Candidate (safe_to_send=false)
```

Straturile de dedesubt au propriile protocoale trecute
([21-observation-engine/OBSERVATION_SHADOW_VALIDATION.md](../21-observation-engine/OBSERVATION_SHADOW_VALIDATION.md),
[22-proactive-ceo/PROACTIVE_CEO_SHADOW_VALIDATION.md](../22-proactive-ceo/PROACTIVE_CEO_SHADOW_VALIDATION.md)).
Asta nu scutește gate-ul de al lui — dimpotrivă: stratul care **clasifică
atenția fondatorului** poate greși în moduri noi (alertă interruptivă pe date
slabe, „decizie necesară" fără date suficiente, spam de candidați identici,
digest umflat cu zgomot de audit). Validarea răspunde la două întrebări:

> 1. Dacă gate-ul rulează zile întregi în Shadow, poate cineva din afara
>    audit-ului să demonstreze că există? Răspunsul corect este **nu** —
>    niciun candidat nu are voie să devină notificare.
> 2. Dacă candidații din audit AR FI fost trimiși, ar fi fost fiecare
>    **exact la nivelul corect de atenție** — nici o treaptă mai sus, nici
>    una mai jos? Răspunsul corect este **da, fiecare**.

Prima întrebare este binară și se verifică tehnic. A doua este calitativă și
are un singur judecător: Adrian. Fără „da" la ambele, gate-ul rămâne în
Shadow pe termen nelimitat.

---

## 2. Starea de pornire — flag-urile

Toate implicit sigure. Cu `FOUNDER_ATTENTION_GATE_ENABLED=false`, apelul din
`proactiveCeo/pipelineRunner` nu se execută — **zero schimbare** față de
comportamentul de azi.

| Flag | Implicit | În validare | Semnificație |
|---|---|---|---|
| `FOUNDER_ATTENTION_GATE_ENABLED` | `false` | `on` (Pasul 1) | Gate-ul rulează după Proactive CEO Pipeline. |
| `FOUNDER_ATTENTION_SHADOW_MODE` | `true` | `true` (obligatoriu) | Doar `audit_log` + `jarvis_state`; zero notificări. |
| `FOUNDER_NOTIFICATIONS_ENABLED` | `false` | `false` (obligatoriu) | Niciun canal către Adrian. Etapă ulterioară, gated separat (§8). |

Orice combinație în care shadow e off sau notificările sunt on în timpul
acestui protocol = protocol invalidat, reluare de la zero.

---

## 3. Materialul de validare — episoadele REALE existente

Validarea se face pe episoadele reale deja produse de Proactive CEO Pipeline
în Shadow, nu pe date sintetice. Setul **minim** obligatoriu de cazuri:

| Caz real așteptat | Sursă | Nivel corect așteptat |
|---|---|---|
| Episod `lichiditate_executie` cu severitate high + termen de plată ≤3 zile | cash / obligații | `INTERRUPTIVE_ALERT` (dacă `data_quality` ≥ partial) |
| Același episod, dar cu `data_quality=poor` (ex. sold bancar necunoscut — datele Danei neintegrate) | cash | **NU** interruptive → `DATA_REQUIRED_BEFORE_DECISION` sau `DAILY_DIGEST`, cu `missing_data[]` populat |
| Episod medium stabil (ex. task-uri întârziate fără agravare) | tasks | `DAILY_DIGEST` |
| Episod cu decizie reală, ≥2 opțiuni valide, Board Preview cere fondatorul, date suficiente | orice | `FOUNDER_DECISION_REQUIRED` |
| Aceeași decizie, dar cu date esențiale lipsă | orice | `DATA_REQUIRED_BEFORE_DECISION` — niciodată „decision required" pe date insuficiente |
| Episod neschimbat între două rulări | orice | ZERO candidat nou (anti-spam) |
| Semnal sub prag / fără relevanță pentru fondator | orice | `IGNORE` sau `AUDIT_ONLY` |

Dacă vreun caz lipsește din episoadele reale în perioada de validare, se
așteaptă apariția lui — **nu se injectează artificial** în producție.
Alternativa acceptată: rulare locală/test a `founderGateRunner` pe un
snapshot al episoadelor reale din `audit_log` (funcțiile din
`src/founderAttention/` sunt PURE tocmai ca să permită asta).

---

## 4. Invariantele Shadow — ce se verifică

Fiecare invariant este o condiție **binară**: trecut sau picat. Un singur
invariant picat = protocolul picat.

| # | Invariant | Ce înseamnă concret | Cum se verifică |
|---|---|---|---|
| G1 | **Nivelurile corecte pe episoade reale** | Fiecare episod primește exact unul dintre cele 6 niveluri (IGNORE / AUDIT_ONLY / DAILY_DIGEST / INTERRUPTIVE_ALERT / FOUNDER_DECISION_REQUIRED / DATA_REQUIRED_BEFORE_DECISION), conform criteriilor din [FOUNDER_ATTENTION_GATE.md](./FOUNDER_ATTENTION_GATE.md). | Recalcul manual pe fiecare episod din audit vs. nivelul emis; tabelul din §3 acoperit integral. |
| G2 | **Interruptive blocat pe date slabe** | Cu `data_quality=poor`, `INTERRUPTIVE_ALERT` este BLOCAT — excepție unică: risc confirmat determinist (probabilitate certă pe date complete). Nicio alertă interruptivă „pe bănuială". | Căutare în audit: niciun candidat interruptive cu `data_quality=poor` fără marcajul excepției; retrogradarea auditată explicit cu motiv. |
| G3 | **Decision vs. data_required** | `FOUNDER_DECISION_REQUIRED` apare DOAR când: decizie reală + minim 2 opțiuni valide + Board Preview indică necesitatea fondatorului + amânarea are cost/risc + informațiile SUNT suficiente. Când lipsesc date esențiale → `DATA_REQUIRED_BEFORE_DECISION` cu `missing_data[]` populat. | Fiecare candidat `decision` din audit verificat pe cele 5 condiții; niciun `decision` cu `missing_data[]` nevid. |
| G4 | **Quiet hours respectate** | 22:00–07:00 Europe/Bucharest: candidații non-critical se retrogradează în digest (auditat cu motiv „quiet_hours"); critical trece DOAR cu risc real confirmat determinist. | Rulări din intervalul 22–07 inspectate în audit: retrogradările prezente, nicio alertă interruptivă non-critical marcată pentru fereastra de noapte. |
| G5 | **Limitele zilnice** | Max 5 alerte/zi (implicit), max 2 interruptive/zi (implicit). Candidații peste limită se retrogradează/amână, auditat cu motiv „daily_limit". | Numărătoare pe zile calendaristice în audit; nicio zi cu >5 candidați de alertă sau >2 interruptive „trimisibile". |
| G6 | **Gruparea** | Mai multe alerte interruptive în aceeași rulare → UNA grupată, cu episoadele membre enumerate; nu N candidați paraleli. | Rulările cu ≥2 episoade eligibile interruptive produc un singur candidat grupat în audit. |
| G7 | **Anti-spam / cooldown** | ZERO candidat nou dacă: episod identic / severitate neschimbată / fără date noi / fără worsening / termen neapropiat / fără decizie nouă. Cooldown per episod 24h; per tip: interruptive 6h, decision 12h. | Două rulări consecutive pe date neschimbate → zero candidați noi, doar audit cu motivul suprimării; `deduplication_key` stabil. |
| G8 | **Digestul disciplinat** | Daily CEO Digest (preview) are exact cele 5 secțiuni fixe (CE NECESITĂ ATENȚIA TA / CE S-A AGRAVAT / CE S-A REZOLVAT / CE DECIZII SE APROPIE / CE DATE LIPSESC), maxim 5–7 puncte relevante, zero zgomot de audit (niciun eveniment tehnic intern). | Inspecția fiecărui `ceo_digest` din audit: structură, ≤7 puncte, fiecare punct trasabil la un episod real. |
| G9 | **`safe_to_send=false` pe TOT** | Fiecare candidat de notificare emis în această fază — indiferent de nivel, inclusiv critical — are `safe_to_send=false`. Fără excepții, fără flag „temporar". | Verificarea câmpului pe TOȚI candidații din audit + `jarvis_state`; un singur `true` = protocol picat. |
| G10 | **Zero notificări, zero Board live, zero acțiuni** | Niciun mesaj pe niciun canal (digest/telegram/hud rămân doar `suggested_channel`); nicio convocare live a Boardului; niciun task, email sau efect; nicio scriere în afara `audit_log` / `jarvis_state`; fără schemă DB nouă. | Verificarea canalelor + a destinațiilor de scriere pe toată perioada; nicio migrare. |
| G11 | **Structura canonică a candidatului** | Fiecare candidat respectă structura din [NOTIFICATION_CANDIDATE_FORMAT.md](./NOTIFICATION_CANDIDATE_FORMAT.md): `notification_candidate_id` stabil (`nc:<episode>:<nivel>`), `episode_id`, `attention_level`, `title`, `why_now`, `what_changed`, `business_impact[]`, `decision_needed`, `deadline`, `confidence` 0–100, `data_quality`, `missing_data[]`, `suggested_channel`, `safe_to_send`, `deduplication_key`. Id-ul NU se re-creează sub altă formă între rulări. | Validare de schemă pe toți candidații din audit; aceleași id-uri la rulări consecutive pe același episod+nivel. |
| G12 | **Determinism pur** | `attentionGate`, `notificationCandidate`, `notificationPolicy`, `dailyDigest` sunt funcții PURE: aceleași episoade + același context (oră, contoare, cooldown-uri) → aceleași niveluri, aceiași candidați, același digest. Fără LLM, fără I/O în logică. | Două rulări pe snapshot identic → rezultate identice byte-cu-byte (mai puțin timestamp-urile); code review: zero apeluri de rețea/DB în modulele pure. |
| G13 | **Erori izolate** | O eroare în gate nu afectează Proactive CEO Pipeline, ciclul de observație, boot-ul serverului sau alte job-uri. Apelul din `pipelineRunner` este gated și înconjurat de try/catch. | Boot identic cu flag off; eroare provocată în test → pipeline-ul se încheie curat, eroarea doar auditată. |
| G14 | **Răspunsurile JARVIS neschimbate** | Conversațiile, raportul de dimineață, comenzile Telegram — identice cu comportamentul de dinaintea activării. Gate-ul nu injectează nimic în fluxul vizibil. | Comparație before/after pe rutele uzuale. |

---

## 5. Pașii de validare live (pe Railway, în Shadow)

Ordinea este obligatorie. Precondiție: Proactive CEO Pipeline deja rulează în
Shadow și produce episoade + brief-uri reale.

| Pas | Acțiune | Criteriu de trecere |
|---|---|---|
| 1 | Setează `FOUNDER_ATTENTION_GATE_ENABLED=on` **cu** `FOUNDER_ATTENTION_SHADOW_MODE=on` (`FOUNDER_NOTIFICATIONS_ENABLED` rămâne off). Redeploy. | Boot reușit; pipeline-ul și ciclul de observație neafectate; nicio rută vizibilă schimbată. |
| 2 | Așteaptă prima rulare a pipeline-ului cu episoade eligibile. | Gate-ul rulează după pipeline: audit conține o intrare `founder_gate` cu nivelul decis per episod și motivarea deterministă. |
| 3 | Verifică `audit_log` pentru cele trei acțiuni: `founder_gate`, `notification_candidate`, `ceo_digest`. | `founder_gate` la fiecare rulare a gate-ului; `notification_candidate` DOAR pentru nivelurile care produc candidat (nu pentru IGNORE/AUDIT_ONLY); `ceo_digest` ca preview zilnic, nu per rulare. |
| 4 | Verifică nivelurile față de §3 și invariantele G1–G3 pe episoadele reale. | Fiecare nivel recalculabil manual din criterii; interruptive blocat pe `poor`; niciun `decision` pe date insuficiente. |
| 5 | Verifică structura candidaților (G11) și `safe_to_send` (G9). | Schemă canonică respectată; `safe_to_send=false` pe absolut toți candidații. |
| 6 | **Anti-spam la rulări consecutive**: lasă minimum două rulări pe date neschimbate. | A doua rulare NU produce candidați noi pentru aceleași episoade — doar audit, cu motivul suprimării (cooldown 24h / fără schimbare). Un candidat nou apare DOAR la: severitate crescută, date noi, worsening, termen devenit apropiat sau decizie nouă. |
| 7 | Verifică quiet hours (G4): inspectează rulările din fereastra 22:00–07:00 Europe/Bucharest. | Retrogradările în digest prezente și auditate; critical marcat ca eligibil pentru excepție DOAR cu risc confirmat determinist. Nimic nu se trimite oricum — shadow. |
| 8 | Verifică limitele zilnice și gruparea (G5–G6) pe o zi cu volum. | Contoarele respectate (max 5/zi, max 2 interruptive/zi); rulările cu alerte multiple produc UN candidat grupat. |
| 9 | Verifică digestul (G8) prin citire umană, zilnic. | 5 secțiuni fixe, maxim 5–7 puncte, fiecare punct relevant pentru fondator, zero zgomot de audit. |
| 10 | Rulează Shadow **minimum 7 zile calendaristice**. | Toate invariantele G1–G14 rămân verzi pe toată perioada; zero notificări, zero Board live, zero acțiuni. |
| 11 | Revizuirea calității de către Adrian: citirea candidaților și a digest-urilor din audit. | Adrian confirmă explicit: fiecare candidat este la nivelul corect de atenție — nimic care l-ar fi întrerupt degeaba, nimic important lăsat în digest, nimic ratat. Fără această confirmare, gate-ul rămâne în Shadow. |

---

## 6. Criteriile de rollback

Rollback = `FOUNDER_ATTENTION_GATE_ENABLED=off` **imediat**, fără dezbatere.
Oprirea flag-ului elimină complet gate-ul de la runtime — Proactive CEO
Pipeline și Observation Engine continuă neafectate în Shadow-ul lor. Acesta
este întregul motiv pentru care apelul este gated în `pipelineRunner`.

Se face rollback la **oricare** dintre următoarele:

| Semnal de regresie | Invariant încălcat |
|---|---|
| Orice notificare trimisă, pe orice canal | G10 — Shadow înseamnă tăcere totală. |
| Orice candidat cu `safe_to_send=true` | G9 — contractul central al fazei. |
| Orice convocare live a Boardului sau acțiune cu efect | G10 — gate-ul clasifică, nu execută. |
| Alertă interruptivă emisă pe `data_quality=poor` fără excepția deterministă | G2 — regula de siguranță a gate-ului. |
| `FOUNDER_DECISION_REQUIRED` cu date esențiale lipsă | G3 — „decision required" pe date insuficiente e exact eroarea interzisă. |
| Candidat nou pentru episod neschimbat / în cooldown | G7 — spam către fondator, exact ce trebuia să prevină. |
| Depășirea limitelor zilnice sau lipsă de grupare la alerte multiple | G5/G6 — disciplina de volum. |
| Quiet hours ignorate (non-critical marcat interruptiv în 22–07) | G4 — protecția timpului fondatorului. |
| Digest cu >7 puncte sau cu zgomot de audit | G8 — digestul e sinteză, nu log. |
| Niveluri nerecalculabile manual sau nedeterministe | G1/G12 — determinismul e fundația încrederii. |
| Scriere în afara `audit_log` / `jarvis_state` sau schemă DB nouă | G10 — contractul de persistență. |
| Orice schimbare în răspunsurile vizibile ale JARVIS | G14 — utilizatorul nu trebuie să simtă nimic. |
| Pipeline blocat/întârziat sau boot eșuat din cauza gate-ului | G13 — erorile nu sunt izolate. |

După rollback: cauza se documentează în audit și în
`/codex/23-founder-attention/`, corecția trece prin teste, iar protocolul se
reia **de la Pasul 1**. Nu există validare parțială reportată.

---

## 7. Ce NU validează acest protocol

Shadow validat ≠ notificări aprobate. Protocolul dovedește doar că gate-ul
**știe să decidă ce merită atenția lui Adrian fără să i-o ceară vreodată**.
Trimiterea efectivă — canalul, formatul final, comportamentul la răspuns —
rămâne nevalidată și interzisă până la etapa următoare.

---

## 8. Etapele ULTERIOARE — gated separat, fiecare cu aprobarea explicită a lui Adrian

Fiecare etapă de mai jos are propriul flag, propriul protocol de validare și
**nu se activează** fără decizia explicită a lui Adrian, consemnată. Trecerea
Shadow-ului nu implică nimic din cele de mai jos.

| Etapă | Flag | Ce s-ar schimba | Condiție de intrare |
|---|---|---|---|
| 1. Notificări reale | `FOUNDER_NOTIFICATIONS_ENABLED=on` | Candidații eligibili devin notificări efective către Adrian — **abia atunci prima notificare reală** — sub exact aceleași reguli (niveluri, anti-spam, cooldown, limite, quiet hours), pe canalul sugerat (digest/telegram/hud). Recomandat: activare progresivă — întâi doar digestul zilnic, apoi alertele interruptive. | Shadow trecut integral (§5, inclusiv Pasul 11) + aprobarea explicită a lui Adrian + protocol propriu de validare. |
| 2. Convocare Board live din gate | `PROACTIVE_CEO_BOARD_EXECUTION_ENABLED=on` | Episoadele `FOUNDER_DECISION_REQUIRED` ar putea convoca Executive Board real înainte de notificare ([04-executive-board](../04-executive-board/BOARD_MEETING_PROTOCOL.md)), cu cost LLM per rol. | Etapa 1 stabilă + aprobarea explicită a lui Adrian + bugetul de tokeni per rol confirmat. |
| 3. Orice acțiune automată derivată | — (inexistent) | Nu există un asemenea flag și nu se creează. Notificarea informează; execuția rămâne exclusiv la Adrian; `approvalGate` rămâne singura poartă pentru efecte. | Interzisă prin arhitectură. |

---

## Legături

- [22-proactive-ceo/PROACTIVE_CEO_SHADOW_VALIDATION.md](../22-proactive-ceo/PROACTIVE_CEO_SHADOW_VALIDATION.md) — protocolul-frate al pipeline-ului; precondiție pentru acest protocol.
- [22-proactive-ceo/CEO_BRIEF_FORMAT.md](../22-proactive-ceo/CEO_BRIEF_FORMAT.md) — brief-urile pe care gate-ul le clasifică.
- [21-observation-engine/OBSERVATION_SHADOW_VALIDATION.md](../21-observation-engine/OBSERVATION_SHADOW_VALIDATION.md) — fundația lanțului; primul Shadow trecut.
- [04-executive-board/BOARD_MEETING_PROTOCOL.md](../04-executive-board/BOARD_MEETING_PROTOCOL.md) — ce ar deveni realitate abia în Etapa 2 (§8).
- Documentele din acest capitol (`/codex/23-founder-attention/`) — arhitectura gate-ului, nivelurile de atenție, formatul candidatului, politica anti-spam și digestul zilnic.
