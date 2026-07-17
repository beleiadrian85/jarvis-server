# OBSERVATION ENGINE — Teste de Acceptanță (Faza 4)

> **PROIECTAT — implementat GATED, flag implicit OFF, prima rulare exclusiv în Shadow Mode.**

Acest document definește cele **40 de teste de acceptanță obligatorii** pentru Observation Engine. Niciun flag nu se activează în producție înainte ca toate cele 40 să treacă. Testele sunt deterministe: aceleași intrări produc aceleași verdicte.

## Locurile verificării

| Suită | Acoperă |
|---|---|
| `test/observation.test.mjs` | Funcțiile pure: detectori, scoring, validator, deduplicare, cache, escaladare (marcare) |
| `test/observation.wiring.test.mjs` | Flag-uri, runner, lock, programare, gărzi de sursă (read-only), gating LLM |
| Suita existentă (non-regresie) | Comportamentul JARVIS vizibil, approvalGate, schema DB, testele deja verzi |

---

## A. Siguranță și izolare (T-01 … T-08)

**T-01 — Flag OFF nu schimbă comportamentul**
- *Dat fiind* `OBSERVATION_ENGINE_ENABLED=false` (valoarea implicită);
- *Când* JARVIS pornește și rulează fluxurile obișnuite;
- *Atunci* motorul nu este programat, nu rulează, nu scrie nimic — comportament identic cu versiunea fără motor.
- Verificare: `test/observation.wiring.test.mjs`

**T-02 — Shadow Mode nu notifică**
- *Dat fiind* motorul activ cu `OBSERVATION_ENGINE_SHADOW_MODE=true`;
- *Când* o rulare produce observații, inclusiv `critical`;
- *Atunci* zero notificări (Telegram/email/voce); `safe_to_notify=false` pe fiecare observație; scriere doar în audit și `jarvis_state`.
- Verificare: `test/observation.wiring.test.mjs`

**T-03 — Shadow Mode nu execută acțiuni**
- *Dat fiind* o rulare completă în Shadow Mode;
- *Când* observațiile recomandă analize sau marchează escaladări;
- *Atunci* nicio acțiune cu efect nu este declanșată — nici task, nici email, nici apel de tool cu efect.
- Verificare: `test/observation.wiring.test.mjs`

**T-04 — Nu modifică Operational**
- *Dat fiind* sursele de observare conectate la datele Operational;
- *Când* motorul colectează și analizează;
- *Atunci* niciun apel de scriere către Operational (create/update/delete) nu are loc — doar citire.
- Verificare: `test/observation.wiring.test.mjs`

**T-05 — Nu modifică Gmail/Calendar**
- *Dat fiind* aceeași rulare completă;
- *Când* motorul procesează toate categoriile;
- *Atunci* zero apeluri de scriere către Gmail sau Calendar (send/create/update/delete).
- Verificare: `test/observation.wiring.test.mjs`

**T-06 — Rulează în fundal**
- *Dat fiind* motorul activ;
- *Când* Adrian folosește JARVIS în timpul unei rulări de observare;
- *Atunci* cererile lui nu sunt blocate și nu așteaptă motorul — rularea este asincronă, fără blocaj pe fluxul principal.
- Verificare: `test/observation.wiring.test.mjs`

**T-07 — O eroare nu blochează JARVIS**
- *Dat fiind* o sursă care aruncă excepție sau date corupte;
- *Când* rularea eșuează parțial sau total;
- *Atunci* eroarea este prinsă și auditată, iar JARVIS continuă normal — niciun crash, nicio funcție existentă afectată.
- Verificare: `test/observation.wiring.test.mjs`

**T-08 — Rulările concurente sunt prevenite**
- *Dat fiind* o rulare în curs (lock activ);
- *Când* programatorul sau un apel manual declanșează o a doua rulare;
- *Atunci* a doua rulare este refuzată/ignorată și faptul este auditat; lock-ul se eliberează la final, inclusiv la eroare.
- Verificare: `test/observation.wiring.test.mjs`

## B. Ciclul de viață al observațiilor (T-09 … T-12)

