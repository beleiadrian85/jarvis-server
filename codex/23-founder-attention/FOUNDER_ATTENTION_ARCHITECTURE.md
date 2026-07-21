# FOUNDER ATTENTION GATE — Arhitectură (Faza 4.4)

> **STARE: PROIECTAT — implementat GATED, flag implicit OFF, validare exclusiv în Shadow Mode; NICIO notificare reală în această fază.**
> `FOUNDER_ATTENTION_GATE_ENABLED=false` · `FOUNDER_ATTENTION_SHADOW_MODE=true` · `FOUNDER_NOTIFICATIONS_ENABLED=false` · `safe_to_send=false` întotdeauna

> **Poziționare:** acest capitol este continuarea directă a capitolului [22 — Proactive CEO Pipeline](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md) și ultimul strat de logică înaintea fondatorului. Consumă exclusiv episoadele, Board Preview-urile și CEO Brief-urile produse de pipeline-ul din capitolul 22, care la rândul lui consumă exclusiv observațiile deterministe ale [Observation Engine (capitolul 21)](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md). Nu înlocuiește niciunul dintre ele.

---

## 1. Scop

Observation Engine răspunde la întrebarea *„ce se întâmplă în companie?"*. Proactive CEO Pipeline răspunde la întrebarea *„ce ar trebui să ajungă pe masa fondatorului?"*. Founder Attention Gate răspunde la ultima și cea mai importantă întrebare: **„ce merită să întrerupă efectiv atenția lui Adrian — și când?"**.

Atenția fondatorului este cea mai scumpă resursă a companiei. Fiecare notificare inutilă o devalorizează pe următoarea. Gate-ul există dintr-un singur motiv: **eliminarea zgomotului** — doar semnalele cu adevărat importante ajung la Adrian, la momentul potrivit, pe canalul potrivit; tot restul rămâne în audit sau se acumulează într-un digest zilnic.

Trei fraze definesc întregul capitol:

1. **Pipeline-ul din capitolul 22 este singura sursă.** Gate-ul nu culege date, nu inventează episoade și nu re-analizează business-ul. Primește episoade gata triate, cu Board Preview și CEO Brief, și decide exclusiv **nivelul de atenție** pe care îl merită.
2. **Tăcerea este comportamentul implicit.** Un episod fără schimbare reală nu produce niciun candidat nou. Anti-spam-ul este regulă de arhitectură, nu opțiune de configurare.
3. **Adrian este decizia — și în această fază, nici măcar nu este deranjat.** Gate-ul produce doar *candidați de notificare* cu `safe_to_send=false`, exclusiv în audit și `jarvis_state`. Nicio notificare reală nu pleacă până la validarea Shadow și decizia explicită a fondatorului.

Obiectivul operațional: **zero spam, zero notificări nevalidate** — lanțul complet de decizie funcționează cap-coadă, dar ultimul metru (livrarea) rămâne tăiat prin design.

---

## 2. Lanțul complet — unde intră gate-ul

