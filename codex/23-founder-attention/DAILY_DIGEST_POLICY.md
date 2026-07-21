# DAILY CEO DIGEST — Politica digestului zilnic

> **PROIECTAT** — implementat GATED, flag implicit OFF, validare exclusiv în Shadow Mode; **NICIO notificare reală în această fază.** Digestul se generează doar ca preview în `audit/` + `jarvis_state`, cu `safe_to_send=false`.

Documentul definește formatul canonic, regulile de selecție și momentul generării pentru **Daily CEO Digest** — livrabilul zilnic al Founder Attention Gate (Faza 4.4). Digestul este canalul implicit pentru tot ce merită atenția lui Adrian dar **nu justifică o întrerupere**: un singur mesaj pe zi, dens, fără zgomot.

Se leagă de: [22-proactive-ceo](../22-proactive-ceo/) (Board Preview, CEO Brief, episoade executive) și [21-observation-engine](../21-observation-engine/) (sursa observațiilor la 30 min). Politica de niveluri este definită în `ATTENTION_LEVELS.md`, iar anti-spamul în `NOTIFICATION_POLICY.md` (același director).

---

## 1. Formatul canonic — 5 secțiuni fixe, numerotate

Digestul are **întotdeauna** aceleași 5 secțiuni, în această ordine, cu aceste titluri. Secțiunile goale se afișează cu „— nimic azi" (nu se omit — absența e informație).

| # | Secțiune | Întrebarea la care răspunde |
|---|----------|------------------------------|
| 1 | **CE NECESITĂ ATENȚIA TA** | Ce trebuie să vezi azi, chiar dacă nu e urgent? |
| 2 | **CE S-A AGRAVAT** | Ce evoluează în direcția greșită de la ultimul digest? |
| 3 | **CE S-A REZOLVAT** | Ce s-a închis și nu mai cere nimic de la tine? |
| 4 | **CE DECIZII SE APROPIE** | Ce termene de decizie intră în fereastra de 7 zile? |
| 5 | **CE DATE LIPSESC** | Ce nu putem evalua corect din lipsă de date? |

Fiecare punct dintr-o secțiune este **o singură frază densă**: ce s-a întâmplat + de ce contează + (dacă există) termenul. Fără jargon de pipeline, fără ID-uri tehnice în corpul textului — `episode_id` și `notification_candidate_id` merg doar în metadatele de audit.

---

## 2. Reguli de selecție

Regula de aur: **maxim 5–7 puncte în TOTAL pe întreg digestul**, nu per secțiune. Un digest bun e cel pe care Adrian îl citește în sub un minut.

| Regulă | Detaliu |
|--------|---------|
| **Plafon total** | 5–7 puncte pe tot digestul. Dacă există mai mulți candidați eligibili, se ordonează după severity → impact financiar → apropierea termenului, iar restul se amână pentru digestul următor (cu dedup — nu reintră identic). |
| **Prag de severitate** | Intră doar semnale cu `severity ≥ medium` **SAU** care au primit un nivel de atenție fondator din gate (`DAILY_DIGEST`, `FOUNDER_DECISION_REQUIRED`, `DATA_REQUIRED_BEFORE_DECISION`, alerte retrogradate). Nimic `low`, oricât de „interesant". |
| **Zero zgomot de audit** | Evenimentele interne de pipeline (rulări, triaj, episoade fără schimbare, heartbeat-uri, statistici de motor) **nu apar niciodată** în digest. Digestul e despre firmă, nu despre JARVIS. |
| **Anti-repetiție** | Un episod fără date noi, fără worsening și fără decizie nouă nu regenerează un punct — se aplică `deduplication_key` din candidat (vezi `NOTIFICATION_POLICY.md`). |
| **Determinism** | Selecția e o funcție PURĂ peste candidații existenți (`dailyDigest.js`): aceleași intrări → același digest. Fără apeluri de rețea, fără LLM în selecție. |

---

## 3. Ce intră în fiecare secțiune