**T-09 — Date identice nu produc duplicate**
- *Dat fiind* două rulări consecutive pe date cu fingerprint identic;
- *Când* a doua rulare evaluează cache-ul;
- *Atunci* nu se reanalizează și nu se emit observații duplicate.
- Verificare: `test/observation.test.mjs`

**T-10 — Agravarea este detectată**
- *Dat fiind* o observație existentă și date noi cu deviație mai mare;
- *Când* deduplicatorul compară cu starea persistată;
- *Atunci* statusul devine `worsening` și observația iese din cooldown.
- Verificare: `test/observation.test.mjs`

**T-11 — Ameliorarea este detectată**
- *Dat fiind* o observație existentă și date noi cu deviație în scădere;
- *Când* deduplicatorul compară stările;
- *Atunci* statusul devine `improving`.
- Verificare: `test/observation.test.mjs`

**T-12 — Rezolvarea este detectată**
- *Dat fiind* o observație activă a cărei condiție nu mai este îndeplinită;
- *Când* rularea următoare nu mai regăsește problema;
- *Atunci* se emite `resolved` exact o dată, apoi observația nu mai reapare.
- Verificare: `test/observation.test.mjs`

## C. Onestitate asupra datelor (T-13 … T-15)

**T-13 — Lipsa datelor nu este zero**
- *Dat fiind* o sursă indisponibilă (ex. trafic sau vânzări fără date);
- *Când* detectorii rulează pe perioada respectivă;
- *Atunci* nu se raportează „zero activitate" — lipsa datelor este marcată explicit ca lipsă, cu `data_quality` degradat.
- Verificare: `test/observation.test.mjs`

**T-14 — Lipsa soldului bancar este declarată**
- *Dat fiind* absența datelor bancare reale;
- *Când* detectorii de cash rulează;
- *Atunci* niciun sold nu este inventat; observațiile de cash declară explicit în `unknowns`/`evidence` că soldul nu este cunoscut.
- Verificare: `test/observation.test.mjs`

**T-15 — Cash nu este profit**
- *Dat fiind* date de încasări/plăți și date de venituri/costuri;
- *Când* detectorii de cash formulează observații;
- *Atunci* fluxul de numerar nu este confundat cu profitul — metricile și formulările le separă corect.
- Verificare: `test/observation.test.mjs`

## D. Scoring, validare, calitate (T-16 … T-23)

**T-16 — Severitatea este deterministă**
- *Dat fiind* aceleași metrici de intrare (impact, urgență, ireversibilitate etc.);
- *Când* `observationScoring` rulează de mai multe ori;
- *Atunci* scorul și severitatea sunt identice la fiecare rulare; pragurile ≥75/≥55/≥35/≥15 sunt respectate; LLM-ul nu poate modifica severitatea.
- Verificare: `test/observation.test.mjs`

**T-17 — Observațiile fără dovezi sunt respinse**
- *Dat fiind* o observație candidată cu `evidence` gol sau lipsă;
- *Când* `observationValidator` o evaluează;
- *Atunci* observația este respinsă și nu ajunge în rezultat.
- Verificare: `test/observation.test.mjs`

**T-18 — Sursele sunt etichetate**
- *Dat fiind* orice observație validă;
- *Când* validatorul verifică `evidence`;
- *Atunci* fiecare intrare are prefix de sursă (`[cashForecast]`, `[riskEngine]`, `[operational]`, `[predictionEngine]`, `[audit]`, `[jarvis_state]`, `[decizii]`), iar intrările neprefixate sunt respinse.
- Verificare: `test/observation.test.mjs`

**T-19 — Confidence este 0-100**
- *Dat fiind* observații candidate cu confidence -5, 0, 100, 150, `null`;
- *Când* validatorul rulează;
- *Atunci* doar valorile din intervalul 0-100 trec; restul sunt respinse.
- Verificare: `test/observation.test.mjs`

**T-20 — Datele vechi reduc data_quality**
- *Dat fiind* surse cu date mai vechi decât pragul de prospețime;
- *Când* se determină `data_quality` și scorul;
- *Atunci* calitatea scade (`partial`/`poor`) și multiplicatorul (0.85/0.6) reduce scorul brut.
- Verificare: `test/observation.test.mjs`

