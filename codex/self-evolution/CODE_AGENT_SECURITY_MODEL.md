# CODE AGENT — Modelul de Securitate (§11, §33)

> Sursa de adevăr: `CODE_AGENT_CAN`, `CODE_AGENT_CANNOT`, `FORBIDDEN_PATHS` din
> `src/ceo/evolution/contract.js`. Impuse în `guardian` — nu sunt convenții, sunt bariere.

## 1. Lista ALBĂ — ce POATE Code Agent

| Permisiune | Sens |
|---|---|
| `READ_REPOSITORY` | Citește codul existent (context pentru build) |
| `CREATE_BRANCH` | Creează exclusiv branch-uri `capability/<id>` |
| `WRITE_CODE_IN_BRANCH` | Scrie cod DOAR în branch-ul propriu de sandbox |
| `RUN_TESTS` | Rulează suita de teste local, în sandbox |
| `RUN_STATIC_ANALYSIS` | Lint, analiză statică |
| `RUN_SECURITY_CHECKS` | Verificări de securitate pe propriul diff |
| `GENERATE_DIFF` | Produce diff-ul complet pentru review |
| `GENERATE_ARTIFACT` | Produce raportul obligatoriu de build (vezi `BUILD_SANDBOX_POLICY.md`) |

## 2. Lista NEAGRĂ — ce NU POATE Code Agent (Guardian BLOCK)

`MERGE_PRODUCTION` · `PUSH_MAIN` · `DEPLOY_PRODUCTION` · `CHANGE_SECRETS` ·
`MODIFY_FOUNDER_DNA` · `MODIFY_CONSTITUTION` · `EXPAND_OWN_PERMISSIONS` ·
`MODIFY_APPROVAL_GATE` · `ACTIVATE_AUTONOMY` · `DELETE_DATA`

Observație §26: primele trei protejează producția; restul protejează **guvernanța** —
un build care își lărgește propriile permisiuni sau atinge poarta de aprobare este exact
pattern-ul de self-preservation pe care sistemul îl interzice prin design.

## 3. FORBIDDEN_PATHS — căile interzise oricărui build self-generated

Atingerea oricăreia = verdict Guardian **BLOCK**, indiferent de restul calității buildului:

```
.env                              src/approvalGate.js
src/config.js                     src/ceo/evolution/guardian.js
src/ceo/evolution/contract.js     codex/CONSTITUTIE
codex/founder                     src/supervisor/opsdb.js
src/ceo/nervous/operationalWrite.js
```

Logica listei: secretele, poarta de aprobare, propriul contract, propriul gardian,
constituția, ADN-ul fondatorului și singura suprafață de scriere către Operational.
**Gardianul nu poate fi modificat de cel pe care îl păzește.**

## 4. Interfața generică CODE_AGENT_PROVIDER (§32 — nu hardcodăm un motor)

`codeAgentOrchestrator` vorbește cu un **provider abstract**, nu cu un produs anume.
Orice motor de cod (Claude Code, alt agent, un om) este un provider valid dacă implementează:

| Metodă | Contract |
|---|---|
| `build(spec, branch, limits)` | Primește specificația CR + branch-ul sandbox + limitele §28; lucrează exclusiv în branch |
| `report()` | Returnează artefactul obligatoriu: diff, rezultate teste, security scan, riscuri, acceptance, recomandare |
| `abort(reason)` | Oprire curată la depășirea limitelor sau la kill de la fondator (§27) |

Reguli: providerul **nu primește secrete**, nu primește acces de scriere în afara branch-ului,
și este tratat ca **untrusted** — tot ce produce trece prin `qualityGate` + `guardian`,
indiferent cine e providerul. Schimbarea providerului nu schimbă nicio regulă de securitate.

## 5. §33 — External knowledge: nu inventăm endpoint-uri

Când buildul are nevoie de cunoștințe externe (un API terț, un format de fișier):

1. Se folosesc **exclusiv surse oficiale** (documentația publică a furnizorului), citate în raport.
2. **Niciun endpoint, parametru sau schemă nu se inventează.** Un API nedocumentat sau incert
   → câmp `unknowns` în raport + eventual `KNOWLEDGE_GAP` separat — nu cod „probabil corect".
3. Credențialele pentru servicii externe nu se generează și nu se ghicesc: lipsa lor este
   `BLOCKED` cu cerință explicită către fondator.
4. Cunoștințele externe folosite se consemnează în artefactul de build (trasabilitate),
   ca reviewerul uman să poată verifica sursa, nu doar rezultatul.
