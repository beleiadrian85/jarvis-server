# OBSERVATION_TYPES — Cele 8 categorii de observatii

> **PROIECTAT — implementat GATED, flag implicit OFF, prima rulare exclusiv in Shadow Mode.**
> Acest document defineste taxonomia canonica a observatiilor emise de Observation Engine (Faza 4).
> Orice observatie emisa de motor apartine EXACT uneia dintre cele 8 categorii de mai jos.
> Campul `category` din schema canonica (`/codex/schemas/observation.schema.json`, impus de `observationValidator`) accepta doar valorile: `cash | sales | traffic | projects | people | decisions | ops_risk | founder`.

---

## Principii transversale (valabile pentru TOATE categoriile)

| # | Principiu | Consecinta practica |
|---|-----------|---------------------|
| 1 | Motorul OBSERVA, nu actioneaza | Nicio categorie nu declanseaza decizii, emailuri, task-uri sau modificari in Operational/Gmail/Calendar. `approvalGate` ramane singura poarta pentru efecte. Platile sunt excluse total. |
| 2 | Detectorii sunt PURI si deterministi | Aceleasi date de intrare → aceleasi observatii. LLM-ul intervine DOAR la sinteza (`observationSummary`), niciodata la detectie sau severitate. |
| 3 | Lipsa datelor NU este o valoare | Absenta unei surse nu se interpreteaza niciodata ca „zero" (zero vanzari, zero trafic, zero obligatii). Lipsa se declara explicit prin `data_quality` si `unknowns[]`. |
| 4 | Fiecare dovada isi declara sursa | Fiecare intrare din `evidence[]` este prefixata cu sursa: `[cashForecast]`, `[riskEngine]`, `[operational]`, `[predictionEngine]`, `[audit]`, `[jarvis_state]`, `[decizii]`. |
| 5 | Nicio observatie „de umplutura" | Nu se emit observatii doar ca sa demonstreze ca motorul ruleaza. Semnalele slabe (scor < 15) se elimina daca nu persista ≥ 3 rulari. |
| 6 | Severitatea e calculata, nu narata | Scoringul determinist (`observationScoring`) stabileste severitatea INAINTE de orice sinteza LLM. LLM-ul nu inventeaza si nu ajusteaza severitate. |

---

## 1. `cash` — Lichiditate si obligatii de plata

### Ce detecteaza

- Lipsa de cash estimata pe orizontul analizat.
- Obligatii de plata fara acoperire in intrarile certe.
- Restante in crestere (obligatii depasite, cu trend ascendent).
- Concentrare de plati (mai multe obligatii mari scadente in aceeasi fereastra scurta).
- Obligatii critice (scadente apropiate, cu impact mare daca sunt ratate).
- Amanari repetate ale acelorasi plati.

### Surse de date

| Sursa | Prefix evidence | Rol |
|-------|----------------|-----|
| `buildForecast` (cash forecast) | `[cashForecast]` | Proiectia intrarilor/iesirilor pe orizont |
| `assessRisks` (risk engine) | `[riskEngine]` | Riscuri financiare deja evaluate |
| Operational (obligatii de plata, jurnale) | `[operational]` | Obligatii confirmate, scadente, restante |
| `predictionState` / `predict` | `[predictionEngine]` | Tendinte si estimari |
| `jarvis_state` | `[jarvis_state]` | Istoric observatii, stare deduplicare |

### Exemplu de formulare corecta

> „In urmatoarele 21 de zile, obligatiile confirmate depasesc intrarile certe cu **X lei**. Cele mai mari 3 obligatii: [operational] furnizor A — Y lei, scadenta Z. Datele bancare nu sunt conectate — soldul real al conturilor este necunoscut si NU a fost estimat."

Formulari INTERZISE:

- „Soldul contului este probabil ~N lei" (inventare de sold).
- „Compania nu are bani" (concluzie fara acoperire in date).

### Reguli speciale

- **NU se inventeaza solduri.** Motorul nu are acces la solduri bancare live; orice calcul de acoperire se face DOAR pe obligatii confirmate vs. intrari certe din sursele conectate.
- **Lipsa datelor bancare se declara explicit** in `unknowns[]` si coboara `data_quality` la `partial` sau `poor` (cu multiplicatorul aferent in scoring: 0.85 / 0.6).
- Impactul financiar intra direct in scoring: ≥ 100.000 lei → 30 puncte si criteriu de `requires_board_review=true`.

---

