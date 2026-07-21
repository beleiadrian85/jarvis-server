# NOTIFICATION POLICY — Founder Attention Gate

> **PROIECTAT — implementat GATED, flag implicit OFF, validare exclusiv in Shadow Mode; NICIO notificare reala in aceasta faza.**
> `FOUNDER_ATTENTION_GATE_ENABLED=false` · `FOUNDER_ATTENTION_SHADOW_MODE=true` · `FOUNDER_NOTIFICATIONS_ENABLED=false`

Acest document defineste politica de notificare a stratului **Founder Attention Gate** (Faza 4.4): structura canonica a candidatului de notificare, regulile anti-spam, canalele sugerate si conditiile viitoare pentru trimiterea reala. Politica este implementata in module **PURE** (`src/founderAttention/notificationCandidate.js`, `src/founderAttention/notificationPolicy.js`) si orchestrata GATED din `founderGateRunner.js`, apelat din pipeline-ul Proactive CEO.

Lantul complet: **Observation → Triage → Episode → Board Preview → CEO Brief → Founder Attention Gate → Notification Candidate**.

Documente conexe:
- [21-observation-engine](../21-observation-engine/) — sursa semnalelor (rulare la 30 min)
- [22-proactive-ceo](../22-proactive-ceo/) — triaj, episoade executive, Board Preview, CEO Brief
- [ATTENTION_GATE.md](./ATTENTION_GATE.md) — nivelurile de atentie si criteriile deterministe ale gate-ului

---

## 1. Structura canonica a candidatului de notificare

Candidatul de notificare este UNICUL artefact produs de gate atunci cand un episod merita atentia fondatorului. In aceasta faza el se scrie **exclusiv in audit + `jarvis_state`** — nu se trimite nicaieri.

```json
{
  "notification_candidate_id": "nc:<episode_id>:<attention_level>",
  "episode_id": "…",
  "attention_level": "IGNORE | AUDIT_ONLY | DAILY_DIGEST | INTERRUPTIVE_ALERT | FOUNDER_DECISION_REQUIRED | DATA_REQUIRED_BEFORE_DECISION",
  "title": "…",
  "why_now": "…",
  "what_changed": "…",
  "business_impact": ["…"],
  "decision_needed": "… | null",
  "deadline": "ISO-8601 | null",
  "confidence": 0,
  "data_quality": "good | partial | poor",
  "missing_data": ["…"],
  "suggested_channel": "digest | telegram | hud",
  "safe_to_send": false,
  "deduplication_key": "…"
}
```

### Semantica fiecarui camp

| Camp | Tip | Semantica |
|---|---|---|
| `notification_candidate_id` | string | Identificator **stabil si determinist**: `nc:<episode_id>:<attention_level>`. Acelasi episod la acelasi nivel produce mereu acelasi id — baza deduplicarii si a auditului. |
| `episode_id` | string | Episodul executiv sursa (din pipeline-ul Proactive CEO, `22-proactive-ceo`). Trasabilitate completa inapoi pana la observatiile brute. |
| `attention_level` | enum | Nivelul decis de gate (vezi `ATTENTION_GATE.md`). Candidatii se genereaza doar pentru nivelurile care implica atentia fondatorului; `IGNORE` si `AUDIT_ONLY` nu produc candidat de notificare. |
| `title` | string | Titlu scurt, orientat pe business, formulat pentru fondator — nu jargon de sistem. |
| `why_now` | string | De ce ACUM si nu in digestul urmator: termen apropiat, agravare, fereastra de decizie, risc iminent. |
| `what_changed` | string | Ce s-a schimbat fata de ultima stare cunoscuta a episodului. Un candidat fara schimbare reala nu are voie sa existe (vezi anti-spam). |
| `business_impact` | string[] | Impactul concret pe business: cash, termen, juridic, reputational, vanzari, productie. Lista scurta, fiecare element o afirmatie verificabila. |
| `decision_needed` | string \| null | Decizia ceruta fondatorului, formulata explicit, cu optiunile pe scurt. Obligatoriu ne-null pentru `FOUNDER_DECISION_REQUIRED`; null in rest. |
| `deadline` | ISO-8601 \| null | Termenul real al deciziei/actiunii, daca exista. Alimenteaza criteriul „termen apropiat (≤3 zile)" al alertelor interruptive. |
| `confidence` | number 0–100 | Increderea gate-ului in evaluare, mostenita si agregata din triaj + episod. Sub pragurile din `ATTENTION_GATE.md`, nivelul se retrogradeaza. |
| `data_quality` | enum | `good` / `partial` / `poor`. Cu `poor`, alerta interruptiva este **blocata** (exceptie: risc confirmat determinist pe date complete). |
| `missing_data` | string[] | Datele lipsa care ar schimba evaluarea. Obligatoriu ne-gol pentru `DATA_REQUIRED_BEFORE_DECISION`. |
| `suggested_channel` | enum | Canalul **sugerat** (nu folosit): `digest` / `telegram` / `hud`. Vezi sectiunea 3. |
| `safe_to_send` | boolean | **Intotdeauna `false` in aceasta faza.** Devine conditionat abia dupa activarea `FOUNDER_NOTIFICATIONS_ENABLED` (sectiunea 4). |
| `deduplication_key` | string | Cheie determinista pe (episod, nivel, natura schimbarii). Doua rulari care produc aceeasi cheie NU genereaza al doilea candidat activ. |

