# IMPROVEMENT ENGINE — System Improvement Proposal

> **STARE: PROIECTAT — infrastructură de propunere, zero auto-modificare.**
> Implementare: `src/ceo/improvementEngine.js` · Propunerile sunt generate și stocate, **niciodată aplicate automat**. Orice schimbare de sistem trece prin [Change Control](../15-security-engine/CHANGE_CONTROL.md).

> **Poziționare:** Improvement Engine este mecanismul prin care CEO AI își semnalează propriile limite și propune îmbunătățiri ale sistemului — fără să le execute. Este perechea „spre exterior" a [Self-Audit](SELF_AUDIT.md)-ului: Self-Audit constată starea sistemului, Improvement Engine transformă constatările recurente în propuneri formale. Consumă semnale din [21 — Observation Engine](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md), gap-uri din [Data Gap Engine](DATA_GAP_ENGINE.md) și lecții din [Closed Loop](CLOSED_LOOP.md); livrează pe masa fondatorului prin [23 — Founder Attention](../23-founder-attention/FOUNDER_ATTENTION_ARCHITECTURE.md).

---

## 1. Scop

Un CEO bun nu doar conduce compania cu instrumentele pe care le are — observă **unde instrumentele nu ajung** și cere unele mai bune. Improvement Engine face exact asta pentru CEO AI:

1. **Detectează limita.** Un gap de date recurent, un conector fragil, o verificare manuală repetată, o decizie blocată în `DATA_REQUIRED` — orice frecare sistematică între ce ar trebui să știe CEO AI și ce știe efectiv.
2. **O formalizează.** Limita devine un **System Improvement Proposal** — un document standard, complet, evaluabil de un om în două minute.
3. **Se oprește.** Propunerea așteaptă. Nimic nu se implementează, nu se instalează, nu se configurează. Decizia este a lui Adrian; implementarea este a lui Claude Code.

Principiul din faza-mamă (CEO AI OPERATIONAL INTELLIGENCE) se aplică integral: **propunere ≠ execuție, recomandare ≠ aprobare, aprobare ≠ rezultat verificat.**

---

## 2. Regula absolută — zero self-modification

> **CEO AI NU își modifică singur codul în producție. Niciodată. Sub nicio formă.**

| Rol | Ce face | Ce NU face |
|---|---|---|
| **CEO AI (Improvement Engine)** | Detectează problema, adună dovezi, redactează propunerea | Nu scrie cod, nu face deploy, nu schimbă config, nu instalează conectori |
| **Adrian** | Citește propunerea, decide: APPROVE / MODIFY / REJECT / DEFER | Nu este ocolit, nu este pus în fața faptului împlinit |
| **Claude Code** | Implementează propunerea aprobată, cu testare și deploy controlat | Nu implementează nimic neaprobat |

Fluxul este cel din [Change Control (15 — Security Engine)](../15-security-engine/CHANGE_CONTROL.md) și nu poate fi scurtcircuitat:

```
Improvement Engine detectează → SYSTEM IMPROVEMENT PROPOSAL
   → Adrian aprobă / modifică / respinge
   → Claude Code implementează → testare → deploy controlat
   → Self-Audit verifică efectul → Closed Loop stochează lecția
```

Consecințe practice ale regulii:

- `improvementEngine.js` nu are acces la scriere pe propriul repo, pe env vars sau pe infrastructura de deploy.
- O propunere aprobată **nu** declanșează nimic automat — aprobarea este semnalul pentru Claude Code (sesiune umană), nu pentru un executor mașină.
- Chiar și îmbunătățirile „triviale" (un prag, un text, un interval de cron) urmează același flux. Nu există categoria „prea mic pentru aprobare".
- Învățarea rămâne **auditabilă în date** (`jarvis_state` + audit, conform [Closed Loop](CLOSED_LOOP.md)), niciodată în cod auto-generat.

---

## 3. Structura canonică — SYSTEM IMPROVEMENT PROPOSAL

Orice propunere, fără excepție, are exact aceste secțiuni, în această ordine:

