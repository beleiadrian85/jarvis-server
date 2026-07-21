# EXECUTIVE EPISODES — Gruparea observațiilor în inițiative executive (Faza 4.2)

> **STARE: PROIECTAT — implementat GATED, flag implicit OFF, validare exclusiv în Shadow Mode.**
> `PROACTIVE_CEO_PIPELINE_ENABLED=false` · `PROACTIVE_CEO_SHADOW_MODE=true` · `PROACTIVE_CEO_NOTIFICATIONS_ENABLED=false` · `PROACTIVE_CEO_BOARD_EXECUTION_ENABLED=false`

Acest document definește **Executive Episodes** — a doua treaptă a Proactive CEO Pipeline: transformarea observațiilor individuale (produse de [Observation Engine](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) și filtrate de [Signal Triage](SIGNAL_TRIAGE.md)) în **episoade executive** coerente, care alimentează [Board Escalation Preview](BOARD_PREVIEW.md) și [CEO Brief](CEO_BRIEF.md). Implementare: `src/proactiveCeo/executiveEpisodes.js` — modul **PUR**, determinist, fără IO și fără LLM.

---

## 1. De ce episoade, nu observații individuale

Observation Engine produce observații **atomice**: fiecare detector vede o singură felie a realității. Adrian nu conduce compania pe felii — el are nevoie de **problema de business**, nu de patru alerte separate care descriu, fără să știe una de alta, aceeași criză.

**Exemplul canonic.** Într-o singură rulare pot apărea simultan:

| Observație atomică | Categorie / tip | Ce vede singură |
|---|---|---|
| Obligații mari de plată în următoarele 21 de zile | `cash` / `cash_gap_21d` | „Presiune de cash" |
| Rezervări fără avans încasat | `sales` / `rezervari_fara_avans` | „Încasări nesigure" |
| Task-uri întârziate / fără responsabil pe execuție | `projects` / `task_no_owner`, `task_no_deadline` | „Execuție în risc" |
| Lipsa soldului bancar actual | `data_quality` degradat + `unknowns` | „Nu știm cât cash există" |

Trimise separat, acestea sunt **patru notificări** — spam executiv care ascunde tocmai legătura dintre ele. Grupate, ele sunt **UN singur episod**: **„Presiune de lichiditate și execuție Bell Residence"** — o problemă, un context, un singur CEO Brief, o singură decizie potențială.

Regula de guvernanță:

- **Observațiile corelate NU se trimit niciodată separat.** Ele devin membre ale unui episod, iar episodul este unitatea de escaladare către Board Preview și CEO Brief.
- Observațiile **necorelate** (care nu se potrivesc niciunui set de corelare) devin **episoade singleton** — un episod cu un singur membru. Nimic nu se pierde, dar nimic nu se duplică.
- Episodul este și **unitatea anti-spam**: cooldown-ul, statusul și istoricul se țin la nivel de episod, nu de observație (vezi §6).

---

## 2. Ce intră în grupare

Nu orice observație devine membru de episod. Gruparea primește **doar** observațiile pe care [Signal Triage](SIGNAL_TRIAGE.md) le-a clasificat:

| Decizie triage | Intră în episoade? |
|---|---|
| `ignore` | Nu — zgomot, dispare |
| `audit_only` | Nu — rămâne doar în audit |
| `group` | **Da** — candidat la corelare |
| `board_candidate` | **Da** — și setează `requires_board_review` pe episod |
| `founder_attention` | **Da** — și setează `requires_founder_attention` pe episod |

---

## 3. Structura canonică a episodului

```json
{
  "episode_id": "ep:lichiditate_executie",
  "title": "Presiune de lichiditate și execuție Bell Residence",
  "category": "lichiditate_executie",
  "observations": ["cash:cash_gap_21d:-", "sales:rezervari_fara_avans:-", "projects:task_no_owner:-"],
  "combined_severity": "high",
  "combined_confidence": 72,
  "business_impact": ["..."],
  "unknowns": ["..."],
  "requires_board_review": true,
  "requires_founder_attention": false,
  "status": "open"
}
```

Semantica fiecărui câmp:

