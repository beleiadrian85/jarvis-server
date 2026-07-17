# BOARD MEETING PROTOCOL — Protocolul unei Ședințe de Board

> Cum se desfășoară o ședință a Executive Board: punctele obligatorii, selecția
> directorilor, ordinea operațiilor, eșecurile tolerate și cazurile în care
> ședința se încheie **fără** recomandare.
>
> **Stare:** PROIECTAT — implementat GATED, flag implicit OFF
> (`EXECUTIVE_BOARD_ENABLED`), neactivat în producție.

---

## 1. Principiu

O ședință de board nu este o conversație — este o **procedură**. Are o intrare
definită, o ordine de operații fixă, o structură de ieșire validată și o urmă
completă în audit. Boardul este **consultativ**: nu decide, nu execută.
Orice acțiune cu efect trece exclusiv prin `approvalGate`. Plățile (Nivel 4)
sunt excluse total din competența Boardului.

---

## 2. Cele 22 de puncte obligatorii ale oricărei ședințe

Nicio ședință nu este completă fără parcurgerea tuturor punctelor de mai jos.
Punctele 1–19 se completează **în ședință**; punctele 20–22 se completează
**ulterior** (vezi §8).

1. Problema
2. Scopul deciziei
3. Datele disponibile
4. Datele lipsă
5. Ipotezele
6. Opțiunile
7. Perspectiva fiecărui director relevant
8. Riscurile
9. Impactul financiar
10. Impactul operațional
11. Impactul uman
12. Impactul legal
13. Impactul asupra brandului și vânzărilor
14. Reversibilitatea
15. Scenariile de succes și eșec
16. Recomandarea sintetizată
17. Nivelul de încredere
18. Condițiile de aprobare
19. Criteriile de oprire
20. Decizia fondatorului *(ulterior)*
21. Rezultatul ulterior *(ulterior)*
22. Lecția învățată *(ulterior)*

