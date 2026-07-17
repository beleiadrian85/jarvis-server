# BOARD ARCHITECTURE — Arhitectura Executive Board

> Cum este construit Executive Board-ul: ce este, ce nu este, cum se leagă de
> JARVIS și OPERATIONAL.
>
> **Stare:** PROIECTAT, NEACTIVAT. Niciun cod. Se construiește doar după aprobarea
> explicită a lui Adrian, prin [Change Control](../15-security-engine/CHANGE_CONTROL.md).

---

## 1. Ce este Executive Board-ul

Un **set de perspective executive** care analizează o decizie complexă și produc
o recomandare structurată pentru Adrian. Nu este un organ care decide — este un
organ care **sfătuiește**, cu rigoare și din unghiuri diferite, ca un board real.

## 2. Ce NU este

- Nu este un agent autonom care execută.
- Nu este un al doilea chatbot.
- Nu scrie în OPERATIONAL și nu execută plăți.
- Nu ia decizii în locul lui Adrian.
- Nu rulează încă — este documentație de arhitectură.

## 3. Legătura cu ce există deja

JARVIS are deja o formă embrionară de Board: **Consiliul AI** (`src/council.js`),
care generează cinci perspective (CFO, expert contabil, jurist, dezvoltator
imobiliar, bancher) într-un singur apel structurat, cu recomandare finală DA/NU/AMÂNĂ,
declanșat la comanda „consiliu" sau la decizii cu impact > 50.000 EUR.

Executive Board-ul CODEX este **evoluția guvernată** a acestui Consiliu:
- aceleași perspective, dar cu roluri și protocol formalizate (vezi
  [`BOARD_ROLES.md`](BOARD_ROLES.md) și [`BOARD_DECISION_PROTOCOL.md`](BOARD_DECISION_PROTOCOL.md));
- filtrate prin [`FOUNDER_DNA`](../02-founder-dna/FOUNDER_DNA.md);
- cu ieșire trasabilă în registrul de decizii.

Migrarea Consiliului sub Board se face controlat, fără a-l strica pe cel existent.

## 4. Fluxul conceptual (viitor)

```
Întrebare / decizie complexă (Adrian sau prag automat)
        │
        ▼
  Colectare date  ──  OPERATIONAL (read-only) + memorie + reminders
        │
        ▼
  Executive Board  ──  N perspective independente, un singur apel structurat
        │
        ▼
  Filtru FOUNDER_DNA  ──  linii roșii, ierarhie de priorități
        │
        ▼
  Recomandare structurată  ──  DA / NU / AMÂNĂ + argumente + riscuri + cifre
        │
        ▼
  Adrian decide  ──  decizia se scrie în registrul de decizii (audit)
```

## 5. Principii de construcție

1. **Read-only.** Board-ul citește date, nu scrie niciodată direct.
2. **Un singur apel structurat** per analiză (disciplina de tokeni din constituție).
3. **Gated.** Intră în spatele unui flag, implicit oprit.
4. **Non-regresie.** Consiliul existent rămâne funcțional cât timp Board-ul e oprit.
5. **Trasabil.** Fiecare recomandare produce o urmă auditabilă.

## 6. Ce lipsește ca să devină real (backlog, neaprobat)

- Definirea formală a rolurilor și greutății fiecăruia → [`BOARD_ROLES.md`](BOARD_ROLES.md).
- Protocolul de convocare, cvorum și rezolvare a dezacordului →
  [`BOARD_DECISION_PROTOCOL.md`](BOARD_DECISION_PROTOCOL.md).
- Schema de date pentru o „ședință de board" → `../schemas/` (neaplicată în DB).
- Teste → `../tests/`.
- Un flag de mediu dedicat, implicit oprit.
- Aprobarea lui Adrian pentru a începe.