| Secțiune | Sursă | Regulă de includere |
|----------|-------|---------------------|
| **1. CE NECESITĂ ATENȚIA TA** | Candidați `INTERRUPTIVE_ALERT` și `FOUNDER_DECISION_REQUIRED` **retrogradați** (quiet hours, cooldown, plafon zilnic atins) + candidați născuți direct la nivel `DAILY_DIGEST` | Retrogradarea nu pierde semnalul: tot ce n-a putut întrerupe azi aterizează aici, marcat cu nivelul original. Prioritate maximă la ordonare în plafonul de 5–7. |
| **2. CE S-A AGRAVAT** | Episoade cu `worsening=true` de la ultimul digest | Doar agravare **reală** (severitate crescută, trend confirmat, termen apropiat brusc) — nu fluctuații în marja de zgomot a datelor. |
| **3. CE S-A REZOLVAT** | Episoade trecute în `resolved` de la ultimul digest | Fiecare rezolvare apare **o singură dată** — în primul digest de după închidere — apoi niciodată. Secțiune de igienă mentală: închide bucle, nu cere nimic. |
| **4. CE DECIZII SE APROPIE** | Candidați cu `decision_needed` și `deadline` | Doar termene **≤ 7 zile**. Fiecare punct: decizia + termenul + costul amânării. Terminele mai îndepărtate așteaptă până intră în fereastră. |
| **5. CE DATE LIPSESC** | `missing_data[]` agregat de pe toți candidații + episoadele `DATA_REQUIRED_BEFORE_DECISION` | Unknowns-urile se **agregă** (aceeași lipsă cerută de 3 episoade = un singur punct, cu ce deblochează). Aceasta e lista de „ce să-i ceri Danei / ce să conectăm" — cea mai acționabilă secțiune pe termen lung. |

Un episod poate alimenta **o singură secțiune** per digest (cea mai relevantă, în ordinea 1 → 2 → 4 → 5; secțiunea 3 e exclusivă prin definiție — un episod rezolvat nu mai e activ).

---

## 4. Când se generează

| Aspect | Regulă |
|--------|--------|
| **Frecvență** | **O dată pe zi**, dimineața (Europe/Bucharest), după terminarea quiet hours (07:00) și **înainte de raportul de dimineață** — digestul devine, în viitor, secțiunea de deschidere a morning briefing-ului JARVIS. |
| **Fereastra acoperită** | De la generarea digestului precedent până la momentul curent (≈24h). Nimic nu se pierde între digesturi: candidații negenerați azi din cauza plafonului reintră mâine dacă rămân relevanți. |
| **Acum (Faza 4.4, Shadow)** | Digestul se generează **doar ca preview**: obiect complet scris în `audit/` și `jarvis_state`, cu `safe_to_send=false`. Nu se trimite pe niciun canal (nici digest, nici telegram, nici hud). |
| **În viitor (post-validare)** | Livrare pe canalul `digest` doar după decizia explicită a lui Adrian de a activa `FOUNDER_NOTIFICATIONS_ENABLED=true` — niciodată implicit. |

### Flag-uri care guvernează digestul

| Flag | Implicit | Efect |
|------|----------|-------|
| `FOUNDER_ATTENTION_GATE_ENABLED` | `false` | Gate-ul (și deci digestul) nu rulează deloc. |
| `FOUNDER_ATTENTION_SHADOW_MODE` | `true` | Digestul se scrie doar în audit + `jarvis_state`. |
| `FOUNDER_NOTIFICATIONS_ENABLED` | `false` | Nicio livrare reală, indiferent de restul flag-urilor. |

---

## 5. Criterii de reușită (validare în Shadow)

- Digestul zilnic din audit are **≤ 7 puncte** și fiecare punct trece testul „ar plăti Adrian 30 de secunde ca să citească asta?".
- Zero puncte de zgomot de audit sau `severity=low` pe parcursul validării.
- Rezolvările apar exact o dată; niciun punct identic în două digesturi consecutive fără date noi.
- Secțiunea 5 scade în timp — semnul că lipsurile de date chiar se închid (ex. formularul Danei).

Implementare: `src/founderAttention/dailyDigest.js` (funcție PURĂ), orchestrat de `founderGateRunner.js`, apelat GATED din `proactiveCeo/pipelineRunner` cu erori izolate.
