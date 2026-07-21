# SELF-AUDIT — CEO SYSTEM HEALTH

> **PROIECTAT** — parte din MASTER PHASE **CEO AI Operational Intelligence** (implementare: `src/ceo/selfAudit.js`). Auditul rulează zilnic și scrie REAL în `audit/` + `jarvis_state`; **notificarea către Adrian este condiționată** — se trimite DOAR dacă există ceva relevant. Zero acțiuni autonome: auditul constată și propune, nu repară singur nimic.

Un CEO care nu știe ce nu funcționează în propriul lui sistem nu poate avea încredere în propriile concluzii. **Self-Audit** este verificarea zilnică prin care JARVIS își auditează **propria infrastructură de inteligență** — surse, conectori, motoare, job-uri — înainte să pretindă că știe ceva despre firmă. Este aplicarea regulii fundamentale *„date lipsă ≠ zero"* asupra sistemului însuși: o sursă căzută nu înseamnă „nimic de raportat", înseamnă „nu văd — și trebuie să spun că nu văd".

Distincție esențială: Self-Audit măsoară **sănătatea sistemului JARVIS**, nu sănătatea firmei. Sănătatea firmei e treaba [Company Data Map](COMPANY_DATA_MAP.md) (Company Data Health Score) și a [06-company-health](../06-company-health/). Cele două se ating într-un singur punct: dacă sistemul e bolnav, orice concluzie despre firmă devine suspectă — iar asta trebuie marcat explicit.

Se leagă de: [21-observation-engine](../21-observation-engine/) (ciclul la 30 min pe care îl supraveghează), [22-proactive-ceo](../22-proactive-ceo/) (pipeline-ul de episoade), [23-founder-attention](../23-founder-attention/) (gate + digest), [04-executive-board](../04-executive-board/) (rulările Board în shadow), [DATA_GAP_ENGINE.md](DATA_GAP_ENGINE.md) (lipsurile de date), [IMPROVEMENT_ENGINE.md](IMPROVEMENT_ENGINE.md) (canalul prin care auditul propune reparații) și [CLOSED_LOOP.md](CLOSED_LOOP.md) (verificarea că reparațiile aprobate chiar s-au făcut).

---

## 1. Principii

| # | Principiu | Consecință practică |
|---|-----------|---------------------|
| 1 | **Sistemul se verifică înainte să vorbească despre firmă** | Auditul rulează dimineața, ÎNAINTE de generarea digestului — dacă infrastructura are o problemă care alterează conținutul digestului, digestul o declară. |
| 2 | **Date lipsă ≠ zero — și pentru sistem** | Un job care nu a rulat nu e „fără evenimente"; e `UNKNOWN` + incident de audit. Nicio metrică inventată. |
| 3 | **Tăcerea e sănătate** | Un sistem sănătos NU generează mesaj către Adrian. Raportul complet există mereu în audit, dar canalul de notificare se folosește doar la relevanță reală. |
| 4 | **Auditul nu repară** | Constatările devin **System Improvement Proposals** prin [IMPROVEMENT_ENGINE.md](IMPROVEMENT_ENGINE.md) → ApprovalGate → Adrian. Fără self-modifying code, fără restart-uri „din proprie inițiativă". |
| 5 | **Auditul e auditabil** | Fiecare rulare scrie un obiect complet în `audit/` + `jarvis_state` — inclusiv rulările în care totul e verde. Absența unui raport de audit e ea însăși un incident (detectat la rularea următoare). |

---

## 2. Ce verifică zilnic — cele 12 secțiuni de control

Auditul parcurge, în ordine deterministă, următoarele categorii. Fiecare check produce o stare `OK / WARN / FAIL / UNKNOWN` + detaliu.

