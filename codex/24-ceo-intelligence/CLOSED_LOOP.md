# CLOSED LOOP — Ciclul Închis: de la Problemă la Lecție (CEO AI Operational Intelligence)

> **STARE: PROIECTAT — INFRASTRUCTURĂ + SHADOW.** Ciclul închis rulează
> exclusiv ca înregistrare și învățare: **zero task-uri reale trimise, zero
> acțiuni autonome, zero cod sau prompturi auto-modificate.** Orice efect în
> lumea reală trece prin **ApprovalGate** — singura poartă. Învățarea trăiește
> **DOAR ca date** în `jarvis_state` (`ceo:closedloop`) + `audit_log`, complet
> auditabilă. Implementare: `src/ceo/closedLoop.js`.

---

## 1. Principiu

Un CEO care recomandă, dar nu verifică niciodată ce s-a întâmplat cu
recomandările lui, nu învață — repetă. Ciclul închis este mecanismul prin care
JARVIS închide bucla completă a principiului MASTER PHASE:

**SEE → UNDERSTAND → VERIFY → THINK → SIMULATE → RECOMMEND → ASK/PROPOSE →
ADRIAN APPROVES → DELEGATE/EXECUTE → VERIFY EXECUTION → LEARN.**

Ultimele trei verigi — execuția delegată, verificarea execuției și învățarea —
sunt exact ceea ce guvernează acest document. Fără ele, restul pipeline-ului
(observație → episod → recomandare) rămâne un sistem care vorbește, dar nu
ține minte dacă a avut dreptate.

Regulile absolute care se aplică integral aici:

| Regulă | Consecință în ciclul închis |
|---|---|
| Propunere ≠ execuție | O buclă se deschide la recomandare, dar nu avansează fără aprobarea lui Adrian |
| Aprobare ≠ rezultat verificat | `APPROVED` nu închide bucla; doar `VERIFIED` + `MEASURED` o pot închide |
| Date lipsă ≠ zero | Un rezultat neverificabil = `UNKNOWN`, nu „a eșuat" și nu „a reușit" |
| Recomandare ≠ aprobare | Confidence-ul se ajustează pe REZULTAT, nu pe faptul că Adrian a spus da |
| Zero acțiuni autonome | Monitorizarea și verificarea sunt read-only; delegarea reală e gated |

---

## 2. Cele 8 trepte ale ciclului

Fiecare buclă (`loop`) parcurge, în ordine strictă, opt trepte. O treaptă nu
poate fi sărită și nu poate fi marcată retroactiv.

| # | Treaptă | Ce se întâmplă | Cine acționează | Sursă / Poartă |
|---|---|---|---|---|
| 1 | **PROBLEM** | O problemă/oportunitate e detectată și formulată | Observation Engine + Proactive CEO ([21](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md), [22](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md)) | shadow, read-only |
| 2 | **APPROVED** | Adrian decide APPROVE / MODIFY / REJECT pe Action Proposal | **Doar Adrian** | [PROPOSAL_ENGINE.md](PROPOSAL_ENGINE.md) → ApprovalGate |
| 3 | **DELEGATED** | Task Proposal cu responsabil, termen, rezultat așteptat, regulă de verificare | JARVIS propune, Adrian confirmă | gated — în faza curentă doar SHADOW |
| 4 | **MONITORED** | Bucla urmărește task-ul: progres, blocaje, termen | JARVIS (read-only, din surse conectate) | fără notificări noi în afara politicilor din [23](../23-founder-attention/NOTIFICATION_POLICY.md) |
| 5 | **VERIFIED** | Rezultatul e confruntat cu **regula de verificare** definită la delegare | JARVIS verifică; nu declară succes fără dovadă | dovada lipsă → `UNKNOWN` + Data Gap ([DATA_GAP_ENGINE.md](DATA_GAP_ENGINE.md)) |
| 6 | **MEASURED** | Impactul real (cash, profit, timp, risc) vs. impactul estimat la recomandare | JARVIS, cu separarea strictă CASH/PROFIT din [CASH_INTELLIGENCE.md](CASH_INTELLIGENCE.md) | componente lipsă = `UNKNOWN`, nu 0 |
| 7 | **STORED** | Înregistrarea completă a buclei se persistă | `jarvis_state` (`ceo:closedloop`) + `audit_log` | append-only, auditabil |
| 8 | **LESSON** | Lecția explicită + ajustarea de confidence per tip de strategie | JARVIS; lecția e text + delta numeric, nu cod | fără self-modifying prompts/cod (§5) |

