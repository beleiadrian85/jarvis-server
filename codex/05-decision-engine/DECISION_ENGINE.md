# DECISION ENGINE — Motorul de Decizie

> Cum ajunge o intrare (mesaj, semnal, prag) la răspunsul potrivit: ce rută, ce
> sursă, ce nivel de autoritate, cu sau fără confirmare. Acest document descrie
> motorul de decizie *conceptual* al CODEX și îl leagă de motorul deja implementat.
>
> **Stare:** documentație. Descrie și codul existent (sursă de adevăr tehnică) și
> direcția CODEX (comportament viitor). Nu modifică nimic.

---

## 1. Ce există deja în cod (sursa de adevăr tehnică)

JARVIS are deja un motor de decizie funcțional, în două straturi:

- **`src/decisionEngine.js`** — clasificator **pur și sincron** (`classify(text, ctx)`),
  fără efecte, fără LLM, fără DB, fără MCP. Întoarce o `Decision` cu: `route`,
  `kind`, `provider`, `active`, `requiresApproval`, `reason`. Rute: `confirm`,
  `report`, `operational_read`, `strategy`, `council`, `action_propose`, `email`,
  `drive`, `memory`, `clarify`, `simple`.
- **`src/brain.js`** — orchestratorul care rutează efectiv mesajul: confirmări →
  rapoarte deterministe → predicție (gated) → engine-uri financiare → entitate →
  memorie/decizii → acțiuni cu confirmare → fast-path → chat general.

Gating existent (flag-uri implicit oprite, pentru non-regresie):
`DECISION_ENGINE=off`, `STRATEGY_ROUTING=off`, `PREDICTION_ENGINE=off`, `PIPELINE`
(implicit on, kill-switch `off`).

## 2. Principii de decizie (CODEX)

1. **Determinist înaintea probabilistului.** Pentru cifre (cash, task-uri, riscuri)
   se folosesc engine-uri deterministe, nu modelul. Modelul face sinteză, nu aritmetică.
2. **Confirmare pentru efect.** Orice acțiune cu efect (Nivel 3–4) trece prin
   `approvalGate`: se propune, Adrian confirmă, apoi se execută. Niciodată execuție directă.
3. **Read-only pe calea de chat.** MCP Operational e expus doar cu tool-uri de
   citire; scrierea trece exclusiv prin fluxul de confirmare.
4. **Onestitate de capabilitate.** Dacă o capabilitate cerută nu e conectată
   (railwayLogs, ga4, searchConsole, banking), sistemul spune clar — nu inventează.
5. **Gated și reversibil.** Orice rută nouă intră în spatele unui flag oprit.

## 3. Nivelurile de autoritate (din Constituția Executivă)

| Nivel | Acțiune | Comportament |
|---|---|---|
| 1 | citire, analiză, căutare | execută direct |
| 2 | creare task-uri, drafturi | execută direct |
| 3 | trimitere email, modificare date | cere confirmare explicită |
| 4 | **plăți** | **exclus total** — doar pregătire, execuția e umană |

## 4. Direcția CODEX (comportament viitor, neaprobat)

Ce ar putea evolua, doar prin Change Control:
- Un strat de decizie care consultă [`FOUNDER_DNA`](../02-founder-dna/FOUNDER_DNA.md)
  când datele nu ajung pentru o rută clară.
- Convocarea [Executive Board](../04-executive-board/BOARD_ARCHITECTURE.md) ca rută
  distinctă pentru decizii complexe/ireversibile.
- Un jurnal de decizii de rutare pentru învățare (ce rută a fost aleasă, dacă a fost bună).

## 5. Regula de aur

Motorul de decizie **rutează**, nu **decide în locul lui Adrian**. Pe orice are
efect, ultimul cuvânt e uman. Această regulă nu se schimbă prin nicio evoluție.
