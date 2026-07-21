# CAPABILITY REQUEST — Protocolul Canonic (§3, §29)

> Sursa de adevăr: `CR_REQUIRED_FIELDS`, `CR_LIFECYCLE`, `CR_TERMINAL`, `CR_TRANSITIONS`
> din `src/ceo/evolution/contract.js`. Schema mașină: `capability-request.schema.json` (acest director).

## 1. Contractul — câmpurile obligatorii

Un Capability Request (CR) fără oricare dintre aceste câmpuri este **invalid** și nu intră în lifecycle:

| Câmp | Conținut |
|---|---|
| `capability_request_id` | Determinist: `cr:<slug>-<hash>` (helperul `crId`) |
| `created_at` | Timestamp ISO al detecției |
| `origin_need_id` | Nevoia reală din Nervous System care a generat cererea (§26 — obligatoriu netrivial) |
| `type` | Unul din `CAPABILITY_TYPES` (§20): DATA_CONNECTOR … OTHER |
| `title`, `problem`, `why_it_matters` | Ce lipsește, de ce contează pentru companie |
| `sources_checked`, `existing_capabilities_checked` | Dovada analizei REUSE (§1) — ce s-a verificat înainte de a cere software |
| `reuse_options` | Alternativele de pe scara REUSE_LADDER și de ce nu ajung |
| `gap_confirmed` | Boolean — gap confirmat abia după analiza de reuse |
| `requested_capability` | Descrierea capabilității cerute |
| `users`, `inputs`, `outputs` | Cine o folosește, ce intră, ce iese |
| `validation_rules`, `write_boundaries`, `security_constraints` | Regulile pe care buildul trebuie să le respecte |
| `acceptance_tests` | Testele care definesc „gata" — scrise ÎNAINTE de build |
| `rollback_plan` | Cum se revine — obligatoriu înainte de orice aprobare |
| `deployment_policy` | Referă §22: producția cere aprobarea fondatorului |
| `approval_required` | Întotdeauna `true` la nivelul activ |
| `status` | Starea curentă din lifecycle |

## 2. Lifecycle-ul complet

Stări normale: `DETECTED → REUSE_ANALYSIS → GAP_CONFIRMED → SPECIFICATION_READY →
QUEUED_FOR_BUILD → BUILDING → BUILT → TESTING → VALIDATED → WAITING_APPROVAL →
APPROVED → DEPLOYED → OUTCOME_VALIDATION → COMPLETED`.

Stări terminale: `REJECTED · DUPLICATE · NO_LONGER_NEEDED · BLOCKED · FAILED · ROLLED_BACK`.

## 3. Tranzițiile permise (determinist — orice altceva = invalid)

| Din | Către |
|---|---|
| DETECTED | REUSE_ANALYSIS, DUPLICATE, REJECTED, NO_LONGER_NEEDED |
| REUSE_ANALYSIS | GAP_CONFIRMED, REJECTED, DUPLICATE, NO_LONGER_NEEDED |
| GAP_CONFIRMED | SPECIFICATION_READY, BLOCKED, REJECTED, NO_LONGER_NEEDED |
| SPECIFICATION_READY | QUEUED_FOR_BUILD, BLOCKED, REJECTED, NO_LONGER_NEEDED |
| QUEUED_FOR_BUILD | BUILDING, BLOCKED, NO_LONGER_NEEDED, REJECTED |
| BUILDING | BUILT, FAILED, BLOCKED |
| BUILT | TESTING, FAILED |
| TESTING | VALIDATED, FAILED |
| VALIDATED | WAITING_APPROVAL |
| WAITING_APPROVAL | APPROVED, REJECTED, NO_LONGER_NEEDED |
| APPROVED | DEPLOYED, NO_LONGER_NEEDED, ROLLED_BACK |
| DEPLOYED | OUTCOME_VALIDATION, ROLLED_BACK |
| OUTCOME_VALIDATION | COMPLETED, ROLLED_BACK |
| BLOCKED / FAILED | QUEUED_FOR_BUILD (reluare — sub limita de retry §30) |
| COMPLETED, REJECTED, DUPLICATE, NO_LONGER_NEEDED, ROLLED_BACK | — (terminale) |

Validarea tranzițiilor este PURĂ (`canTransition(from, to)`). Nu există sărituri:
`VALIDATED` nu poate merge decât în `WAITING_APPROVAL` — niciun drum ocolește fondatorul.

## 4. Deduplicare (§29)

- Înainte de a crea un CR nou, `capabilityRequest` compară cererea cu registrul existent
  (`ceo:evolution:requests`): același `origin_need_id`, titlu similar (similaritate de tokeni)
  sau aceeași capabilitate cerută → CR nou marcat **DUPLICATE**, cu referință la originalul viu.
- Un CR închis pe stare terminală „soft" (`NO_LONGER_NEEDED`) nu blochează la nesfârșit:
  o nevoie reapărută cu context nou poate genera un CR nou, cu istoria citată.
- Dedup-ul previne și buclele: aceeași limitare detectată la fiecare scan produce **un singur** CR.

## 5. Aprobarea — obligatorie

`approval_required = true` pe fiecare CR. Starea `WAITING_APPROVAL` se rezolvă **exclusiv**
prin acțiunea fondatorului (vezi `CAPABILITY_APPROVAL_POLICY.md`). Nicio componentă —
nici Guardian cu verdict PASS, nici quality gates 100% verzi — nu poate muta un CR în
`APPROVED` fără om.
