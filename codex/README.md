# CODEX — Stratul de Guvernanță al Proiectului JARVIS

> Versiune: 0.1.0 (schelet — doar documentație și arhitectură)
> Stare: **NEACTIVAT ÎN PRODUCȚIE.** Niciun cod din acest folder nu rulează.
> Proprietar și decident final: **Adrian Belei** (fondator PROFI CONCEPT / Bell Residence).

---

## Ce este CODEX

CODEX este **stratul superior de arhitectură și guvernare** al proiectului JARVIS.
Este locul unde trăiesc filosofia, Constituția Executivă, regulile de decizie,
Executive Board-ul, memoria fondatorului și mecanismul de evoluție al sistemului.

CODEX definește **cum ar trebui să se comporte** CEO-ul AI. JARVIS este interfața
și motorul care **execută** acel comportament, folosind OPERATIONAL ca sursă de
date și strat de execuție.

```
ADRIAN BELEI  ──  fondatorul și decidentul final
     │
     ▼
   CODEX        ──  filosofie, Constituție, reguli de decizie, Executive Board,
     │              memoria fondatorului, mecanismul de evoluție  (GUVERNANȚĂ)
     ▼
   JARVIS       ──  interfața + motorul AI care folosește CODEX     (INTELIGENȚĂ)
     │
     ▼
 OPERATIONAL    ──  stratul de execuție și sursa operațională principală (EXECUȚIE)
```

---

## Șapte adevăruri despre CODEX (citește-le înainte de orice)

1. **CODEX nu este un alt chatbot.** Nu răspunde la mesaje, nu are endpoint, nu
   are token, nu are proces care rulează. Este un corp de reguli și documente.

2. **CODEX nu înlocuiește JARVIS.** JARVIS rămâne aplicația, motorul AI și
   interfața. CODEX îi dă lui JARVIS regulile după care să opereze — nu îi ia locul.

3. **JARVIS trebuie să respecte CODEX.** Pe măsură ce fiecare zonă este migrată
   controlat, comportamentul lui JARVIS se aliniază la regulile din CODEX. Alinierea
   se face prin propunere → aprobare → implementare → audit, niciodată automat.

4. **Nicio regulă din CODEX nu se implementează direct în producție** fără
   parcurgerea completă a fluxului: analiză → propunere → aprobare (Adrian) → audit.
   Un document în CODEX este o *intenție*, nu o *implementare*.

5. **CODEX este sursa principală de adevăr pentru comportamentul VIITOR** al
   CEO-ului AI. Când te întrebi „cum ar trebui să decidă sistemul", răspunsul se
   caută aici.

6. **Codul existent rămâne sursa de adevăr pentru funcționalitatea TEHNICĂ actuală**
   până când fiecare zonă este migrată controlat. Ce face sistemul *azi* este
   definit de `src/`, nu de acest folder.

7. **În caz de conflict între CODEX și implementarea existentă, conflictul se
   RAPORTEAZĂ, nu se repară automat.** Dacă un document CODEX spune una și codul
   face alta, se deschide o intrare în [`decisions/DECISION_LOG.md`](decisions/DECISION_LOG.md)
   și se prezintă lui Adrian. Nimeni nu „corectează" codul ca să se potrivească cu
   documentul fără aprobare, și nimeni nu rescrie documentul ca să scuze codul.

---

## Ce NU face CODEX în această etapă

- Nu modifică schema bazei de date.
- Nu modifică autentificarea sau permisiunile.
- Nu modifică integrările existente (MCP Operational, Google, Telegram, Railway).
- Nu redenumește JARVIS, repository-ul, serviciile, baza de date sau variabilele.
- Nu creează agenți activi.
- Nu implementează automatizări care pot scrie în OPERATIONAL.
- Nu face deploy.
- Nu șterge cod vechi și nu refactorizează în afara scopului.

---

## Harta folderului

| Folder | Rol | Stare |
|---|---|---|
| `00-governance/` | Manifest, Constituția Executivă, Regula Zero | schelet scris |
| `01-identity/` | Identitatea sistemului (cine este CEO-ul AI) | rezervat |
| `02-founder-dna/` | ADN-ul fondatorului: valori, stil, linii roșii | schelet scris |
| `03-company-dna/` | ADN-ul companiei: misiune, model, principii | rezervat |
| `04-executive-board/` | Arhitectura, rolurile și protocolul Executive Board | schelet scris |
| `05-decision-engine/` | Motorul de decizie: cum se ia o decizie | schelet scris |
| `06-company-health/` | Sănătatea companiei (mapează pe healthScore) | rezervat |
| `07-people-engine/` | Oameni: echipă, responsabili, încărcare | rezervat |
| `08-client-engine/` | Clienți / vânzări / parteneri | rezervat |
| `09-financial-engine/` | Financiar: cash-flow, obligații, prognoze | rezervat |
| `10-risk-engine/` | Riscuri (mapează pe riskEngine — NU se modifică) | rezervat |
| `11-operational-engine/` | Execuție: task-uri, proiecte, șantier | rezervat |
| `12-ai-engine/` | Motorul AI: modele, rutare, providers | rezervat |
| `13-knowledge-engine/` | Cunoaștere: memorie, vault, documente | rezervat |
| `14-evolution-engine/` | Cum învață și evoluează sistemul | rezervat |
| `15-security-engine/` | Control de schimbare, siguranță, permisiuni | schelet scris |
| `16-company-memory/` | Memoria companiei (istoric, decizii) | rezervat |
| `17-founder-legacy/` | Moștenirea fondatorului (continuitate) | rezervat |
| `18-codex-evolution/` | Versionarea și evoluția CODEX-ului însuși | schelet scris |
| `19-company-conscience/` | Conștiința companiei (etică, linii roșii) | rezervat |
| `20-laboratory/` | Laborator: idei neaprobate, experimente pe hârtie | rezervat |
| `schemas/` | Scheme de date propuse (NU aplicate în DB) | rezervat |
| `decisions/` | Registrul deciziilor de arhitectură CODEX | schelet scris |
| `tests/` | Teste pentru viitoarele componente CODEX | rezervat |

Folderele „rezervat" conțin doar un `.gitkeep` — structura este pregătită, conținutul
se adaugă controlat, o zonă pe rând, cu aprobare.

---

## Relația cu documentele existente

- [`../CONSTITUTIE.md`](../CONSTITUTIE.md) — constituția tehnică actuală a lui JARVIS
  (fazele 1–5, stack, ierarhia decizională, acces și securitate). Rămâne **sursa
  de adevăr operațională** până când zonele sunt migrate în CODEX. CODEX nu o
  contrazice; o ridică la nivel de principiu și o extinde spre Executive Board.
- `src/` — implementarea. Sursa de adevăr tehnică actuală.

---

## Următorul pas

Această etapă livrează **doar scheletul + auditul read-only**. Executive Board-ul
**nu** se construiește fără aprobarea explicită a lui Adrian. Vezi
[`00-governance/CHANGE_CONTROL.md`](15-security-engine/CHANGE_CONTROL.md) pentru fluxul
obligatoriu de la idee la producție.
