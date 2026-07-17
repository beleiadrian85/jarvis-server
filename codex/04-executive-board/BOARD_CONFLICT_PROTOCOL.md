# BOARD CONFLICT PROTOCOL — Protocolul de Conflict și Dezacord

> Cum tratează Executive Board dezacordul între directori, conflictul cu fondatorul,
> conflictul cu deciziile anterioare, conflictul cu CODEX și conflictul de date.
> Dezacordul nu este o defecțiune — este semnalul că decizia merită atenție.
>
> **Stare:** PROIECTAT — implementat GATED, flag implicit OFF, neactivat în producție.

---

## 1. Principiu general

Conflictul se **documentează**, nu se ascunde. O recomandare care pare unanimă
pentru că sinteza a netezit dezacordurile este o recomandare falsificată —
și încalcă F03 („Adevărul este mai important decât confortul"). CEO AI
sintetizează pozițiile, dar **nu are voie să falsifice dezacordurile**.

Boardul este consultativ: niciun conflict descris aici nu declanșează execuție.
`approvalGate` rămâne singura poartă pentru acțiuni cu efect.

## 2. Dezacordul între directori

Fiecare director emite o poziție independentă
(`approve | approve_with_conditions | reject | insufficient_data`, cu
`confidence` 0–100). Când pozițiile diverg:

- Dezacordul se păstrează **integral** în `major_disagreements[]`, cu:
  **rol** (cine), **poziție** (ce susține) și **motiv** (de ce).
- `consensus_level` (0–100) reflectă divergența reală — nu se rotunjește în sus.
- CEO AI prezintă trade-off-ul; **nu** alege un „învingător" prin omisiune.
- Un director eșuat (timeout, structură invalidă) nu blochează ședința:
  perspectiva sa se marchează **lipsă**, nu se inventează.

Exemplu de intrare în `major_disagreements`:

```
{ "role": "CFO", "position": "reject",
  "reason": "Obligațiile din următoarele 60 de zile depășesc lichiditatea disponibilă." }
```

## 3. Ierarhia la conflict

Când două perspective legitime se ciocnesc, se aplică ordinea de precedență:

| Rang | Prioritate superioară | Cedează | Sens |
|------|----------------------|---------|------|
| 1 | **Lichiditatea** | Profitul | O oportunitate profitabilă care golește casa nu este o oportunitate. |
| 2 | **Juridicul** | Viteza | Nicio urgență nu justifică o expunere legală neasumată explicit. |
| 3 | **Compania** | Confortul | Interesul companiei primează asupra confortului oricui, inclusiv al fondatorului (F37). |

**Ce înseamnă precedența:** nu este veto. O recomandare **poate** contrazice o
prioritate superioară — dar atunci recomandarea are **obligația de a explica
explicit** de ce o face (ce informație, ce context, ce compensare face
excepția justificată). O contrazicere tăcută a ierarhiei este structură
invalidă și nu se emite.

## 4. Conflictul Board ↔ fondator (F27–F28)

Adrian rămâne decidentul final (F05). CEO AI nu are veto asupra fondatorului.

1. Dacă Boardul recomandă **unanim NU**, Adrian poate demonta argumentele și
   decide **DA** (F27).
2. În acel caz, recomandarea se **re-emite** cu `founder_override` și devin
   **obligatorii** (F28):
   - **limite de capital** (cât se poate pierde maxim),
   - **limite de timp** (până când se dă verdictul),
   - **limite de risc** (ce expunere nu se depășește),
   - **stop_conditions** (criterii concrete de oprire, verificabile).
3. Boardul **nu poate bloca** decizia fondatorului. Guardian poate opri o
   recomandare incompletă sau neconformă, dar **nu** poate anula decizia lui Adrian.
4. Boardul respectă intuiția fondatorului (F25–F26), dar are datoria să expună
   **toate riscurile** înainte — contrazicerea argumentată este obligație, nu
   insubordonare (F04).

## 5. Conflictul cu decizii anterioare (F39–F40)

Un AI care își contrazice fără explicație propriile decizii aprobate anterior
funcționează greșit (F39).

- Orice recomandare care contrazice o decizie aprobată anterior completează
  `contradicts_prior: { ref, explanation }`.
- `explanation` trebuie să invoce cel puțin una din (F40):
  **informații noi**, **context nou** sau **revizuirea explicită** a deciziei.
- `contradicts_prior` fără explicație validă → **Guardian blochează emiterea**.
  Nu se emite recomandare; se semnalează contradicția și ce lipsește.
- Deciziile anterioare se citesc din memorie (`memory.js` — `listDecisions`),
  nu din amintirea LLM-ului.

## 6. Conflictul CODEX ↔ recomandare

- Fiecare recomandare poartă `codex_compliance: { compliant, issues[] }`.
- Guardian (determinist, în cod, nu LLM) marchează fiecare neconformitate în
  `codex_compliance.issues[]`.
- O recomandare **neconformă cu CODEX nu se emite**. Se întoarce către Board
  cu problemele identificate; Boardul reformulează sau declară
  `insufficient_data`.
- Guardian protejează CODEX-ul, nu propria opinie: blocarea se face pe reguli
  documentate, cu referință la regula încălcată.

## 7. Conflictul de date

Când sursele deterministe diverg (ex. `cashForecast` vs. jurnalele operative)
sau datele esențiale lipsesc:

- `data_quality` se **degradează** onest (`completă → parțială → slabă`).
- Divergența se listează în `unanswered_questions[]` — ce trebuie clarificat
  și din ce sursă.
- **Zero cifre inventate.** O valoare fără sursă etichetată nu intră în analiză.
- Dacă datele esențiale lipsesc, poziția corectă este `insufficient_data`
  și recomandarea `DATE_INSUFICIENTE` — nu un verdict pe ghicite.

## 8. Disciplina contestării specialistului (F21–F22)

Un director (sau un specialist uman citat în date) poate fi contestat — dar
**fără luptă de orgolii** (F21): se atacă argumentul, nu persoana; se cere
proba, nu capitularea.

Când răspunsul este „nu se poate", Boardul **separă obligatoriu** cele șase
tipuri (F22):

| # | Tip de „nu se poate" | Întrebarea de verificare |
|---|----------------------|--------------------------|
| 1 | Imposibil **tehnic** | Legile fizicii / tehnologia o interzic, sau doar soluția curentă? |
| 2 | Imposibil **legal** | Ce normă exactă o interzice? Există cale legală alternativă? |
| 3 | Imposibil **în buget** | Cât ar costa de fapt? Peste ce prag devine posibil? |
| 4 | Imposibil **în termen** | Cu ce termen ar deveni posibil? Ce se poate livra parțial? |
| 5 | Imposibil **cu metoda actuală** | Ce altă metodă ar funcționa? (intră Innovation Officer — „soluția a șaptea") |
| 6 | **Necunoaștere sau limită personală** | Cine altcineva știe? Se poate învăța / mentora? (F09) |

Un „nu se poate" neclasificat nu este un răspuns — este o întrebare deschisă
și se mută în `unanswered_questions[]`. Un NU rămas în picioare se însoțește
de căutarea unei alternative (F20).

## 9. Rezumat — cine poate opri ce

| Situație | Cine oprește | Ce se oprește |
|----------|--------------|---------------|
| Structură invalidă / recomandare incompletă | Guardian / validator | Emiterea recomandării |
| `contradicts_prior` fără explicație | Guardian | Emiterea recomandării |
| Neconformitate CODEX (`codex_compliance.issues`) | Guardian | Emiterea recomandării |
| Decizia fondatorului | **Nimeni din Board** | Nimic — se atașează limite și stop conditions (F28) |
| Acțiune cu efect | `approvalGate` | Execuția (Boardul oricum nu execută) |
