# DECISION ENGINE V2 — Regula 6+1

> Metoda de decizie a lui Adrian, formalizată pentru CEO AI: până la **6 scenarii
> reale** + **scenariul 7 = recomandarea CEO AI**, cu justificarea explicită
> „DE CE ACEASTA ESTE CEA MAI BUNĂ DECIZIE ACUM". Date critice lipsă →
> `DATA_REQUIRED`, niciodată recomandare finală pe date insuficiente.
>
> **Stare:** implementat în `src/ceo/decisionEngineV2.js`, mod SHADOW. Nucleul e
> generic; compania (Profi Concept) e configurată în `companyConfig.js`. Zero
> acțiuni autonome — Adrian decide final, întotdeauna.

---

## 1. De ce V2

[Decision Engine V1](../05-decision-engine/DECISION_ENGINE.md) **rutează**: decide
pe ce cale merge un mesaj sau un semnal. V2 face altceva: **construiește spațiul
de decizie** pentru o problemă de business — scenarii reale, cuantificate, cu
necunoscutele declarate — și abia apoi formulează o recomandare. V1 rămâne
neschimbat; V2 e stratul de deasupra, pentru deciziile care contează.

| | V1 (rutare) | V2 (scenarii 6+1) |
|---|---|---|
| Întrebarea | „pe ce rută merge asta?" | „ce opțiuni reale există și care e cea mai bună acum?" |
| Ieșirea | o `Decision` de rutare | până la 6 scenarii + recomandarea CEO AI |
| Date lipsă | onestitate de capabilitate | `DATA_REQUIRED` + Data Gap declarat |
| Cine decide | motorul (mecanic, fără efecte) | **Adrian, întotdeauna** |

## 2. Regula 6+1 (metoda lui Adrian)

### 2.1 Până la 6 scenarii REALE

Motorul construiește **cel mult** 6 scenarii. Regula dură: scenariile sunt
**reale, nu umplute artificial**. Dacă o problemă are doar 2–3 opțiuni reale,
se prezintă 2–3. Un scenariu inventat ca să „arate bine tabloul" e mai rău decât
lipsa lui: contaminează comparația și erodează încrederea. „A nu face nimic /
a amâna" **este** un scenariu real și se evaluează cu aceleași câmpuri ca oricare
altul — dar nu se adaugă din oficiu, ci doar când e o opțiune de bună-credință.

### 2.2 Cele 11 câmpuri per scenariu

Fiecare scenariu se evaluează pe aceleași 11 câmpuri, ca să fie comparabile:

| # | Câmp | Ce răspunde |
|---|---|---|
| 1 | **Upside** | ce câștigăm dacă merge |
| 2 | **Downside** | ce pierdem dacă nu merge |
| 3 | **Cash impact** | efectul pe lichiditate (nu pe profit) — leagă de `cashIntelligence` |
| 4 | **Profit impact** | efectul pe profit (separat strict de cash) |
| 5 | **Time** | orizont de execuție și când se văd efectele |
| 6 | **Risk** | riscurile principale și probabilitatea lor |
| 7 | **Reversibility** | ușă cu două sensuri sau cu un singur sens? cât costă revenirea |
| 8 | **People** | cine execută, ce încărcare, ce dependențe umane |
| 9 | **Company value** | efectul pe valoarea companiei pe termen lung |
| 10 | **Unknowns** | ce NU știm și ar putea schimba concluzia — declarat explicit |
| 11 | **Confidence** | cât de solidă e evaluarea, dat fiind calitatea datelor |

Regulile absolute ale sistemului se aplică în interiorul câmpurilor: **cash ≠
profit** (câmpurile 3 și 4 nu se amestecă niciodată), **date lipsă ≠ zero**
(o componentă necunoscută intră la Unknowns ca `UNKNOWN`, nu ca 0).

### 2.3 Scenariul 7 — recomandarea CEO AI

