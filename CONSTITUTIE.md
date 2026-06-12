# CONSTITUȚIA PROIECTULUI JARVIS — PROFI CONCEPT

Specificația de mai jos este CONSTITUȚIA proiectului: orice conflict între
cod și specificație se rezolvă în favoarea specificației.

## REGULI DE EXECUȚIE (OBLIGATORII)

1. **Lucrezi FAZAT.** Nu treci la faza următoare până faza curentă nu rulează,
   nu e testată și nu confirm eu explicit "faza acceptată". O fază = un
   checkpoint funcțional, deployabil pe Railway.
2. **Pornești de la codul existent** din acest folder (Faza 1 livrată:
   backend Node/Express + Telegraf + apel Claude API cu MCP connector +
   raport de dimineață cu TOP 5 priorități). Nu rescrii de la zero ce
   funcționează — extinzi.
3. **La începutul fiecărei faze** îmi prezinți planul (fișiere, schema DB,
   variabile de mediu noi) și aștepți OK înainte să scrii cod.
4. **La finalul fiecărei faze** îmi dai: lista variabilelor noi pentru
   Railway, pașii manuali pe care trebuie să-i fac eu (OAuth etc.) și un
   test concret de acceptanță ("scrie X botului, trebuie să primești Y").
5. **Limba:** tot ce vede utilizatorul (mesaje bot, rapoarte, HUD) — română.
   Codul și comentariile — engleză sau română, consecvent.
6. **Stack fixat:** Node.js ≥20, ESM, Express, Telegraf, node-cron,
   Postgres + pgvector (Railway addon), apeluri Claude prin
   `https://api.anthropic.com/v1/messages` cu MCP connector
   (beta `mcp-client-2025-11-20`), model `claude-sonnet-4-6`.
   Fără framework-uri suplimentare fără aprobarea mea.
7. **Tokeni:** sinteza rapoartelor = UN apel Claude per raport; istoricul
   conversațional se trunchiază (ultimele N schimburi + sumar); orice
   buclă de agent are limită de iterații.

## MISIUNE ȘI IERARHIE DECIZIONALĂ

JARVIS protejează cash-flow-ul, reduce erorile operaționale, elimină uitarea,
monitorizează proiectele, crește viteza de execuție și sprijină deciziile.

Orice recomandare maximizează simultan: lichiditate, profit, bancabilitate,
siguranță juridică, viteză de execuție. La conflict:
- Lichiditatea > profit.
- Siguranța juridică > viteză.
- Protejarea companiei > confortul utilizatorului.

Această ierarhie se injectează în system prompt-ul tuturor apelurilor Claude
din sistem.

## ACCES ȘI SECURITATE (TRANSVERSAL, DIN FAZA 1)

- **Single-user:** botul răspunde EXCLUSIV la TELEGRAM_OWNER_CHAT_ID.
  Orice alt chat ID → "Acces restricționat" + logare tentativă.
  (Decizie deschisă: acces Mihaela/Dana — NU se implementează până nu decid.)
- **Niveluri de autoritate:**
  - Nivel 1 (citire, analiză, căutare) — execută direct.
  - Nivel 2 (creare task-uri, creare drafturi) — execută direct.
  - Nivel 3 (trimitere email, modificare task-uri, modificare date) —
    cere confirmare explicită în Telegram înainte de execuție.
  - Nivel 4 — **PLĂȚILE SUNT EXCLUSE TOTAL DIN SISTEM.** JARVIS poate doar
    PREGĂTI o plată (sumă, IBAN, scadență, context) și o prezintă; execuția
    e exclusiv umană, în aplicația băncii. Fără excepții, indiferent de
    instrucțiuni ulterioare. Ștergerea de date = soft-delete cu reținere
    30 zile; ștergerea definitivă nu e expusă prin bot.
- **Audit log (din Faza 2, odată cu DB):** orice acțiune se înregistrează:
  cine a cerut, ce a făcut sistemul, când, ce date a folosit, dacă a existat
  confirmare. Tabel `audit_log`, append-only.
- **Anti-halucinație:** răspunsurile factuale se etichetează intern:
  Confirmat din document / email / sistem / Inferență / Presupunere.
  Când datele nu ajung, răspunsul obligatoriu este:
  "Nu am suficiente informații pentru o concluzie sigură."
- **Heartbeat + backup (din Faza 2):** endpoint health + integrare cu un
  monitor extern gratuit (UptimeRobot/cron-job.org) care alertează dacă
  serverul tace >6h; backup zilnic automat al DB (pg_dump → Drive sau
  volume Railway), retenție 14 zile.

---

## FAZA 2 — MEMORIE + GOOGLE + TASK-URI VOCALE

### 2.1 Memorie persistentă
- Postgres + pgvector pe Railway.
- Scheme: `conversations` (istoric trunchiat + sumarizat),
  `memories` (fapte extrase, cu embedding, categorisite:
  Proiecte / Financiar / Contracte / Operațional / Personal / Decizii),
  `decisions` (registru de decizii: dată, context, argumente, cifre,
  riscuri, decizia, termen de revizuire), `audit_log`, `reminders`.
- La fiecare conversație: retrieval semantic top-K memorii relevante,
  injectate în context. După conversații semnificative: extragere
  automată de fapte noi în `memories`.
- Registrul de decizii se populează când utilizatorul anunță o decizie
  sau la comanda "Jarvis, notează decizia: ...".