```
┌────────────────────────────┐
│ 1. OBSERVATION ENGINE      │  ciclu la 30 min (shadow), capitolul 21
│    observationRunner       │  → observații deterministe
└─────────────┬──────────────┘
              │ apel GATED (flag implicit OFF)
              ▼
┌────────────────────────────┐
│ 2. SIGNAL TRIAGE           │  capitolul 22 — verdict per observație
├────────────────────────────┤
│ 3. EXECUTIVE EPISODES      │  capitolul 22 — episoade corelate + status
├────────────────────────────┤
│ 4. BOARD ESCALATION        │  capitolul 22 — simulare, NU convocare
│    PREVIEW                 │
├────────────────────────────┤
│ 5. CEO BRIEF               │  capitolul 22 — brief determinist, fără LLM
└─────────────┬──────────────┘
              │ episoade eligibile + preview + brief
              │ apel GATED din pipelineRunner (flag implicit OFF, erori izolate)
              ▼
╔═════════════╪══════════ founderGateRunner.js (orchestrare) ═══════════╗
║             ▼                                                         ║
║ ┌────────────────────────────┐                                        ║
║ │ 6. FOUNDER ATTENTION GATE  │  decizie deterministă per episod:      ║
║ │    attentionGate.js (PUR)  │  unul din cele 6 niveluri de atenție   ║
║ └─────────────┬──────────────┘                                        ║
║               │ episoadele care merită atenție                        ║
║               ▼                                                       ║
║ ┌────────────────────────────┐                                        ║
║ │ 7. NOTIFICATION CANDIDATE  │  structura canonică a candidatului,    ║
║ │    notificationCandidate.js│  safe_to_send=FALSE întotdeauna        ║
║ │    (PUR)                   │                                        ║
║ └─────────────┬──────────────┘                                        ║
║               │ candidați bruți                                       ║
║               ▼                                                       ║
║ ┌────────────────────────────┐                                        ║
║ │ 8. NOTIFICATION POLICY     │  cooldown · limite/zi · quiet hours ·  ║
║ │    notificationPolicy.js   │  deduplicare · grupare interruptive    ║
║ │    (PUR)                   │                                        ║
║ └─────────────┬──────────────┘                                        ║
║               │ candidați filtrați + retrogradați                     ║
║               ▼                                                       ║
║ ┌────────────────────────────┐                                        ║
║ │ 9. DAILY CEO DIGEST        │  preview-ul digestului zilnic,         ║
║ │    dailyDigest.js (PUR)    │  5 secțiuni, max 5-7 puncte            ║
║ └─────────────┬──────────────┘                                        ║
╚═══════════════╪═══════════════════════════════════════════════════════╝
                ▼
     NOTIFICATION CANDIDATE (audit + jarvis_state, safe_to_send=false)
     ── în Shadow Mode: ZERO notificări reale către Adrian
```

| Treaptă | Întrebarea la care răspunde | Rezultat |
|---|---|---|
| 6. Attention Gate | Ce nivel de atenție merită acest episod? | Unul din cele 6 niveluri (§3) |
| 7. Notification Candidate | Cum ar arăta notificarea, dacă ar fi trimisă? | Candidat canonic, `safe_to_send=false` |
| 8. Notification Policy | Are voie candidatul să existe acum? | Filtrare: cooldown, limite, quiet hours, grupare |
| 9. Daily CEO Digest | Ce ar primi Adrian într-un singur mesaj pe zi? | Preview de digest, 5 secțiuni, 5-7 puncte |

---

## 3. Cele 6 niveluri de atenție — semantica

Decizia gate-ului este **deterministă și pură**: același episod, aceeași stare anterioară → același nivel, întotdeauna. Criteriile de intrare: severitate, confidence, `data_quality`, impact financiar, urgență/termen, worsening, persistență, sisteme afectate, reversibilitate, risc juridic/reputațional/cash, necesitatea deciziei fondatorului, existența unei acțiuni concrete posibile.

| Nivel | Semantică | Când |
|---|---|---|
| `IGNORE` | Episodul nu merită nicio urmă dincolo de pipeline. | Zgomot, severitate joasă, fără schimbare, fără acțiune posibilă. |
| `AUDIT_ONLY` | Se consemnează, nu se semnalează. Urmărit în tăcere. | Relevant pentru istoric/trend, dar fără valoare de atenție acum. |
| `DAILY_DIGEST` | Intră în digestul zilnic — atenție acumulată, nu întreruptă. | Severitate medium; high fără urgență imediată; trend relevant; problemă repetată; oportunitate importantă; dependență de fondator fără termen presant. |
| `INTERRUPTIVE_ALERT` | Merită să întrerupă ziua lui Adrian. Cel mai scump nivel. | **Doar dacă:** critical; SAU high + termen ≤3 zile; SAU high + worsening; SAU risc cash sever; SAU risc juridic/reputațional major; SAU decizie ireversibilă iminentă. |
| `FOUNDER_DECISION_REQUIRED` | Există o decizie reală care nu poate fi luată fără fondator. | **Doar când toate sunt adevărate:** există o decizie reală; minim 2 opțiuni valide; Board Preview indică necesitatea fondatorului; amânarea are cost/risc; informațiile SUNT suficiente. |
| `DATA_REQUIRED_BEFORE_DECISION` | Decizia se conturează, dar datele esențiale lipsesc. Cererea de date precede cererea de decizie. | Când lipsesc date esențiale pentru o decizie altfel reală. **Niciodată** `FOUNDER_DECISION_REQUIRED` pe date insuficiente. |

