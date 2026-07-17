# BOARD ARCHITECTURE — Arhitectura Executive Board

> Cum este construit Executive Board-ul: ce este, ce nu este, cum funcționează
> și cum se leagă de JARVIS și OPERATIONAL.
>
> **Stare:** PROIECTAT — implementat GATED, flag implicit OFF, neactivat în producție.
> Activarea trece prin [Change Control](../15-security-engine/CHANGE_CONTROL.md)
> și prin aprobarea explicită a lui Adrian.

---

## 1. Ce este Executive Board-ul

Un **organ consultativ** format din 12 perspective executive care analizează o
decizie complexă și produc o recomandare structurată pentru Adrian. Este
evoluția guvernată a Consiliului AI existent (`src/council.js`): aceleași
principii — perspective multiple, un singur apel LLM — dar cu roluri
formalizate, protocol de decizie, protecții deterministe și urmă completă de
audit.

Boardul **sfătuiește**. Nu decide și nu execută.

## 2. Ce NU este

- **Nu decide.** Fiecare recomandare are `founder_decision_required: true`. Decidentul final este Adrian Belei.
- **Nu execută.** Boardul nu scrie în OPERATIONAL, nu trimite mesaje, nu declanșează acțiuni. `approvalGate` rămâne **singura** poartă pentru acțiuni cu efect și nu este modificat.
- **Nu atinge plățile.** Deciziile de Nivel 4 (plăți) sunt excluse total din competența Boardului.
- **Nu are veto asupra fondatorului.** Guardian poate opri emiterea unei recomandări incomplete sau neconforme, dar nu poate anula decizia lui Adrian. Dacă Boardul recomandă unanim NU, Adrian poate demonta argumentele și decide DA — caz în care se aplică obligatoriu limite de capital, timp, risc și criterii de oprire (stop conditions).
- **Nu inventează cifre.** Datele vin determinist din sistemele existente, înainte de apelul LLM; sursele sunt etichetate; date esențiale lipsă → `insufficient_data`.
- **Nu este un al doilea chatbot** și nu rulează în producție cât timp flag-ul e OFF.

## 3. Cele 12 roluri

Definițiile complete (mandat, personalitate, ce refuză să facă) sunt în
[`BOARD_ROLES.md`](BOARD_ROLES.md). Enumerarea oficială, cu întrebarea
definitorie a fiecărui director:

| # | Rol | Caracter | Întrebarea definitorie |
|---|-----|----------|------------------------|
| 1 | **CEO AI** — Chairman și sintetizator | calm, strategic, echilibrat; sintetizează, nu domină artificial discuția; caută adevărul, nu consensul | „Care este decizia care protejează și dezvoltă cel mai bine compania?" |
| 2 | **CFO** — financiar și capital | conservator, precis, bazat pe cifre; separă profitul de cash; verifică lichiditatea, finanțarea și costul capitalului | „Ne permitem și ce sacrificăm pentru această decizie?" |
| 3 | **COO** — execuție și capacitate operațională | pragmatic, orientat spre execuție; verifică oameni, termene, procese și dependențe | „Cine execută, cu ce resurse și până când?" |
| 4 | **CRO** — risc și scenarii de eșec | pesimist constructiv; caută riscurile ascunse, construiește scenarii de eșec; nu spune doar NU — propune limitarea riscului | „Ce nu vedem și cât ne poate costa?" |
| 5 | **CLO** — juridic și conformitate | riguros; verifică legalitatea și obligațiile; separă imposibilitatea legală de dificultatea operațională | „Este legal, conform și apărat contractual?" |
| 6 | **CHRO** — oameni, cultură și capacitate | orientat spre oameni; urmărește caracterul, capacitatea, efortul și impactul net; nu confundă funcția cu valoarea; recomandă mentorat înainte de înlocuire când este rezonabil | „Cum afectează oamenii și capacitatea companiei?" |
| 7 | **CMO** — marketing, brand și piață | creativ, optimist controlat; analizează percepția pieței, brandul și autenticitatea | „Cum va înțelege și percepe piața această decizie?" |
| 8 | **CSO** — vânzări și comportament comercial | comercial, realist, orientat spre conversie, negociere și client; nu promite ce nu depinde de companie | „Cine cumpără, de ce cumpără și de ce ar refuza?" |
| 9 | **CTO** — tehnologie, automatizare și arhitectură | tehnic; simplifică, preferă reutilizarea, evită complexitatea inutilă; nu automatizează procese greșite | „Poate fi implementat sigur, simplu și scalabil?" |
| 10 | **Innovation Officer** — alternative și „soluția a șaptea" | caută metode neconvenționale; analizează minimum șase scenarii și încearcă să găsească soluția a șaptea; adaptează ideile, nu le copiază mecanic | „Care este alternativa pe care încă nu am văzut-o?" |
| 11 | **Guardian** — protecția CODEX | calm, neemoțional; apără CODEX; verifică etica, adevărul, responsabilitatea și protecția companiei. **DETERMINIST — implementat în cod, nu LLM** | „Respectă această decizie CODEX și poate deveni o regulă sănătoasă?" |
| 12 | **Founder Voice** — ADN-ul și experiența fondatorului | reprezintă experiența și ADN-ul lui Adrian; nu îl imită teatral, nu inventează opinii; citează **doar** principii documentate ([`FOUNDER_DNA`](../02-founder-dna/FOUNDER_DNA.md)) și semnalează când lipsesc informații despre preferința fondatorului. **DETERMINIST — implementat în cod, nu LLM** | „Cum se aliniază această decizie cu experiența și principiile fondatorului?" |