**T-21 — Semnalele slabe sunt filtrate**
- *Dat fiind* o observație cu scor <15 la prima apariție;
- *Când* deduplicatorul o evaluează;
- *Atunci* nu se emite; se emite doar dacă persistă ≥3 rulări consecutive.
- Verificare: `test/observation.test.mjs`

**T-22 — Maximul de observații este respectat**
- *Dat fiind* o rulare care detectează mai mult de 10 observații valide;
- *Când* se compune rezultatul final;
- *Atunci* se rețin maximum 10, cele cu scorurile cele mai mari.
- Verificare: `test/observation.test.mjs`

**T-23 — Cooldown-ul funcționează**
- *Dat fiind* o observație `repeated` ne-agravată emisă recent;
- *Când* aceeași cheie de deduplicare reapare înainte de expirarea cooldown-ului (critical 2h / high 6h / rest 24h);
- *Atunci* nu se re-emite; după expirare sau la `worsening`/`improving`, se emite.
- Verificare: `test/observation.test.mjs`

## E. Detectori pe categorii (T-24 … T-28)

**T-24 — Contradicția produce explicație**
- *Dat fiind* o acțiune/stare care contrazice o decizie aprobată anterior;
- *Când* detectorul `decisions` rulează;
- *Atunci* observația conține explicația contradicției prin una din căile permise: informații noi, context nou, ipoteze schimbate, revizuire explicită sau eroare — niciodată contradicție fără explicație.
- Verificare: `test/observation.test.mjs`

**T-25 — Decizia neexecutată este detectată**
- *Dat fiind* o decizie aprobată fără nicio urmă de execuție în perioada analizată;
- *Când* detectorul `decisions` rulează;
- *Atunci* se emite o observație de decizie aprobată dar neexecutată, cu dovezi din `[decizii]`/`[audit]`.
- Verificare: `test/observation.test.mjs`

**T-26 — Job-ul eșuat este detectat**
- *Dat fiind* un job programat care nu a rulat sau a eșuat repetat (din `[audit]`/`[jarvis_state]`);
- *Când* detectorul `ops_risk` rulează;
- *Atunci* se emite o observație `ops_risk` cu jobul, perioada și dovezile.
- Verificare: `test/observation.test.mjs`

**T-27 — Task important fără responsabil este detectat**
- *Dat fiind* un task cu impact/termen semnificativ fără responsabil atribuit;
- *Când* detectorii `projects`/`people` rulează;
- *Atunci* se emite o observație cu cauza încadrată la lipsă de claritate/responsabilitate, nu la persoană.
- Verificare: `test/observation.test.mjs`

