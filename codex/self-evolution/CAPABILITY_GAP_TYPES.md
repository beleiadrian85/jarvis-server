# CAPABILITY GAP TYPES — Cele 9 Tipuri + PROCESS_FIX_RECOMMENDED (§2, §19)

> Sursa de adevăr: `GAP_TYPES` + `PROCESS_FIX_RECOMMENDED` din `src/ceo/evolution/contract.js`.
> `gapEngine` clasifică fiecare limitare detectată în exact unul din aceste tipuri.
> Exemplele sunt GENERICE (§32) — fără nume de companie sau persoane.

## Cele 9 tipuri

| # | Tip | Definiție | Exemplu concret generic |
|---|---|---|---|
| 1 | `DATA_CAPABILITY_GAP` | Nu pot citi/obține o dată care există | Un om trimite un extras bancar ca fișier atașat; sistemul nu îl poate citi |
| 2 | `INPUT_CAPABILITY_GAP` | Omul nu are canal prin care să introducă datele | Nu există upload de fișiere — datele rămân pe email sau pe hârtie |
| 3 | `CONNECTOR_GAP` | Sursa există și are API, dar lipsește adaptorul | Programul de facturare are API oficial; nu există conector care să tragă facturile |
| 4 | `ANALYSIS_GAP` | Datele sunt disponibile, lipsește parserul/motorul de analiză | Extrasele CSV sunt stocate, dar nimeni nu le reconciliază cu facturile |
| 5 | `ACTION_GAP` | Se știe ce trebuie făcut, lipsește calea autorizată de execuție | Sistemul detectează o factură scadentă, dar nu are flux aprobat de remindere |
| 6 | `UI_GAP` | Omul trebuie să introducă/valideze date, lipsește interfața | Confirmarea soldurilor se face prin mesaje libere, nu printr-un formular structurat |
| 7 | `OBSERVABILITY_GAP` | Rezultatul unei acțiuni nu poate fi verificat — starea nu e expusă | Un task e marcat „rezolvat", dar nu există nicio dată care să confirme schimbarea |
| 8 | `KNOWLEDGE_GAP` | Lipsește o regulă/definiție clară pentru a decide | Nu e definit ce înseamnă „lead calificat" — analiza vânzărilor nu poate clasifica |
| 9 | `POLICY_GAP` | Tehnic posibil, dar lipsește politica de autonomie/permisiune | Sistemul ar putea trimite remindere, dar nu există politică aprobată care să-i permită |

## PROCESS_FIX_RECOMMENDED (§19) — nu construim software pentru probleme de proces

Nu orice limitare este un gap de capabilitate. Când cauza rădăcină este **procesul uman**,
verdictul este `PROCESS_FIX_RECOMMENDED` — o recomandare de schimbare de proces, **nu** un
Capability Request și **nu** un build.

| Situație | Verdict corect | Verdict INTERZIS |
|---|---|---|
| Datele nu sosesc pentru că omul responsabil nu le trimite | PROCESS_FIX_RECOMMENDED (disciplină/claritate de rol) | Un „automat de insistat" construit ca software |
| Două persoane țin aceleași date în două locuri diferite | PROCESS_FIX_RECOMMENDED (o singură sursă de adevăr, decisă de om) | Un sincronizator care perpetuează dublura |
| Termenele se ratează pentru că nu sunt definite nicăieri | PROCESS_FIX_RECOMMENDED (definiți termenele) | Un motor de „ghicit deadline-uri" |
| Datele sosesc, dar în format imposibil de citit | ANALYSIS_GAP real (parser) | — |

Testul de separare: *dacă un om și-ar schimba comportamentul și problema ar dispărea fără
nicio linie de cod — este proces, nu capabilitate.*

## Reguli de clasificare

1. **Un gap = un tip.** Dacă o limitare pare să acopere două tipuri, se sparge în două gap-uri
   distincte, fiecare cu propriul CR și `origin_need_id`.
2. **Clasificarea vine după REUSE_ANALYSIS**, nu înainte: multe „gap-uri" dispar la prima
   treaptă a scării (capabilitatea există deja).
3. **KNOWLEDGE_GAP și POLICY_GAP nu produc cod.** Produc întrebări structurate către fondator
   (definiții, politici) — software-ul, dacă mai e nevoie, vine abia după răspuns.
4. **PROCESS_FIX_RECOMMENDED se auditează** ca orice detecție, dar nu intră niciodată în
   `QUEUED_FOR_BUILD`.
