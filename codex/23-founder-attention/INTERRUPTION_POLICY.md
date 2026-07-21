# INTERRUPTION POLICY — Politica de Întrerupere a Fondatorului (Founder Attention Gate)

> **Stare: PROIECTAT — implementat GATED, flag implicit OFF, validare exclusiv în
> Shadow Mode; NICIO notificare reală în această fază.** Acest document definește
> CÂND o problemă are dreptul să întrerupă fondatorul. În Faza 4.4, „a întrerupe"
> înseamnă un singur lucru: un **candidat de notificare** cu
> `attention_level = INTERRUPTIVE_ALERT` și `safe_to_send = false`, scris în
> audit + `jarvis_state`. Telefonul lui Adrian **nu sună**. Trimiterea reală
> rămâne gated pe `FOUNDER_NOTIFICATIONS_ENABLED=false` și se activează doar
> după validarea în Shadow Mode și aprobarea explicită a lui Adrian.

---

## 1. Filozofia întreruperii

**Timpul și atenția fondatorului sunt resursa cea mai scumpă a companiei.**
Principiul canonic F07 din [`FOUNDER_DNA.md`](../02-founder-dna/FOUNDER_DNA.md)
— *„Timpul este mai valoros decât banii"* — nu este o metaforă, ci o regulă de
cost: fiecare întrerupere consumă din singura resursă care nu se poate cumpăra
înapoi. Un sistem care întrerupe des este un sistem care își cheltuie bugetul
de încredere; a treia alertă inutilă o îngroapă și pe a patra, cea reală.

De aceea, politica pleacă de la o inversiune deliberată a sarcinii probei:

| Întrebarea GREȘITĂ | Întrebarea CORECTĂ |
|---|---|
| „E destul de important ca să-i spun?" | „Care este **costul real al întârzierii** dacă NU-i spun acum?" |

Întreruperea este justificată **DOAR** de costul real al întârzierii: bani care
se pierd, un termen care expiră, o situație care se agravează măsurabil, o
decizie care devine ireversibilă. Dacă informația are aceeași valoare mâine
dimineață în digest ca acum pe telefon, atunci locul ei este în digest —
**implicit se tace, excepțional se întrerupe**. Importanța singură nu întrerupe;
doar importanța cu ceas atașat.

Corolar: gate-ul nu decide ce este important pentru companie — asta fac triajul
și episoadele din [`22-proactive-ceo`](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md).
Gate-ul decide exclusiv ce merită **atenția lui Adrian acum**, iar cele două
întrebări nu sunt aceeași întrebare.

---

## 2. Cele 6 condiții pentru INTERRUPTIVE_ALERT

`attentionGate.js` (modul **PUR**, determinist, zero LLM, zero IO) acordă
nivelul `INTERRUPTIVE_ALERT` **doar** dacă episodul îndeplinește **cel puțin
una** dintre următoarele șase condiții — lista este închisă, nu exemplificativă:

| # | Condiție | De ce justifică întreruperea |
|---|---|---|
| 1 | `severity = critical` | Prin definiție, criticul are cost de întârziere; totuși rămâne supus §3 (data quality) și anti-spamului |
| 2 | `severity = high` **ȘI** termen apropiat (deadline ≤ 3 zile) | Fereastra de acțiune se închide — mâine în digest poate fi prea târziu |
| 3 | `severity = high` **ȘI** `worsening = true` | Trendul confirmat de agravare transformă costul întârzierii din ipotetic în măsurat |
| 4 | Risc de cash sever | Lichiditatea este sistemul circulator al firmei; golul de cash nu așteaptă digestul |
| 5 | Risc juridic sau reputațional major | Expunerea legală/reputațională crește cu fiecare oră de tăcere |
| 6 | Decizie ireversibilă iminentă | După punctul de ireversibilitate, atenția fondatorului nu mai poate schimba nimic — trebuie chemată ÎNAINTE |

Reguli de aplicare:

- niciun episod nu primește `INTERRUPTIVE_ALERT` pe alt temei — „mi se pare
  important", severitate `medium` acumulată sau volum mare de observații
  **nu sunt condiții**; ele merg cel mult în `DAILY_DIGEST`;
- condițiile se evaluează determinist pe câmpurile episodului
  (`combined_severity`, `deadline`, `worsening`, categoriile de risc) — același
  episod produce întotdeauna același nivel;