**T-28 — Dependența de fondator, fără analiză psihologică**
- *Dat fiind* procese recurente care necesită intervenția lui Adrian;
- *Când* detectorul `founder` rulează;
- *Atunci* observația este formulată neutru („Compania depinde încă de intervenția fondatorului în X procese recurente"), fără judecăți de caracter sau termeni psihologici.
- Verificare: `test/observation.test.mjs`

## F. Escaladare și granițe de guvernanță (T-29 … T-32)

**T-29 — requires_board_review este corect**
- *Dat fiind* observații care ating fiecare criteriu de escaladare (critical; ireversibil ≥high; impact ≥100.000 lei; contradicție majoră; ≥3 sisteme; repetat și agravat; simptomele F31) și observații care nu ating niciunul;
- *Când* `observationEscalation` rulează;
- *Atunci* flag-ul este `true` exact pentru cele care ating cel puțin un criteriu, cu motivul scris în audit.
- Verificare: `test/observation.test.mjs`

**T-30 — Boardul nu este convocat automat**
- *Dat fiind* observații cu `requires_board_review=true` și `OBSERVATION_BOARD_ESCALATION_ENABLED=false` (implicit);
- *Când* rularea se încheie;
- *Atunci* niciun apel către Executive Board nu are loc — doar marcarea.
- Verificare: `test/observation.wiring.test.mjs`

**T-31 — approvalGate rămâne neatins**
- *Dat fiind* motorul activ pe rulări complete;
- *Când* se compară fluxul approvalGate înainte și după integrare;
- *Atunci* approvalGate nu este apelat, ocolit sau modificat de motor — rămâne singura poartă pentru efecte.
- Verificare: `test/observation.wiring.test.mjs` + suita existentă (non-regresie)

**T-32 — Schema DB nemodificată**
- *Dat fiind* persistența stării motorului;
- *Când* rulează deduplicarea, cache-ul și runner-ul;
- *Atunci* nu se creează tabele sau coloane noi — totul se scrie în `jarvis_state` și audit.
- Verificare: `test/observation.wiring.test.mjs`

## G. Stabilitate, cost, non-regresie (T-33 … T-40)

**T-33 — Testele existente trec**
- *Dat fiind* întreaga suită de teste dinaintea Fazei 4;
- *Când* rulează cu codul motorului integrat (flag OFF și flag ON+shadow);
- *Atunci* toate testele existente rămân verzi.
- Verificare: suita existentă (non-regresie)

**T-34 — Aceeași intrare → structură stabilă**
- *Dat fiind* același set de date de intrare, rulat de două ori;
- *Când* se compară rezultatele deterministe (fără câmpurile de timp);
- *Atunci* observațiile au aceleași chei de deduplicare, scoruri, severități și structură.
- Verificare: `test/observation.test.mjs`

**T-35 — Cost LLM zero fără observații relevante**
- *Dat fiind* o rulare fără observații semnificative (nimic peste pragul de sinteză);
- *Când* se ajunge la etapa `observationSummary`;
- *Atunci* niciun apel LLM nu este efectuat.
- Verificare: `test/observation.wiring.test.mjs`

**T-36 — Timeout LLM păstrează rezultatul determinist**
- *Dat fiind* observații valide și un LLM care expiră sau eșuează la sinteză;
- *Când* `observationSummary` eșuează;
- *Atunci* observațiile deterministe se persistă complet în audit/`jarvis_state`; doar sinteza lipsește; eroarea este auditată.
- Verificare: `test/observation.wiring.test.mjs`

**T-37 — Zero notificări suplimentare**
- *Dat fiind* `OBSERVATION_NOTIFICATIONS_ENABLED=false` (implicit), indiferent de shadow;
- *Când* rulează motorul pe orice combinație de observații;
- *Atunci* numărul de notificări trimise de JARVIS este identic cu cel dinaintea Fazei 4.
- Verificare: `test/observation.wiring.test.mjs`

**T-38 — Răspunsurile vizibile neschimbate**
- *Dat fiind* întrebările obișnuite ale lui Adrian către JARVIS;
- *Când* motorul este activ în shadow;
- *Atunci* răspunsurile vizibile (chat, rapoarte, Telegram) sunt identice cu cele dinaintea Fazei 4 — motorul nu injectează conținut.
- Verificare: suita existentă (non-regresie)

**T-39 — Nu rulează peste limita configurată**
- *Dat fiind* `OBSERVATION_INTERVAL_MINUTES` configurat (implicit 45);
- *Când* programatorul evaluează momentul următoarei rulări;
- *Atunci* nicio rulare rapidă nu pornește înainte de scurgerea intervalului; rulările zilnice (06:45) și săptămânale (luni 06:30) respectă programarea Europe/Bucharest.
- Verificare: `test/observation.wiring.test.mjs`

**T-40 — Fiecare observație respectă schema**
- *Dat fiind* toate observațiile emise într-o rulare completă;
- *Când* sunt validate contra `/codex/schemas/observation.schema.json`;
- *Atunci* fiecare observație trece validarea strictă (toate câmpurile canonice, enum-urile corecte, `safe_to_notify=false` în shadow); orice abatere respinge observația.
- Verificare: `test/observation.test.mjs`

---

## Sinteză pe suite

| Suită | Teste |
|---|---|
| `test/observation.test.mjs` (funcții pure) | T-09…T-29, T-34, T-40 (23 teste) |
| `test/observation.wiring.test.mjs` (flag-uri/runner/gărzi) | T-01…T-08, T-30…T-32, T-35…T-37, T-39 (15 teste) |
| Suita existentă (non-regresie) | T-31 (partajat), T-33, T-38 (2 teste dedicate + 1 partajat) |

**Regula de acceptanță:** toate cele 40 trec → motorul poate rula în Shadow Mode. Activarea notificărilor și a escaladării către Board rămân etape ulterioare, fiecare cu propriile flag-uri și propriile teste.
