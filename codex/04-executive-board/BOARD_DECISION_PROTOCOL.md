# BOARD DECISION PROTOCOL — Mecanismul de Decizie al Executive Board

> Cum emite fiecare director o poziție structurată, cum sintetizează CEO AI fără
> să falsifice dezacordurile și cum se ajunge — determinist — la o recomandare
> finală. **Nu este vot simplu.**
>
> **Stare:** PROIECTAT — implementat GATED, flag implicit OFF, neactivat în producție.
> Boardul este organ **consultativ**: nu decide, nu execută. `approvalGate` rămâne
> singura poartă pentru acțiuni cu efect. Plățile (Nivel 4) sunt excluse total.

---

## 1. Principiu: poziții structurate, nu voturi

Un vot simplu ascunde informația care contează: *de ce* un director e împotrivă,
*cu ce condiții* ar accepta, *ce date* îi lipsesc. Protocolul cere fiecărui
director convocat (vezi selecția pe tip de decizie în
[`BOARD_ARCHITECTURE.md`](BOARD_ARCHITECTURE.md)) o **poziție structurată** cu 8
câmpuri obligatorii. Toate pozițiile se produc într-un **singur apel LLM**
per ședință, pe baza datelor deterministe colectate înainte (riskEngine,
financialBrain, healthScore, predictionState, memory).

## 2. Structura emisă de fiecare director

```json
{
  "position": "approve | approve_with_conditions | reject | insufficient_data",
  "confidence": 0-100,
  "arguments": [],
  "evidence": [],
  "risks": [],
  "conditions": [],
  "alternatives": [],
  "unanswered_questions": []
}
```

