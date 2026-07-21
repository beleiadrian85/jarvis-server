# PRODUCTIZATION — CEO AI ca produs generic, Profi Concept ca instanță

> **STARE: PRINCIPIU ACTIV ÎN COD — nucleul din `src/ceo/` este GENERIC; Profi Concept este COMPANY INSTANCE #1, definită exclusiv în `companyConfig.js`.**
> Nu construim încă SaaS. Construim disciplina de separare care face SaaS-ul posibil mai târziu, fără rescriere.

---

## 1. De ce productizare acum

CEO AI Operational Intelligence nu este „un script pentru Profi Concept". Este un **sistem de operare pentru conducerea unei companii**, în care Profi Concept / Bell Residence este prima companie instalată. Dacă numele oamenilor, pragurile de cash sau domeniile de date ar fi hardcodate în motoare, fiecare companie viitoare ar însemna un fork — adică moartea produsului.

Decizia de arhitectură este deci luată **de la prima linie de cod**, nu amânată:

> **REGULA DE AUR: ZERO hardcodare de companie în nucleul generic.**
> Numele companiei, oamenii (Adrian, Dana, Nelu), pragurile, domeniile conectate, tonul și valorile fondatorului — toate vin din configurație. Nucleul nu știe cine este „Adrian"; știe doar că există un rol `FOUNDER` cu un `attentionProfile` (vezi [23-founder-attention](../23-founder-attention/)).

Regulile absolute ale fazei rămân neatinse de productizare: zero acțiuni autonome, propunere ≠ execuție, aprobare ≠ rezultat verificat, date lipsă ≠ zero, approvalGate = singura poartă pentru efecte, plățile excluse total.

## 2. Cele șase straturi

Sistemul se separă în șase straturi cu graniță netă. Un strat de deasupra poate citi straturile de sub el; nucleul nu citește niciodată „în sus".