| Câmp | Tip | Semantică |
|---|---|---|
| `episode_id` | string | Identitate **stabilă** între rulări: `ep:<cheia setului de corelare>` pentru episoadele grupate (ex. `ep:lichiditate_executie`), respectiv `ep:<cheia dedup a observației>` pentru episoadele singleton. Stabilitatea id-ului este ceea ce face posibilă reconcilierea (§6) și cooldown-ul. |
| `title` | string | Titlul executiv al episodului — numele problemei de business, nu al detectorului. Pentru seturi: titlul canonic al setului (§4). Pentru singleton: titlul observației. |
| `category` | string | Cheia setului de corelare (`lichiditate_executie`, `oameni`, `decizii`, `ops`, `piata`) sau categoria observației pentru singleton. |
| `observations` | string[] | **Cheile dedup** ale observațiilor membre (`<category>:<type>:<entity>` — aceleași chei folosite de Observation Engine pentru deduplicare). Setul de membri este semnătura informațională a episodului: schimbarea lui înseamnă „informație nouă relevantă". |
| `combined_severity` | enum | `low` \| `medium` \| `high` \| `critical` — **maximul** severităților membrilor (§5). |
| `combined_confidence` | number 0–100 | Media **ponderată** a confidence-urilor membrilor, redusă de calitatea slabă a datelor (§5). |
| `business_impact` | string[] | Reuniunea (dedup) a impacturilor de business ale membrilor — ce este în joc, în bani și în consecințe. |
| `unknowns` | string[] | Reuniunea (dedup) a necunoscutelor membrilor — ce date lipsesc ca episodul să fie evaluat cu certitudine. Alimentează direct secțiunea „CE DATE LIPSESC" din [CEO Brief](CEO_BRIEF.md). |
| `requires_board_review` | boolean | `true` dacă **cel puțin un** membru a fost triat `board_candidate`. Declanșează [Board Escalation Preview](BOARD_PREVIEW.md) — doar preview, Boardul NU se convoacă (`PROACTIVE_CEO_BOARD_EXECUTION_ENABLED=false`). |
| `requires_founder_attention` | boolean | `true` dacă cel puțin un membru a fost triat `founder_attention`. Marchează episodul pentru CEO Brief către Adrian (în Shadow Mode: doar audit). |
| `status` | enum | `open` \| `worsening` \| `stable` \| `improving` \| `resolved` — poziția în ciclul de viață (§6), rezultatul reconcilierii cu starea anterioară din `jarvis_state`. |

---

## 4. Seturile de corelare