Reguli transversale:

- **`data_quality=poor` blochează alerta interruptivă.** Excepția unică: risc confirmat determinist — probabilitate certă calculată pe date complete. Restul se retrogradează în `DAILY_DIGEST` sau `DATA_REQUIRED_BEFORE_DECISION`.
- **Onestitate epistemică moștenită:** gate-ul nu „repară" incertitudinea pipeline-ului — o propagă. `missing_data` din candidat vine direct din `unknowns`-urile episodului.
- **O acțiune concretă posibilă** este condiție de bun-simț pentru orice nivel peste `AUDIT_ONLY`: dacă Adrian nu poate face nimic cu informația, informația nu îi consumă atenția.

---

## 4. Candidatul de notificare — structura canonică

```json
{
  "notification_candidate_id": "nc:<episode>:<nivel>",
  "episode_id": "ep:…",
  "attention_level": "IGNORE | AUDIT_ONLY | DAILY_DIGEST | INTERRUPTIVE_ALERT | FOUNDER_DECISION_REQUIRED | DATA_REQUIRED_BEFORE_DECISION",
  "title": "…",
  "why_now": "de ce acum, nu ieri și nu mâine",
  "what_changed": "ce s-a schimbat față de ultima stare cunoscută",
  "business_impact": [],
  "decision_needed": "decizia cerută fondatorului sau null",
  "deadline": "termenul real sau null",
  "confidence": 0,
  "data_quality": "good | partial | poor",
  "missing_data": [],
  "suggested_channel": "digest | telegram | hud",
  "safe_to_send": false,
  "deduplication_key": "cheie stabilă anti-duplicat"
}
```

`notification_candidate_id` este **stabil** (`nc:<episode>:<nivel>`): același episod la același nivel produce același candidat, ceea ce face posibile deduplicarea, cooldown-ul și reconcilierea între rulări. `safe_to_send` este **hard-codat `false` în această fază** — nu este o valoare calculată care ar putea deveni `true` accidental.

---

## 5. Anti-spam — regulă de arhitectură

**Zero candidat nou** dacă: episodul e identic cu rularea anterioară / severitatea neschimbată / fără date noi / fără worsening / termenul nu s-a apropiat / fără decizie nouă.

| Mecanism | Valoare implicită |
|---|---|
| Cooldown per episod | 24h |
| Cooldown per tip de alertă | interruptive 6h · decision 12h |
| Maxim alerte/zi (toate tipurile) | 5 |
| Maxim interruptive/zi | 2 |
| Grupare | Mai multe alerte interruptive în aceeași rulare → **UNA grupată** |
| Quiet hours | 22:00–07:00 Europe/Bucharest |