| Câmp | Semantică | Exemplu scurt |
|---|---|---|
| `position` | Verdictul directorului. `approve` = susține fără rezerve; `approve_with_conditions` = susține doar dacă se îndeplinesc `conditions[]`; `reject` = se opune; `insufficient_data` = nu poate emite verdict onest cu datele existente. | CFO: `approve_with_conditions` |
| `confidence` | Cât de sigur e directorul pe propria poziție (0–100). Nu e „cât de bună e ideea", ci „cât de solide îmi sunt datele și raționamentul". | 65 — „forecast pe date parțiale" |
| `arguments[]` | Raționamentul explicit, pe puncte. Fiecare argument trebuie să poată fi contrazis de alt director — asta e materia primă a dezacordurilor. | „Cash disponibil acoperă doar 60% din avans" |
| `evidence[]` | Sursele concrete pe care stau argumentele, **etichetate** (cashForecast, riskEngine, memorie, declarat de Adrian). Zero cifre inventate: o cifră fără sursă nu intră aici. | „getObligations: 42.000 EUR scadente în 30 zile" |
| `risks[]` | Ce poate merge prost din unghiul rolului, cu severitate și, unde există, probabilitate. CRO le are pe toate; ceilalți le văd doar pe ale domeniului lor. | CLO: „contract fără clauză de reziliere" |
| `conditions[]` | Ce ar transforma poziția în `approve`. Obligatoriu nenul la `approve_with_conditions`. | „Plafonare avans la 15.000 EUR" |
| `alternatives[]` | Căi diferite de a atinge același obiectiv. Innovation Officer e obligat să propună cel puțin una („soluția a șaptea"); ceilalți, opțional. | „Închiriere utilaj în loc de achiziție" |
| `unanswered_questions[]` | Ce nu se știe și ar putea răsturna verdictul. Alimentează direct `data_quality` și eventualul `DATE_INSUFICIENTE`. | „Care e termenul real de livrare?" |

Reguli per director:

- Un director care nu poate răspunde (timeout, eroare) **nu blochează ședința**:
  perspectiva se marchează *lipsă* și nu se numără la sinteză.
- **Guardian** și **Founder Voice** nu sunt LLM: Guardian validează determinist
  conformitatea cu CODEX-ul, Founder Voice citează **doar** principii documentate
  din [`FOUNDER_DNA`](../02-founder-dna/FOUNDER_DNA.md) — nu inventează opinii.

## 3. Sinteza CEO AI — fără falsificarea dezacordurilor

CEO AI este Chairman și sintetizator, nu arbitru care netezește. Reguli:

1. **Dezacordurile majore nu se elimină niciodată.** Dacă CFO spune `reject` pe
   lichiditate și CSO spune `approve` pe oportunitate de vânzare, ambele poziții
   apar în `major_disagreements[]`, cu argumentele fiecăruia. O sinteză care
   „împacă" pozițiile fără să le raporteze este structură invalidă.
2. CEO AI poate cântări și ierarhiza (cash > profit; juridic > viteză), dar
   ponderarea se **declară** în recomandare, nu se ascunde în ea.
3. CEO AI nu are drept de veto asupra fondatorului și nu poate rescrie poziția
   unui director — o poate doar contextualiza.
4. Un dezacord este „major" când: două poziții valide sunt opuse
   (`approve`/`reject`), sau un director marchează un risc ireversibil pe care
   altul îl ignoră, sau `confidence` sub 40 pe o poziție decisivă.

## 4. Recomandarea finală — câmpuri obligatorii

| Câmp | Semantică |
|---|---|
| `consensus_level` | 0–100 — cât de aliniate sunt pozițiile valide (nu media încrederii). Unanimitate `approve` ≈ 100; split `approve`/`reject` pe argumente centrale → sub 50. |
| `major_disagreements[]` | Dezacordurile majore, netezirea lor fiind interzisă (vezi §3). Poate fi gol doar dacă chiar nu există. |
| `recommendation` | `DA` \| `NU` \| `AMANA` \| `DATE_INSUFICIENTE` — derivată determinist (vezi §5). |
| `conditions[]` | Reuniunea condițiilor din pozițiile `approve_with_conditions`, deduplicate. Un `DA` cu condiții neîndeplinite nu este un `DA`. |
| `risk_limits[]` | Limite explicite de capital, timp și expunere (ex. „maxim 20.000 EUR", „decizie de revizuit la 60 de zile"). |
| `stop_conditions[]` | Criterii de oprire măsurabile: dacă se ating, execuția se oprește și decizia revine la Adrian (ex. „cash sub 30.000 EUR → stop"). |
| `founder_decision_required` | Întotdeauna `true`. Boardul nu decide; Adrian decide. |
| `codex_compliance` | `{ compliant: bool, issues[] }` — verdictul determinist al Guardianului față de CODEX. |
| `data_quality` | `completa` \| `partiala` \| `slaba` — starea datelor deterministe folosite. `slaba` împinge spre `AMANA`/`DATE_INSUFICIENTE`. |
| `confidence` | 0–100 — încrederea agregată a Boardului în propria recomandare. |
| `contradicts_prior` | `null` sau `{ ref, explanation }` — vezi §6. |

## 5. Reguli de sinteză deterministe

Verdictul final nu este „la aprecierea" CEO AI. Se aplică, în ordine:

| # | Situație | Rezultat |
|---|---|---|
| 1 | Zero poziții valide **sau** date esențiale lipsă (`data_quality: slaba` pe un domeniu decisiv, majoritate `insufficient_data`) | `DATE_INSUFICIENTE` — se listează exact ce trebuie aflat |
| 2 | Decizie **ireversibilă** cu `consensus_level` sub **80%** | `AMANA` — principiul F24: ireversibilul cere consens ridicat, nu majoritate simplă |
| 3 | Egalitate între pozițiile valide (`approve`+`approve_with_conditions` vs `reject`) | `AMANA` — trade-off-ul se prezintă explicit, decizia rămâne la Adrian |
| 4 | Majoritate `reject` | `NU` |
| 5 | Majoritate `approve` / `approve_with_conditions` | `DA` — obligatoriu cu `conditions[]`, `risk_limits[]` și `stop_conditions[]` completate |

Precizări:

- „Majoritate" se calculează doar pe pozițiile **valide** (perspectivele lipsă
  sau `insufficient_data` nu se numără la majoritate, dar apar în raport).
- Regulile 1–3 au prioritate asupra 4–5: o majoritate `approve` pe o decizie
  ireversibilă cu consens 70% tot `AMANA` produce.
- **Cache:** aceeași întrebare pe aceleași date nu redeclanșează analiza —
  se servește recomandarea existentă, marcată ca atare.

## 6. Regula contradicției (F39–F40)

O recomandare care **contrazice o decizie aprobată anterior** (din
`memory.listDecisions` / registrul de decizii) trebuie să completeze
`contradicts_prior` cu:

- `ref` — decizia anterioară contrazisă;
- `explanation` — **informații noi**, **context nou** sau **revizuire explicită**
  care justifică schimbarea.

Fără această explicație, **Guardian blochează emiterea recomandării** —
inconsecvența nedeclarată e mai periculoasă decât lipsa unei recomandări.
Guardian blochează, de asemenea, orice recomandare cu structură invalidă
(câmpuri lipsă, dezacorduri netezite, cifre fără sursă) sau neconformă CODEX
(`codex_compliance.compliant: false`). Guardian **nu poate** anula o decizie a
fondatorului — poate opri doar emiterea Boardului.

## 7. Decizia fondatorului și override-ul (F27–F28)

1. **Adrian Belei este decidentul final.** Orice recomandare, indiferent de
   `consensus_level`, are `founder_decision_required: true`.
2. Dacă Boardul recomandă **unanim NU**, Adrian poate demonta argumentele și
   decide **DA**. Override-ul este legitim — Boardul consiliază, nu guvernează.
3. La override contra recomandării, se aplică **obligatoriu**:
   - limite de **capital**, **timp** și **risc** (`risk_limits[]`);
   - **criterii de oprire** (`stop_conditions[]`) măsurabile;
   - consemnarea în registrul de decizii a recomandării Boardului, a deciziei
     lui Adrian și a argumentelor demontate (prin `audit.js`, fără schimbare de
     schemă DB).
4. La termenul de revizuire, rezultatul real se compară cu recomandarea —
   material de învățare pentru ambele părți, nu instrument de reproș.

## 8. Linii roșii ale protocolului

- Boardul **nu execută** nimic; `approvalGate` rămâne singura poartă pentru efecte.
- Plățile (Nivel 4) sunt **excluse total** din perimetrul Boardului.
- Zero cifre inventate; fiecare cifră are sursă etichetată în `evidence[]`.
- În `EXECUTIVE_BOARD_SHADOW_MODE`, analiza merge doar în audit — răspunsul
  către utilizator rămâne neschimbat.
- Cât timp `EXECUTIVE_BOARD_ENABLED` e OFF, Consiliul AI existent
  (`src/council.js`) rămâne funcțional, nemodificat.
