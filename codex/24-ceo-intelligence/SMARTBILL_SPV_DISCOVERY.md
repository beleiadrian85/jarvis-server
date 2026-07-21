# SMARTBILL & SPV DISCOVERY — Auditul integrărilor contabile

> Audit de descoperire: ce integrări contabile sunt **posibile** pentru CEO AI,
> pe ce căi oficiale, cu ce cost și ce beneficiu — **fără nicio credențială
> introdusă acum**. Documentul propune; nu conectează nimic. Orice conectare
> reală trece prin Change Control + ApprovalGate, cu Adrian ca decident final.
>
> **Stare:** DISCOVERY. Nicio integrare server-side activă. Există o integrare
> SmartBill **locală, funcțională, pe BIROU** (config în
> `C:\Bell Data\.claude\smartbill-api.json`, serie facturi SB) — candidat de
> portare pe server. SPV/e-Factura: neconectat, cale oficială identificată.
> Plățile sunt **excluse total** din orice etapă.

---

## 1. Scop și limite

Domeniile contabile din registrul companiei — `ACCOUNTING`, `RECEIVABLES`,
`PAYABLES`, parțial `CASH` (vezi `src/ceo/companyDataMap.js`) — sunt astăzi
alimentate manual sau deloc. CEO AI nu poate raționa corect pe cash fără facturi
emise, facturi primite, scadențe și încasări **cu sursă declarată**. Regula
absolută rămâne: **date lipsă ≠ zero** — un domeniu neconectat se raportează
`NOT_CONNECTED`, nu „0 lei".

Acest document face trei lucruri, și doar trei:

1. inventariază **căile oficiale** de acces la datele contabile;
2. fixează **ierarhia preferințelor** de integrare (secțiunea 4);
3. propune o **arhitectură pe etape**, fiecare cu cost/beneficiu, fiecare gated.

Ce NU face: nu introduce credențiale, nu activează conectori, nu emite facturi,
nu inițiază și nu va iniția vreodată plăți. Propunere ≠ execuție.

## 2. Sursa 1 — SmartBill Cloud API (oficial)

| Aspect | Detaliu |
|---|---|
| Tip | API REST oficial SmartBill Cloud, autentificare cu **token API + email cont** |
| Stare actuală | integrare **locală funcțională pe BIROU**; config în `C:\Bell Data\.claude\smartbill-api.json`; seria de facturi **SB** |
| Acoperă | facturi **emise** (emitere, listare, PDF, status), **încasări/plăți pe facturi emise**, serii, clienți, proforme/estimate, stocuri (după abonament) |
| NU acoperă | facturile **primite** de la furnizori (nu e scopul SmartBill API) — pentru ele sursa corectă e SPV/e-Factura |
| Risc | scăzut: API documentat, versionat, cu rate limits publice; token revocabil oricând din contul SmartBill |
| Cost | 0 suplimentar (inclus în abonamentul SmartBill existent); efort de portare mic — clientul există deja local |

**Decizie de portare (propusă, nu executată):** integrarea de pe BIROU se
portează pe server (jarvis-server) prin **Change Control**: token-ul intră ca
variabilă de mediu pe Railway (niciodată în repo, niciodată în codex), modul de
pornire este **read-only** (listare facturi + încasări), iar orice operație de
scriere (emitere factură) rămâne în spatele ApprovalGate, per acțiune.

## 3. Sursa 2 — SPV / e-Factura ANAF (oficial)

| Aspect | Detaliu |
|---|---|
| Tip | API oficial ANAF (SPV / RO e-Factura), **OAuth 2.0** cu aplicație înregistrată la ANAF + **certificat digital calificat** al reprezentantului |
| Stare actuală | neconectat; e-Factura e obligatorie B2B în România, deci fluxul de date **există deja** în SPV pentru firmă |
| Acoperă | facturi **primite** de la furnizori (XML UBL 2.1 — sursa canonică pentru `PAYABLES` și scadențe furnizori), confirmarea facturilor **emise** (dublă verificare față de SmartBill), mesajele SPV (notificări, erori de validare) |
| NU acoperă | încasările/plățile efective (SPV vede documentul, nu banii — banii se văd în bancă și în SmartBill) |
| Precondiții | certificat calificat valabil, înrolare SPV pe firmă, înregistrarea aplicației OAuth la ANAF, refresh-token gestionat pe server |
| Risc | mediu: birocratic la setup (certificat + OAuth), stabil după; API-ul ANAF are ferestre de mentenanță — se tratează cu retry + freshness declarat |
| Cost | 0 recurent pentru API; costul real e efortul de setup (certificat + OAuth) și mentenanța token-urilor |