| # | Strat | Ce conține | Unde trăiește azi | Specific companiei? |
|---|---|---|---|---|
| 1 | **CORE CEO AI** | Motoarele: observare, cash intelligence, sales funnel, people model, decizii 6+1, proposal engine, closed loop, self-audit, improvement engine | `src/ceo/*.js` (logică), `src/observation*`, `src/proactive*` | **NU — generic 100%** |
| 2 | **COMPANY CONFIG** | Numele companiei, oamenii și rolurile lor, pragurile (cash, severitate, escaladare), domeniile active din cele 22, monedă, fus orar | `src/ceo/companyConfig.js` + `companyDataMap.js` | **DA — per instanță** |
| 3 | **FOUNDER DNA** | Valorile, stilul decizional, toleranța la risc, regulile personale ale fondatorului („prima greșeală = învățare, repetarea = problemă de proces"), profilul de atenție | [02-founder-dna](../02-founder-dna/FOUNDER_DNA.md) + praguri în config | **DA — per fondator** |
| 4 | **CONNECTORS** | Adaptoarele către surse: Operational, SmartBill, Gmail, Calendar, GA4, bancă (viitor) — fiecare cu stările `CONNECTED / PARTIAL / NOT_CONNECTED` | `companyDataMap.js` (registru) + tool-urile MCP / API existente | **DA — per instanță** |
| 5 | **POLICIES** | Guvernanța: ce cere aprobare, ce e interzis (plăți), gating pe flag-uri, shadow mode, escaladare Board | `/codex` (00-governance, [04-executive-board](../04-executive-board/BOARD_ARCHITECTURE.md)), approvalGate | **Parțial — schelet generic, valori per instanță** |
| 6 | **UI** | Command Center (`/api/ceo/*`, read-only, PIN), Telegram (digest zilnic), rapoarte | `src/api`, bot Telegram | **Parțial — canale per instanță** |

Testul de puritate al stratului 1: **nucleul trebuie să poată rula pentru o companie fictivă „ACME SRL" schimbând doar straturile 2–4, fără nicio modificare de cod în motoare.** Orice `if (person === 'Adrian')` în motoare este un defect de arhitectură, nu o scurtătură.

## 3. Profi Concept = COMPANY INSTANCE #1

Profi Concept nu este „compania sistemului" — este **prima instanță** a sistemului. Concret:

- `companyConfig.js` declară: numele, oamenii (Adrian = FOUNDER/decident final, Dana = financiar, Nelu = execuție), pragurile, domeniile active, canalele de notificare.
- `companyDataMap.js` este registrul instanței peste cele 22 de domenii (CASH → DECISIONS), cu SOURCE / CONNECTED / FRESHNESS / QUALITY / OWNER / WHAT CEO KNOWS / WHAT CEO DOES NOT KNOW / BUSINESS IMPACT / HOW TO FIX și Company Data Health Score 0–100.
- Motoarele din `src/ceo/` primesc aceste structuri ca **input**, nu le conțin. `cashIntelligence.js` nu știe că banca e BT sau că moneda e RON — știe doar formula de lichiditate proiectată și regula „componentă lipsă → UNKNOWN + Data Gap, niciodată inventată".
- Distincția **ZERO vs NU AM DATE** este proprietate a nucleului (validă pentru orice companie); *care* domenii sunt NOT_CONNECTED este proprietate a instanței.

Ce câștigă Profi Concept din această disciplină chiar dacă nu apare niciodată compania #2: config auditabil într-un singur loc, praguri modificabile fără deploy de logică, și un nucleu testabil izolat de datele reale.

## 4. NEW COMPANY ONBOARDING (conceptual)

Fluxul prin care o companie nouă devine o instanță funcțională. **Țintă: sub 24 de ore** de la primul contact la primul ciclu de observare în shadow. Fiecare pas produce un artefact concret; niciun pas nu sare peste guvernanță.

| Pas | Acțiune | Artefact rezultat | Corespondent Profi Concept |
|---|---|---|---|
| 1 | **Questionnaire** — cine e compania, cine decide, ce doare, ce praguri contează | Draft `companyConfig` | Construit organic în 2025–2026 |
| 2 | **Connectors** — inventarul surselor de date; fiecare domeniu marcat CONNECTED / PARTIAL / NOT_CONNECTED, fără excepție | `companyDataMap` + Data Health Score inițial | Operational, SmartBill, Gmail, GA4 |
| 3 | **Founder DNA** — interviu structurat: valori, stil decizional, toleranță la risc, ce escaladează, ce nu vrea să vadă | Document Founder DNA per fondator | [FOUNDER_DNA.md](../02-founder-dna/FOUNDER_DNA.md) |
| 4 | **Company map** — cele 22 de domenii instanțiate; gap-urile devin Data Gaps explicite (via `dataGapEngine`), nu zone gri | Harta domeniilor + listă gap-uri | `companyDataMap.js` |
| 5 | **Roles** — oamenii, responsabilitățile, cine primește ce (gate de atenție per rol) | Registru roluri în config | Adrian / Dana / Nelu |
| 6 | **Policies** — approvalGate configurat, plățile excluse, flag-urile pe OFF, praguri de escaladare Board | Set de politici activ, totul gated | [00-governance](../00-governance/RULE_ZERO.md) |
| 7 | **First observation** — primul ciclu Observation Engine pe datele reale ale companiei | Primul set de observații + audit | [21-observation-engine](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) |
| 8 | **Shadow learning** — pipeline-ul complet rulează în shadow: episoade executive, gate de atenție, board; zero mesaje reale, zero efecte | Jurnal shadow + calibrare praguri | [22-proactive-ceo](../22-proactive-ceo/) · [23-founder-attention](../23-founder-attention/) · [04-executive-board](../04-executive-board/BOARD_ARCHITECTURE.md) |
| 9 | **Activation** — fondatorul aprobă explicit trecerea din shadow, canal cu canal (digest primul, restul gated) | Flag-uri ON per canal, cu aprobare scrisă | Daily CEO Digest = singurul canal REAL azi |

Regula fluxului: **activarea (pasul 9) nu este niciodată implicită.** O companie poate rămâne în shadow oricât; ieșirea din shadow este o decizie a fondatorului ei, exact cum SHADOW→ENABLED la Executive Board este decizia lui Adrian.

## 5. Ce NU construim încă

Productizarea de acum este **disciplină de arhitectură, nu produs de vânzare**. Explicit în afara scopului:

| NU construim | De ce nu acum |
|---|---|
| SaaS complet (multi-tenant, billing, sign-up, izolare per client) | O singură instanță reală există; multi-tenancy fără al doilea client = complexitate speculativă |
| Panou de onboarding self-service | Onboarding-ul rămâne conceptual (cap. 4) până când nucleul e validat complet pe instanța #1 |
| Marketplace de connectors | Connectors se scriu la cerere, pe registrul `companyDataMap` |
| Infrastructură de scalare (cozi dedicate, sharding) | Railway + arhitectura actuală acoperă instanța #1 |
| Vânzare / pricing / poziționare comercială | Decizie de business a lui Adrian, nu de arhitectură |

Criteriul de trecere spre SaaS real (când și dacă Adrian decide): nucleul rulează instanța #1 fără nicio referință hardcodată la companie, closed loop-ul (`closedLoop.js`) produce lecții auditabile, iar self-audit-ul (`selfAudit.js`) raportează verde susținut. Până atunci, orice propunere de extindere trece prin `improvementEngine` → ApprovalGate → Adrian, ca orice altă schimbare de sistem.

---

*Legături: [21-observation-engine](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) · [22-proactive-ceo](../22-proactive-ceo/) · [23-founder-attention](../23-founder-attention/) · [04-executive-board](../04-executive-board/BOARD_ARCHITECTURE.md) · [02-founder-dna](../02-founder-dna/FOUNDER_DNA.md) · [00-governance](../00-governance/RULE_ZERO.md)*