## 2. `sales` — Vanzari Bell Residence

### Ce detecteaza

- Rezervari fara avans incasat.
- Ritm de vanzare (accelerare/incetinire fata de baseline), **cand exista date**.
- Evolutia lead-urilor, **cand exista date**.

### Surse de date

| Sursa | Prefix evidence | Rol |
|-------|----------------|-----|
| Operational (unitati de vanzare, rezervari, parteneri) | `[operational]` | Stare unitati, rezervari, avansuri |
| `predictionState` / `predict` | `[predictionEngine]` | Ritm si tendinte |
| `jarvis_state` | `[jarvis_state]` | Baseline istoric |

### Exemplu de formulare corecta

> „[operational] Apartamentul B12 figureaza rezervat din data D, fara avans inregistrat dupa 14 zile. Baseline: rezervarile anterioare au avut avans in medie in 5 zile. Datele despre lead-uri nu sunt disponibile in perioada analizata — ritmul de generare lead-uri este necunoscut, nu zero."

### Reguli speciale

- **Lipsa datelor NU inseamna zero vanzari / zero lead-uri.** Perioadele fara date se marcheaza in `period_analyzed` + `unknowns[]`, iar `data_quality` scade corespunzator.
- Detectorii de ritm ruleaza DOAR cand exista suficiente puncte de date pentru un baseline; altfel nu se emite observatie de ritm.

---

## 3. `traffic` — Trafic bellresidence.ro

### Ce detecteaza

- Variatii semnificative de trafic pe bellresidence.ro (din Spion), **cand sursa e conectata**.
- Perioade fara date de trafic (se marcheaza explicit, nu se interpreteaza).

### Surse de date

| Sursa | Prefix evidence | Rol |
|-------|----------------|-----|
| Spion Site (contor vizitatori) | `[operational]` | Accesari agregate, fara IP brut (conform GDPR) |
| `jarvis_state` | `[jarvis_state]` | Baseline si istoric |

### Exemplu de formulare corecta

> „[operational] Traficul inregistrat de Spion in ultimele 7 zile este cu 40% sub media ultimelor 4 saptamani. Nota de calitate a datelor: contorul SUBNUMARA traficul real (audit 13 iul) — comparatia este valida doar relativ la propriul baseline, nu ca cifra absoluta."

### Reguli speciale

- **Lipsa datelor NU e trafic zero.** Daca Spion nu a raportat intr-o perioada, acea perioada se marcheaza ca „fara date" in `unknowns[]`, nu se trateaza ca scadere.
- Detectorii de trafic ruleaza DOAR cand sursa e conectata; sursa indisponibila devine, eventual, observatie `ops_risk`, nu `traffic`.
- Comparatiile se fac exclusiv fata de baseline-ul propriu al contorului (cifra absoluta e cunoscuta ca subnumarata).

---

## 4. `projects` — Proiecte si executie

### Ce detecteaza

- Intarzieri fata de termene.
- Blocaje (task-uri/etape care nu avanseaza).
- Termene fara progres inregistrat.
- Costuri vs. estimari (depasiri sau abateri semnificative de buget).

### Surse de date

| Sursa | Prefix evidence | Rol |
|-------|----------------|-----|
| Operational (task-uri, costuri proiect, comenzi materiale, productie) | `[operational]` | Stare executie, costuri reale |
| `computeHealth` | `[predictionEngine]` | Sanatatea agregata a proiectelor |
| `assessRisks` | `[riskEngine]` | Riscuri de executie deja evaluate |
| `reminders` / `decisions` | `[decizii]` | Termene si angajamente asumate |

### Exemplu de formulare corecta

> „[operational] Etapa «finisaje Corp 3» are termen T si zero progres inregistrat in ultimele 10 zile. [operational] Costurile cumulate pe proiect sunt cu 12% peste estimarea aprobata. Cauze posibile (neconfirmate): lipsa materiale, dependenta de subcontractor. Analiza recomandata: verificarea comenzilor de materiale aferente etapei."

### Reguli speciale