Cele două surse sunt **complementare, nu redundante**: SmartBill = ce emitem și
ce încasăm; SPV = ce primim și ce datorăm. Împreună închid ciclul documentelor.
Banii efectivi rămân pe domeniul `BANK` (integrare separată, în afara acestui
document).

## 4. Ierarhia preferințelor de integrare

Regulă de guvernanță pentru orice conector de date al CEO AI, nu doar contabil:

| Prioritate | Cale | Când | Exemplu aici |
|---|---|---|---|
| 1 | **API oficial** | întotdeauna când există | SmartBill Cloud API, SPV/e-Factura OAuth |
| 2 | **Integrare sigură** (export/webhook documentat de furnizor) | când API-ul nu acoperă tot | export SmartBill programat, arhiva ZIP e-Factura |
| 3 | **Import automat** (fișiere primite pe canale existente: email, folder sincronizat) | când 1–2 nu există | extrase/rapoarte de la Dana în folderul Contabilitate |
| 4 | **Input uman structurat** | ultimă instanță, cu formular clar | formularul Excel al Danei (solduri + încasări estimate) |

**Regulă absolută: NICIODATĂ scraping fragil când există o alternativă
oficială.** Un scraper pe interfața web SmartBill sau pe portalul SPV ar fi:
casant la orice schimbare de UI, imposibil de auditat, potențial contrar
termenilor de utilizare și un risc de securitate (sesiuni, cookie-uri). Toate
cele patru fluxuri vizate aici au cale de nivel 1 sau 3 — scraping-ul nu are
nicio justificare în acest domeniu.

## 5. Acoperirea fluxurilor contabile

| Flux | Sursa preferată | Sursă secundară / verificare | Stare azi | Domeniu în companyDataMap |
|---|---|---|---|---|
| Facturi **emise** | SmartBill API | SPV (confirmare e-Factura) | PARTIAL (doar local, pe BIROU) | ACCOUNTING / RECEIVABLES |
| Facturi **primite** | SPV e-Factura | folder Contabilitate (PDF-uri) | NOT_CONNECTED | PAYABLES |
| **Scadențe** (de încasat + de plătit) | derivate din cele două de mai sus | jurnalele Danei | NOT_CONNECTED | RECEIVABLES / PAYABLES |
| **Încasări** | SmartBill (plăți pe facturi) | extras bancar (domeniul BANK) | PARTIAL | CASH / RECEIVABLES |
| **Plăți efectuate** | extras bancar (BANK) | jurnalele Danei | NOT_CONNECTED | CASH / PAYABLES |

Fiecare rând închis ridică **Company Data Health Score** și stinge câte un Data
Gap din `src/ceo/dataGapEngine.js`. Până la închidere, `cashIntelligence`
raportează componentele respective ca `UNKNOWN` — niciodată inventate.

## 6. Propunere de arhitectură pe etape

Fiecare etapă e o propunere separată, cu propriul Change Control și propriul
ApprovalGate. Nicio etapă nu pornește automat după precedenta.