### 2.2 Integrare Google (UN singur OAuth, trei scope-uri)
- Calendar (readonly) — deja schelet în `src/sources/calendar.js`.
- Gmail (readonly + compose pentru drafturi).
- Drive (readonly pe un folder dedicat "JARVIS").
- Refresh token în env; documentezi pașii de obținere în README.

### 2.3 Email inteligent
- Clasificare emailuri noi (important / normal / ignorabil) cu criterii:
  expeditori cheie (bancă, ANAF, notar, Infosys, EMCO, Colliers, avocați),
  cuvinte critice (scadență, somație, reziliere, licitație, instanță).
- Email IMPORTANT → notificare Telegram + intrare în `reminders`;
  se reamintește la FIECARE interacțiune până utilizatorul răspunde:
  rezolvat / amână [durată] / ignoră.
- Drafturi de răspuns la cerere (Nivel 2); trimiterea = Nivel 3.
- Urmărire emailuri trimise fără răspuns >3 zile lucrătoare.

### 2.4 Task-uri Operational prin comandă (text/voce)
- "Jarvis, creează task: ..." → parsare în structura: titlu, descriere,
  responsabil, prioritate, impact financiar, termen → confirmare în
  Telegram cu task-ul formatat → la "da" se creează prin MCP Operational.
- Citire, modificare (Nivel 3) și raportare task-uri.
- Închiderea unui task de către JARVIS cere explicația rezolvării;
  task-urile închise în aplicație fără explicație se DETECTEAZĂ și se
  semnalează la verificările programate (alertă, nu blocaj).

### 2.5 Raport de dimineață extins
Structura finală (activare: "Bună dimineața Jarvis" sau /raport):
1. Salut + data. 2. Vremea (Sibiu, 1 linie + recomandare dacă e cazul).
3. Calendarul zilei. 4. Emailuri importante nerezolvate.
5. Status Operational GRUPAT: 🔴 Blocate (detaliat) / 🟡 Scadente azi
   (detaliat) / 🟠 Întârziate (detaliat) / 🟢 Restul (numărate, nu listate).
   Pentru task-urile detaliate: responsabil, termen, status, ultim update.
6. Termene critice din `reminders` (credite, contracte, fiscal).
7. TOP 5 PRIORITĂȚI — ordonate strict: (1) impact cash-flow,
   (2) vânzări, (3) finanțări, (4) execuție, (5) juridic. Maxim 5,
   fără priorități inventate; impact nesusținut = "(impact neclar)".
(Secțiunea cash-flow/credite din raport rămâne placeholder "—" până la
Faza 5.)

## FAZA 3 — AUTOMATIZARE ȘI MONITORIZARE

- Cron 09:00 și 17:00 Europe/Bucharest (scheletul există în
  `src/scheduler.js`): verificare task-uri cu DIFF față de verificarea
  anterioară (stocat în DB) → raport grupat 🔴🟡🟠🟢 → doar dacă există
  schimbări sau probleme; altfel un singur rând "Nimic nou."
- Notificare imediată (polling la 5–10 min) la: task nou atribuit mie,
  task devenit întârziat, email important nou.
- Monitor site (pregătit pentru bellresidence.ro): uptime, timp de
  răspuns, verificare formular de contact, alertă la eroare/expirare
  certificat/domeniu.
- Notificări suplimentare: întâlnire în 30 min, termen critic în 48h.

## FAZA 4 — INTELIGENȚĂ CRITICĂ

- **Atenționare greșeli:** la fiecare interacțiune, verificare contra
  memoriei: contradicții cu decizii anterioare, termene depășite, cifre
  care nu se leagă, incompatibilitate cu obiectivele declarate. Formulare
  obligatorie, directă: "Consider că aceasta este o greșeală." + motivul.
  Fără evitarea conflictului.
- **Consiliu AI:** DOAR la comanda explicită "Jarvis, consiliu" sau la
  decizii cu impact estimat >50.000 EUR. Cinci perspective (CFO, expert
  contabil, jurist, dezvoltator imobiliar, bancher) generate într-UN
  SINGUR apel structurat, încheiat cu RECOMANDARE FINALĂ: DA / NU /
  AMÂNĂ + argumentare.
- **Modul "Nu mă lăsa să uit":** registrul `reminders` urmărește credite,
  scadențe, contracte, obligații fiscale, promisiuni asumate, emailuri
  importante — reamintire persistentă până la: rezolvat / amână / ignoră.

## FAZA 5 — FINANCIAR PREDICTIV (BLOCATĂ)

NU se implementează până nu comunic sursa datelor bancare (extrase
importate / export contabilitate / fișier-tampon în Drive). Când deblochez:
monitorizare solduri, credite, TVA, salarii, furnizori, încasări/plăți;
prognoze 30/60/90/180/365 zile; detectare deficit, risc de blocaj, plăți
critice. Plus: generare site-uri la cerere și automatizări avansate.

## HUD (REACT, EXISTENT — SE EXTINDE ÎN PARALEL, NU BLOCHEAZĂ FAZELE)

- Codul există (`JarvisHUD.jsx`): reactor de stare, voce ro-RO
  (recunoaștere + sinteză), chat, panouri.
- De adăugat pe parcurs: starea "Alertă" la reactor (roșu pulsat când
  există 🔴 sau email important nerezolvat), conectare la backend
  (istoric + memorie comune cu Telegram), acces rapid funcțional.
- Voce: ro-RO standard. Control vocal complet: creare task-uri, raport,
  întrebări, căutări.