---

## 2. Reguli anti-spam

Principiul: **fondatorul nu primeste niciodata acelasi lucru de doua ori si niciodata mai mult decat poate procesa intr-o zi.** Toate regulile sunt deterministe, implementate PUR in `notificationPolicy.js`, si se aplica INAINTE de orice alta logica de canal.

### 2.1 Zero candidat nou — cele 6 conditii

**Nu se genereaza niciun candidat nou** daca ORICARE din conditiile de mai jos este adevarata pentru episodul evaluat:

| # | Conditie | Rationament |
|---|---|---|
| 1 | Episodul este **identic** cu cel deja notificat (aceeasi `deduplication_key`) | Repetitia pura e zgomot. |
| 2 | **Severitatea neschimbata** fata de ultimul candidat al episodului | Fara escaladare, nu exista „why now". |
| 3 | **Fara date noi** de la ultimul candidat | Aceleasi date → aceeasi concluzie → niciun mesaj. |
| 4 | **Fara worsening** (situatia nu s-a agravat) | Stagnarea se raporteaza in digest, nu prin alerta. |
| 5 | **Termenul nu s-a apropiat** semnificativ | Un deadline indepartat nu justifica re-notificare. |
| 6 | **Nicio decizie noua** nu a aparut (si cea veche nu s-a schimbat) | Fara decizie noua, `FOUNDER_DECISION_REQUIRED` nu se re-emite. |

### 2.2 Cooldown-uri

| Cooldown | Durata | Domeniu |
|---|---|---|
| Per **episod** | **24h** | Acelasi episod nu produce un al doilea candidat in fereastra, indiferent de nivel — exceptie doar escaladarea reala de severitate cu date noi (care trece de 2.1). |
| Per tip: **INTERRUPTIVE_ALERT** | **6h** | Intre doua alerte interruptive din orice episoade. |
| Per tip: **FOUNDER_DECISION_REQUIRED** | **12h** | Intre doua cereri de decizie din orice episoade. |

### 2.3 Limite zilnice

| Limita | Valoare implicita | Comportament la depasire |
|---|---|---|
| Maxim alerte / zi (toate nivelurile notificabile) | **5** | Candidatii peste limita se **retrogradeaza in DAILY_DIGEST** (nu se pierd — apar in digest si in audit). |
| Maxim INTERRUPTIVE_ALERT / zi | **2** | Interruptivele peste limita se retrogradeaza in digest; doar un `critical` confirmat determinist poate depasi limita, si doar cu inregistrare explicita in audit. |

### 2.4 Grupare

Daca **o singura rulare** a gate-ului produce **mai multe alerte interruptive**, acestea se **grupeaza intr-UNA singura**: un candidat agregat cu titlu sumar, lista episoadelor incluse in `business_impact` si trimitere la digest pentru detalii. Nivelul candidatului grupat = nivelul maxim dintre componente. Gruparea se aplica DUPA filtrele 2.1–2.3.