- Abaterile de cost se raporteaza fata de `baseline{}` (estimarea aprobata), cu `deviation{}` explicit — nu ca aprecieri vagi („e scump").
- „Fara progres" inseamna absenta modificarilor inregistrate in sursele conectate, si se formuleaza ca atare (posibil ca progresul sa existe dar sa nu fie inregistrat — se noteaza in `unknowns[]`).

---

## 5. `people` — Oameni si responsabilitati

### Ce detecteaza

- Greseli repetate (acelasi tip de eroare, recurent).
- Task-uri mutate repetat (reasignate sau amanate de mai multe ori).
- Supraincarcare (volum disproportionat pe o singura persoana).
- Responsabilitati neclare (task-uri fara responsabil clar sau cu responsabil disputat).

### Surse de date

| Sursa | Prefix evidence | Rol |
|-------|----------------|-----|
| Operational (task-uri Adrian/Nelu, jurnale, activitate parteneri) | `[operational]` | Istoric task-uri, asignari, mutari |
| `audit_log` (read-only) | `[audit]` | Tipare de interventie si corectie |
| `jarvis_state` | `[jarvis_state]` | Istoric observatii pe persoana/entitate |

### Exemplu de formulare corecta

> „[operational] Task-ul «comanda balustrade» a fost mutat de 4 ori intre responsabili in 3 saptamani, fara progres. Tiparul indica o **lipsa de claritate** (nu e definit cine decide furnizorul), nu o lipsa de disciplina. Analiza recomandata: clarificarea autoritatii de decizie pe achizitii Corp 3."

Formulari INTERZISE:

- „Nelu este neserios / dezorganizat / nu se poate baza nimeni pe el" (judecata de caracter).
- Orice eticheta psihologica sau morala aplicata unei persoane.

### Reguli speciale

- **FARA judecati de caracter.** Observatia descrie tiparul faptic, nu persoana.
- Fiecare tipar se incadreaza explicit intr-unul (sau mai multe) dintre cele **6 tipuri de lipsa**, care sunt singura grila de interpretare admisa:

| Tip de lipsa | Intrebarea la care raspunde |
|--------------|----------------------------|
| Lipsa **competentei** | Stie persoana CUM sa faca? |
| Lipsa **resurselor** | Are timpul/uneltele/banii necesari? |
| Lipsa **claritatii** | Stie exact CE se asteapta de la ea? |
| Lipsa **autoritatii** | Are dreptul sa decida/execute? |
| Lipsa **disciplinei** | Stie, poate, dar nu executa consecvent? |
| Lipsa **datelor** | Are informatiile necesare la timp? |

- Daca tiparul nu poate fi incadrat cu incredere rezonabila intr-un tip de lipsa, incadrarea se lasa deschisa in `unknowns[]` — nu se ghiceste.

---

## 6. `decisions` — Coerenta deciziilor

### Ce detecteaza

- Contradictii cu decizii aprobate anterior (actiuni sau stari care contrazic o decizie inregistrata).
- Decizii aprobate dar neexecutate (fara urma de executie dupa un interval rezonabil).
- Aceeasi problema analizata repetat fara decizie (bucla de analiza fara concluzie).

### Surse de date

| Sursa | Prefix evidence | Rol |
|-------|----------------|-----|
| Registrul de decizii | `[decizii]` | Deciziile aprobate si contextul lor |
| `audit_log` (read-only) | `[audit]` | Urmele de executie sau absenta lor |
| Operational | `[operational]` | Starea reala vs. decizia luata |
| `jarvis_state` | `[jarvis_state]` | Istoric analize repetate |

### Exemplu de formulare corecta

> „[decizii] Decizia D-014 (aprobata la data X): «furnizorul de tamplarie ramane F1». [operational] Comanda C-231 din data Y este emisa catre F2. Explicatii posibile (F39–F40, de verificat, nu se presupune eroarea): (a) informatii noi despre F1, (b) context nou de pret/termen, (c) ipoteze schimbate, (d) revizuire explicita neinregistrata, (e) eroare. Pana la clarificare, contradictia ramane deschisa."

### Reguli speciale

- **Orice contradictie cere explicatie (F39–F40).** O contradictie NU se raporteaza niciodata implicit ca eroare; se enumera obligatoriu cele 5 explicatii posibile: **informatii noi / context nou / ipoteze schimbate / revizuire explicita / eroare** — si se marcheaza care sunt plauzibile pe baza dovezilor.
- Contradictia **majora** de decizie este criteriu direct de `requires_board_review=true`.
- „Neexecutata" inseamna absenta urmelor de executie in sursele conectate — posibilitatea executiei neinregistrate se noteaza in `unknowns[]`.

---

## 7. `ops_risk` — Riscuri operationale ale sistemului

### Ce detecteaza

- Job-uri programate care nu au rulat.
- Erori repetitive (acelasi tip de eroare, recurent, in loguri).
- Surse de date indisponibile.
- Date vechi (surse care nu s-au mai actualizat in intervalul asteptat).
- Integrari picate (API-uri, conectori, servicii externe).

### Surse de date

| Sursa | Prefix evidence | Rol |
|-------|----------------|-----|
| `audit_log` (read-only) | `[audit]` | Rulari, erori, absente |
| `jarvis_state` | `[jarvis_state]` | Timestamps ultimelor actualizari per sursa |
| `observationSources` (metadate de colectare) | `[jarvis_state]` | Ce surse au raspuns / nu au raspuns la rularea curenta |

### Exemplu de formulare corecta

> „[audit] Job-ul de sincronizare X nu a rulat de 3 zile (ultima rulare reusita: data D). [jarvis_state] Ultimele date disponibile din sursa Y au vechime de 5 zile, peste pragul asteptat de 24h. Impact: observatiile din categoriile cash si sales ruleaza pe date incomplete (`data_quality: partial`)."

### Reguli speciale

- `ops_risk` este categoria care EXPLICA de ce alte categorii au `data_quality` scazuta — cele doua se leaga prin `recommended_next_analysis[]`, nu se dubleaza.
- O sursa indisponibila genereaza observatie `ops_risk`, NU observatii false in categoria care depindea de ea.
- Erorile repetitive se raporteaza ca tipar (tip, frecventa, prima/ultima aparitie), nu ca lista bruta de loguri.

---

## 8. `founder` — Dependenta de fondator

### Ce detecteaza

- Dependenta operationala de fondator: procese recurente care nu avanseaza fara interventia directa a lui Adrian (aprobari, decizii marunte, deblocari, informatii detinute doar de el).

### Surse de date

| Sursa | Prefix evidence | Rol |
|-------|----------------|-----|
| `audit_log` (read-only) | `[audit]` | Frecventa interventiilor fondatorului |
| Operational | `[operational]` | Task-uri/procese blocate pana la interventia lui |
| Registrul de decizii | `[decizii]` | Tipuri de decizii care urca sistematic la fondator |
| `jarvis_state` | `[jarvis_state]` | Trend in timp al dependentei |

### Exemplu de formulare corecta (formularea neutra este OBLIGATORIE)

> „Compania depinde inca de interventia fondatorului in **X procese recurente**: [operational] aprobarea comenzilor de materiale sub N lei, [decizii] alegerea furnizorilor uzuali, [audit] deblocarea task-urilor intre departamente. In ultimele 30 de zile: Y interventii, fata de Z in perioada anterioara (trend: crestere)."

Formulari INTERZISE:

- Orice analiza psihologica („Adrian nu deleaga pentru ca…").
- Orice critica personala („Adrian e un blocaj / micro-manageriaza").
- Orice recomandare comportamentala adresata persoanei.

### Reguli speciale

- **Formularea neutra este obligatorie**: subiectul propozitiei este COMPANIA si PROCESELE, niciodata persoana. Sablonul canonic: „Compania depinde inca de interventia fondatorului in X procese recurente".
- **NU analiza psihologica, NU critica personala.** Observatia masoara dependenta structurala (numar de procese, frecventa interventiilor, trend), atat.
- Dependenta de fondator adauga 5 puncte in scoringul determinist (factor dedicat).

---

## Sinteza: categorii × reguli speciale

| Categorie | Regula speciala definitorie |
|-----------|-----------------------------|
| `cash` | NU se inventeaza solduri; lipsa datelor bancare se declara explicit |
| `sales` | Lipsa datelor NU inseamna zero vanzari/lead-uri |
| `traffic` | Lipsa datelor NU e trafic zero; perioadele fara date se marcheaza; doar cu sursa conectata |
| `projects` | Abaterile se raporteaza fata de baseline explicit, cu deviation cuantificata |
| `people` | FARA judecati de caracter; incadrare obligatorie in cele 6 tipuri de lipsa |
| `decisions` | Orice contradictie cere explicatie (F39–F40): informatii noi / context nou / ipoteze schimbate / revizuire explicita / eroare |
| `ops_risk` | Sursa picata → observatie ops_risk, NU observatii false in categoria dependenta |
| `founder` | Formulare neutra obligatorie; subiect = compania si procesele, nu persoana |

---

*Document de guvernanta CODEX — Faza 4, Observation Engine. Taxonomia este inchisa: adaugarea unei categorii noi cere modificarea schemei canonice si a `observationValidator`, cu revizuire in /codex.*