| # | Categorie | Ce se verifică concret |
|---|-----------|------------------------|
| 1 | **Surse de date** (cele 22 de domenii din [COMPANY_DATA_MAP.md](COMPANY_DATA_MAP.md)) | Starea fiecărui domeniu (`CONNECTED / PARTIAL / NOT_CONNECTED`) și — mai important — **schimbările de stare** față de ieri. O sursă care cade din `CONNECTED` în `NOT_CONNECTED` e un eveniment; una care era deja `NOT_CONNECTED` e doar context. |
| 2 | **Freshness** | Vechimea ultimei date per domeniu vs. pragul de freshness declarat în registru (ex. BANK la zi, ACCOUNTING lunar). Date mai vechi decât pragul → `WARN`; de peste 2× prag → `FAIL`. Freshness expirat NU se maschează: domeniul devine `STALE` în orice raționament CEO din ziua respectivă. |
| 3 | **Conectori** | Fiecare conector tehnic (MCP Operational — cele 28 de tool-uri, SmartBill API, Google/GA4, Telegram, vault, e-mail): răspunde? autentificarea e validă? latență anormală? erori la ultimele apeluri? |
| 4 | **Observation Engine** ([21](../21-observation-engine/)) | A rulat la fiecare 30 min? Câte cicluri lipsesc din ultimele 24h? A produs observații sau doar heartbeat? Erori de scoring/escaladare? |
| 5 | **Proactive CEO Pipeline** ([22](../22-proactive-ceo/)) | Episoade executive: câte deschise / actualizate / blocate; triajul a procesat toate semnalele primite; episoade „înghețate" fără update peste pragul lor. |
| 6 | **Founder Attention Gate** ([23](../23-founder-attention/)) | Candidații au fost evaluați? Quiet hours, cooldown și plafonul zilnic s-au aplicat corect (zero notificări peste politică)? Retrogradările au aterizat în coada de digest, nu s-au pierdut? |
| 7 | **Daily CEO Digest** | S-a generat? S-a livrat la 07:40 (singurul mesaj REAL/zi)? Respectă plafonul de 5–7 puncte și formatul din [DAILY_DIGEST_POLICY.md](../23-founder-attention/DAILY_DIGEST_POLICY.md)? Un digest negenerat sau nelivrat = `FAIL` automat relevant. |
| 8 | **Executive Board** ([04](../04-executive-board/)) | Rulările shadow: toate rolurile au răspuns? Răspunsuri goale sau JSON trunchiat (simptomul cunoscut de buget tokeni la thinking) → `WARN` cu rolul și bugetul efectiv. |
| 9 | **Motoare CEO** (`src/ceo/*`) | `cashIntelligence`, `dataGapEngine`, `proposalEngine`, `salesIntelligence`, `peopleIntelligence`, `decisionEngineV2`, `closedLoop`, `improvementEngine`: ultima execuție reușită, erori, ieșiri valide de schemă. Un motor care produce output invalid e tratat ca și cum n-ar fi rulat. |
| 10 | **Job-uri programate** | Toate cron-urile: ultima rulare, durata vs. istoricul, rulări suprapuse, job-uri care n-au mai rulat de peste un interval. |
| 11 | **Erori** | Excepții necaptate, retry-uri epuizate, rate limits atinse, degradări de model (fallback-uri activate) — agregate pe 24h, cu tendință față de ziua precedentă. |
| 12 | **Date contradictorii + informații lipsă** | (a) **Contradicții**: aceeași realitate raportată diferit de două surse (ex. sold bancar din extras vs. jurnalul Danei; stoc unități vs. vânzări confirmate). Contradicția NU se rezolvă prin alegerea unei surse — se marchează `CONFLICT` și devine Data Gap cu întrebare pentru owner. (b) **Lipsuri**: gap-urile noi detectate și gap-urile închise de la ultimul audit, sincronizate cu [DATA_GAP_ENGINE.md](DATA_GAP_ENGINE.md). |

---

## 3. Formatul raportului — CEO SYSTEM HEALTH REPORT

Raportul se generează **la fiecare rulare**, indiferent de rezultat, ca obiect structurat în `audit/` + `jarvis_state` (cheie `ceo_system_health`). Structura canonică:

| Câmp | Conținut |
|------|----------|
| `verdict` | `GREEN` (totul funcțional), `YELLOW` (degradări care nu alterează concluziile CEO), `RED` (cel puțin un subsistem critic căzut sau concluziile CEO de azi sunt nesigure). |
| `system_health_score` | 0–100, ponderat pe criticitatea subsistemelor (Digest + Observation + surse financiare cântăresc mai mult decât un conector secundar). Distinct de Company Data Health Score. |
| `checks[]` | Cele 12 secțiuni, fiecare cu `status`, `detail`, `since` (de când persistă starea) și `changed` (diferit față de ieri: da/nu). |
| `delta` | **Ce s-a schimbat față de auditul precedent** — singura parte pe care un om ar trebui să o citească zilnic. Stările stabile (bune sau rele) se comprimă într-o linie. |
| `conflicts[]` | Contradicțiile de date active, cu cele două valori, sursele și owner-ul care poate tranșa. |
| `data_gaps` | Rezumat: gap-uri noi / închise / persistente (detaliul rămâne în Data Gap Engine). |
| `proposals[]` | Reparații propuse — referințe către System Improvement Proposals generate (NETRIMISE fără ApprovalGate). |
| `notify` | `true/false` + motivul exact pentru care s-a decis notificarea (sau tăcerea). Decizia e deterministă și re-verificabilă. |

Regulă de stil (moștenită din digest): raportul pentru om e **text dens, fără ID-uri tehnice în corp** — ID-urile trăiesc în obiectul de audit.

---

## 4. Regula de notificare — DOAR dacă e relevant

Implicit, auditul **nu notifică pe nimeni**. Raportul se scrie în audit și atât. Notificarea către Adrian se declanșează exclusiv la condițiile de mai jos:

| Condiție | Exemplu | Canal |
|----------|---------|-------|
| **Digestul zilnic a eșuat** (negenerat sau nelivrat la 07:40) | Job căzut, Telegram indisponibil | Notificare directă — absența digestului nu are voie să treacă neobservată. |
| **Degradare de stare la o sursă critică** | BANK sau CASH trece din `CONNECTED` în `NOT_CONNECTED`/`STALE` | Punct în digestul de a doua zi + notificare dacă alterează decizii în curs. |
| **Pipeline oprit peste prag** | Observation Engine fără nicio rulare > 3h; niciun episod procesat 24h | Notificare — sistemul e orb și trebuie spus. |
| **Erori repetate pe același subsistem** | Al 3-lea eșec consecutiv al aceluiași conector | Notificare o singură dată per incident (dedup pe `incident_key`), nu la fiecare recidivă. |
| **Contradicție de date cu impact financiar** | Sold bancar diferit între două surse peste pragul de materialitate din `companyConfig` | Punct în secțiunea 5 a digestului + `CONFLICT` marcat pe orice analiză de cash. |
| **Gap critic nou** | Un domeniu necesar unei decizii active devine indisponibil | Prin Data Gap Engine → digest (nu mesaj separat). |

Tot ce nu se încadrează mai sus — inclusiv `YELLOW` stabil, degradări cunoscute, statistici de motor — **rămâne doar în audit**. Anti-spamul din [NOTIFICATION_POLICY.md](../23-founder-attention/NOTIFICATION_POLICY.md) (cooldown, dedup, quiet hours) se aplică integral și notificărilor de sistem: sănătatea sistemului nu are un canal privilegiat care să ocolească gate-ul.

Regulă de igienă: **o problemă = o notificare pe durata incidentului** + o mențiune la rezolvare („s-a închis"). Fără remindere zilnice pentru aceeași stare cunoscută.

---

## 5. Integrarea cu Digestul și cu ciclul Observation

Regula „zero zgomot de audit" din [DAILY_DIGEST_POLICY.md](../23-founder-attention/DAILY_DIGEST_POLICY.md) rămâne suverană: **digestul e despre firmă, nu despre JARVIS**. Sănătatea sistemului intră în digest numai când schimbă încrederea în conținutul lui:

| Situație | Efect în digest |
|----------|-----------------|
| Sistem `GREEN`/`YELLOW` fără impact pe date | Nimic. Digestul nu menționează auditul. |
| Sursă critică `STALE`/căzută care alimentează un punct din digest | Punctul poartă marcaj explicit: *„(date de acum N zile — sursa X indisponibilă)"*. Niciodată prezentat ca proaspăt. |
| Gap-uri și contradicții | Alimentează **secțiunea 5 — CE DATE LIPSESC**, agregat prin Data Gap Engine (nu ca puncte separate de „sistem"). |
| `RED` care compromite digestul întreg | Digestul se deschide cu o singură linie de avertisment de fiabilitate — apoi conținutul disponibil, marcat corespunzător. |

**Ordinea dimineții (Europe/Bucharest):** ciclul Observation de la 07:00–07:30 → **Self-Audit** → generarea digestului → livrare 07:40. Auditul rulează exact între observație și digest ca digestul să știe pe ce se poate baza. Suplimentar, un heartbeat ușor (doar categoriile 3–4: conectori + Observation Engine) rulează în cursul zilei, pentru ca o cădere de pipeline să fie detectată în ore, nu a doua zi dimineața — cu notificare doar la condițiile din §4.

Constatările persistente ale auditului intră în ciclul de învățare din [CLOSED_LOOP.md](CLOSED_LOOP.md): incident → propunere → aprobare Adrian → reparație delegată → **verificare că starea chiar a redevenit `OK`** → lecție stocată în `jarvis_state` + audit.

---

## 6. Guvernanță și flag-uri

| Flag | Implicit | Efect |
|------|----------|-------|
| `CEO_SELF_AUDIT_ENABLED` | `true` | Auditul intern (scriere în audit + `jarvis_state`) — sigur by design, read-only asupra firmei. |
| `CEO_SELF_AUDIT_NOTIFY` | `false` | Notificările de sistem către Adrian. Se activează doar prin decizia lui Adrian, după validarea în shadow a regulilor din §4. |

Limite absolute: auditul **nu** repornește servicii, **nu** modifică config, **nu** își modifică propriul cod, **nu** trimite Information Requests către oameni — toate acestea sunt propuneri prin ApprovalGate, singura poartă pentru efecte.

---

## 7. Criterii de reușită

- Fiecare zi are exact un CEO SYSTEM HEALTH REPORT în audit; zilele fără raport sunt detectate și declarate la rularea următoare.
- Peste o lună de funcționare: majoritatea zilelor `GREEN` cu `notify=false` — dovada că regula tăcerii funcționează.
- Orice cădere de pipeline e detectată în < 3h, nu descoperită de Adrian („de ce n-a venit digestul?" nu trebuie să se întâmple niciodată — sistemul o spune primul).
- Zero notificări duplicate pentru același incident; fiecare incident închis are lecția stocată.
- Numărul contradicțiilor de date active scade în timp — semn că sursele conflictuale se tranșează, nu se acumulează.