**Quiet hours:** implicit nicio notificare. `critical` trece **doar** cu risc real confirmat determinist; tot restul se retrogradează în digest. (În această fază, „trece" înseamnă doar că nivelul candidatului se păstrează în audit — nimic nu se trimite.)

Politica este continuarea la nivel de fondator a [politicii anti-spam pe episod din capitolul 22](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md) și a [politicii de notificare din capitolul 21](../21-observation-engine/OBSERVATION_NOTIFICATION_POLICY.md): observație → episod → atenția fondatorului, fiecare strat mai tăcut decât precedentul.

---

## 6. Daily CEO Digest — preview în shadow

Un singur mesaj pe zi, **maxim 5-7 puncte relevante, zero zgomot de audit**, cu 5 secțiuni fixe:

| # | Secțiune | Conținut |
|---|---|---|
| 1 | **CE NECESITĂ ATENȚIA TA** | Candidații `FOUNDER_DECISION_REQUIRED` + interruptive retrogradate |
| 2 | **CE S-A AGRAVAT** | Episoade `worsening` de la ultimul digest |
| 3 | **CE S-A REZOLVAT** | Episoade `resolved` — închidere, o singură dată |
| 4 | **CE DECIZII SE APROPIE** | Termene care intră în fereastra de decizie |
| 5 | **CE DATE LIPSESC** | `DATA_REQUIRED_BEFORE_DECISION` + `missing_data` agregat |

În această fază digestul este **exclusiv un preview**: se generează determinist, se scrie în audit, nu se trimite pe niciun canal.

---

## 7. Cele 6 module (`src/founderAttention/`)

| Modul | Tip | Responsabilitate |
|---|---|---|
| `attentionGate.js` | PUR | Decide determinist, per episod, unul din cele 6 niveluri de atenție (§3). Fără efecte secundare, fără I/O, fără LLM — aceleași intrări produc întotdeauna același nivel. |
| `notificationCandidate.js` | PUR | Construiește candidatul canonic (§4) din episod + nivel + brief. `safe_to_send=false` hard-codat. Id stabil `nc:<episode>:<nivel>` + `deduplication_key`. |
| `notificationPolicy.js` | PUR | Aplică politica anti-spam (§5): cooldown per episod și per tip, limitele zilnice, quiet hours (cu excepția critical determinist), deduplicare, gruparea interruptive-lor într-una singură. Primește starea anterioară (`founder:candidates`, `founder:limits`) ca parametru — nu citește singur nimic. |
| `dailyDigest.js` | PUR | Generează preview-ul digestului zilnic (§6), determinist, fără LLM, din candidații acumulați și starea episoadelor. |
| `founderGateRunner.js` | Orchestrare | Singurul modul cu I/O: leagă gate → candidat → policy → digest, citește/scrie starea în `jarvis_state`, emite evenimentele de audit (`founder_gate`, `notification_candidate`, `ceo_digest`). Erorile sunt izolate — o excepție aici nu doboară niciodată pipeline-ul din capitolul 22. |
| `index.js` | API | Suprafața publică a modulului pentru `pipelineRunner`; expune exclusiv funcția de rulare gated. |

Toate cele patru module de logică sunt **funcții pure** — testabile determinist, fără mock-uri de infrastructură. **Fără LLM** nicăieri în gate: costul, latența și variabilitatea deciziei de atenție sunt zero.

---

## 8. Moduri de funcționare: OFF / SHADOW

| Mod | Condiție | Comportament |
|---|---|---|
| **OFF** (implicit) | `FOUNDER_ATTENTION_GATE_ENABLED=false` | Gate-ul **nu rulează deloc**. Apelul din `pipelineRunner` se întoarce imediat — zero schimbare față de comportamentul actual al capitolului 22. |
| **SHADOW** | `FOUNDER_ATTENTION_GATE_ENABLED=true` + `FOUNDER_ATTENTION_SHADOW_MODE=true` | Gate-ul rulează complet — niveluri, candidați, policy, digest — dar ieșirile merg **exclusiv** în `audit` și `jarvis_state`. `safe_to_send=false` pe fiecare candidat. Zero notificări reale. Este singurul mod în care se face validarea. |

Toate flag-urile sunt implicit pe valoarea sigură:

| Flag | Implicit | Efect |
|---|---|---|
| `FOUNDER_ATTENTION_GATE_ENABLED` | `false` | Gate-ul nu rulează |
| `FOUNDER_ATTENTION_SHADOW_MODE` | `true` | Când rulează: doar audit/jarvis_state |
| `FOUNDER_NOTIFICATIONS_ENABLED` | `false` | Nicio notificare reală către Adrian, pe niciun canal |

Activarea oricărui flag dincolo de Shadow este **decizia exclusivă a lui Adrian**, după validarea rezultatelor din audit — același model de guvernanță ca la Executive Board și la capitolele 21-22 (SHADOW validat, ENABLED decis de fondator).

---

## 9. Integrări

| Integrare | Mecanism |
|---|---|
| **Proactive CEO Pipeline → gate** | Apel **gated** din `proactiveCeo/pipelineRunner`: dacă `FOUNDER_ATTENTION_GATE_ENABLED=false`, apelul e inert. Erorile gate-ului sunt **izolate** (try/catch la graniță) — pipeline-ul din capitolul 22 rămâne neatins funcțional în orice scenariu. |
| **Stare** | `jarvis_state`, două chei: `founder:candidates` (candidații per episod, cu nivel, timestamp-uri și dedup) și `founder:limits` (contoarele zilnice și cooldown-urile per tip de alertă). **Fără schemă DB nouă.** |
| **Audit** | Toate ieșirile gate-ului sunt evenimente de audit: `founder_gate` (rularea + deciziile de nivel per episod), `notification_candidate` (fiecare candidat produs, cu `safe_to_send=false`), `ceo_digest` (preview-ul digestului zilnic). Auditul este singura „fereastră" a gate-ului în Shadow Mode. |
| **Board Preview (capitolul 22)** | Consum read-only: `requires_founder_attention` și concluziile preview-ului alimentează criteriul „Board Preview indică necesitatea fondatorului" pentru `FOUNDER_DECISION_REQUIRED`. Gate-ul **nu convoacă** Boardul. |

---

## 10. Ce NU face gate-ul în această fază

| NU face | De ce |
|---|---|
| **NU trimite nimic** — nici Telegram, nici email, nici HUD, nici digest | `FOUNDER_NOTIFICATIONS_ENABLED=false`; `suggested_channel` este doar o sugestie consemnată în audit. |
| **NU produce niciun candidat cu `safe_to_send=true`** | Valoarea este hard-codată `false` în `notificationCandidate.js` — nu există cale de cod prin care să devină `true` în această fază. |
| **NU convoacă Executive Board** | Convocarea reală rămâne guvernată de capitolul [04](../04-executive-board/BOARD_MEETING_PROTOCOL.md) și de decizia lui Adrian; gate-ul doar citește preview-ul din capitolul 22. |
| **NU execută acțiuni și NU ia decizii de business** | Gate-ul decide exclusiv *nivelul de atenție*, nu conținutul deciziei. Capătul lanțului este întotdeauna Adrian. |
| **NU scrie în Operational, Gmail sau Calendar** | Singurele ieșiri: audit + `jarvis_state`. |
| **NU atinge approvalGate** | approvalGate rămâne singura poartă pentru efecte în lumea reală, exact ca în capitolele 21-22. |
| **NU folosește LLM** | Toată logica de atenție este deterministă — validabilă, reproductibilă, auditabilă. |

---

## 11. Documente conexe

| Document | Rol |
|---|---|
| [22 — PROACTIVE_CEO_ARCHITECTURE](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md) | Sursa episoadelor, Board Preview-urilor și CEO Brief-urilor pe care gate-ul le consumă |
| [22 — CEO_BRIEF_FORMAT](../22-proactive-ceo/CEO_BRIEF_FORMAT.md) | Formatul brief-ului atașat candidaților |
| [22 — BOARD_ESCALATION_POLICY](../22-proactive-ceo/BOARD_ESCALATION_POLICY.md) | Semantica `requires_founder_attention` consumată de gate |
| [21 — OBSERVATION_ENGINE_ARCHITECTURE](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) | Originea semnalelor — începutul lanțului |
| [21 — OBSERVATION_NOTIFICATION_POLICY](../21-observation-engine/OBSERVATION_NOTIFICATION_POLICY.md) | Politica anti-spam pe observație, extinsă aici la nivelul atenției fondatorului |
| [21 — OBSERVATION_SHADOW_VALIDATION](../21-observation-engine/OBSERVATION_SHADOW_VALIDATION.md) | Modelul de validare în Shadow, replicat pentru gate |
| [04 — BOARD_ARCHITECTURE](../04-executive-board/BOARD_ARCHITECTURE.md) | Boardul pe care gate-ul nu îl convoacă — doar îi citește preview-ul |

*Documentele dedicate ale capitolului 23 (niveluri de atenție, politica de notificare, formatul digestului, validarea shadow) detaliază fiecare treaptă descrisă aici.*
