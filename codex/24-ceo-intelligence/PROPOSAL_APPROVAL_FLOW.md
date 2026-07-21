# PROPOSAL & APPROVAL FLOW — De la detecție la delegare verificată

> **STARE: PROIECTAT — implementat ca INFRASTRUCTURĂ + SHADOW; ZERO task-uri reale trimise, ZERO execuție autonomă în această fază.**
> `approvalGate` existent rămâne **NEMODIFICAT** și este **singura poartă pentru efecte**. Plățile sunt **excluse total** din flux, în orice fază.

> **Poziționare:** acest document face parte din capitolul **24 — CEO AI Operational Intelligence** și definește coloana vertebrală decizională a CEO-ului AI: drumul complet al unei probleme de la detecție până la task delegat și verificat. Implementarea trăiește în `src/ceo/proposalEngine.js`. Consumă detecții din [Observation Engine (cap. 21)](../21-observation-engine/), episoade executive din [Proactive CEO Pipeline (cap. 22)](../22-proactive-ceo/), niveluri de atenție din [Founder Attention Gate (cap. 23)](../23-founder-attention/) și, la nevoie, opinii din [Executive Board (cap. 04)](../04-executive-board/). Nu înlocuiește niciunul dintre ele.

---

## 1. Scop

CEO-ul AI vede, înțelege și recomandă — dar **nu decide și nu execută**. Acest document definește exact granițele: cum se transformă o detecție într-o recomandare, o recomandare într-o propunere de acțiune, o propunere într-o decizie a lui Adrian și o decizie într-un task delegabil cu regulă de verificare. Fiecare treaptă este o graniță de autoritate, nu doar un pas tehnic.

Patru ecuații guvernează întregul flux și nu admit excepții:

