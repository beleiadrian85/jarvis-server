# BOARD AUTHORITY MATRIX — Matricea de autoritate

> Cine poate ce în jurul Executive Board-ului: decizie, recomandare, sinteză,
> blocare, execuție. Matricea nu creează autoritate nouă — o delimitează pe cea
> existentă.
>
> **Stare:** PROIECTAT — implementat GATED, flag implicit OFF
> (`EXECUTIVE_BOARD_ENABLED`), neactivat în producție.

---

## 1. Principiu

Boardul este un organ **consultativ**. Analizează, argumentează, recomandă.
Nu decide, nu execută, nu plătește. Decizia finală aparține exclusiv lui
Adrian Belei; efectele trec exclusiv prin fluxul existent `approvalGate`,
cu confirmare umană.

## 2. Matricea principală

| Acțiune | Adrian Belei | CEO AI | Guardian | Directori | Board ca întreg | approvalGate |
|---|---|---|---|---|---|---|
| **A decide final** | ✅ DA — singurul decident | ❌ | ❌ | ❌ | ❌ | ❌ |
| **A recomanda** | — (nu e cazul; el decide) | ✅ prin sinteză | ❌ (validează, nu recomandă) | ✅ perspectivă individuală structurată | ✅ recomandare finală (DA / NU / AMÂNĂ / DATE_INSUFICIENTE) | ❌ |
| **A sintetiza** | — | ✅ DA — Chairman; sintetizează fără a falsifica dezacordurile | ❌ | ❌ | — | ❌ |
| **A bloca emiterea unei recomandări incomplete / neconforme** | ✅ (poate opri orice) | ❌ | ✅ DA — determinist, împreună cu `boardValidator` | ❌ | ❌ | ❌ |
| **A anula decizia fondatorului** | — | ❌ **NIMENI** | ❌ **NIMENI** | ❌ **NIMENI** | ❌ **NIMENI** | ❌ **NIMENI** |
| **A executa acțiuni cu efect** | ✅ prin confirmare în fluxul existent | ❌ | ❌ | ❌ | ❌ **NIMENI din Board** | ✅ SINGURA poartă — flux existent, nemodificat, cu confirmare umană |
| **Plăți (Nivel 4)** | ✅ doar el, prin fluxul existent | ❌ EXCLUS | ❌ EXCLUS | ❌ EXCLUS | ❌ **EXCLUS TOTAL** | flux existent Nivel 4, neatins de Board |

## 3. Delimitări de autoritate

| Regulă | Formulare |
|---|---|
| **CEO AI fără veto** | CEO AI conduce ședința și sintetizează, dar **nu are drept de veto asupra fondatorului**. Sinteza lui este o recomandare, nu o decizie. |
| **Guardian oprește recomandări, nu decizii** | Guardian (determinist, în cod) poate opri **emiterea** unei recomandări incomplete, invalide structural sau neconforme cu CODEX. **Nu poate anula și nu poate bloca o decizie a fondatorului.** |
| **boardValidator** | Validatorul de structură are aceeași autoritate ca Guardian pe acest punct: structură invalidă → recomandarea finală **nu se emite**. |
| **Directori** | Fiecare director emite doar propria perspectivă structurată (position, confidence, argumente, riscuri, condiții). Un director eșuat nu blochează ședința — perspectiva se marchează lipsă. |
| **Board ca întreg** | Produce o recomandare cu `founder_decision_required: true` întotdeauna. Nu există nicio cale prin care recomandarea să devină acțiune fără Adrian. |
| **approvalGate** | Rămâne **singura** poartă pentru acțiuni cu efect. Boardul nu primește niciun canal nou către execuție. |

## 4. Override-ul fondatorului (F27–F28)

Dacă Boardul recomandă **NU în unanimitate**, Adrian poate demonta argumentele
și decide **DA**. Override-ul este legitim, dar **condiționat obligatoriu**:

| Condiție obligatorie la override | Conținut |
|---|---|
| Limită de capital | Suma maximă expusă deciziei |
| Limită de timp | Orizontul până la care decizia se reevaluează |
| Limită de risc | Pragul de pierdere / expunere acceptat |
| Criterii de oprire (stop conditions) | Semnale concrete la care execuția se oprește, definite înainte de start |

Override-ul fără aceste limite **nu se înregistrează ca decizie validă** în
registrul de decizii. Guardian semnalează lipsa lor — dar, conform §3, nu
poate anula decizia în sine.

## 5. Relația cu nivelurile de autoritate 1–4

Nivelurile de autoritate existente (1–4, cu Nivelul 4 = plăți) **rămân
neatinse**. Boardul este un strat consultativ **PESTE** ele, nu în locul lor:

- clasificarea deciziei rămâne în `decisionEngine`;
- aprobările și confirmarea umană rămân în `approvalGate`;
- plățile (Nivel 4) sunt **excluse total** din perimetrul Boardului — Boardul
  nu le analizează spre execuție, nu le recomandă spre auto-aprobare și nu
  are vizibilitate de execuție asupra lor;
- în shadow mode (`EXECUTIVE_BOARD_SHADOW_MODE`), analiza Boardului merge doar
  în audit, iar răspunsul către utilizator rămâne neschimbat.

## 6. Rezumat într-o frază

Adrian decide, Boardul recomandă, CEO AI sintetizează, Guardian și
`boardValidator` opresc recomandări defecte, `approvalGate` execută cu
confirmare umană — și nimeni, niciodată, nu anulează decizia fondatorului.

---

*Vezi și: [`BOARD_ARCHITECTURE.md`](BOARD_ARCHITECTURE.md),
[`BOARD_ROLES.md`](BOARD_ROLES.md),
[`BOARD_DECISION_PROTOCOL.md`](BOARD_DECISION_PROTOCOL.md),
[`FOUNDER_DNA.md`](../02-founder-dna/FOUNDER_DNA.md).*
