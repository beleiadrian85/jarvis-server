# DECISION LOG — Registrul Deciziilor de Arhitectură CODEX

> Fiecare decizie de arhitectură, fiecare conflict CODEX ↔ cod și fiecare activare
> controlată se scrie aici. Append-only în spirit: nu se șterg intrări; deciziile
> revizuite se marchează „revizuită de #N".
>
> Acesta este registrul de guvernanță CODEX (arhitectură). Registrul deciziilor de
> business ale firmei trăiește în DB (`decisions`) și în audit — sunt lucruri diferite.

---

## Format al unei intrări

```
### #N — Titlu scurt
- Dată: YYYY-MM-DD
- Tip: arhitectură | conflict | activare | amendare
- Context: ce a dus la decizie
- Opțiuni considerate: A / B / C
- Decizie: ce s-a hotărât
- Motiv: de ce
- Impact: ce atinge (module, flag-uri, non-regresie)
- Aprobat de: Adrian / în așteptare
- Revizuire: dată sau condiție
```

---

### #1 — Introducerea stratului CODEX ca guvernanță peste JARVIS
- **Dată:** 2026-07-17
- **Tip:** arhitectură
- **Context:** Nevoia unui strat superior de guvernanță (filosofie, Constituție,
  Executive Board, memoria fondatorului, evoluție) deasupra sistemului existent,
  fără a schimba funcționalitatea actuală.
- **Opțiuni considerate:**
  - A — a scrie reguli direct în cod (respinsă: leagă guvernanța de implementare,
    greu de revizuit, risc de regresie);
  - B — un folder de guvernanță `/codex` cu documentație + arhitectură, separat de
    cod, migrat controlat (aleasă);
  - C — a amâna guvernanța până la o rescriere (respinsă: rescrierea nu e pe masă,
    iar sistemul are deja nevoie de reguli clare).
- **Decizie:** Opțiunea B. S-a creat structura `/codex` (24 subdirectoare) și
  documentele de guvernanță de bază, ca **schelet neactivat**. Zero cod executabil,
  zero atingere a funcționalității, DB, autentificării, permisiunilor sau integrărilor.
- **Motiv:** Guvernanța trebuie să fie citibilă, revizuibilă și separată de
  implementare; migrarea comportamentului se face pas cu pas, gated, cu aprobare.
- **Impact:** Doar fișiere noi sub `/codex`. Niciun fișier existent modificat.
  Non-regresie totală (nimic nu importă din `/codex`). Constituția tehnică existentă
  (`CONSTITUTIE.md`) rămâne sursa de adevăr operațională.
- **Aprobat de:** Adrian a cerut această etapă; ratificarea conținutului rămâne a lui.
- **Revizuire:** înainte de a construi Executive Board-ul (etapă separată, cu aprobare).

---

### #2 — (rezervat)
*Următoarea decizie de arhitectură, conflict sau activare se scrie aici.*