| Ecuație | Semnificație |
|---------|--------------|
| **Propunere ≠ execuție** | O Action Proposal este text pentru Adrian, nu o comandă pentru sistem. Nimic nu se execută pentru că a fost propus. |
| **Recomandare ≠ aprobare** | Recomandarea CEO AI (inclusiv „Scenariul 7" din [decisionEngineV2](./DECISION_ENGINE_V2.md)) nu are nicio autoritate. Doar Adrian aprobă. |
| **Aprobare ≠ rezultat verificat** | Un task aprobat și delegat nu este un task rezolvat. Bucla se închide doar la `verified`, prin regula de verificare — vezi [closedLoop](./CLOSED_LOOP.md). |
| **Date critice lipsă ≠ recomandare finală** | Dacă datele critice lipsesc, fluxul produce `DATA_REQUIRED` + Data Gap ([dataGapEngine](./DATA_GAP_ENGINE.md)), nu o propunere „pe ghicite". Date lipsă ≠ zero. |

---

## 2. Fluxul complet — 6 trepte

```
CEO DETECTS → CEO RECOMMENDATION → ACTION PROPOSAL → APPROVAL GATE → ADRIAN → TASK PROPOSAL
   (vede)        (gândește)           (formulează)      (poarta)    (decide)    (delegă*)
                                                                            *shadow în această fază
```

| # | Treaptă | Ce intră | Ce iese | Cine decide | Ce NU se întâmplă |
|---|---------|----------|---------|-------------|-------------------|
| 1 | **CEO detects** | Observații deterministe (cap. 21), episoade executive (cap. 22), semnale din [companyDataMap](./COMPANY_DATA_MAP.md), [cashIntelligence](./CASH_INTELLIGENCE.md), [salesIntelligence](./SALES_INTELLIGENCE.md), [peopleIntelligence](./PEOPLE_INTELLIGENCE.md) | O problemă/oportunitate identificată, cu dovezi și cu unknowns-urile marcate explicit | Nimeni — e percepție, nu decizie | Nu se inventează date. Componentele lipsă rămân `UNKNOWN` + Data Gap. |
| 2 | **CEO Recommendation** | Problema detectată + contextul complet (cash, oameni, proiecte, riscuri) | O recomandare argumentată: ce, de ce, de ce acum, cu ce impact estimat și cu ce nivel de încredere. Pentru decizii majore: scenariile 6+1 din decisionEngineV2 | Nimeni — e gândire, nu autoritate | Nu se emite recomandare finală dacă date critice lipsesc → `DATA_REQUIRED`. |
| 3 | **Action Proposal** | Recomandarea | Un obiect structurat, uman-lizibil, pregătit pentru Adrian (anatomia în §3) | Nimeni — e formulare | Nu se trimite nimic, nu se execută nimic. Propunerea așteaptă la poartă. |
| 4 | **ApprovalGate** | Action Proposal | Propunerea prezentată lui Adrian pe canalul potrivit (conform politicilor din cap. 23) | **Poarta nu decide** — doar garantează că nimic nu trece pe lângă ea | Gate-ul existent NU se modifică. Nicio propunere nu o ocolește, indiferent de severitate sau urgență. |
| 5 | **Adrian** | Propunerea din poartă | **APPROVE** / **MODIFY** / **REJECT** — cu modificările lui, dacă există | **Doar Adrian.** Singura autoritate de decizie din întregul flux | Tăcerea nu e aprobare. Lipsa răspunsului = propunerea rămâne `proposed`, nu avansează. |
| 6 | **Task Proposal** | Decizia aprobată (eventual modificată) | Un task complet delegabil: responsabil, termen, rezultat așteptat, regulă de verificare (anatomia în §4) | Adrian a decis deja; treapta doar operaționalizează | **În această fază: task-ul NU se trimite nicăieri.** Se scrie în `jarvis_state` + `audit` ca preview shadow. |

Rezultatele deciziei lui Adrian la treapta 5:

| Decizie | Efect asupra propunerii | Ce urmează |
|---------|------------------------|------------|
| **APPROVE** | Trece în `approved` exact cum a fost propusă | Se generează Task Proposal → `delegated` (shadow) |
| **MODIFY** | Trece în `modified` — modificările lui Adrian devin parte din propunere și se auditează ca atare (materie primă pentru învățare: unde greșește sistematic CEO-ul AI) | Se generează Task Proposal pe varianta modificată → `delegated` (shadow) |
| **REJECT** | Trece în `rejected`, cu motivul dacă e dat | Nimic nu se execută. Respingerea + motivul intră în audit și în lecțiile closedLoop. Propunerea nu reintră identic (dedup). |

---

## 3. Anatomia unei Action Proposal

Fiecare Action Proposal conține obligatoriu, în această ordine:

| Câmp | Conținut | Regulă |
|------|----------|--------|
| **Problema** | Ce s-a detectat, cu dovezile (sursele de date, timestamps) | Fără afirmații nesusținute de date conectate |
| **De ce contează** | Impact business: cash / profit / termen / oameni / risc — cu separarea strictă CASH ≠ PROFIT | Cifrele estimate se marchează ca estimări |
| **Ce propun** | Acțiunea concretă recomandată | O singură acțiune per propunere; alternativele majore trec prin scenariile 6+1 |
| **De ce acum** | Costul amânării | Dacă amânarea nu costă nimic, propunerea merge în digest, nu în întrerupere (politici cap. 23) |
| **Ce nu știu** | Unknowns-urile relevante + Data Gap-urile asociate | Niciodată listă goală „de formă" — dacă e goală, e pentru că datele chiar sunt complete |
| **Încredere** | Nivelul de încredere al recomandării și de ce | Încredere scăzută + miză mare → se propune întâi obținerea datelor, nu acțiunea |
| **Reversibilitate** | Cât de ușor se poate anula acțiunea dacă se dovedește greșită | Acțiunile ireversibile se marchează explicit |

---

## 4. Anatomia unui Task Proposal

Un task fără regulă de verificare nu este un task — este o speranță. Fiecare Task Proposal conține obligatoriu:

| Câmp | Conținut | Regulă |
|------|----------|--------|
| **Responsabil** | O singură persoană (Adrian / Dana / Nelu — din [companyConfig](./COMPANY_CONFIG.md)) | Un task = un responsabil. „Echipa" nu e responsabil. |
| **Termen** | Dată concretă, realistă față de complexitate | Fără „cât mai repede". Termenul se propune, Adrian îl poate modifica. |
| **Rezultat așteptat** | Ce înseamnă „gata", formulat verificabil | Nu activitatea („sună furnizorul"), ci rezultatul („ofertă scrisă primită de la furnizor"). |
| **Regula de verificare** | Cum și unde verifică sistemul că rezultatul există (sursa de date, semnalul, pragul) | Dacă rezultatul nu e verificabil prin nicio sursă conectată, task-ul primește verificare manuală explicită de la responsabil + se deschide Data Gap pentru viitor. |

Regula de verificare este ceea ce transformă delegarea în buclă închisă: `delegated` → monitorizat → `verified` → rezultat măsurat → lecție stocată ([closedLoop](./CLOSED_LOOP.md)). Evaluarea felului în care responsabilul a livrat se face contextual, după modelul din [peopleIntelligence](./PEOPLE_INTELLIGENCE.md) — nu după numărul de task-uri.

---

## 5. Stările unei propuneri

```
draft → proposed → approved ──────→ delegated → verified
                 ↘ modified ──────↗
                 ↘ rejected (terminal)
```

| Stare | Semnificație | Cine o produce | Tranziții permise |
|-------|--------------|----------------|-------------------|
| `draft` | Propunerea se construiește; incompletă sau în așteptare de date | proposalEngine | → `proposed` (câmpurile obligatorii complete) sau abandon cu motiv în audit (ex. `DATA_REQUIRED`) |
| `proposed` | Prezentată lui Adrian prin ApprovalGate; așteaptă decizia | ApprovalGate | → `approved` / `modified` / `rejected`. **Nu expiră în `approved` niciodată** — fără răspuns, rămâne aici. |
| `approved` | Adrian a aprobat-o ca atare | **Doar Adrian** | → `delegated` |
| `modified` | Adrian a aprobat-o cu modificări; versiunea lui e cea valabilă | **Doar Adrian** | → `delegated` (pe varianta modificată) |
| `rejected` | Adrian a respins-o; motivul (dacă există) intră în audit și în învățare | **Doar Adrian** | Terminală. Nu reintră identic. |
| `delegated` | Task Proposal generat și atribuit responsabilului. **În această fază: doar preview shadow în `jarvis_state` + `audit` — nimic trimis real** | proposalEngine, post-decizie | → `verified` (regula de verificare confirmă rezultatul). Dacă verificarea eșuează / termenul trece → escaladare ca nouă detecție (treapta 1), nu retrimitere silențioasă. |
| `verified` | Rezultatul există și a fost confirmat prin regula de verificare; bucla se închide, lecția se stochează | closedLoop | Terminală (succes). |

Invarianți de stare:

- **Nicio tranziție nu sare peste `proposed`.** Nu există drum `draft → approved` sau `draft → delegated`.
- **Tranzițiile `proposed → approved/modified/rejected` au un singur autor posibil: Adrian.** Niciun motor, job, board sau agent nu poate produce aceste tranziții.
- **Orice tranziție se scrie în audit** cu timestamp, autor și conținut — învățarea este auditabilă, fără self-modifying code.

---

## 6. Faza curentă — infrastructură + shadow

| Există (construit și auditat) | NU există (interzis în această fază) |
|-------------------------------|--------------------------------------|
| proposalEngine generează propuneri complete, cu toate câmpurile din §3–§4 | Trimitere de task-uri reale către Operational sau orice alt sistem |
| Stările și tranzițiile din §5, persistate în `jarvis_state` + `audit` | Orice execuție autonomă, în orice condiții |
| Task Proposals ca preview shadow, marcate explicit ca netrimise | Modificarea `approvalGate` — rămâne exact cum e, singura poartă pentru efecte |
| Data Gap-uri și Information Requests pregătite dar **NETRIMISE** ([dataGapEngine](./DATA_GAP_ENGINE.md)) | Plăți sau orice atingere a banilor — excluse total, permanent |
| Legarea de scenariile 6+1 și de `DATA_REQUIRED` (decisionEngineV2) | Recomandări finale construite pe date critice lipsă |

Criteriul de ieșire din shadow este identic cu cel folosit la capitolele 21–23: validare pe date reale, rată de zgomot acceptabilă, zero încălcări de invarianți în audit — și **decizia explicită a lui Adrian**. Până atunci, fluxul rulează complet, dar ultimul metru — trimiterea reală — nu există.

---

## 7. Legături

- [21 — Observation Engine](../21-observation-engine/) — sursa detecțiilor (treapta 1)
- [22 — Proactive CEO Pipeline](../22-proactive-ceo/) — episoadele executive care alimentează recomandările
- [23 — Founder Attention Gate](../23-founder-attention/) — când și pe ce canal ajunge o propunere la Adrian
- [04 — Executive Board](../04-executive-board/) — opinii de directori pentru propunerile majore (gated, shadow)
- În acest capitol: [decisionEngineV2](./DECISION_ENGINE_V2.md) (scenariile 6+1), [closedLoop](./CLOSED_LOOP.md) (verificare + învățare), [dataGapEngine](./DATA_GAP_ENGINE.md) (unknowns → cereri de date), [peopleIntelligence](./PEOPLE_INTELLIGENCE.md) (evaluarea contextuală a livrării)