După cele maximum 6 scenarii, motorul produce **scenariul 7**: recomandarea
CEO AI. Nu e „încă un scenariu", ci poziția motorului asupra spațiului construit,
cu justificarea obligatorie:

> **„DE CE ACEASTA ESTE CEA MAI BUNĂ DECIZIE ACUM"** — nu doar care scenariu,
> ci de ce acesta, de ce acum (ce fereastră se închide sau se deschide), ce l-ar
> invalida și care e al doilea cel mai bun.

O recomandare fără „de ce acum" e incompletă și nu se emite.

## 3. DATA_REQUIRED — bariera de onestitate

Dacă pentru decizie lipsesc **date critice** (o componentă fără de care
comparația scenariilor devine ghicit), motorul **nu emite recomandare finală**.
Emite starea `DATA_REQUIRED`:

1. ce date lipsesc și de ce sunt critice pentru această decizie;
2. Data Gap-ul corespunzător, prin `dataGapEngine` (WHY / BEST SOURCE /
   TEMPORARY sau PERMANENT / PROPOSED IMPLEMENTATION);
3. opțional, o **recomandare provizorie** marcată explicit ca provizorie, cu
   confidence scăzut — niciodată prezentată ca finală.

Regula e nenegociabilă: **decizie cu date critice lipsă ≠ recomandare finală**.
Un CEO AI care recomandă ferm pe date insuficiente e mai periculos decât unul
care spune „nu știu încă — iată ce îmi trebuie ca să știu".

## 4. Relația cu Executive Board

[Executive Board](../04-executive-board/BOARD_ARCHITECTURE.md) și Regula 6+1
sunt instrumente **complementare**, nu concurente:

| | Executive Board | Regula 6+1 |
|---|---|---|
| Ce aduce | **perspective multiple** (12 directori) pe **O** decizie | **spațiul de scenarii** al deciziei |
| Axa | cine privește (CFO, CMO, COO…) | ce opțiuni există |
| Întrebarea | „cum arată decizia din fiecare unghi?" | „între ce alegem, cu ce consecințe?" |

**Se pot compune.** Pentru deciziile mari: 6+1 construiește scenariile, Board-ul
le judecă din perspectivele fiecărui rol (conform
[BOARD_DECISION_PROTOCOL](../04-executive-board/BOARD_DECISION_PROTOCOL.md)),
iar scenariul 7 se formulează după ce perspectivele Board-ului au fost auzite.
Board-ul rămâne gated (SHADOW validat, ENABLED=off — decide Adrian).

## 5. Locul în lanțul CEO AI

V2 e veriga **THINK → SIMULATE → RECOMMEND** din principiul master:

SEE → UNDERSTAND → VERIFY → **THINK → SIMULATE → RECOMMEND** → ASK/PROPOSE →
ADRIAN APPROVES → DELEGATE/EXECUTE → VERIFY EXECUTION → LEARN

- Intrarea vine din [Observation Engine](../21-observation-engine/) și
  [Proactive CEO Pipeline](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md)
  (episoade executive care cer o decizie);
- livrarea către Adrian trece prin
  [Founder Attention Gate](../23-founder-attention/) — o analiză 6+1 ajunge la
  el doar dacă merită atenția lui, la momentul potrivit;
- dacă recomandarea implică o acțiune, ea devine **Action Proposal** prin
  `proposalEngine` și trece prin **ApprovalGate** — singura poartă pentru efecte;
- rezultatul deciziei intră în `closedLoop` pentru verificare și lecție învățată.

## 6. Regula de aur

Regula 6+1 **construiește spațiul de decizie**; nu decide. Recomandare ≠
aprobare; aprobare ≠ rezultat verificat. Scenariul 7 e poziția CEO AI —
**decizia e a lui Adrian**, pe toate cele 7, întotdeauna. Această regulă nu se
schimbă prin nicio evoluție.