Regulă de tranziție: **1→2 trece obligatoriu prin ApprovalGate**; **5 nu poate
fi derivată din 2** (aprobarea nu este dovadă de rezultat); **8 nu există fără
5 și 6** — o buclă neverificată nu produce lecție, produce cel mult un Data Gap.

Bucle care nu ajung la 8 rămân valabile și utile: un REJECT la treapta 2 este
el însuși un semnal de învățare (vezi §6.3), iar o buclă blocată în `UNKNOWN`
la treapta 5 alimentează [DATA_GAP_ENGINE.md](DATA_GAP_ENGINE.md) cu un caz
concret de „nu putem verifica ce am recomandat".

---

## 3. Structura înregistrării unei bucle

Fiecare buclă este un obiect JSON append-only. Forma canonică urmează tiparul:
**„am recomandat X pentru că Y → X a produs Z → confidence-ul strategiei
crește/scade"** — cu fiecare segment atribuit, datat și legat de dovezi.

```json
{
  "loop_id": "loop-2026-07-21-0003",
  "strategy_type": "cash.acceleration.receivables",
  "status": "MEASURED",
  "problem": {
    "summary": "Încasare probabilă întârziată >14 zile pe unitatea B2-ap07",
    "source_episode": "ep-2026-07-19-0011",
    "detected_at": "2026-07-19T07:30:00Z",
    "domains": ["RECEIVABLES", "CASH"]
  },
  "recommendation": {
    "what": "X = contact direct client + propunere calendar de plată în 2 tranșe",
    "why": "Y = istoric client bun, blocajul e administrativ, nu de solvabilitate",
    "expected_outcome": "încasare tranșa 1 în ≤10 zile",
    "expected_impact": { "cash": "+X EUR în 10 zile", "profit": "0", "risk": "scăzut" },
    "confidence_at_recommendation": 0.62,
    "decision_ref": "decisionEngineV2 scenariul 7, vezi DECISION_ENGINE_V2.md",
    "data_gaps_at_recommendation": []
  },
  "approval": {
    "decision": "MODIFY",
    "by": "Adrian",
    "at": "2026-07-19T09:12:00Z",
    "modifications": "3 tranșe în loc de 2",
    "via": "ApprovalGate"
  },
  "delegation": {
    "owner": "Dana",
    "deadline": "2026-07-24",
    "expected_result": "acord scris pe calendarul de plată",
    "verification_rule": "document semnat SAU încasare tranșa 1 vizibilă în BANK",
    "mode": "SHADOW"
  },
  "monitoring": [
    { "at": "2026-07-21T07:30:00Z", "signal": "fără progres vizibil", "source": "TASKS" }
  ],
  "verification": {
    "verdict": "UNKNOWN",
    "evidence": null,
    "reason": "sursa BANK neconectată pe acest cont",
    "data_gap_ref": "gap-bank-002"
  },
  "measurement": {
    "expected_vs_actual": null,
    "cash_impact_actual": "UNKNOWN",
    "profit_impact_actual": "UNKNOWN"
  },
  "lesson": null,
  "confidence_delta": 0,
  "audit_refs": ["audit#18231", "audit#18240"]
}
```

Reguli pe structură:

1. **`strategy_type` este cheia de învățare** — o taxonomie stabilă, definită
   în configurația companiei ([COMPANY_CONFIG](companyConfig-ul instanței #1)),
   nu inventată ad-hoc per buclă. Fără `strategy_type`, lecția nu are unde să
   se acumuleze.
2. **`why` (Y) se scrie la momentul recomandării**, nu reconstruit după
   rezultat. Interzis „hindsight editing": segmentul `recommendation` devine
   imutabil după treapta 2.
3. **`Z` (rezultatul) vine doar din `verification` + `measurement`** — surse
   conectate, cu dovadă. Declarațiile fără dovadă nu sunt Z.
4. **`verdict` ∈ {CONFIRMED, PARTIAL, CONTRADICTED, UNKNOWN}.** `UNKNOWN` este
   un verdict legitim și frecvent — el nu ajustează confidence (§6.2).
5. Orice câmp necompletabil = `UNKNOWN` + referință la Data Gap. **Niciodată
   valori inventate.**

---

## 4. Persistență: `jarvis_state` + `audit_log`

Învățarea este **auditabilă prin construcție**: două locuri, ambele existente
deja în infrastructura JARVIS, niciunul nou.

| Depozit | Cheie / tabelă | Conținut | Regim |
|---|---|---|---|
| `jarvis_state` | `ceo:closedloop` | Starea curentă: buclele active + agregatele de confidence per `strategy_type` | citit la runtime de motoarele de decizie |
| `jarvis_state` | `ceo:closedloop:archive:<YYYY-MM>` | Buclele închise, pe luni | append-only, istoric complet |
| `audit_log` | `actor='ceo_closed_loop'` | Fiecare tranziție de treaptă = o intrare separată (`loop_opened`, `loop_approved`, `loop_verified`, `loop_lesson`, …) | imutabil, cu `data_used` |

Consecințe:

- Orice ajustare de confidence poate fi **reconstruită integral** din audit:
  ce buclă a produs-o, ce dovadă a existat, ce delta s-a aplicat, când.
- Nu există stare de învățare „ascunsă" în prompturi, în memorie de model sau
  în fișiere modificate de sistem. Dacă nu e în `jarvis_state`/`audit_log`,
  nu există.
- [SELF_AUDIT.md](SELF_AUDIT.md) include zilnic sănătatea buclei: câte bucle
  active, câte blocate în `UNKNOWN`, câte fără monitorizare posibilă.

---

## 5. FĂRĂ self-modifying prompts / cod

Linia roșie a acestui motor:

1. **Codul nu se modifică singur.** `closedLoop.js` nu scrie fișiere sursă,
   nu editează prompturi, nu își schimbă regulile. Orice schimbare de cod sau
   de prompt trece prin [IMPROVEMENT_ENGINE.md](IMPROVEMENT_ENGINE.md):
   propunere explicită → Adrian aprobă → om (sau sesiune supervizată) aplică.
2. **Învățarea = date, nu comportament rescris.** Ceea ce „învață" sistemul
   este un set de numere și lecții text în `jarvis_state`, pe care motoarele
   le **citesc** ca input. Ștergerea cheii `ceo:closedloop` readuce sistemul
   exact la comportamentul inițial — proprietate de reversibilitate care
   trebuie să rămână adevărată permanent.
3. **Lecțiile sunt sugestii pentru decizii, nu reguli noi de guvernanță.**
   O lecție nu poate relaxa ApprovalGate, nu poate crea rute de execuție și
   nu poate modifica pragurile din configurația companiei. Poate cel mult
   genera un System Improvement Proposal — care merge tot la Adrian.

---

## 6. Cum alimentează învățarea deciziile viitoare

### 6.1 Agregatul per tip de strategie

În `ceo:closedloop` se menține, per `strategy_type`:

```json
{
  "strategy_type": "cash.acceleration.receivables",
  "loops_total": 9,
  "verdicts": { "CONFIRMED": 5, "PARTIAL": 2, "CONTRADICTED": 1, "UNKNOWN": 1 },
  "confidence": 0.71,
  "confidence_base": 0.50,
  "last_adjusted": "2026-07-18",
  "lessons": ["clienții cu istoric bun răspund la calendar de plată; blocajul tipic e administrativ"]
}
```

Când [DECISION_ENGINE_V2.md](DECISION_ENGINE_V2.md) construiește cele 6+1
scenarii, câmpul `confidence` al fiecărui scenariu pornește din acest agregat
(dacă tipul de strategie are istoric) în loc de valoarea de bază — iar
Scenariul 7 (recomandarea CEO AI) **citează explicit istoricul**: „strategie
aplicată de 9 ori, confirmată de 5, contrazisă o dată".

### 6.2 Reguli de ajustare

| Verdict | Delta tipic | Notă |
|---|---|---|
| CONFIRMED | +0.05 | plafonat: confidence ≤ 0.90 — niciodată certitudine |
| PARTIAL | +0.02 | rezultat parțial ≠ jumătate de succes declarat; se notează ce a lipsit |
| CONTRADICTED | −0.10 | penalizarea > recompensa, deliberat: costul încrederii false e asimetric |
| UNKNOWN | 0 | **date lipsă ≠ zero**: nu urcă, nu coboară; deschide/întărește Data Gap |

Garduri suplimentare:

- **Podea 0.20 / plafon 0.90** — sistemul nu ajunge nici la disperare, nici la aroganță.
- **Eșantion minim:** sub 3 bucle închise (`CONFIRMED`+`PARTIAL`+`CONTRADICTED`),
  agregatul se afișează ca `INSUFFICIENT_HISTORY` și nu suprascrie confidence-ul de bază.
- **Decădere:** bucle mai vechi de 12 luni cântăresc jumătate — piața și firma se schimbă.
- **Context nou ≠ istoric vechi:** dacă parametrii cheie ai scenariului diferă
  semnificativ de buclele istorice (alt ordin de mărime, alt proiect, alt tip
  de client), motorul semnalează `HISTORY_MAY_NOT_APPLY` în loc să aplice orb delta-urile.
- **Override uman:** Adrian poate reseta sau fixa confidence-ul unui
  `strategy_type` oricând; override-ul se scrie în audit cu motiv.

### 6.3 Semnale colaterale (tot auditabile)

- **REJECT repetat pe același `strategy_type`** = lecție separată: nu „strategia
  e proastă", ci „recomandarea nu se aliniază cu judecata fondatorului" — se
  raportează ca semnal către [02-founder-dna](../02-founder-dna/) și scade
  prioritatea propunerilor de acel tip, fără a atinge confidence-ul de rezultat.
- **MODIFY frecvent** = tiparul modificărilor lui Adrian devine lecție („Adrian
  preferă 3 tranșe, nu 2") — folosită la formularea propunerilor viitoare, nu
  la executarea lor.
- **UNKNOWN cronic pe o treaptă** = dovadă pentru [DATA_GAP_ENGINE.md](DATA_GAP_ENGINE.md)
  și [COMPANY_DATA_MAP.md](COMPANY_DATA_MAP.md): un domeniu în care compania
  ia decizii pe care nu le poate verifica. Acesta e un cost de business, nu un
  detaliu tehnic.
- Buclele cu impact pe oameni alimentează [PEOPLE_INTELLIGENCE.md](PEOPLE_INTELLIGENCE.md)
  conform regulii Founder DNA: prima greșeală = învățare; repetarea = problemă
  de capacitate/proces/disciplină.

---

## 7. Ce ESTE și ce NU este ciclul închis

| ESTE | NU ESTE |
|---|---|
| Registru auditabil recomandare → rezultat → lecție | Un mecanism de execuție automată |
| Ajustare de confidence per tip de strategie, cu garduri | Auto-modificare de prompturi, cod sau reguli |
| Consumator al ApprovalGate (treapta 2) | O ocolire sau o dublură a ApprovalGate |
| Sursă de input pentru Decision Engine V2 și Proposal Engine | O autoritate de decizie proprie |
| Generator de Data Gaps când verificarea e imposibilă | Un sistem care declară succes fără dovadă |
| Reversibil complet prin ștergerea stării | Memorie opacă, nerecuperabilă din audit |

---

## 8. Legături

- [PROPOSAL_ENGINE.md](PROPOSAL_ENGINE.md) — treptele 2–3: Action Proposal → ApprovalGate → Task Proposal
- [DECISION_ENGINE_V2.md](DECISION_ENGINE_V2.md) — consumatorul principal al confidence-ului învățat (Scenariul 7)
- [DATA_GAP_ENGINE.md](DATA_GAP_ENGINE.md) / [COMPANY_DATA_MAP.md](COMPANY_DATA_MAP.md) — destinația verdictelor `UNKNOWN`
- [CASH_INTELLIGENCE.md](CASH_INTELLIGENCE.md) — măsurarea impactului cash/profit la treapta 6
- [PEOPLE_INTELLIGENCE.md](PEOPLE_INTELLIGENCE.md) — lecțiile cu dimensiune umană
- [SELF_AUDIT.md](SELF_AUDIT.md) — sănătatea zilnică a buclelor
- [IMPROVEMENT_ENGINE.md](IMPROVEMENT_ENGINE.md) — singura cale legitimă de schimbare a sistemului însuși
- [../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) — sursa treptei 1
- [../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md) — episoadele executive din care se nasc buclele
- [../23-founder-attention/NOTIFICATION_POLICY.md](../23-founder-attention/NOTIFICATION_POLICY.md) — de ce monitorizarea nu generează notificări proprii
- [../04-executive-board/BOARD_DECISION_PROTOCOL.md](../04-executive-board/BOARD_DECISION_PROTOCOL.md) — buclele născute din decizii cu aviz de Board