- chiar și un episod care îndeplinește o condiție rămâne supus politicii
  anti-spam din `notificationPolicy.js` (cooldown per episod 24h, cooldown
  interruptive 6h, max 2 interruptive/zi, quiet hours 22:00–07:00
  Europe/Bucharest, grupare) — dreptul la întrerupere nu este dreptul la
  întreruperi repetate.

---

## 3. Blocarea pe `data_quality = poor`

**O alertă interruptivă construită pe date proaste este ea însăși un incident.**
Dacă episodul are `data_quality = poor`, nivelul `INTERRUPTIVE_ALERT` este
**BLOCAT** — indiferent de severitate — și episodul se retrogradează (tipic în
`DAILY_DIGEST` sau `DATA_REQUIRED_BEFORE_DECISION`), cu motivul blocării scris
explicit în audit.

**Singura excepție:** riscul **confirmat determinist** — o probabilitate certă,
calculată pe date complete pentru componenta de risc în sine (ex. un termen
legal scadent, verificabil în sursă, chiar dacă alte câmpuri ale episodului au
calitate slabă). Excepția acoperă certitudinea deterministă, nu estimările:

| Trece de blocare | NU trece de blocare |
|---|---|
| Termen scadent citit direct din sursă, dată certă | „Probabil expiră ceva în perioada asta" |
| Sold negativ confirmat pe extras complet | Gol de cash **estimat** pe încasări incerte |
| Risc calculat pe date complete, probabilitate certă | Severitate `critical` atribuită pe date parțiale |

Rațiunea: a-l trezi pe Adrian pentru o alarmă falsă costă de două ori — o dată
timpul lui, a doua oară credibilitatea tuturor alertelor viitoare. Politica
preferă o alertă întârziată cu date bune unei alerte imediate cu date proaste.

---

## 4. FOUNDER_DECISION_REQUIRED vs DATA_REQUIRED_BEFORE_DECISION

Regula de aur: **niciodată „decizie cerută" pe date insuficiente — întâi se cer
datele.** A-i prezenta fondatorului o decizie fără datele necesare nu este
escaladare, este mutarea muncii de colectare pe biroul cel mai scump din firmă.

`FOUNDER_DECISION_REQUIRED` se acordă **doar** când TOATE condițiile de mai jos
sunt îndeplinite simultan:

1. există o **decizie reală** de luat (nu o informare, nu un status);
2. există **minimum 2 opțiuni valide**, formulabile concret;
3. **Board Preview** ([`BOARD_ESCALATION_POLICY.md`](../22-proactive-ceo/BOARD_ESCALATION_POLICY.md))
   indică necesitatea fondatorului — decizia depășește ce ar putea recomanda
   Boardul singur;
4. **amânarea are cost sau risc** identificabil (altfel: `DAILY_DIGEST`);
5. informațiile **SUNT suficiente** pentru a decide (`data_quality` adecvat,
   fără `missing_data` esențiale).

Dacă punctele 1–4 sunt îndeplinite dar punctul 5 **nu** este, nivelul corect
este `DATA_REQUIRED_BEFORE_DECISION`:

| | `FOUNDER_DECISION_REQUIRED` | `DATA_REQUIRED_BEFORE_DECISION` |
|---|---|---|
| Ce i se prezintă fondatorului | Decizia + opțiunile + datele | Ce date lipsesc și de ce blochează decizia |
| `missing_data[]` | gol sau nesemnificativ | populat, cauza retrogradării |
| Ce urmează | Adrian decide | Se obțin datele → episodul se re-evaluează → abia apoi, eventual, decision required |
| Anti-pattern evitat | — | „Decide acum, îți aducem cifrele după" |