## 4. Fluxul unei ședințe de Board

```
Întrebare / decizie complexă (Adrian sau prag automat)
        │
        ▼
Clasificare tip decizie ──────── decisionEngine.js (determinist)
        │
        ▼
Selecție directori ───────────── doar rolurile relevante tipului de decizie
        │
        ▼
Colectare date deterministe ──── riskEngine, cashForecast, healthScore,
        │                        predictionState, memory (înainte de LLM,
        │                        surse etichetate, zero cifre inventate)
        ▼
UN apel LLM structurat ───────── directorii LLM emit poziții individuale
        │                        { position, confidence, arguments[],
        │                          evidence[], risks[], conditions[],
        │                          alternatives[], unanswered_questions[] }
        ▼
Founder Voice + Guardian ─────── verificări DETERMINISTE, în cod:
        │                        aliniere FOUNDER_DNA + conformitate CODEX
        ▼
Sinteză CEO ──────────────────── consensus_level, major_disagreements[]
        │                        (dezacordurile NU se falsifică)
        ▼
Validare structură ───────────── boardValidator; structură invalidă sau
        │                        neconformă → NU se emite recomandarea
        ▼
Recomandare structurată ──────── DA / NU / AMÂNĂ / DATE_INSUFICIENTE
        │                        + conditions[], risk_limits[],
        │                        stop_conditions[], codex_compliance,
        │                        data_quality, confidence, contradicts_prior
        ▼
Decizia lui Adrian ───────────── founder_decision_required: true, întotdeauna
        │
        ▼
Audit ────────────────────────── ședința completă în audit_log (audit.js,
                                 fără schimbare de schemă DB)
```

Selecția directorilor (nu se convoacă toți pentru orice întrebare):

| Tip decizie | Directori convocați |
|-------------|---------------------|
| Investiție majoră | CEO, CFO, COO, CRO, CLO, CSO, CMO, Guardian, Founder Voice, Innovation |
| Angajare / concediere | CEO, COO, CHRO, CFO, Guardian, Founder Voice |
| Modificare tehnică | CEO, CTO, COO, CRO, Guardian |
| Campanie marketing | CEO, CMO, CSO, CFO, CRO |
| Contract | CEO, CLO, CFO, COO, CRO |
| General (implicit) | CEO, CFO, COO, CRO, Guardian |

Mecanismul complet de decizie (structura pozițiilor, sinteza, contradicțiile cu
decizii anterioare) este specificat în
[`BOARD_DECISION_PROTOCOL.md`](BOARD_DECISION_PROTOCOL.md).

## 5. Harta integrării cu sistemele existente

Boardul **reutilizează**, nu rescrie. Fiecare sistem existent își păstrează
rolul; Boardul doar le citește:

| Sistem existent | Funcție | Rol în Board |
|-----------------|---------|--------------|
| `riskEngine.js` (`assessRisks`) | evaluare riscuri | date pentru CRO |
| `financialBrain` / `cashForecast` (`buildForecast`, `getObligations`) | prognoză cash și obligații | date pentru CFO |
| `healthScore.js` (`computeHealth`) | scor de sănătate al firmei | context pentru CEO |
| `predictionState.js` (`buildPredictionState`) | stare agregată (obligații + taskuri + vânzări), cu timeout și cache | starea de intrare a ședinței |
| `decisionEngine.js` | clasificarea deciziilor | clasificare tip decizie → selecție directori |
| `approvalGate` | poarta de aprobare a acțiunilor | **singura** poartă pentru efecte — NEMODIFICAT |
| `audit.js` | jurnal de audit | înregistrarea ședinței în `audit_log` (fără schimbare de schemă DB) |
| `memory.js` (`recall`, `listDecisions`) | memorie și decizii anterioare | context + verificarea `contradicts_prior` |
| `council.js` | Consiliul AI existent | rămâne funcțional când flag-ul e OFF; migrare graduală |
| `capabilities.js` | declararea capabilităților | declară starea Board: activ / shadow / inactiv |