### 2.5 Quiet hours

**22:00–07:00 Europe/Bucharest**, implicit fara notificari. In aceasta fereastra:
- doar `critical` cu **risc real confirmat determinist** ar putea trece (in faza live);
- tot restul se **retrogradeaza in digest** pentru dimineata urmatoare.

In faza curenta quiet hours se evalueaza si se scriu in audit, dar nu au niciun efect real — nimic nu se trimite oricum.

---

## 3. Canale sugerate

Campul `suggested_channel` este **doar o sugestie** in aceasta faza — nicio ruta nu este activa, niciun canal nu este apelat. Maparea determinista:

| Nivel de atentie | `suggested_channel` | Rationament |
|---|---|---|
| `INTERRUPTIVE_ALERT` | `telegram` | Singurul canal cu adevarat interruptiv pentru Adrian (bot @AdiJarviBot, in faza live). |
| `FOUNDER_DECISION_REQUIRED` | `telegram` | O decizie ceruta trebuie sa ajunga acolo unde poate fi si raspunsa. |
| `DAILY_DIGEST` | `digest` | Se acumuleaza in Daily CEO Digest (5 sectiuni, max 5–7 puncte). |
| `DATA_REQUIRED_BEFORE_DECISION` | `hud` | Vizibil pasiv, fara intrerupere — datele lipsa se afiseaza, nu se imping. |
| Orice alt nivel notificabil | `hud` | Implicit non-interruptiv. |

`IGNORE` si `AUDIT_ONLY` nu produc candidat, deci nu au canal.

---

## 4. Conditii viitoare pentru `safe_to_send=true`

`safe_to_send` este **hard-codat `false`** in intreaga Faza 4.4. Trecerea la `true` NU este o decizie a gate-ului per candidat pana cand TOATE conditiile de mai jos nu sunt indeplinite simultan, iar intregul mecanism ramane **gated pe `FOUNDER_NOTIFICATIONS_ENABLED`** — flagul-parinte fara de care restul conditiilor nici nu se evalueaza:

| # | Conditie | Verificare |
|---|---|---|
| 1 | **Notificarile pornite** | `FOUNDER_NOTIFICATIONS_ENABLED=true` (decizie explicita a lui Adrian, ca la CODEX `ENABLED`). |
| 2 | **Shadow oprit** | `FOUNDER_ATTENTION_SHADOW_MODE=false`. Cat timp shadow e activ, totul ramane doar in audit + `jarvis_state`. |
| 3 | **Nivel suficient** | `attention_level` ∈ { `INTERRUPTIVE_ALERT`, `FOUNDER_DECISION_REQUIRED`, `DAILY_DIGEST` (la ora digestului), `DATA_REQUIRED_BEFORE_DECISION` } — niciodata `IGNORE` / `AUDIT_ONLY`. |
| 4 | **In afara quiet hours** | Ora curenta in Europe/Bucharest NU e in 22:00–07:00; exceptia `critical` determinist se aplica doar cu audit explicit. |

Ordinea de evaluare (determinista): flag-parinte → shadow → anti-spam (sectiunea 2) → nivel → quiet hours. Prima conditie picata inchide evaluarea; motivul se scrie in audit la fiecare candidat.

Activarea flag-urilor este o decizie de guvernanta a fondatorului, urmand acelasi model validat la `22-proactive-ceo` (SHADOW=on validat live, ENABLED=off pana decide Adrian).

---

## 5. Ce garanteaza aceasta politica

- **Zero notificari reale** in Faza 4.4 — `safe_to_send=false` intotdeauna, indiferent de nivel sau severitate.
- **Determinism complet** — aceleasi intrari produc aceiasi candidati, aceleasi id-uri, aceleasi decizii de politica.
- **Trasabilitate** — fiecare candidat, retrogradare, grupare si blocare de cooldown are inregistrare in audit + `jarvis_state`.
- **Fara pierderi** — nimic nu se sterge prin anti-spam: ce nu devine alerta ajunge in digest sau ramane in audit.
- **Reversibilitate** — toate flag-urile implicit OFF; oprirea gate-ului readuce sistemul exact la comportamentul din `22-proactive-ceo`.