| Etapă | Ce se face | Cost (efort/bani) | Beneficiu | Gate |
|---|---|---|---|---|
| **0. Discovery** | acest audit; fără credențiale | făcut | harta căilor oficiale; decizie informată | — (doar informare) |
| **1. SmartBill read-only pe server** | portarea clientului local pe jarvis-server; token în env Railway; listare facturi emise + încasări | mic (client existent) / 0 lei | facturi emise + încasări vizibile zilnic pentru CEO AI; RECEIVABLES → PARTIAL→CONNECTED | Change Control + aprobarea lui Adrian pentru mutarea token-ului |
| **2. Scadențe → cashIntelligence** | maparea facturilor emise pe orizonturile 7/14/21/30/60/90 din modelul de lichiditate | mic / 0 lei | CONFIRMED RECEIVABLES devine calculat, nu estimat; digest-ul zilnic capătă cifre cu sursă | validare în SHADOW înainte de a intra în digest |
| **3. SPV e-Factura OAuth** | certificat calificat + aplicație OAuth ANAF + descărcare facturi primite (read-only) | mediu (setup birocratic) / costul certificatului dacă nu există deja | PAYABLES conectat la sursa canonică; scadențe furnizori reale | Change Control + Adrian face pașii de certificat (JARVIS nu manevrează certificate/parole) |
| **4. Reconciliere încrucișată** | SmartBill vs SPV vs BANK: emise confirmate, primite vs plătite, încasat vs facturat | mediu / 0 lei | detectarea diferențelor (factură neîncasată, furnizor neplătit, dublură) → episoade pentru [Proactive CEO](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md) | SHADOW întâi; escaladare doar prin [Founder Attention](../23-founder-attention/FOUNDER_ATTENTION_ARCHITECTURE.md) |
| **5. Scriere (emitere factură)** | opțional, târziu: emitere factură SmartBill **propusă** de CEO AI | mic / 0 lei | de la vizibilitate la execuție delegată | **fiecare factură individual prin ApprovalGate**; plățile rămân excluse permanent |

Ordinea nu e negociabilă în spirit: **întâi vezi (1–3), apoi înțelegi și
verifici (4), abia apoi propui execuție (5)** — exact secvența SEE → UNDERSTAND
→ VERIFY din principiul fazei.

## 7. Securitate și guvernanță

- **Credențiale:** token SmartBill și token-urile OAuth ANAF trăiesc exclusiv în
  variabile de mediu pe Railway. Nu apar în repo, în codex, în loguri sau în
  mesaje. Certificatul calificat rămâne la Adrian; JARVIS nu îl atinge.
- **Read-only first:** etapele 1–4 nu scriu nimic în SmartBill sau SPV.
- **ApprovalGate = singura poartă pentru efecte** — inclusiv pentru trimiterea
  oricărui Information Request generat de `dataGapEngine` către Dana.
- **Plăți: excluse total.** Nicio etapă, prezentă sau viitoare, nu include
  inițierea de plăți. Aceasta nu e o limitare tehnică, ci una de guvernanță.
- **Auditabilitate:** fiecare sincronizare scrie sursă + timestamp + freshness;
  semnalele derivate intră în [Observation Engine](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md)
  cu proveniență declarată; deciziile pe date contabile trec prin
  [Decision Engine V2](DECISION_ENGINE_V2.md) — date critice lipsă → `DATA_REQUIRED`.
- **Board:** implicațiile financiare ale conectării (ex. ce vede CFO-ul virtual)
  urmează [matricea de autoritate a Board-ului](../04-executive-board/BOARD_AUTHORITY_MATRIX.md);
  Board-ul recomandă, Adrian aprobă.

## 8. Legături

- `src/ceo/companyDataMap.js` — stările CONNECTED/PARTIAL/NOT_CONNECTED pe cele 22 de domenii
- `src/ceo/dataGapEngine.js` — gap-urile pe care etapele 1–3 le închid
- `src/ceo/cashIntelligence.js` — consumatorul principal al datelor (PROJECTED LIQUIDITY)
- [Observation Engine](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) — unde intră semnalele contabile
- [Proactive CEO](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md) — episoadele executive alimentate de reconciliere
- [Founder Attention](../23-founder-attention/FOUNDER_ATTENTION_ARCHITECTURE.md) — cum ajung diferențele la Adrian fără zgomot
- [Executive Board](../04-executive-board/BOARD_ARCHITECTURE.md) — perspectiva de rol (CFO) peste aceleași date