Cinci seturi canonice. O observație aparține **cel mult unui set**; seturile se evaluează în ordinea de mai jos (de aceea `rezervari_fara_avans` intră la lichiditate, iar la „piață" ajunge doar **restul** categoriei `sales`).

| # | Cheie set | Membri (categorii / tipuri) | Titlul episodului |
|---|---|---|---|
| 1 | `lichiditate_executie` | `cash` (toate: `cash_gap_21d`, `payment_concentration`, `restante`) + `sales`/`rezervari_fara_avans` + task-uri în risc din `projects` (`task_no_owner`, `task_no_deadline`) | **Presiune de lichiditate și execuție Bell Residence** |
| 2 | `oameni` | `people` (ex. `repeated_discipline`) + `founder` (`founder_dependency`) | **Capacitate și responsabilitate în echipă** |
| 3 | `decizii` | `decisions` (`decision_overdue`, `decision_contradiction`, `analysis_no_decision`) | **Coerența deciziilor** |
| 4 | `ops` | `ops_risk` (`job_stale`, `repeated_errors`, `sources_unavailable`) | **Sănătatea sistemelor** |
| 5 | `piata` | `traffic` (`traffic_drop`) + **restul** observațiilor `sales` (cele nerevendicate de setul 1) | **Piața și vânzări** |

Reguli:

- Un set produce un episod **doar dacă are cel puțin un membru** în rularea curentă; seturile goale nu generează episoade.
- Un set cu un singur membru produce totuși episodul setului (cu `episode_id`-ul setului) — identitatea stabilă contează mai mult decât numărul de membri din acel moment.
- Observațiile care nu se potrivesc niciunui set devin episoade **singleton** cu `episode_id = ep:<cheia dedup a observației>`.
- Lista tipurilor per categorie este cea din [OBSERVATION_TYPES](../21-observation-engine/OBSERVATION_TYPES.md); seturile referă categorii/tipuri, deci detectori noi intră natural în seturile existente fără modificarea grupării.

---

## 5. Regulile de combinare

Combinarea este **deterministă**: aceiași membri → același episod, aceleași valori.

| Câmp combinat | Regulă |
|---|---|
| `combined_severity` | **Maximul** severităților membrilor (`critical` > `high` > `medium` > `low`). Un singur membru critical face episodul critical — riscul nu se diluează prin mediere. |
| `combined_confidence` | **Media ponderată** a confidence-urilor membrilor, cu ponderi date de rangul de severitate al fiecărui membru (`low`=1, `medium`=2, `high`=3, `critical`=4): membrii mai severi trag media. Confidence-ul fiecărui membru intră în medie **deja redus** conform regulii din [Signal Triage](SIGNAL_TRIAGE.md): `data_quality = poor` → confidence ×0.7. Rezultatul se rotunjește și se limitează la 0–100. |
| `business_impact` | Reuniunea impacturilor membrilor, deduplicată, cu păstrarea ordinii (membrii mai severi primii). |
| `unknowns` | Reuniunea necunoscutelor membrilor, deduplicată. Datele lipsă **nu se interpretează ca zero** — ele coboară confidence-ul și apar explicit aici (aceeași regulă absolută ca în Observation Engine). |
| `requires_board_review` | OR logic peste membri (orice `board_candidate` → `true`). |
| `requires_founder_attention` | OR logic peste membri (orice `founder_attention` → `true`). |

Consecință de guvernanță: un episod cu severitate mare dar confidence coborât de date slabe **nu escaladează agresiv** — el escaladează cererea de date („CE DATE LIPSESC"), exact comportamentul dorit pentru cazul „lipsă sold bancar".

---

## 6. Ciclul de viață și reconcilierea cu starea anterioară

### 6.1 Statusuri și tranziții

```
                    ┌────────────► worsening ─┐
  (nou) ──► open ───┤              ▲    │     │
                    ├──► stable ───┤    ▼     ├──► resolved ──► (arhivat)
                    │              ▼    ▲     │
                    └────────────► improving ─┘
```

| Tranziție | Regulă de declanșare |
|---|---|
| *(inexistent)* → `open` | Episodul apare prima dată (nu există în starea anterioară) sau **reapare** după ce fusese `resolved` — un ciclu de viață nou pe același `episode_id`. |
| → `worsening` | Față de starea anterioară: `combined_severity` a crescut, **sau** au apărut membri noi cu severitate ≥ `high`, **sau** un membru existent este el însuși marcat ca deteriorat de Observation Engine. |
| → `improving` | `combined_severity` a scăzut **sau** setul de membri s-a redus (observații membre dispărute) fără ca episodul să fie complet gol. |
| → `stable` | Episodul există în ambele stări, cu aceeași severitate combinată și același set de membri — nimic nou de spus. |
| → `resolved` | **Niciun membru** al episodului nu mai este prezent în rularea curentă. Se emite **o singură dată** (este unul dintre declanșatoarele legitime de CEO Brief), apoi episodul se arhivează în stare. |

### 6.2 Reconcilierea cu `jarvis_state`

Starea episoadelor trăiește în `jarvis_state` sub cheia **`proactive:episodes`** — fără schemă DB nouă, aceeași disciplină de persistență ca restul motorului. Per episod se rețin: `episode_id`, `status`, `combined_severity`, setul de membri, momentul ultimului CEO Brief și `cooldown_until`.

Pașii reconcilierii (în `pipelineRunner.js`, singurul loc cu IO):

1. **Citește** starea anterioară `proactive:episodes`.
2. **Construiește** episoadele rulării curente (funcțiile pure din `executiveEpisodes.js`).
3. **Reconciliază** pe `episode_id`: aplică regulile de tranziție din §6.1 → fiecare episod primește `status`.
4. **Decide eligibilitatea** pentru Board Preview + CEO Brief (regulile anti-spam de mai jos).
5. **Scrie** starea nouă + audit (`ceo_pipeline`, `ceo_board_preview`, `ceo_brief`). În Shadow Mode acesta este **întregul** efect — zero notificări.

### 6.3 Anti-spam la nivel de episod

Un **nou** CEO Brief pentru același `episode_id` se emite **doar** dacă:

- severitatea combinată **crește**;
- apare **informație nouă relevantă** — setul de membri se schimbă;
- statusul devine `worsening`;
- un termen relevant **se apropie semnificativ**;
- episodul devine `resolved` (o singură dată, ca închidere);
- apare o **contradicție semnificativă** față de ce s-a comunicat anterior.

În orice alt caz: **cooldown** (implicit **24h**, per episod) și doar înregistrare în audit. Episodul `stable` în cooldown este exact cazul „nimic nou" — pipeline-ul tace, conform aceleiași filosofii din [OBSERVATION_NOTIFICATION_POLICY](../21-observation-engine/OBSERVATION_NOTIFICATION_POLICY.md): tăcerea este comportamentul implicit, vorbitul se câștigă.

---

## 7. Ce urmează în lanț

Episoadele eligibile (și doar ele) merg mai departe:

- `requires_board_review = true` → [Board Escalation Preview](BOARD_PREVIEW.md): ce directori **AR fi** convocați (reutilizând `selectDirectors`/`ROLES` din [Executive Board](../04-executive-board/BOARD_ROLES.md), cu Guardian adăugat forțat la `critical`), fără convocare reală.
- `requires_founder_attention = true` sau episod eligibil de brief → [CEO Brief](CEO_BRIEF.md): cele 5 secțiuni fixe, determinist, fără LLM, maxim ~900 de caractere.

Adrian decide. Nimic nu se execută automat. Nicio notificare până la validarea în Shadow Mode.