## 6. Modurile de funcționare

Controlate prin `EXECUTIVE_BOARD_ENABLED` (implicit OFF) și
`EXECUTIVE_BOARD_SHADOW_MODE`:

| Mod | Comportament |
|-----|--------------|
| **OFF** (implicit) | Comportament identic cu cel de azi. `council.js` neatins, Boardul nu rulează deloc. |
| **SHADOW** | Boardul rulează în paralel, analiza se scrie **doar** în `audit_log`. Răspunsul către utilizator rămâne neschimbat, zero notificări, zero acțiuni. Mod de calibrare și comparație. |
| **ACTIVE** | Raportul Board înlocuiește răspunsul Consiliului. Rămâne strict consultativ: `founder_decision_required: true`, nicio execuție. |

Tranziția OFF → SHADOW → ACTIVE se face gradual, fiecare pas cu aprobarea lui
Adrian.

## 7. Legătura cu Consiliul AI existent (`src/council.js`)

JARVIS are deja o formă embrionară de Board: **Consiliul AI** (`src/council.js`),
care generează cinci perspective (CFO, expert contabil, jurist, dezvoltator
imobiliar, bancher) într-un singur apel structurat, cu recomandare finală
DA/NU/AMÂNĂ, declanșat la comanda „consiliu" sau la decizii cu impact
> 50.000 EUR.

Executive Board-ul CODEX este **evoluția guvernată** a acestui Consiliu:

- aceleași principii (perspective multiple, un singur apel LLM), dar cu 12
  roluri formalizate și protocol de decizie explicit;
- filtrat prin [`FOUNDER_DNA`](../02-founder-dna/FOUNDER_DNA.md) și protejat de
  Guardian (determinist);
- cu ieșire structurată, validată și trasabilă în audit.

Migrarea se face controlat, fără regresie: cât timp `EXECUTIVE_BOARD_ENABLED`
este OFF, Consiliul funcționează exact ca astăzi. Consiliul nu se șterge decât
după ce modul ACTIVE este validat în producție.

## 8. Implementarea (`src/executiveBoard/`)

Module mici, cu separare de responsabilități. Nimic din `src/` existent nu se
rescrie:

| Modul | Responsabilitate |
|-------|------------------|
| `index.js` | punct de intrare; verifică flag-urile; expune `runBoardSession()` |
| `boardRouter.js` | clasificare tip decizie (via `decisionEngine`) → selecția directorilor |
| `boardRoles.js` | definițiile celor 12 roluri: mandat, caracter, întrebare definitorie |
| `boardSession.js` | orchestrarea ședinței: colectare date deterministe, apelul LLM unic, timeout și fallback |
| `boardSynthesis.js` | sinteza CEO: consensus_level, major_disagreements, recomandarea finală |
| `boardValidator.js` | validarea structurii de ieșire; structură invalidă → recomandarea NU se emite |
| `founderVoice.js` | **determinist** — citește principiile documentate din FOUNDER_DNA; nu inventează opinii; semnalează lipsa informațiilor despre preferința fondatorului |
| `guardian.js` | **determinist** — verificare conformitate CODEX; poate bloca emiterea unei recomandări neconforme |
| `prompts.js` | prompturile structurate ale directorilor LLM, per rol și per tip decizie |

## 9. Principii de siguranță și cost

1. **Un singur apel LLM per ședință.** Disciplina de tokeni din constituție se păstrează.
2. **Roluri limitate după tipul deciziei.** Nu se convoacă toți directorii pentru orice întrebare.
3. **Date deterministe înainte de LLM.** Cifrele vin din sistemele existente, cu surse etichetate; zero cifre inventate.
4. **Cache.** Aceeași analiză nu se repetă dacă datele nu s-au schimbat.
5. **Timeout și fallback.** Un director eșuat nu blochează ședința — perspectiva se marchează lipsă.
6. **Validare strictă.** Structură invalidă detectată de Guardian/validator → nu se emite recomandare finală.
7. **Onestitate asupra datelor.** Date esențiale lipsă → `insufficient_data`, nu ghicire.
8. **Zero execuție.** Boardul nu execută acțiuni; `approvalGate` rămâne singura poartă pentru efecte; plățile (Nivel 4) sunt excluse total.
9. **Gated.** Flag implicit OFF; comportamentul de azi nu se schimbă până la activarea explicită.
10. **Trasabilitate.** Fiecare ședință lasă urmă completă în `audit_log`.