| # | Secțiune | Conținut obligatoriu | Testul de calitate |
|---|---|---|---|
| 1 | **Problem** | Ce limită concretă are sistemul azi, formulată operațional, nu tehnic | Adrian înțelege problema fără să vadă cod |
| 2 | **Evidence** | Dovezi din date: de câte ori a apărut, când, cu ce efect (observații, gap-uri, erori din Self-Audit) | Fiecare afirmație are o sursă verificabilă; zero anecdote |
| 3 | **Business value** | Ce decizie devine posibilă / mai bună / mai rapidă dacă problema dispare | Legătura cu bani, timp sau risc este explicită |
| 4 | **Proposed change** | Schimbarea propusă, cu alternative dacă există (de la cea mai simplă la cea mai completă) | Un om poate spune „da" sau „nu" pe fiecare variantă |
| 5 | **Affected system** | Ce componente sunt atinse: module `src/ceo/`, conectori, Operational, joburi, oameni | Niciun efect colateral nedeclarat |
| 6 | **Risk** | Ce se poate strica, ce date sunt expuse, reversibilitate | Include întotdeauna scenariul „nu facem nimic" |
| 7 | **Estimated complexity** | S / M / L + estimare onestă de efort și dependențe | Fără optimism artificial; necunoscutele sunt declarate |
| 8 | **Expected benefit** | Rezultatul măsurabil așteptat + **cum verificăm după implementare** că a apărut | Există o regulă de verificare, nu doar o speranță |
| 9 | **Approval required** | Cine aprobă (Adrian — întotdeauna pentru schimbări de sistem) și ce anume se aprobă exact | Aprobarea are un obiect precis, nu un „ok general" |

Reguli de redactare:

