# SELF-EVOLUTION & CAPABILITY BUILDER V1 — Arhitectură

> **STARE: PROIECTAT + CONTRACT LIVRAT.** Sursa de adevăr în cod: `src/ceo/evolution/contract.js`.
> Nivel activ: **4** (detectează + specifică + sandbox + validează). **NU deploiază.**
> Politica §22 este ÎNGHEȚATĂ: `PRODUCTION_DEPLOYMENT_REQUIRES_ADRIAN_APPROVAL = true` — constantă, nu flag.

---

## 1. Principiul complet

Organismul își detectează propriile limitări și comandă construirea capabilității lipsă
într-un mediu controlat — **fără să își modifice singur producția**. Lanțul canonic:

```
COMPANY REALITY → NEED (Nervous System V1) → LIMITATION DETECTED → REUSE ANALYSIS
→ GAP CONFIRMED → CAPABILITY REQUEST → SPECIFICATION → SANDBOX BUILD
→ QUALITY VALIDATION → FOUNDER APPROVAL → CONTROLLED DEPLOYMENT
→ OUTCOME VALIDATION → ORIGINAL NEED RE-EVALUATED
```

Bucla se închide obligatoriu la capăt: după deploy se verifică dacă **nevoia originară**
(`origin_need_id`) chiar a fost rezolvată. Capabilitate livrată ≠ nevoie rezolvată.

Ordinea REUSE BEFORE BUILD (§1) este lege: `REUSE_EXISTING_CAPABILITY → EXISTING_COMPANY_DATA
→ EXISTING_CONNECTOR → OFFICIAL_API → CONFIGURATION → STRUCTURED_HUMAN_INPUT → NEW_SOFTWARE`.
Software nou este ultima treaptă, niciodată prima.

## 2. REGULA CENTRALĂ

**JARVIS nu își modifică singur producția.** Codul self-generated trăiește exclusiv în
branch-uri sandbox (`capability/<id>`), trece prin toate porțile de calitate și prin Guardian,
și ajunge în producție **doar** cu aprobarea explicită a fondatorului. Nu există excepții,
nu există flag de ocolire, nu există „low-risk auto-deploy" la nivelul activ curent.

Corolar §26 — *self-evolution is not self-preservation*: obiectivul este **IMPROVE COMPANY
CAPABILITY**, nu IMPROVE AI POWER. Orice Capability Request pornește dintr-o nevoie reală a
companiei (`origin_need_id`), niciodată din nevoia sistemului de a se extinde.

## 3. Componentele (src/ceo/evolution/)

| Componentă | Responsabilitate |
|---|---|
| `gapEngine` | Detectează limitările și le clasifică în cele 9 `GAP_TYPES` sau `PROCESS_FIX_RECOMMENDED` (§19) |
| `capabilityRequest` | Contractul canonic CR: câmpuri obligatorii, lifecycle determinist, dedup §29 |
| `roi` | Prioritizare cost/beneficiu → backlog `NOW / NEXT / LATER` (§17) |
| `graph` | Graful capabilităților: dependențe, ce există deja, ce reutilizează ce |
| `costControl` | Limitele de build §28 (`DEFAULT_BUILD_LIMITS`): buget, concurență, retry |
| `memory` | §30–31: failure learning + memoria capabilităților (KEEP/IMPROVE/DEPRECATE) |
| `parserRegistry` | Registrul parserelor de documente — un parser per tip, reutilizat, nu regenerat |
| `schemaDiscovery` | Descoperă structura datelor/documentelor noi înainte de a cere un parser nou |
| `documentIntake` | Pipeline-ul de ingest §5 + niveluri de încredere §35 + securitate fișiere §34 |
| `codeAgentOrchestrator` | Invocă un Code Agent generic (interfața `CODE_AGENT_PROVIDER`) în sandbox |
| `qualityGate` | Porțile de calitate §13 — toate obligatorii înainte de fondator |
| `guardian` | Verdictele §14 (`PASS / PASS_WITH_CONDITIONS / BLOCK`), căile interzise, permisiunile Code Agent |
| `evolutionCycle` | Orchestratorul ciclului complet, de la nevoie la re-evaluarea nevoii |

## 4. Integrarea cu Nervous System V1

Nervous System V1 (`src/ceo/nervous/`) produce **nevoile** companiei — forma canonică cu
`need_id`, evidence, `material_consequence`. Self-Evolution le consumă ca **input**:

- O nevoie pe care Nervous System **nu o poate satisface** cu capabilitățile existente devine
  candidat de limitare pentru `gapEngine` (ex. `RESPONSIBILITY_UNKNOWN` repetat, date lipsă cronice).
- `origin_need_id` din Capability Request referă exact `need_id`-ul din Nervous — trasabilitate
  completă de la realitatea companiei la codul construit.
- Regula structurală a fazei rămâne neatinsă: FULL READ / TASKS-ONLY WRITE. Self-Evolution
  **nu** adaugă nicio suprafață nouă de scriere către Operational.

## 5. Ce NU este acest sistem

| ESTE | NU ESTE |
|---|---|
| Un constructor de capabilități în sandbox, cu aprobare umană | Self-modifying code în producție |
| Un detector de limitări pornit din nevoi reale | Un generator de „îmbunătățiri" autoservite |
| Un lanț determinist cu porți și audit | O autonomie care se auto-promovează între niveluri |
| GENERIC (§32): zero nume de companie/oameni în nucleu | Un sistem legat de o singură companie sau un singur motor de cod |

---

*Documentele-pereche: protocolul CR, tipurile de gap, modelul de securitate Code Agent,
politica de sandbox, politica de aprobare, memoria, document intake, nivelurile 0–6 și
testele de acceptanță A–O.*
