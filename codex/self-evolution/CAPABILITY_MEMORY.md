# CAPABILITY MEMORY — Învățare din Eșec și Memoria Capabilităților (§30, §31)

> Sursa de adevăr: `DEFAULT_BUILD_LIMITS.max_retries_per_capability` + `STATE_KEYS.memory`
> (`ceo:evolution:memory`) din `src/ceo/evolution/contract.js`. Componenta: `memory`.

## 1. §30 — Failure Learning: eșecul se învață, nu se repetă

Fiecare build eșuat (`FAILED`) sau blocat (`BLOCKED`) lasă o intrare de memorie:

| Câmp reținut | De ce |
|---|---|
| `capability_request_id` + branch | Trasabilitate |
| Cauza eșecului (poartă picată, limită depășită, verdict Guardian, eroare provider) | Următorul retry pornește informat, nu de la zero |
| Ce s-a încercat deja | Providerul primește istoricul — nu repetă aceeași abordare |
| Numărul de încercări | Contorul limitei de retry |

**Regula max retry:** `max_retries_per_capability = 2`. După a doua reluare eșuată,
CR-ul intră în starea de fapt **HUMAN_REVIEW_REQUIRED**: nu se mai programează niciun
retry automat, iar cazul apare la fondator cu istoricul complet al încercărilor.
Motivația: un eșec repetat înseamnă aproape întotdeauna specificație greșită, gap
clasificat greșit sau problemă de proces (§19) — lucruri pe care mai mult compute nu
le rezolvă, dar un om da.

Respingerile fondatorului (`REJECTED` cu motiv) intră în aceeași memorie: un CR viitor
similar cu unul respins se prezintă cu referință explicită la respingere și la motivul ei —
sistemul nu „reîncearcă norocul".

## 2. §31 — Memoria capabilităților: ce am construit și ce s-a ales de ele

Fiecare capabilitate deployată rămâne sub observație pe toată durata vieții:

| Dimensiune urmărită | Întrebarea |
|---|---|
| Utilizare | Se folosește? De cine, cât de des? |
| Rezultat (`OUTCOME_VALIDATION`) | A rezolvat nevoia originară (`origin_need_id`)? |
| Cost de operare | Cât costă să existe (rulări, mentenanță, erori)? |
| Incidente | A produs erori, rollback-uri, date greșite? |

Pe baza lor, `memory` emite periodic un verdict **PROPUS** per capabilitate:

| Verdict | Sens | Cine decide |
|---|---|---|
| `KEEP` | Utilă, sănătoasă — rămâne | Propus de sistem, vizibil fondatorului |
| `IMPROVE` | Utilă dar deficitară → poate genera un CR nou de îmbunătățire (ciclu complet, cu aprobare) | CR-ul rezultat trece prin tot lanțul normal |
| `DEPRECATE` | Nefolosită / cost > beneficiu → propunere de retragere | **Doar fondatorul.** Nimic nu se șterge automat |

**Regula de neștergere:** sistemul nu dezinstalează, nu dezactivează și nu șterge
niciodată singur o capabilitate din producție. `DEPRECATE` este o recomandare pe cardul
fondatorului — retragerea efectivă e act uman, cu propriul plan de rollback.

## 3. Persistență și audit

- Totul trăiește în `jarvis_state` sub cheia `ceo:evolution:memory` — aditiv, fără
  schemă DB nouă.
- Memoria este **citită** de `gapEngine` (dedup §29 + evitarea gap-urilor deja respinse),
  de `roi` (istoricul de cost real corectează estimările viitoare) și de Approval Inbox
  (context pe card).
- Memoria nu se rescrie retroactiv: intrările sunt append-only; corecțiile sunt intrări noi
  care le referă pe cele vechi.