Tranziția este unidirecțională și auditată: un episod `DATA_REQUIRED` devine
`FOUNDER_DECISION_REQUIRED` doar când datele lipsă au sosit efectiv (date noi
în episod), nu prin simpla trecere a timpului. Cererea de date apare și în
secțiunea 5 a Daily CEO Digest („CE DATE LIPSESC") — colectarea datelor este
muncă de sistem, nu de fondator.

---

## 5. Relația cu override-ul și autoritatea fondatorului

Gate-ul filtrează **fluxul către** Adrian, niciodată **autoritatea lui** —
delimitată canonic în
[`BOARD_AUTHORITY_MATRIX.md`](../04-executive-board/BOARD_AUTHORITY_MATRIX.md):

| Principiu din 04-executive-board | Consecință pentru acest gate |
|---|---|
| **F05 — Adrian rămâne decidentul final** | Gate-ul nu decide nimic în locul lui; decide doar CE și CÂND i se propune spre atenție |
| **Override-ul fondatorului este legitim** (Board NU, Adrian DA — cu condiții obligatorii: limită de capital etc.) | Gate-ul nu poate „confisca" o decizie: `FOUNDER_DECISION_REQUIRED` prezintă opțiunile, inclusiv pe cea contrară recomandării Boardului |
| **Guardian oprește recomandări, nu decizii** | Identic aici: gate-ul poate opri un candidat de notificare defect, **nu poate anula și nu poate bloca o decizie a fondatorului** |
| **Nicio recomandare nu devine acțiune fără Adrian** | Niciun nivel al gate-ului nu execută nimic; chiar și `INTERRUPTIVE_ALERT` este doar o cerere de atenție |

Două clarificări de autoritate:

1. **Adrian poate ocoli gate-ul oricând, în ambele sensuri.** Poate cere
   explicit orice informație pe care gate-ul a pus-o în `IGNORE`/`AUDIT_ONLY`
   (totul rămâne în audit tocmai pentru asta) și poate reconfigura pragurile,
   limitele și quiet hours. Gate-ul îi protejează atenția; nu i-o
   raționalizează împotriva voinței lui.
2. **Gate-ul nu este un strat de aprobare.** El stă ÎNAINTEA atenției
   fondatorului, nu după decizia lui. Ce decide Adrian se execută pe căile
   existente (`approvalGate`, nivelurile de autoritate 1–4, plățile Nivel 4
   excluse total) — exact ca până acum, neatinse de această fază.

---

## 6. Porți și legături

| Poartă | Implicit | Efect |
|---|---|---|
| `FOUNDER_ATTENTION_GATE_ENABLED` | `false` | gate-ul nu rulează deloc |
| `FOUNDER_ATTENTION_SHADOW_MODE` | `true` | când rulează: DOAR audit + `jarvis_state` |
| `FOUNDER_NOTIFICATIONS_ENABLED` | **`false`** | nicio notificare reală, indiferent de nivel |

Nicio combinație de severitate, termen sau risc nu ocolește aceste porți: în
această fază, un episod `critical` cu decizie ireversibilă iminentă produce
exact același lucru ca unul banal — un candidat cu `safe_to_send=false` în
audit.

Amonte: [`21-observation-engine`](../21-observation-engine/OBSERVATION_ESCALATION_PROTOCOL.md)
(observații, scoring, escaladare) →
[`22-proactive-ceo`](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md)
(triaj → episoade → Board Preview → CEO Brief) → **acest gate** → candidat de
notificare. Documente conexe în `23-founder-attention`: arhitectura gate-ului,
structura candidatului, politica anti-spam și Daily CEO Digest.

---

## 7. Invarianți

1. Întreruperea se justifică **doar** prin costul real al întârzierii (F07);
   importanța fără urgență merge în digest.
2. `INTERRUPTIVE_ALERT` doar pe una din cele **6 condiții** din §2 — listă
   închisă, evaluată determinist.
3. `data_quality = poor` **blochează** alerta interruptivă; excepție unică:
   risc confirmat determinist (probabilitate certă pe date complete).
4. **Niciodată** `FOUNDER_DECISION_REQUIRED` pe date insuficiente — lipsurile
   esențiale produc `DATA_REQUIRED_BEFORE_DECISION`, cu `missing_data[]`
   populat.
5. Decizia cerută fondatorului presupune: decizie reală, ≥2 opțiuni valide,
   Board Preview care indică fondatorul, cost al amânării, date suficiente.
6. Gate-ul filtrează fluxul, nu autoritatea: nu decide, nu execută, nu poate
   bloca sau anula o decizie a fondatorului; override-ul lui Adrian rămâne
   guvernat exclusiv de `04-executive-board`.
7. Orice nivel, inclusiv `IGNORE`, lasă urmă completă în audit — Adrian poate
   vedea oricând ce NU i s-a arătat.
8. `FOUNDER_NOTIFICATIONS_ENABLED=false` implicit; `safe_to_send=false`
   întotdeauna în această fază. Activarea reală cere validarea Shadow Mode +
   aprobarea explicită a lui Adrian. **Adrian decide.**
