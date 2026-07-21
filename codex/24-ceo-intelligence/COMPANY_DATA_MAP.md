# COMPANY DATA MAP — Harta Creierului: Registrul celor 22 de Domenii de Date

> **STARE: FUNDAȚIE — registru READ-ONLY, zero efecte, zero acțiuni autonome.**
> Implementat în `src/ceo/companyDataMap.js`, configurat prin `src/ceo/companyConfig.js`
> (COMPANY INSTANCE #1 = PROFI CONCEPT). Nucleul este **GENERIC**: codul nu
> hardcodează compania — numele, oamenii (Adrian / Dana / Nelu), pragurile și
> sursele vin exclusiv din configurație. Harta **nu colectează** date noi, **nu
> trimite** nimic și **nu execută** nimic: ea spune doar, în orice moment, **ce
> vede CEO AI, ce nu vede și cât de mult să aibă încredere în ce vede**.
> Orice cerere de date către oameni trece prin Data Gap Engine și rămâne
> **NETRIMISĂ** fără ApprovalGate. Plățile sunt excluse total.

---

## 1. Ce este harta și de ce există

Un CEO care nu știe ce nu știe ia decizii proaste cu încredere maximă. Company
Data Map este mecanismul prin care JARVIS **refuză** această capcană: înainte de
orice raționament (SEE → UNDERSTAND → VERIFY → THINK), CEO AI consultă harta și
află pentru fiecare domeniu al companiei:

1. **de unde** vin datele (sursa reală, nu una ideală);
2. **dacă** sunt conectate (CONNECTED / PARTIAL / NOT_CONNECTED);
3. **cât de proaspete** și **cât de bune** sunt;
4. **cine** răspunde de ele (owner uman);
5. **ce știe** și **ce NU știe** CEO din acel domeniu;
6. **ce pierde afacerea** cât timp domeniul e deconectat;
7. **cum se conectează** (calea concretă, cu efort estimat).

Harta este sursa de adevăr pentru:

- [Observation Engine](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) — ce surse pot genera observații și cu ce încredere;
- [Proactive CEO Pipeline](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md) — secțiunea `CE DATE LIPSESC` din CEO Brief se derivă de aici;
- [Founder Attention Gate](../23-founder-attention/FOUNDER_ATTENTION_ARCHITECTURE.md) — un semnal pe date PARTIAL nu are aceeași greutate ca unul pe date CONNECTED;
- [Executive Board](../04-executive-board/README.md) — directorii primesc, lângă date, și starea surselor lor;
- Data Gap Engine (`src/ceo/dataGapEngine.js`) — fiecare domeniu neconectat devine un gap documentat, cu propunere de implementare;
- Cash Intelligence (`src/ceo/cashIntelligence.js`) — componentele modelului de lichiditate se mapează direct pe domeniile de mai jos.

**Regulă absolută:** date lipsă ≠ zero. Un domeniu deconectat produce
`UNKNOWN` + Data Gap, **niciodată** o valoare inventată (vezi §5).

---

## 2. Cele trei stări de conectare

| Stare | Definiție | Efect asupra raționamentului CEO |
|---|---|---|
| `CONNECTED` | Sursa reală alimentează sistemul automat sau printr-un flux disciplinat, complet pentru scopul domeniului | Datele sunt utilizabile în decizii, sub rezerva prospețimii și calității |
| `PARTIAL` | O parte a domeniului e acoperită; restul lipsește sau vine nestructurat | Orice concluzie se marchează explicit „**pe date parțiale**"; ce lipsește apare în `CE DATE LIPSESC` |
| `NOT_CONNECTED` | Nu există flux de date; domeniul trăiește pe hârtie, în telefoane sau în memoria oamenilor | Toate valorile domeniului = `UNKNOWN`; se emite Data Gap; **nicio recomandare finală** nu se sprijină pe acest domeniu (`DATA_REQUIRED`) |

Starea se evaluează **per domeniu**, determinist, din configurație + verificări
de conectori (`selfAudit.js` o reverifică zilnic). Nimeni — nici CEO AI — nu
poate „promova" un domeniu la CONNECTED prin optimism: promovarea cere o sursă
reală, verificabilă.

---

## 3. Câmpurile registrului (schema unui domeniu)

Fiecare din cele 22 de domenii poartă exact aceleași câmpuri:

| Câmp | Întrebarea la care răspunde |
|---|---|
| `SOURCE` | Care este sursa **reală** la Profi Concept (nu cea dorită)? |
| `CONNECTED` | CONNECTED / PARTIAL / NOT_CONNECTED |
| `FRESHNESS` | Care e pragul de prospețime al domeniului și unde suntem față de el? |
| `QUALITY` | HIGH / MEDIUM / LOW / UNKNOWN — cât de completă și corectă e sursa |
| `OWNER` | Omul care răspunde de date (Adrian / Dana / Nelu / contabil extern / JARVIS) |
| `WHAT CEO KNOWS` | Ce poate afirma CEO AI din acest domeniu, azi |
| `WHAT CEO DOES NOT KNOW` | Ce NU poate afirma — lista explicită a orbului |
| `BUSINESS IMPACT` | Ce pierde sau riscă firma cât timp domeniul rămâne așa |
| `HOW TO FIX` | Calea concretă de conectare, în pași, cu efortul estimat |

---

## 4. Harta celor 22 de domenii

### 4.1 Tabel sinoptic

| # | Domeniu | Sursa reală (Profi Concept) | Stare | Nivel critic | Owner |
|---|---|---|---|---|---|
| 1 | CASH | Jurnale de casă Dana → Operational (`cash_report`, `list_journals`) | PARTIAL | CRITIC | Dana |
| 2 | BANK | Formular Excel solduri bancare (trimis Danei, nereturant) | NOT_CONNECTED | CRITIC | Dana |
| 3 | ACCOUNTING | SmartBill API (serie SB) + `C:\Bell Data\Contabilitate` + contabil extern | PARTIAL | IMPORTANT | Dana + contabil |
| 4 | PAYABLES | Operational `list_payment_obligations` + Facturi Primite | PARTIAL | CRITIC | Dana |
| 5 | RECEIVABLES | SmartBill (facturi emise) + tranșe antecontracte (nestructurate) | PARTIAL | CRITIC | Dana / Adrian |
| 6 | SALES | Operational (`sales_summary`, `list_sales_units`, `partner_activity`) | CONNECTED | CRITIC | Adrian |
| 7 | LEADS | Telefon/WhatsApp Adrian + formular site + parteneri | PARTIAL | IMPORTANT | Adrian |
| 8 | BELL_INVENTORY | Operational `list_sales_units` (unitățile Bell Residence) | CONNECTED | IMPORTANT | Adrian |
| 9 | PROJECTS | Operational `project_costs`; bugete = formular Dana (în așteptare) | PARTIAL | IMPORTANT | Adrian / Dana |
| 10 | CONSTRUCTION | `production_summary` + `building_expenses` + raportări Nelu | PARTIAL | IMPORTANT | Nelu |
| 11 | SUPPLIERS | `list_material_orders` + referințe preț (/materiale) | PARTIAL | IMPORTANT | Nelu / Dana |
| 12 | CONTRACTS | Antecontracte/contracte notariale pe hârtie; scanare în lucru | NOT_CONNECTED | IMPORTANT | Adrian |
| 13 | PEOPLE | Task-uri per responsabil + jurnale Dana | PARTIAL | IMPORTANT | Adrian |
| 14 | TASKS | Operational (`list_tasks` + CRUD complet) | CONNECTED | IMPORTANT | Adrian / Nelu |
| 15 | WEBSITE_TRAFFIC | GA4 „Bell Residence" (544681576) + contor propriu GDPR | PARTIAL | SUPORT | JARVIS / Adrian |
| 16 | MARKETING | `marketing_report`; Google Ads blocat (verificare advertiser UE); Meta blocat | PARTIAL | IMPORTANT | Adrian / @marketing |
| 17 | EMAIL | Gmail proficoncept.sb (acces direct + Email Voice Watcher) | CONNECTED | SUPORT | Adrian |
| 18 | CALENDAR | Google Calendar (conector activ) | CONNECTED | SUPORT | Adrian |
| 19 | LEGAL | Avocat/notar extern; acte pe hârtie | NOT_CONNECTED | SUPORT | Adrian |
| 20 | ASSETS | Fără registru de active (terenuri, utilaje, vehicule) | NOT_CONNECTED | SUPORT | Adrian / Dana |
| 21 | FINANCING | Credite și scadențare bancare — necunoscute sistemului | NOT_CONNECTED | CRITIC | Adrian / Dana |
| 22 | DECISIONS | firma-vault (Obsidian) + `codex/decisions` + jarvis_state/audit | PARTIAL | SUPORT | Adrian + JARVIS |

**Citire rapidă:** 5 domenii CONNECTED · 12 PARTIAL · 5 NOT_CONNECTED. Din cele
6 domenii CRITICE, doar **unul** (SALES) e complet conectat — iar două
(BANK, FINANCING) sunt complet oarbe. Acesta e motivul pentru care formularul
Excel trimis Danei (solduri bancare + încasări estimate + bugete proiecte) este
**cea mai valoroasă singură acțiune** de pe hartă: deblochează simultan BANK,
RECEIVABLES (parțial) și PROJECTS (parțial).

### 4.2 Fișele domeniilor — nivel CRITIC

#### 1. CASH — numerar disponibil

| Câmp | Valoare |
|---|---|
| Sursa reală | Jurnalele de casă ale Danei în Operational (`cash_report`, `list_journals`) |
| Stare | **PARTIAL** — casa e acoperită; băncile nu (vezi BANK) |
| Prospețime | Prag 24h; la zi când Dana scrie jurnalul în ziua respectivă |
| Calitate | MEDIUM — corectă pe ce e înregistrat, incompletă ca acoperire |
| Owner | Dana |
| Ce ȘTIE CEO | Intrările/ieșirile de numerar înregistrate; soldul de casă pe jurnal |
| Ce NU ȘTIE CEO | Cash-ul total al firmei (fără solduri bancare, totalul = `UNKNOWN`) |
| Impact | Orice proiecție de lichiditate e incompletă; risc de decizie pe cash care nu există — sau de blocare a unei decizii bune din prudență oarbă |
| Cum se conectează | Pas 1: formularul Danei (solduri) → CASH devine calculabil. Pas 2: reconciliere periodică jurnal ↔ extras. Țintă: agregare automată zilnică |

#### 2. BANK — solduri și mișcări bancare

| Câmp | Valoare |
|---|---|
| Sursa reală | Formularul Excel trimis Danei (solduri bancare) — **încă nereturant** |
| Stare | **NOT_CONNECTED** |
| Prospețime | Prag 24–72h (irelevant până la conectare) |
| Calitate | UNKNOWN |
| Owner | Dana |
| Ce ȘTIE CEO | Că există conturi bancare. Atât. |
| Ce NU ȘTIE CEO | Soldul per cont, mișcările, sumele blocate/garanțiile |
| Impact | Primul termen din PROJECTED LIQUIDITY (`BANK BALANCE`) = `UNKNOWN` → **toate orizonturile** (azi/7/14/21/30/60/90) rămân `UNKNOWN`. Cel mai mare orb al hărții |
| Cum se conectează | Pas 1: formularul Danei (efort: minute, deja trimis). Pas 2: export săptămânal extras (CSV/MT940) în `Contabilitate`. Țintă: conector bancar read-only (PSD2) — necesită aprobarea explicită a lui Adrian |

#### 4. PAYABLES — obligații de plată

| Câmp | Valoare |
|---|---|
| Sursa reală | Operational `list_payment_obligations` + `Contabilitate\Facturi Primite` |
| Stare | **PARTIAL** |
| Prospețime | Prag 24h; la zi pe ce e introdus |
| Calitate | MEDIUM — depinde de disciplina introducerii |
| Owner | Dana |
| Ce ȘTIE CEO | Obligațiile introduse, cu scadențe și beneficiari |
| Ce NU ȘTIE CEO | Facturile primite dar neînregistrate; înțelegerile verbale (rate, amânări, penalități negociate) |
| Impact | Scadențe ratate = penalități + relații deteriorate cu furnizorii; PROJECTED LIQUIDITY subestimează ieșirile → optimism fals |
| Cum se conectează | Regulă operațională: fiecare factură primită → obligație în Operational în aceeași zi. Accelerator: scanner Konica → `C:\Scanari` (în lucru) → extracție automată din PDF |

#### 5. RECEIVABLES — încasări de primit

| Câmp | Valoare |
|---|---|
| Sursa reală | SmartBill API (facturi emise, status încasare) + tranșe din antecontracte (nestructurate) + formular Dana (încasări estimate — în așteptare) |
| Stare | **PARTIAL** |
| Prospețime | Prag 24–72h; facturile SmartBill la zi, tranșele deloc |
| Calitate | MEDIUM pe facturi, UNKNOWN pe tranșe |
| Owner | Dana / Adrian |
| Ce ȘTIE CEO | Facturile emise și statusul lor |
| Ce NU ȘTIE CEO | Tranșele contractuale viitoare (sume, date, probabilitate) → separarea `CONFIRMED` vs `PROBABLE RECEIVABLES` e imposibilă |
| Impact | Orizonturile 30/60/90 din Cash Intelligence sunt oarbe exact acolo unde se joacă viitorul firmei; `EXPECTED CASH` nu poate fi distins de speranță |
| Cum se conectează | Pas 1: formularul Danei (încasări estimate). Pas 2: registru de tranșe per antecontract în Operational (sumă, scadență, condiție). Se leagă de CONTRACTS |

#### 6. SALES — vânzări

| Câmp | Valoare |
|---|---|
| Sursa reală | Operational: `sales_summary`, `list_sales_units`, `partner_activity`; prețuri reale confirmate (66.476 / 99.943 / 125.786 €) |
| Stare | **CONNECTED** |
| Prospețime | Prag 24h; la zi |
| Calitate | HIGH |
| Owner | Adrian |
| Ce ȘTIE CEO | Fiecare unitate: status (liberă/rezervată/vândută), preț, activitatea partenerilor |
| Ce NU ȘTIE CEO | De ce se pierd clienții; cât stă un client în fiecare stagiu (vezi Sales Intelligence — stagiile fără sursă = NOT_CONNECTED, nu simulate) |
| Impact | — (conectat); dacă disciplina de actualizare slăbește, firma orbește pe singura sursă majoră de venit |
| Cum se conectează | Menținere: statusul se schimbă în Operational **în ziua** evenimentului |

#### 21. FINANCING — credite și serviciul datoriei

| Câmp | Valoare |
|---|---|
| Sursa reală | Graficele de rambursare bancare — există pe hârtie, necunoscute sistemului |
| Stare | **NOT_CONNECTED** |
| Prospețime | Prag 30 zile (irelevant până la conectare) |
| Calitate | UNKNOWN |
| Owner | Adrian / Dana |
| Ce ȘTIE CEO | Nimic structurat |
| Ce NU ȘTIE CEO | Soldul creditelor, ratele lunare, dobânzile, garanțiile, covenants |
| Impact | Termenul `DEBT SERVICE` din PROJECTED LIQUIDITY = `UNKNOWN` → proiecția de lichiditate ar fi **fals-optimistă** dacă s-ar calcula fără el; de aceea nu se calculează, se declară `UNKNOWN` |
| Cum se conectează | Scadențar per credit: graficul de rambursare scanat + un tabel simplu (credit, rată, scadență, sold). Efort: sub o oră, o singură dată + actualizare la refinanțare |

### 4.3 Fișele domeniilor — nivel IMPORTANT

#### 3. ACCOUNTING — contabilitate

| Câmp | Valoare |
|---|---|
| Sursa reală | SmartBill API (facturi emise, serie SB; config `C:\Bell Data\.claude\smartbill-api.json`) + `C:\Bell Data\Contabilitate` + balanțe de la contabilul extern |
| Stare | **PARTIAL** |
| Prospețime | Facturi: 24h; balanță: prag 30 zile — sosește neregulat |
| Calitate | MEDIUM |
| Owner | Dana + contabil extern |
| Ce ȘTIE CEO | Facturile emise prin SmartBill; documentele arhivate în Contabilitate |
| Ce NU ȘTIE CEO | Balanța curentă, TVA de plată/recuperat, profitul contabil real |
| Impact | Separarea CASH ≠ PROFIT nu poate fi **verificată** contabil; obligațiile fiscale sunt estimări, nu certitudini |
| Cum se conectează | Balanța lunară (PDF/Excel) de la contabil → `Contabilitate\Rapoarte` → citire automată. Țintă: export e-Factura/SPV |

#### 7. LEADS — clienți potențiali

| Câmp | Valoare |
|---|---|
| Sursa reală | Telefonul/WhatsApp-ul lui Adrian + formularul de pe bellresidence.ro + partenerii de vânzări (`partner_activity`) |
| Stare | **PARTIAL** — doar partenerii lasă urme structurate |
| Prospețime | Prag 24h |
| Calitate | LOW pe ansamblu |
| Owner | Adrian |
| Ce ȘTIE CEO | Lead-urile venite prin parteneri |
| Ce NU ȘTIE CEO | Lead-urile directe: câte sunt, de unde vin, ce s-a întâmplat cu ele |
| Impact | Capătul funnel-ului LEAD→CONTACT e orb → marketingul nu poate fi corelat cu vânzările → bugetul de reclamă se cheltuie fără buclă de feedback |
| Cum se conectează | Registru minimal de lead-uri în Operational (nume, sursă, dată, status) — disciplină de 30 sec/lead. Țintă: formularul site-ului scrie direct în Operational |

#### 8. BELL_INVENTORY — inventarul Bell Residence

| Câmp | Valoare |
|---|---|
| Sursa reală | Operational `list_sales_units` |
| Stare | **CONNECTED** |
| Prospețime | La eveniment (rezervare/vânzare/schimbare preț); la zi |
| Calitate | HIGH |
| Owner | Adrian |
| Ce ȘTIE CEO | Fiecare unitate: corp, etaj, suprafață, preț, status |
| Ce NU ȘTIE CEO | Istoricul complet al modificărilor de preț per unitate (parțial în audit) |
| Impact | — (conectat) |
| Cum se conectează | Menținere |

#### 9. PROJECTS — proiecte și bugete

| Câmp | Valoare |
|---|---|
| Sursa reală | Operational `project_costs`; bugetele aprobate = formularul Danei (în așteptare) |
| Stare | **PARTIAL** |
| Prospețime | Prag 7 zile |
| Calitate | MEDIUM |
| Owner | Adrian / Dana |
| Ce ȘTIE CEO | Costurile înregistrate per proiect |
| Ce NU ȘTIE CEO | Bugetul aprobat vs. consumat; angajamentele viitoare (`PROJECT COMMITMENTS`) |
| Impact | Depășirile de buget se văd târziu, nu preventiv; termenul `PROJECT COMMITMENTS` din modelul de lichiditate = `UNKNOWN` |
| Cum se conectează | Bugete per proiect din formularul Danei + revizie trimestrială în Operational |

#### 10. CONSTRUCTION — execuție șantier

| Câmp | Valoare |
|---|---|
| Sursa reală | `production_summary` + `building_expenses` + raportările lui Nelu |
| Stare | **PARTIAL** |
| Prospețime | Prag 7 zile; raportările vin neregulat |
| Calitate | MEDIUM |
| Owner | Nelu |
| Ce ȘTIE CEO | Cheltuielile pe clădiri; sumarul de producție raportat |
| Ce NU ȘTIE CEO | Stadiul fizic real vs. planificat (procent execuție pe faze); întârzierile în timp real |
| Impact | Promisiuni de livrare către clienți fără bază verificată → risc de penalități din antecontracte și de reputație |
| Cum se conectează | Raport săptămânal de stadiu de la Nelu (procent pe faze + fotografii) în Operational — un task recurent, 15 min/săptămână |

#### 11. SUPPLIERS — furnizori și materiale

| Câmp | Valoare |
|---|---|
| Sursa reală | `list_material_orders` + referințe de preț (coloana de verificare la /materiale, `import_price_references`) |
| Stare | **PARTIAL** |
| Prospețime | Prag 7 zile |
| Calitate | MEDIUM |
| Owner | Nelu / Dana |
| Ce ȘTIE CEO | Comenzile de materiale înregistrate; referințele de preț pentru verificare |
| Ce NU ȘTIE CEO | Termene de livrare confirmate; fiabilitatea istorică per furnizor; condițiile de plată negociate |
| Impact | Avansuri către furnizori nefiabili; blocaje de șantier din livrări întârziate pe care nimeni nu le vede venind |
| Cum se conectează | Câmpuri `termen_livrare` + `status_livrare` pe comenzi; scorul de fiabilitate se derivă apoi automat, fără efort suplimentar |

#### 12. CONTRACTS — antecontracte și contracte

| Câmp | Valoare |
|---|---|
| Sursa reală | Acte notariale pe hârtie + PDF-uri răzlețe; modelul de negociere Excel (Corp 3) există, contractele efective nu sunt în sistem |
| Stare | **NOT_CONNECTED** |
| Prospețime | La eveniment (irelevant până la conectare) |
| Calitate | UNKNOWN |
| Owner | Adrian |
| Ce ȘTIE CEO | Nimic structurat despre contractele semnate |
| Ce NU ȘTIE CEO | Tranșele scadente, clauzele de penalitate, obligațiile de livrare per client |
| Impact | RECEIVABLES probabilistic imposibil; risc juridic invizibil; termenele contractuale trăiesc exclusiv în memoria lui Adrian — un singur om, zero redundanță |
| Cum se conectează | Pas 1: scanare (Konica → `C:\Scanari`, în lucru). Pas 2: registru de contracte în Operational (părți, valoare, tranșe, termene, penalități). Deblochează și RECEIVABLES și LEGAL |

#### 13. PEOPLE — oameni și performanță

| Câmp | Valoare |
|---|---|
| Sursa reală | `list_tasks` per responsabil (Adrian/Nelu) + jurnalele Danei |
| Stare | **PARTIAL** |
| Prospețime | Prag 24h |
| Calitate | LOW pentru scopul evaluării (bogată în ce, săracă în de ce) |
| Owner | Adrian |
| Ce ȘTIE CEO | Cine ce task are, statusuri, întârzieri brute |
| Ce NU ȘTIE CEO | Contextul: complexitate, dependențe, cauze; calitatea rezultatului; prima greșeală vs. eroare repetată |
| Impact | Risc de evaluare nedreaptă — exact riscul interzis de Founder DNA: **performanța umană ≠ număr de task-uri**. People Intelligence (`src/ceo/peopleIntelligence.js`) rămâne pe date sărace și o spune explicit |
| Cum se conectează | Câmpuri `motiv_intarziere` + `rezultat_verificat` pe task-uri; feedback lunar structurat de la Adrian |

#### 14. TASKS — task-uri operaționale

| Câmp | Valoare |
|---|---|
| Sursa reală | Operational (`list_tasks` + creare/actualizare/ștergere) |
| Stare | **CONNECTED** |
| Prospețime | Timp real |
| Calitate | HIGH |
| Owner | Adrian / Nelu |
| Ce ȘTIE CEO | Toate task-urile: responsabil, termen, status |
| Ce NU ȘTIE CEO | Task-urile date verbal și necapturate |
| Impact | — (conectat) |
| Cum se conectează | Disciplină: „ce nu e în Operational nu există" |

#### 16. MARKETING — campanii și cost per rezultat

| Câmp | Valoare |
|---|---|
| Sursa reală | `marketing_report` (Operational); Google Ads — campanie Search creată, **blocată** pe verificarea advertiser UE; Meta — handoff blocat pe permisiuni |
| Stare | **PARTIAL** |
| Prospețime | Prag 24h |
| Calitate | LOW — raportare internă fără date de platformă |
| Owner | Adrian / @marketing |
| Ce ȘTIE CEO | Raportările interne de marketing |
| Ce NU ȘTIE CEO | Cost per lead real; performanța campaniilor (nepornite/blocate); atribuirea lead→campanie |
| Impact | Bugetul de test (50+20 lei/zi) nu poate fi evaluat; împreună cu golul din LEADS, bucla marketing→vânzări e ruptă la ambele capete |
| Cum se conectează | Finalizarea verificării advertiser UE → API Google Ads read-only; deblocarea permisiunilor Meta; atribuirea cere și registrul de lead-uri (LEADS) |

### 4.4 Fișele domeniilor — nivel SUPORT

#### 15. WEBSITE_TRAFFIC — trafic bellresidence.ro

| Câmp | Valoare |
|---|---|
| Sursa reală | GA4 „Bell Residence" (proprietate 544681576, G-VMVM29XZ2Z) + contorul propriu GDPR (fără IP brut, `VISITOR_SALT`) |
| Stare | **PARTIAL** — GA4 creat dar nemontat pe Vercel; contorul propriu funcționează dar **subnumără** traficul real (audit 13 iul) |
| Prospețime | Prag 24h; contorul la zi |
| Calitate | MEDIUM — cifre corecte ca tendință, subevaluate ca volum |
| Owner | JARVIS / Adrian |
| Ce ȘTIE CEO | Accesările contorizate (limită cunoscută: subnumărare) |
| Ce NU ȘTIE CEO | Traficul real complet, sursele de trafic, pozițiile în căutări (fără Search Console) |
| Impact | Eficiența site-ului și a reclamelor nu se poate măsura; deciziile de buget se iau pe tendințe, nu pe volume |
| Cum se conectează | GA4 montat pe Vercel + acces Search Console + cititorul JARVIS (service account `jarvis-reader` — deja pregătit parțial) |

#### 17. EMAIL — corespondență

| Câmp | Valoare |
|---|---|
| Sursa reală | Gmail proficoncept.sb (acces direct + Email Voice Watcher, always-on) |
| Stare | **CONNECTED** |
| Prospețime | Timp real |
| Calitate | HIGH |
| Owner | Adrian |
| Ce ȘTIE CEO | Fiecare email nou pe adresa firmei |
| Ce NU ȘTIE CEO | Fluxurile de business purtate pe alte adrese sau pe WhatsApp |
| Impact | — (conectat) |
| Cum se conectează | Menținere; canalele paralele rămân un orb asumat |

#### 18. CALENDAR — programări

| Câmp | Valoare |
|---|---|
| Sursa reală | Google Calendar (conector activ) |
| Stare | **CONNECTED** |
| Prospețime | Timp real |
| Calitate | HIGH |
| Owner | Adrian |
| Ce ȘTIE CEO | Evenimentele și programările înregistrate |
| Ce NU ȘTIE CEO | Întâlnirile stabilite verbal, neintroduse |
| Impact | — (conectat) |
| Cum se conectează | Disciplină de calendar |

#### 19. LEGAL — juridic

| Câmp | Valoare |
|---|---|
| Sursa reală | Avocat/notar extern; acte pe hârtie |
| Stare | **NOT_CONNECTED** |
| Prospețime | La eveniment |
| Calitate | UNKNOWN |
| Owner | Adrian |
| Ce ȘTIE CEO | Nimic structurat |
| Ce NU ȘTIE CEO | Litigii, autorizații și termenele lor de expirare, obligații legale în curs |
| Impact | Un termen legal ratat poate opri șantierul sau vânzările; riscul e total invizibil până devine urgență |
| Cum se conectează | Registru minimal (act, termen, responsabil) alimentat la fiecare eveniment notarial + scanarea actelor (aceeași cale ca la CONTRACTS) |

#### 20. ASSETS — active

| Câmp | Valoare |
|---|---|
| Sursa reală | Nu există registru de active (terenuri, utilaje, vehicule); inventarul de apartamente e domeniul separat BELL_INVENTORY |
| Stare | **NOT_CONNECTED** |
| Prospețime | La eveniment / anual |
| Calitate | UNKNOWN |
| Owner | Adrian / Dana |
| Ce ȘTIE CEO | Nimic structurat |
| Ce NU ȘTIE CEO | Ce active deține firma, valoarea, starea, asigurările și expirările lor |
| Impact | Valoarea companiei necalculabilă; asigurări expirate nevăzute; garanții date băncilor fără evidență proprie |
| Cum se conectează | Un singur Excel în `Contabilitate\Documente` (activ, valoare, stare, asigurare, expirare) — efort mic, o dată, apoi întreținere la eveniment |

#### 22. DECISIONS — jurnalul deciziilor

| Câmp | Valoare |
|---|---|
| Sursa reală | firma-vault (Obsidian, repo GitHub privat) + `codex/decisions` + jarvis_state/audit |
| Stare | **PARTIAL** |
| Prospețime | La eveniment |
| Calitate | MEDIUM |
| Owner | Adrian + JARVIS |
| Ce ȘTIE CEO | Deciziile notate în vault și în codex |
| Ce NU ȘTIE CEO | Deciziile verbale nescrise; motivația completă la momentul deciziei |
| Impact | Closed Loop (`src/ceo/closedLoop.js`) nu poate lega rezultatele de decizii → pasul LEARN din ciclu rămâne parțial; compania nu învață auditabil |
| Cum se conectează | Fiecare decizie majoră → notă de decizie în vault + legare la episodul executiv care a generat-o |

---

## 5. Regula ZERO vs NU AM DATE

Cea mai periculoasă eroare a unui sistem de informare este să prezinte absența
datelor drept valoare zero. Harta o interzice structural:

> **ZERO** este o valoare **măsurată** dintr-o sursă `CONNECTED` și `FRESH`.
> **NU AM DATE** (`UNKNOWN`) este absența sursei, a prospețimii sau a acoperirii.
> Cele două **nu se amestecă niciodată** — nu în rapoarte, nu în briefuri, nu în
> decizii, nu în Digest.

Condiția formală: o valoare `0` este raportabilă ca zero **doar dacă** domeniul
sursă e `CONNECTED` **și** în pragul de prospețime. Altfel, valoarea este
`UNKNOWN` și generează Data Gap (`dataGapEngine.js`).

### Exemple canonice

| Întrebare | Răspuns GREȘIT (interzis) | Răspuns CORECT |
|---|---|---|
| „Cât avem în bancă?" | „0 lei" | „**NU AM DATE** — BANK e NOT_CONNECTED. Formularul e la Dana; fără el, lichiditatea proiectată e UNKNOWN." |
| „Câte lead-uri directe am avut săptămâna asta?" | „0 lead-uri" | „**NU AM DATE** — lead-urile directe (telefon/WhatsApp) nu sunt capturate. Prin parteneri: N (sursă parțială)." |
| „Câte rate de credit avem luna asta?" | „Niciuna" | „**NU AM DATE** — FINANCING e NOT_CONNECTED; DEBT SERVICE = UNKNOWN." |
| „Câte unități s-au rezervat azi?" | — | „**0** — zero verificat: `list_sales_units` e CONNECTED și la zi." |
| „Ce obligații de plată avem scadente azi?" | „Niciuna" (fără calificare) | „**0 înregistrate** în sursa conectată; PAYABLES e PARTIAL — pot exista facturi primite neintroduse." |

Ultimul exemplu arată forma intermediară: pe un domeniu `PARTIAL`, un zero se
raportează întotdeauna **calificat** („0 în sursa conectată"), niciodată
absolut. Aceeași regulă alimentează secțiunea `CE DATE LIPSESC` din
[CEO Brief](../22-proactive-ceo/CEO_BRIEF_FORMAT.md) și pragul `DATA_REQUIRED`
din Decision Engine V2 (`src/ceo/decisionEngineV2.js`): **decizie cu date
critice lipsă ≠ recomandare finală**.

---

## 6. Company Data Health Score (CDHS)

CDHS măsoară **cât vede CEO AI**, nu cât de sănătoasă e compania. O firmă
excelentă cu date deconectate are CDHS mic; un CDHS mare nu garantează o firmă
sănătoasă — garantează doar că, dacă ceva e rău, **se vede**.

### Formula (deterministă, calculată în `companyDataMap.js`)

```
scor(d)  = stare(d) × prospetime(d) × calitate(d)          ∈ [0, 1]

CDHS     = 100 × Σ [ w(d) × scor(d) ] / Σ w(d)             ∈ [0, 100]
```

**Factorii:**

| Factor | Valori |
|---|---|
| `stare(d)` | CONNECTED = 1.0 · PARTIAL = 0.5 · NOT_CONNECTED = 0.0 |
| `prospetime(d)` | FRESH (în prag) = 1.0 · STALE (≤ 3× prag) = 0.6 · EXPIRED (> 3× prag) = 0.3 |
| `calitate(d)` | HIGH = 1.0 · MEDIUM = 0.7 · LOW = 0.4 · UNKNOWN = 0.2 |
| `w(d)` | CRITIC = 3 · IMPORTANT = 2 · SUPORT = 1 (din `companyConfig.js`, nu din cod) |

Un domeniu NOT_CONNECTED contribuie **exact 0**, indiferent de restul factorilor
— nu există credit parțial pentru surse inexistente.

### Benzi de interpretare

| CDHS | Interpretare | Consecință |
|---|---|---|
| 0–39 | **Orbire operațională** | CEO AI refuză recomandări finale pe domeniile oarbe; prioritatea #1 devine conectarea datelor |
| 40–69 | **Vedere parțială** | Recomandări posibile, marcate „pe date parțiale"; gap-urile critice apar recurent în Digest |
| 70–89 | **Vedere bună** | Raționament de încredere pe majoritatea domeniilor |
| 90–100 | **Vedere completă** | Limitele rămase sunt asumate și documentate |

### Instantaneu orientativ (COMPANY INSTANCE #1, iulie 2026)

Valoarea autoritativă se calculează la rulare și se expune read-only în
`/api/ceo/*`; estimarea de mai jos e ilustrativă, pe stările din §4:

| Nivel | Punctaj estimat | Maxim |
|---|---|---|
| CRITIC (6 domenii, w=3) | ~5.7 | 18 |
| IMPORTANT (10 domenii, w=2) | ~6.8 | 20 |
| SUPORT (6 domenii, w=1) | ~2.6 | 6 |
| **CDHS** | **≈ 34 / 100** | — |

Citirea corectă a lui 34: **CEO AI vede circa o treime din companie.** Nu e un
verdict despre firmă — e harta drumului. Primele trei mutări cu efect maxim pe
scor: (1) formularul Danei → BANK + RECEIVABLES + PROJECTS; (2) scadențarul
creditelor → FINANCING; (3) registrul de contracte → CONTRACTS (+ LEGAL,
+ RECEIVABLES). Toate trei sunt efort de ore, nu de luni — iar cererile către
oameni pleacă **doar** prin Data Gap Engine + ApprovalGate, cu aprobarea lui
Adrian.

---

## 7. Guvernanță și legături

- Harta e **registru, nu agent**: citește configurație, nu colectează, nu trimite, nu execută. Singura poartă pentru orice efect rămâne `approvalGate` — inclusiv pentru un simplu mesaj de tip Information Request către Dana.
- `selfAudit.js` reverifică zilnic stările și prospețimea; degradările apar în CEO SYSTEM HEALTH, nu se ascund.
- Orice schimbare de stare a unui domeniu (ex. BANK → CONNECTED) se consemnează în audit și se reflectă automat în Health Score — fără editare manuală de scor.
- Documente înrudite: [Observation Engine](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) · [Proactive CEO](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md) · [CEO Brief Format](../22-proactive-ceo/CEO_BRIEF_FORMAT.md) · [Founder Attention](../23-founder-attention/FOUNDER_ATTENTION_ARCHITECTURE.md) · [Executive Board](../04-executive-board/) · restul fazei 24 (Data Gap Engine, Cash Intelligence, Proposal Engine, Sales/People Intelligence, Decision Engine V2, Closed Loop, Self-Audit, Improvement Engine).

> Principiul întregii hărți, într-o frază: **CEO AI nu pretinde niciodată că
> vede ce nu vede — și știe exact ce l-ar face să vadă mai mult.**
