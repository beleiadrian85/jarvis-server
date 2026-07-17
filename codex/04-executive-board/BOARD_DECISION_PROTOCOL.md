# BOARD DECISION PROTOCOL — Protocolul de Decizie al Board-ului

> Cum se convoacă Board-ul, ce declanșează o ședință, cum se rezolvă dezacordul
> și cum arată rezultatul.
>
> **Stare:** PROIECTAT, NEACTIVAT.

---

## 1. Când se convoacă Board-ul

- **La cerere explicită** a lui Adrian („consiliu", „board", „ce ziceți de...").
- **Automat, la prag de impact:** decizii cu impact estimat **> 50.000 EUR**
  (prag deja existent în `src/council.js` prin `impactOver50k`).
- **La cerere a sistemului**, când detectează o decizie cu efect ireversibil sau
  cu risc pe o prioritate superioară (lichiditate, juridic). În etapa curentă,
  sistemul doar *propune* convocarea; nu o forțează.

## 2. Intrarea

O convocare are nevoie de:
- **întrebarea/decizia** formulată clar;
- **datele** relevante colectate read-only din OPERATIONAL + memorie + reminders;
- **contextul** (proiect, sume, termene, părți implicate).

Dacă datele esențiale lipsesc, Board-ul nu inventează — marchează „date lipsă" și
recomandă ce trebuie aflat înainte de decizie.

## 3. Deliberarea

- Toate perspectivele rulează într-**un singur apel structurat** (disciplină de tokeni).
- Fiecare rol își dă poziția independent (vezi [`BOARD_ROLES.md`](BOARD_ROLES.md)).
- Pozițiile trec prin filtrul [`FOUNDER_DNA`](../02-founder-dna/FOUNDER_DNA.md).

## 4. Rezolvarea dezacordului

1. Se aplică ierarhia de priorități (cash > profit; juridic > viteză; companie > confort).
2. Dacă două priorități de rang egal se ciocnesc, Board-ul **nu forțează** un
   verdict — prezintă trade-off-ul clar și lasă decizia la Adrian.
3. Un risc ireversibil marcat de Analistul de risc coboară automat recomandarea
   spre AMÂNĂ, cu explicație.

## 5. Ieșirea — recomandare structurată

Board-ul întoarce, obligatoriu:

```
RECOMANDARE: DA / NU / AMÂNĂ
MOTIV PRINCIPAL: (1–2 fraze, cu cifre)
CE SUSȚINE: (pozițiile favorabile, pe scurt)
CE SE OPUNE: (pozițiile rezervate/împotrivă, pe scurt)
RISCUL PRINCIPAL: (din unghiul Analistului de risc)
CE AR SCHIMBA DECIZIA: (date lipsă / condiții)
IMPACT ESTIMAT: (cash / profit / juridic / execuție)
```

## 6. După decizie

- Decizia lui Adrian se scrie în registrul de decizii (`decisions` în DB / audit).
- Se stabilește un **termen de revizuire** (când re-evaluăm dacă a fost bună).
- Rezultatul real se compară ulterior cu recomandarea → învățare (etapa 13 din
  [Change Control](../15-security-engine/CHANGE_CONTROL.md)).

## 7. Limite (linii roșii)

- Board-ul **nu execută** nimic. Recomandă.
- Board-ul **nu atinge plăți** (Nivel 4 exclus).
- Board-ul **nu scrie** în OPERATIONAL.
- Board-ul rulează **gated**, implicit oprit, până la aprobarea lui Adrian.