- **Datele lipsă rămân lipsă.** Dacă Evidence nu poate cuantifica impactul, scrie `UNKNOWN` — nu se inventează cifre (regula „date lipsă ≠ zero").
- **O propunere = o problemă.** Problemele multiple se despart în propuneri separate, prioritizabile independent.
- **Propunerile concurente se leagă.** Dacă două propuneri rezolvă aceeași problemă pe căi diferite, sunt prezentate împreună, ca alternative în aceeași secțiune Proposed change.
- Propunerile cu impact strategic pot fi pre-analizate de [Executive Board](../04-executive-board/BOARD_ARCHITECTURE.md) (în regimul de gating existent) înainte de a ajunge la Adrian — dar Board-ul **recomandă**, nu aprobă.

---

## 4. Exemplul canonic — soldul bancar

Problema cea mai valoroasă și cea mai simplă de înțeles din COMPANY INSTANCE #1: CEO AI nu cunoaște soldul bancar curent, deci [Cash Intelligence](CASH_INTELLIGENCE.md) pornește de la `BANK BALANCE = UNKNOWN`.

**SYSTEM IMPROVEMENT PROPOSAL — SIP-001: Sold bancar conectat**

| Secțiune | Conținut |
|---|---|
| **Problem** | CEO AI nu are acces la soldurile bancare curente. Proiecția de lichiditate (azi/7/14/21/30/60/90 zile) pleacă de la o componentă `UNKNOWN`, deci orice recomandare de cash este marcată incompletă. |
| **Evidence** | Domeniul `BANK` din [Company Data Map](COMPANY_DATA_MAP.md) = `NOT_CONNECTED`; Data Gap Engine a marcat gap-ul ca PERMANENT; fiecare rulare Cash Intelligence din shadow a produs `PROJECTED LIQUIDITY = UNKNOWN`; digestul zilnic nu poate răspunde la „câți bani avem?". |
| **Business value** | Deblochează întregul model de cash: proiecții reale de lichiditate, alerte de deficit înainte să apară, decizii de plăți/angajamente pe cifre, nu pe memorie. Cea mai mare creștere unitară posibilă a Company Data Health Score. |
| **Proposed change** | Patru variante, de la cea mai simplă la cea mai completă: **(a)** câmp „sold bancar" în Operational, completat manual de Dana la un interval agreat; **(b)** formular Excel periodic de la Dana (deja trimis — de integrat la întoarcere), importat automat; **(c)** export CSV/MT940 din internet banking, depus într-un folder monitorizat și parsat; **(d)** integrare API bancar / agregator PSD2 (read-only), sincronizare automată zilnică. Recomandare: start cu (a) sau (b) săptămâna aceasta, migrare către (d) când merită efortul. |
| **Affected system** | `companyDataMap.js` (BANK → CONNECTED/PARTIAL), `cashIntelligence.js` (sursa BANK BALANCE), Operational (câmp/import nou), eventual un conector nou; procesul de lucru al Danei. |
| **Risk** | (a)/(b): date învechite între actualizări — se afișează întotdeauna vârsta datei (FRESHNESS), niciodată prezentată ca „acum". (c)/(d): expunere de date financiare — acces strict read-only, fără inițiere de plăți (plățile sunt excluse total din sistem), credențiale doar în env pe server, niciodată în cod sau în CODEX. Reversibilitate: completă pentru toate variantele. |
| **Estimated complexity** | (a) S — o zi; (b) S/M — 1–2 zile după primirea formularului; (c) M; (d) L + dependență de banca/agregatorul ales. |
| **Expected benefit** | `BANK = CONNECTED`, `PROJECTED LIQUIDITY` calculabilă pe toate orizonturile. **Verificare post-implementare:** 7 zile consecutive în care Self-Audit raportează sold cu FRESHNESS sub pragul agreat și digestul include cifra de cash fără mențiunea `UNKNOWN`. |
| **Approval required** | Adrian — alegerea variantei (a/b/c/d), intervalul de actualizare și, pentru (c)/(d), acordul explicit de acces read-only la datele bancare. Implementare: Claude Code, după aprobare. |

Acest exemplu este șablonul viu: orice propunere viitoare care nu atinge nivelul lui de concretețe se întoarce în lucru, nu pleacă spre Adrian.

---

## 5. Ciclul de viață al unei propuneri

```
DRAFT → READY → PRESENTED → (APPROVED | MODIFIED | REJECTED | DEFERRED)
                                 │
                                 ▼ (doar APPROVED / MODIFIED)
                       IMPLEMENTING (Claude Code, Change Control)
                                 │
                                 ▼
                        VERIFIED → LESSON STORED (Closed Loop)
```

| Stare | Semnificație | Cine mută starea |
|---|---|---|
| DRAFT | Propunere generată, incompletă sau fără dovezi suficiente | Improvement Engine |
| READY | Toate cele 9 secțiuni complete, verificabile | Improvement Engine |
| PRESENTED | Ajunsă la Adrian prin canalul Founder Attention (fără spam — intră în bugetul de atenție din [DAILY_DIGEST_POLICY](../23-founder-attention/DAILY_DIGEST_POLICY.md)) | Founder Attention Gate |
| APPROVED / MODIFIED / REJECTED / DEFERRED | Decizia fondatorului, înregistrată în audit | **Doar Adrian** |
| IMPLEMENTING | În lucru la Claude Code, sub Change Control | Claude Code |
| VERIFIED | Beneficiul așteptat confirmat cu regula de verificare din §8 al propunerii | Self-Audit |
| LESSON STORED | Rezultat + lecție arhivate auditabil | Closed Loop |

O propunere REJECTED nu se re-trimite identic; poate reveni doar cu Evidence nou. O propunere DEFERRED are termen de revenire explicit.

---

## 6. Ce NU este Improvement Engine

- **Nu este un executor.** Nu aplică nimic, nici măcar schimbări „evidente".
- **Nu este un canal de presiune.** Nu repetă aceeași propunere ca să forțeze un „da"; frecvența este limitată de politica de atenție a fondatorului.
- **Nu este evoluție autonomă.** Capitolul [14 — Evolution Engine](../14-evolution-engine) descrie cum evoluează CODEX-ul; acest motor doar alimentează acel proces cu propuneri, sub aceleași gărzi.
- **Nu atinge plățile.** Nicio propunere nu poate introduce, direct sau indirect, capacitatea de a mișca bani — plățile rămân excluse total din sistem.

---

*Documente înrudite: [CHANGE_CONTROL (15)](../15-security-engine/CHANGE_CONTROL.md) · [SELF_AUDIT](SELF_AUDIT.md) · [CLOSED_LOOP](CLOSED_LOOP.md) · [DATA_GAP_ENGINE](DATA_GAP_ENGINE.md) · [COMPANY_DATA_MAP](COMPANY_DATA_MAP.md) · [CASH_INTELLIGENCE](CASH_INTELLIGENCE.md) · [PROPOSAL_ENGINE](PROPOSAL_ENGINE.md) · [21 — Observation Engine](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) · [22 — Proactive CEO](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md) · [23 — Founder Attention](../23-founder-attention/FOUNDER_ATTENTION_ARCHITECTURE.md) · [04 — Executive Board](../04-executive-board/BOARD_ARCHITECTURE.md)*
