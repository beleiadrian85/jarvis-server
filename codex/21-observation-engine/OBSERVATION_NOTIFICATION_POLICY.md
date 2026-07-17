# OBSERVATION_NOTIFICATION_POLICY — Politica de notificare și anti-spam a Observation Engine

> **PROIECTAT — implementat GATED, flag implicit OFF, prima rulare exclusiv in Shadow Mode.**
> Notificarile sunt guvernate de `OBSERVATION_NOTIFICATIONS_ENABLED=false` (implicit). Cat timp `OBSERVATION_ENGINE_SHADOW_MODE=true`, motorul scrie DOAR in audit si `jarvis_state` — zero notificari, indiferent de severitate. Acest document defineste regulile care raman valabile si dupa activare.

---

## 1. Principiul fundamental

Observation Engine exista ca sa aduca **valoare reala**, nu zgomot. O notificare care nu schimba nimic in ce stie sau ce poate decide Adrian este spam — chiar daca observatia din spatele ei e tehnic corecta.

**Regula de aur: motorul NU trimite observatii doar ca sa demonstreze ca ruleaza.**

- O rulare fara observatii semnificative este un rezultat perfect valid si de dorit. Se consemneaza in audit („rulare completa, nimic semnificativ") si atat.
- Nu exista notificari de tip „heartbeat", „totul e ok", „am analizat X surse" catre Adrian. Sanatatea motorului se verifica in audit si in `jarvis_state`, nu in inbox-ul fondatorului.
- Lipsa datelor nu se transforma in alarma falsa: absenta datelor bancare, de trafic sau de vanzari se declara explicit ca `data_quality: partial/poor` si `unknowns[]`, nu se raporteaza ca „zero" sau ca problema inventata.

---

## 2. Lantul anti-spam (ordinea aplicarii)

Fiecare observatie candidata trece prin urmatorul lant determinist, in aceasta ordine. Orice pas poate elimina sau retine observatia:

| Pas | Mecanism | Modul | Efect |
|---|---|---|---|
| 1 | Validare schema | `observationValidator` | Observatiile invalide nu exista — nu se scoreaza, nu se persista |
| 2 | Scoring determinist | `observationScoring` | Severitate calculata din puncte, nu din LLM |
| 3 | Filtrare semnale slabe | `observationDeduplicator` | Scor < 15 → eliminat, cu exceptia persistentei (vezi §2.3) |
| 4 | Deduplicare pe cheie stabila | `observationDeduplicator` | `categorie:tip:entitate` — aceeasi problema = aceeasi identitate |
| 5 | Cooldown pe severitate | `observationDeduplicator` | „repeated" ne-agravat e suprimat in fereastra de cooldown |
| 6 | Grupare similare | `observationDeduplicator` | Observatiile inrudite se consolideaza intr-una singura |
| 7 | Plafon per rulare | `observationDeduplicator` | Maxim 10 observatii/rulare, cele cu scorul cel mai mare |
| 8 | Marcare escaladare | `observationEscalation` | Doar marcheaza `requires_board_review`; NU convoaca Boardul |
| 9 | Decizie `safe_to_notify` | politica de fata | Vezi §3 — in shadow, intotdeauna `false` |

### 2.1 Deduplicare — cheia stabila

- Cheia: **`categorie:tip:entitate`** (ex. `cash:obligatie_fara_acoperire:furnizor_X`, `ops_risk:job_neexecutat:morning_report`).
- Aceeasi problema detectata in rulari succesive primeste aceeasi cheie — nu genereaza observatii noi, ci actualizeaza starea celei existente.
- Starea de deduplicare se persista in `jarvis_state` (fara tabele noi in DB).
- Schimbarea entitatii sau a tipului = observatie distincta. Reformularea aceleiasi probleme NU produce cheie noua.

### 2.2 Cooldown pe severitate

Cat timp o observatie este `repeated` (aceeasi problema, fara agravare), ea NU se re-emite inainte de expirarea cooldown-ului:

| Severitate | Cooldown „repeated" |
|---|---|
| `critical` | 2 ore |
| `high` | 6 ore |
| `medium` / `low` / `info` | 24 ore |

Reguli de iesire din cooldown:

- **`worsening`** (scorul creste, deviatia se adanceste, termenul se apropie) — iese IMEDIAT din cooldown si se re-emite cu statusul agravat.
- **`improving`** — iese din cooldown pentru a semnala redresarea (o singura data per tranzitie de stare).
- **`resolved`** — se emite **exact o data**, apoi cheia se inchide. Reaparitia ulterioara a aceleiasi probleme deschide un ciclu nou (`new`), cu istoricul pastrat in `jarvis_state`.
- `repeated` ne-agravat in interiorul cooldown-ului: se actualizeaza doar contorul intern si audit-ul; nimic vizibil in exterior.

### 2.3 Filtrarea semnalelor slabe

- Observatiile cu **scor < 15** (sub pragul `low`) se elimina din rezultat.
- Exceptie — **persistenta**: un semnal slab care reapare in **≥ 3 rulari consecutive** este promovat si retinut (persistenta e ea insasi informatie; scoring-ul ii adauga punctele de persistenta).
- Semnalele slabe eliminate raman vizibile doar in audit, pentru trasabilitate.

### 2.4 Gruparea observatiilor similare

- Observatiile care descriu fatete ale aceleiasi probleme (ex. 4 obligatii de plata neacoperite in aceeasi saptamana) se **grupeaza intr-o singura observatie** cu evidenta agregata, nu 4 alerte separate.
- Gruparea pastreaza in `evidence[]` toate elementele componente, fiecare cu prefixul sursei (`[cashForecast]`, `[operational]` etc.).
- Scorul grupului se calculeaza pe impactul agregat — gruparea nu dilueaza severitatea, o consolideaza.

### 2.5 Plafonul per rulare

- **Maxim 10 observatii per rulare**, selectate strict dupa scor descrescator.
- Ce nu incape in plafon nu dispare: ramane persistat in `jarvis_state` si concureaza din nou la rularea urmatoare (unde, daca persista, castiga puncte).
- Plafonul se aplica DUPA grupare — 10 observatii consolidate, nu 10 randuri brute.

---

## 3. `safe_to_notify` — definitie si conditii

`safe_to_notify` este un camp boolean pe fiecare observatie, calculat determinist. El raspunde la o singura intrebare: **„are voie aceasta observatie sa paraseasca stratul intern (audit/jarvis_state) catre un canal de notificare?"**

`safe_to_notify = true` DOAR daca **TOATE** conditiile de mai jos sunt indeplinite simultan:

| # | Conditie | Detaliu |
|---|---|---|
| 1 | `OBSERVATION_NOTIFICATIONS_ENABLED = true` | Flag implicit `false`; pornirea e o decizie explicita a lui Adrian |
| 2 | `OBSERVATION_ENGINE_SHADOW_MODE = false` | In shadow, `safe_to_notify` este **intotdeauna `false`**, fara exceptii, indiferent de severitate — inclusiv `critical` |
| 3 | Severitate suficienta | Observatia a trecut de pragul de notificare (implicit: `medium` si peste; `info`/`low` nu notifica niciodata, doar apar in rapoartele periodice) |
| 4 | A trecut de intregul lant anti-spam (§2) | Nu e in cooldown, nu e semnal slab eliminat, e in plafonul de 10 |
| 5 | Continut complet (§5) | Are dovezi, impact si motivul prioritizarii — o alerta fara acestea nu se trimite |

Reguli suplimentare:

- `safe_to_notify` este **calculat de motor, nu de LLM**. `observationSummary` (sinteza LLM) nu poate seta, ridica sau ocoli acest camp.
- `safe_to_notify=true` inseamna „permis", nu „trimis". Trimiterea efectiva e responsabilitatea stratului de notificare, care respecta la randul lui approvalGate si restul guvernantei CODEX.
- Escaladarea (`requires_board_review=true`) este **independenta** de `safe_to_notify`: o observatie poate fi marcata pentru Board in shadow fara sa notifice pe nimeni. Marcarea traieste in audit si `jarvis_state`.

---

## 4. Ce va putea notifica in viitor (gated)

Cand `OBSERVATION_NOTIFICATIONS_ENABLED=true` **si** shadow-ul e oprit, fluxul de notificare va functiona astfel:

- **Canal**: exclusiv **notifier-ul existent al JARVIS** (acelasi strat folosit de rapoarte si alerte). **Nu se modifica acum** si nu se construieste un canal nou pentru Observation Engine — motorul doar ii va livra observatii cu `safe_to_notify=true`.
- **Ce se notifica**: observatii `medium+` care au trecut lantul anti-spam; observatiile `critical` si cele `worsening` au prioritate la livrare.
- **Ce NU se notifica niciodata**, indiferent de flaguri: heartbeat-uri, confirmari de rulare, observatii `info`/`low` izolate, semnale slabe, duplicate in cooldown, observatii cu date insuficiente prezentate ca certitudini.
- **Escaladarea catre Executive Board** ramane un gate separat (`OBSERVATION_BOARD_ESCALATION_ENABLED`, implicit `false`) si o etapa ulterioara: Observation Engine → Observation Validator → Executive Board → CEO Recommendation → Adrian. In etapa curenta, escaladarea inseamna doar **marcare** in observatie si motiv scris in audit.
- Notificarile raman **pur informative**: motorul nu ia decizii, nu executa actiuni, nu trimite emailuri, nu creeaza task-uri, nu modifica Operational/Gmail/Calendar. `approvalGate` ramane singura poarta pentru orice efect. Platile sunt excluse total.

---

## 5. Continutul obligatoriu al oricarei alerte

Nicio notificare nu pleaca fara toate cele trei componente. O alerta care spune doar „e o problema la X" este interzisa prin schema.

| Componenta | Camp(uri) in observatie | Cerinta |
|---|---|---|
| **Dovezi** | `evidence[]`, `sources[]`, `metrics{}`, `baseline{}`, `deviation{}` | Fiecare intrare din `evidence[]` e prefixata cu sursa: `[cashForecast]`, `[riskEngine]`, `[operational]`, `[predictionEngine]`, `[audit]`, `[jarvis_state]`, `[decizii]`. Fara dovada verificabila, observatia nu exista |
| **Impact** | `business_impact[]`, `severity`, `confidence`, `data_quality` | Ce inseamna concret pentru companie (bani, termene, oameni, sisteme), cu calitatea datelor declarata onest — nu se ascund golurile |
| **Motivul prioritizarii** | `urgency_reason`, scorul determinist, `status` | De ce ACUM si de ce inaintea altora: factorii de scoring (impact financiar, urgenta, ireversibilitate, persistenta etc.) si statusul (`new`/`worsening` etc.) |

Suplimentar, cand exista: `possible_causes[]` (ipoteze, nu verdicte), `unknowns[]` (ce nu stim) si `recommended_next_analysis[]` (ce ar merita verificat) insotesc alerta, ca Adrian sa primeasca o observatie completa, nu o alarma goala.

---

## 6. Sinteza

| Intrebare | Raspuns |
|---|---|
| Notifica ceva acum? | **Nu.** Shadow Mode + flag OFF → `safe_to_notify=false` intotdeauna |
| Cand va notifica? | Doar cu `OBSERVATION_NOTIFICATIONS_ENABLED=true`, shadow oprit, severitate `medium+`, lant anti-spam trecut |
| Pe ce canal? | Notifier-ul existent JARVIS, nemodificat in aceasta etapa |
| Cat de des poate reveni aceeasi alerta? | `critical` 2h / `high` 6h / rest 24h — doar daca ramane `repeated`; agravarea sparge cooldown-ul |
| Cate alerte maxim? | 10 per rulare, cele mai mari scoruri, dupa grupare |
| Alerta fara dovezi/impact/motiv? | Invalida prin schema — nu se emite |
| Rulare fara probleme gasite? | Audit „nimic semnificativ" si tacere. Tacerea este un rezultat corect |
