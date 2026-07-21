# BUILD SANDBOX — Politica de Izolare și Cost (§11, §13, §28)

> Sursa de adevăr: `branchNameFor`, `DEFAULT_BUILD_LIMITS`, `QUALITY_GATES`, `OPTIONAL_GATES`
> din `src/ceo/evolution/contract.js`.

## 1. Branch-ul de sandbox

Fiecare build trăiește într-un singur branch, cu nume determinist:

```
capability/<capability_request_id fără prefixul cr:>
```

(helperul `branchNameFor(cr)`). Reguli:

- **Un CR = un branch.** Retry-urile (§30) refolosesc același branch sau îl recreează curat —
  niciodată un al doilea branch paralel pentru același CR.
- Branch-ul **nu se merge** de nicio componentă automată. Merge-ul e act uman, post-aprobare.
- La stările terminale (`REJECTED`, `FAILED` definitiv, `NO_LONGER_NEEDED`) branch-ul se
  păstrează pentru audit până la curățenia decisă de fondator — nu se șterge automat.

## 2. Izolarea

| Buildul VEDE | Buildul NU VEDE / NU ATINGE |
|---|---|
| Codul repository-ului (read) | `FORBIDDEN_PATHS` (scriere = Guardian BLOCK) |
| Specificația CR + acceptance tests | Secrete, `.env`, credențiale |
| Propriul branch (read/write) | `main`, producția, alte branch-uri |
| Limitele §28 sub care rulează | Date reale de producție (doar fixture/mostre sanitizate) |

## 3. Output-ul OBLIGATORIU al unui build

Un build fără raport complet este **FAILED**, indiferent dacă codul „pare gata".
Artefactul (`GENERATE_ARTIFACT`) conține obligatoriu:

| Secțiune | Conținut |
|---|---|
| **diff** | Diff-ul complet al branch-ului față de bază — nimic în afara lui |
| **tests** | Rezultatele rulării: unit, integrare, regresie — cu cifre, nu adjective |
| **security** | Rezultatul verificărilor de securitate + confirmarea că FORBIDDEN_PATHS e neatins |
| **risk** | Riscurile identificate de build (ce se poate strica, ce e incert, `unknowns`) |
| **acceptance** | Fiecare acceptance test din CR: PASS/FAIL, cu dovada |
| **recommendation** | Recomandarea providerului: ready for review / needs work / abandon — recomandare, nu decizie |

Raportul alimentează `qualityGate` și cardul din Approval Inbox — fondatorul vede raportul,
nu trebuie să citească diff-ul ca să înțeleagă ce se cere.

## 4. Limitele de cost (§28 — default conservator, override doar prin env în config)

| Limită | Valoare implicită | La depășire |
|---|---|---|
| `max_builds_per_day` | 2 | CR rămâne în `QUEUED_FOR_BUILD` până a doua zi |
| `max_concurrent_builds` | 1 | Al doilea build nu pornește — fără excepții |
| `max_estimated_cost_usd` | 10 | Build refuzat înainte de pornire |
| `max_files_changed` | 30 | Buildul se oprește → `FAILED` cu motiv auditat |
| `max_diff_kb` | 200 | Idem — un diff uriaș e semn de scope greșit, nu de hărnicie |
| `max_runtime_minutes` | 30 | `abort()` pe provider → `FAILED` |
| `max_retries_per_capability` | 2 | Apoi **HUMAN_REVIEW_REQUIRED** (§30) — nu se mai reîncearcă orb |

Contoarele trăiesc în `jarvis_state` (`ceo:evolution:counters`) și se auditează.
`costControl` verifică limitele **înainte** de pornirea buildului, nu doar după.

## 5. Porțile de calitate înainte de fondator (§13)

Toate obligatorii: `syntax · unit_tests · integration_tests · regression_suite ·
permission_boundary_tests · security_tests · data_integrity_tests · idempotency ·
rollback_test · performance_sanity · shadow_test`. Singura poartă care poate fi N/A este
`shadow_test` (dacă nu există cale de shadow) — restul, fără excepție. Abia după toate
porțile + verdict Guardian ≠ BLOCK, CR-ul intră în `WAITING_APPROVAL`.