Guardian verifică structural prezența punctelor 1–19 înainte de emitere.
Un punct fără conținut real se marchează explicit („date lipsă", „neaplicabil
cu motiv"), nu se lasă gol și nu se umple cu text inventat.

---

## 3. Selecția directorilor

**Regulă: nu se convoacă toți directorii pentru orice întrebare.** Componența
ședinței se determină determinist din tipul deciziei (clasificat de
`decisionEngine.js`), înainte de orice apel LLM. Mai puține roluri = mai puțini
tokeni, răspuns mai rapid, perspective mai relevante.

| Tip decizie | Directori convocați |
|---|---|
| Investiție majoră | CEO, CFO, COO, CRO, CLO, CSO, CMO, Guardian, Founder Voice, Innovation |
| Angajare / concediere | CEO, COO, CHRO, CFO, Guardian, Founder Voice |
| Modificare tehnică | CEO, CTO, COO, CRO, Guardian |
| Campanie marketing | CEO, CMO, CSO, CFO, CRO |
| Contract | CEO, CLO, CFO, COO, CRO |
| General *(implicit)* | CEO, CFO, COO, CRO, Guardian |

Note:
- **CEO AI** prezidează orice ședință (Chairman și sintetizator).
- **Guardian** participă determinist ori de câte ori este convocat — este cod,
  nu LLM; verifică conformitatea cu CODEX și structura ieșirii.
- **Founder Voice** este determinist: citează exclusiv principii documentate
  (`FOUNDER_DNA`), nu inventează poziții ale fondatorului.
- Dacă tipul deciziei nu se potrivește niciunei categorii, se aplică
  componența **General**.

---

## 4. Ordinea operațiilor unei ședințe

Ordinea este fixă și nu se sare peste pași:

| Pas | Operație | Cine / cu ce |
|---|---|---|
| 1 | **Clasificare** — tipul deciziei | `decisionEngine.js` (determinist) |
| 2 | **Selecție** — componența Boardului după tabelul din §3 | determinist |
| 3 | **Date deterministe, cu timeout** — colectare read-only ÎNAINTE de LLM: `riskEngine.assessRisks` (CRO), `financialBrain`/`cashForecast` (CFO), `healthScore.computeHealth` (CEO), `predictionState.buildPredictionState` (stare agregată), `memory.recall` + `listDecisions` (context și decizii anterioare) | motoare existente, cache, timeout per sursă |
| 4 | **Un singur apel LLM** — toate perspectivele directorilor LLM convocați, într-un singur apel structurat | disciplină de cost |
| 5 | **Perspective deterministe** — Guardian (conformitate CODEX, structură) și Founder Voice (principii documentate) se calculează în cod, nu în LLM | determinist |
| 6 | **Sinteză** — CEO AI agregă pozițiile; dezacordurile se raportează, **nu se falsifică**; `consensus_level` și `major_disagreements[]` reflectă realitatea | CEO AI |
| 7 | **Validare** — structura ieșirii, punctele 1–19, zero cifre inventate, surse etichetate, verificarea `contradicts_prior` | Guardian / validator |
| 8 | **Emitere sau blocare** — recomandarea se emite doar dacă validarea trece; altfel ședința se încheie fără recomandare (§6) | Guardian |

În **shadow mode** (`EXECUTIVE_BOARD_SHADOW_MODE`), pașii rulează identic, dar
rezultatul merge doar în audit — răspunsul către utilizator rămâne neschimbat
(produs de `council.js`).

O ședință cu date identice nu se repetă: rezultatul se servește din **cache**
cât timp datele de intrare nu s-au schimbat.

---

## 5. Eșecul unui director

Un director eșuat **nu blochează ședința**:

- Dacă o sursă deterministă de date expiră (timeout) sau eșuează, perspectiva
  directorului respectiv se marchează **„perspectivă lipsă"**, cu motivul.
- Ședința continuă cu directorii rămași.
- Lipsa se reflectă obligatoriu în ieșire: `data_quality` coboară
  (completă → parțială → slabă), iar `confidence` se ajustează în jos.
- Dacă perspectiva lipsă este esențială pentru tipul deciziei (ex. CFO la o
  investiție majoră), recomandarea devine `insufficient_data` sau `AMANA` —
  niciodată un verdict ferm construit pe gol.
- Excepție: eșecul **Guardian** (validatorul determinist) nu se tolerează —
  fără validare, nu se emite recomandare (§6).

---

## 6. Când ședința NU emite recomandare

Ședința se încheie **fără recomandare finală** (se emite doar un raport de
blocare, înregistrat în audit) în oricare din cazurile:

1. **Structură invalidă** — ieșirea LLM nu respectă formatul obligatoriu
   (poziții per director, câmpurile recomandării finale) și nu poate fi
   reparată determinist. Guardian/validatorul blochează emiterea.
2. **Date esențiale lipsă** — punctele critice pentru tipul deciziei nu au
   acoperire în date reale. Verdictul devine `DATE_INSUFICIENTE`, cu lista
   `unanswered_questions[]` și ce trebuie aflat înainte de reconvocare.
3. **Contradicție neexplicată** — recomandarea contrazice o decizie aprobată
   anterior (`memory.listDecisions`), iar `contradicts_prior` nu conține o
   explicație validă (informații noi, context nou sau revizuire explicită).
   O contradicție tăcută nu se emite niciodată.

Blocarea nu este un eșec al sistemului — este sistemul funcționând corect.
Mai bine nicio recomandare decât una incompletă sau neconformă.

---

## 7. Înregistrarea în audit

Fiecare ședință — emisă sau blocată — se înregistrează prin `audit.js` în
`audit_log`, **fără schimbare de schemă DB**:

- tipul deciziei și componența convocată;
- sursele de date folosite (etichetate) și cele eșuate/expirate;
- pozițiile directorilor (inclusiv perspectivele marcate lipsă);
- sinteza CEO AI, `consensus_level`, `major_disagreements[]`;
- verdictul Guardian (validare trecută / blocare + motiv);
- recomandarea finală sau raportul de blocare;
- `founder_decision_required: true` — întotdeauna.

În shadow mode, auditul este **singurul** loc unde analiza Boardului există.

---

## 8. Punctele 20–22 — completare ulterioară

Punctele 20–22 nu se completează la ședință, pentru că nu aparțin Boardului:

| Punct | Cine îl completează | Când |
|---|---|---|
| 20. Decizia fondatorului | Adrian Belei | la momentul deciziei; se scrie în registrul de decizii |
| 21. Rezultatul ulterior | sistemul + fondatorul | la termenul de revizuire stabilit |
| 22. Lecția învățată | fondatorul, asistat de sistem | după evaluarea rezultatului; alimentează `memory` și deciziile viitoare |

Adrian Belei rămâne decidentul final. Dacă Boardul recomandă unanim NU și
Adrian decide DA, decizia se consemnează cu limitele obligatorii de capital,
timp și risc și cu criteriile de oprire — conform
[`BOARD_DECISION_PROTOCOL.md`](BOARD_DECISION_PROTOCOL.md).

---

*Documente conexe: [`BOARD_ARCHITECTURE.md`](BOARD_ARCHITECTURE.md) ·
[`BOARD_ROLES.md`](BOARD_ROLES.md) ·
[`BOARD_DECISION_PROTOCOL.md`](BOARD_DECISION_PROTOCOL.md) ·
[`FOUNDER_DNA.md`](../02-founder-dna/FOUNDER_DNA.md)*
