# AUDIT — bellresidence.ro

**Data auditului:** 8 iulie 2026
**Auditor:** Claude (sesiune Claude Code, repo `jarvis-server`)
**Obiect:** site-ul public bellresidence.ro (Bell Residence Șelimbăr — ansamblu de 30 de case, duplex + individuale, lângă Sibiu)

---

## ⚠️ Constatare dominantă și limitările auditului

**Site-ul bellresidence.ro este căzut: contul de hosting este SUSPENDAT.**

Dovezi colectate la data auditului:

1. Toate cererile HTTP către `bellresidence.ro` (homepage, subpagini, `robots.txt`, `sitemap.xml`) răspund **HTTP 403 Forbidden**.
2. În indexul Google, homepage-ul apare cu titlul **„Account Suspended"** — pagina standard afișată de panourile de hosting (cPanel/WHM) când contul e suspendat (de regulă: neplată factură hosting, expirare abonament sau suspendare administrativă).
3. Indexul Google pentru `site:bellresidence.ro` s-a restrâns la **doar 4 URL-uri** — semn că deindexarea este deja în curs.

**Consecință asupra auditului:** din cauza răspunsului 403 pe tot site-ul, auditurile care necesită pagina funcțională — **Lighthouse, Core Web Vitals, accesibilitate (axe/WCAG), analiza completă a componentelor, formularelor și linkurilor interne** — **nu au putut fi executate acum**. Ele sunt documentate mai jos ca plan de execuție imediat după restaurare (secțiunea „Plan de re-audit post-restaurare"). Analiza de față se bazează pe: răspunsurile HTTP live, ce a rămas în indexul Google (titluri, descrieri, structură URL), site-urile partenere și codul de monitorizare din repo-ul `jarvis-server`.

**Notă despre „fișierele care trebuie modificate":** codul sursă al site-ului bellresidence.ro **nu se află în acest repository** (aici e doar serverul Jarvis). Structura URL (`/services/…`, șablonul de titluri „… - Case de Vânzare Sibiu | Bell Residence Șelimbăr") indică un site **WordPress** cu un plugin SEO (Yoast/Rank Math) și o temă cu custom post type „services". Fișierele indicate mai jos sunt deci: (a) fișiere/setări de pe hostingul WordPress și (b) fișiere din acest repo, acolo unde soluția ține de Jarvis (monitorizare).

---

## Ce se știe despre site (reconstituit din index și surse externe)

| Element | Constatare |
|---|---|
| Platformă (probabil) | WordPress + plugin SEO (șablon de titlu global), temă cu CPT `services` |
| Pagini rămase în index | `/` (ca „Account Suspended"), `/concept-bell-residence/`, `/structura-rezistenta/`, `/services/finsiaje-lux/` |
| Șablon titlu | `{Titlu pagină} - Case de Vânzare Sibiu \| Bell Residence Șelimbăr` |
| Contact cunoscut | telefon 0732 962 866 + formular de contact (menționat pe pagina de structură) |
| Prezențe alternative active | `bellresidence.welhome.ro`, listări pe `casesibiu.com` (Welhome, comision 0%), pagină Facebook „Bell Residence Selimbar" |
| Conținut editorial existent | articole de tip landing: concept (5 motive), structură de rezistență (7 elemente), variante de finisaje/design interior |

---

# PROBLEME IDENTIFICATE

## 🔴 CRITIC (acțiune imediată — site-ul nu funcționează)

### C1. Contul de hosting este suspendat — site-ul răspunde 403 pe toate paginile

- **Impact:** site-ul e complet indisponibil pentru clienți; orice ban cheltuit pe promovare (Facebook, Google Ads, panouri cu URL-ul) duce într-o pagină „Account Suspended". Pierdere directă de lead-uri pentru un proiect cu case de ~170.000–230.000 €, unde un singur lead pierdut valorează enorm.
- **Soluție tehnică:**
  1. Contactați URGENT furnizorul de hosting și achitați/renegociați factura sau clarificați motivul suspendării (verificați emailurile de la hoster, inclusiv Spam, pentru notificări de neplată sau abuz).
  2. După reactivare, verificați integritatea: `curl -sI https://bellresidence.ro/` trebuie să întoarcă `200`, iar pagina să conțină conținutul real, nu placeholder.
  3. Dacă suspendarea a fost pentru abuz/malware (se întâmplă la WordPress neactualizat), rulați un scan (Wordfence/Sucuri), actualizați core + teme + pluginuri, schimbați toate parolele (hosting, WP admin, FTP, DB).
  4. Configurați plata recurentă automată la hoster și la registrar, ca să nu se repete.
- **Fișiere/locuri de modificat:** panoul de client al hosterului (facturare); după restaurare: WordPress core/plugins/teme (actualizări), parole.

### C2. Deindexare Google în curs — homepage-ul e indexat ca „Account Suspended"

- **Impact:** Google a redus deja indexul la 4 URL-uri și a înlocuit titlul homepage-ului cu „Account Suspended". Cu fiecare zi de 403, se pierd poziții organice pe interogări comerciale („case de vânzare Sibiu", „case Șelimbăr") câștigate în ani; recuperarea după deindexare durează săptămâni–luni. Reputațional, oricine caută brandul „Bell Residence" vede „Account Suspended" — semnal de neîncredere fatal pentru o achiziție imobiliară.
- **Soluție tehnică (imediat după restaurarea hostingului):**
  1. Verificați că toate paginile vechi răspund `200` (nu `404`) — comparați cu sitemap-ul vechi/backup.
  2. În **Google Search Console** (dacă nu există proprietate, creați-o și validați domeniul prin DNS): cereți reindexare pentru homepage + paginile principale (URL Inspection → Request Indexing) și retrimiteți `sitemap.xml`.
  3. Verificați `robots.txt` și meta `robots` să nu fi rămas pe `noindex`/`Disallow: /` (unele restaurări din backup sau moduri „maintenance" lasă asta activ).
  4. Monitorizați în GSC raportul Coverage/Pages zilnic 2–3 săptămâni.
- **Fișiere/locuri de modificat:** Google Search Console; `robots.txt` (rădăcina hostingului sau setarea WordPress „Search engine visibility" din Settings → Reading); plugin SEO (sitemap).

### C3. Zero conversii pe durata căderii — canalele de lead-uri sunt rupte

- **Impact:** formularul de contact și pagina cu telefonul sunt inaccesibile. Dacă rulează campanii plătite sau listări externe care trimit spre bellresidence.ro, bugetul se arde pe un 403.
- **Soluție tehnică:**
  1. **Azi, fără a aștepta hostingul:** puneți pe pauză orice campanie (Google Ads/Facebook Ads) care are ca destinație bellresidence.ro, sau mutați temporar destinația spre `bellresidence.welhome.ro` / pagina de Facebook, care sunt live.
  2. Actualizați linkul din bio/despre pe Facebook și Google Business Profile spre o destinație funcțională până revine site-ul.
  3. După restaurare, testați formularul cap-coadă (trimitere reală + primirea emailului) — formularele WordPress se strică frecvent la restaurări (SMTP).
- **Fișiere/locuri de modificat:** conturile de Ads / Facebook Page / Google Business Profile; după restaurare: configurarea SMTP a formularului (plugin WP Mail SMTP sau echivalent).

### C4. Nu există monitorizare de uptime — căderea nu a fost detectată automat

- **Impact:** suspendarea a fost descoperită târziu (posibil după zile/săptămâni — indexul Google a apucat să se restrângă). Fiecare zi nedetectată amplifică C1–C3.
- **Soluție tehnică:** repo-ul `jarvis-server` are DEJA un monitor de site scris exact pentru bellresidence.ro (`src/monitor.js`) — verificare la 15 minute cu alertă Telegram la cădere/revenire + alertă de expirare certificat TLS. E **dormant** pentru că variabila de mediu `SITE_MONITOR_URL` nu e setată.
  1. Setați în mediul de producție Jarvis (Railway → Variables): `SITE_MONITOR_URL=https://bellresidence.ro/` și redeploy.
  2. Adăugați `SITE_MONITOR_URL=` și în `.env.example`, ca variabila să fie documentată.
  3. **Îmbunătățire necesară în `src/monitor.js`:** unele suspendări de hosting răspund `200` cu pagina „Account Suspended" (nu 403), deci checkul `res.ok` nu e suficient. Adăugați o verificare de conținut: după `fetch`, citiți corpul și alertați dacă lipsește un cuvânt-cheie așteptat (ex. „Bell Residence") sau dacă apare „suspended". Tot acolo merită adăugată și alerta de **expirare a domeniului** (comentariul din fișier o menționează ca TODO).
- **Fișiere de modificat (în acest repo):** `src/monitor.js` (verificare conținut + expirare domeniu), `.env.example` (documentare `SITE_MONITOR_URL`), variabilele de mediu din Railway (`railway.json` nu trebuie modificat).

---

## 🟠 IMPORTANT (de rezolvat imediat după restaurare)

### I1. Slug cu greșeală de tipar: `/services/finsiaje-lux/`

- **Impact:** URL-ul paginii de finisaje conține „finsiaje" în loc de „finisaje" — arată neprofesionist în SERP și ratează potrivirea exactă pe cuvântul-cheie „finisaje lux".
- **Soluție tehnică:** redenumiți slug-ul în WordPress în `finisaje-lux` și adăugați redirect 301 de la URL-ul vechi (plugin Redirection, sau regulă în `.htaccess`: `Redirect 301 /services/finsiaje-lux/ https://bellresidence.ro/services/finisaje-lux/`). Nu ștergeți URL-ul vechi fără redirect — e printre puținele încă indexate.
- **Fișiere de modificat:** editorul paginii în WP admin (slug); `.htaccess` sau pluginul de redirecturi.

### I2. Șablonul de titluri produce titluri prea lungi și cvasi-duplicate

- **Impact:** sufixul „ - Case de Vânzare Sibiu | Bell Residence Șelimbăr" (~45 caractere) se adaugă la fiecare titlu; titluri ca „Structura de rezistenta: 7 Elemente care definesc o casa trainica - Case de Vânzare Sibiu | Bell Residence Șelimbăr" au ~115 caractere și sunt trunchiate în Google (~60 caractere vizibile), tăind exact partea comercială.
- **Soluție tehnică:** în pluginul SEO (Yoast/Rank Math), scurtați șablonul global la `%title% | Bell Residence Șelimbăr` și scrieți manual titluri ≤ 60 caractere pentru paginile-cheie, cu keywordul comercial la început (ex. homepage: „Case de vânzare în Șelimbăr, Sibiu | Bell Residence"). Verificați și meta descrierile (150–160 caractere, cu CTA și preț „de la … €").
- **Fișiere de modificat:** setările pluginului SEO (Search Appearance → Title templates) + câmpurile SEO per pagină.

### I3. `robots.txt` și `sitemap.xml` — inaccesibile acum, de verificat/reconstruit la restaurare

- **Impact:** ambele răspund 403; la restaurare, un `robots.txt` greșit sau un sitemap absent/învechit încetinește dramatic reindexarea (vezi C2).
- **Soluție tehnică:** după restaurare, verificați `https://bellresidence.ro/robots.txt` — trebuie să permită crawl (`User-agent: * / Allow: /` cu excepții pt. `/wp-admin/`) și să declare sitemap-ul: `Sitemap: https://bellresidence.ro/sitemap_index.xml`. Activați sitemap-ul XML din pluginul SEO și confirmați că include toate paginile publice + imaginile. Trimiteți-l în GSC.
- **Fișiere de modificat:** `robots.txt` (generat de pluginul SEO sau fișier fizic în rădăcină), setările de sitemap ale pluginului SEO.

### I4. Certificat TLS și expirare domeniu — risc de a doua cădere

- **Impact:** dacă hostingul a fost suspendat pentru neplată, există risc real ca și **domeniul** sau **certificatul** să expire nemonitorizate — o a doua cădere ar anula recuperarea SEO din C2.
- **Soluție tehnică:** verificați la registrar data de expirare a domeniului `bellresidence.ro` (ROTLD/registrar) și activați auto-renew; după restaurare confirmați că certificatul TLS se reînnoiește automat (Let's Encrypt via hosting). Alerta de certificat există deja în `src/monitor.js` (rulează zilnic la 08:00 când monitorul e activ — vezi C4); adăugați și verificarea expirării domeniului (RDAP: `https://rdap.rotld.ro/domain/bellresidence.ro`).
- **Fișiere de modificat:** panoul registrarului (auto-renew); `src/monitor.js` (verificare RDAP domeniu).

### I5. Dependența de un singur cont de hosting, fără backup verificat

- **Impact:** dacă hosterul șterge contul (la suspendări prelungite conturile se purjează, uneori după 30 de zile), site-ul și conținutul se pierd definitiv — inclusiv textele și pozele care acum nu mai există nicăieri altundeva.
- **Soluție tehnică:** imediat după reactivare, faceți backup complet off-site (fișiere + baza de date; UpdraftPlus spre Google Drive/S3, program săptămânal). Păstrați o copie și local. Documentați accesele (hosting, registrar, WP admin) într-un manager de parole.
- **Fișiere de modificat:** configurare plugin de backup în WP; niciun fișier din acest repo.

### I6. Consolidare cu site-urile partenere (welhome) — risc de conținut duplicat și de semnale împrăștiate

- **Impact:** `bellresidence.welhome.ro` și listările de pe `casesibiu.com` sunt acum singura prezență funcțională; descriu același proiect cu texte similare. După restaurare, Google poate considera site-ul propriu duplicat sau poate împărți autoritatea între domenii.
- **Soluție tehnică:** păstrați paginile partenere (aduc lead-uri), dar asigurați-vă că (a) site-ul propriu are conținut mai bogat și unic, (b) partenerii linkuiesc spre bellresidence.ro, (c) prețurile/stocul sunt sincronizate (pe partener apar 227.000 € și 172.550 € — site-ul propriu trebuie să afișeze aceleași informații sau mai actuale, altfel pierde credibilitate).
- **Fișiere de modificat:** conținutul paginilor WP; acorduri cu Welhome pentru linkuri.

---

## 🟢 RECOMANDAT (după stabilizare — cresc calitatea, SEO și conversiile)

### R1. Date structurate schema.org — absente din câte se poate reconstitui

- **Impact:** fără schema.org, Google nu afișează rich results (breadcrumbs, organizație, oferte) pentru un domeniu — imobiliarele beneficiază direct de `Residence`/`Offer` și de panoul de brand.
- **Soluție tehnică:** adăugați JSON-LD:
  - pe homepage: `RealEstateAgent`/`Organization` (nume, logo, telefon `+40732962866`, adresă Șelimbăr, `sameAs` către Facebook și welhome);
  - pe fiecare model de casă: `Product` sau `SingleFamilyResidence` + `Offer` (preț, `priceCurrency: EUR`, `availability`);
  - `BreadcrumbList` pe toate paginile;
  - `FAQPage` pe paginile de tip „5 motive" / „7 elemente" (au deja formatul potrivit).
  Implementare simplă: Rank Math/Yoast Pro sau blocuri JSON-LD în temă (`header.php` / hook `wp_head`). Validați cu https://validator.schema.org și testul Rich Results.
- **Fișiere de modificat:** plugin SEO (module Schema) sau `functions.php`/`header.php` din tema activă.

### R2. Metadata Open Graph / Twitter Card

- **Impact:** linkurile distribuite pe Facebook (canalul principal activ al proiectului!) fără `og:image`/`og:description` afișează preview sărac și scad CTR-ul.
- **Soluție tehnică:** setați în pluginul SEO imagini OG dedicate (1200×630, cu vizual al caselor + „de la X €") pentru homepage și paginile de model; completați `og:title`, `og:description`, `og:locale=ro_RO`. Testați cu Facebook Sharing Debugger.
- **Fișiere de modificat:** setările Social din pluginul SEO + imagini noi în Media Library.

### R3. Performanță / Core Web Vitals (de măsurat la re-audit)

- **Impact:** site-urile imobiliare WordPress pică de regulă la LCP (hero-uri mari nefolosind WebP) și CLS (slidere). CWV slab = poziții mai slabe pe mobil, unde vine majoritatea traficului imobiliar.
- **Soluție tehnică (checklist de aplicat la re-audit):** activați caching de pagină (LiteSpeed Cache/WP Rocket), convertiți imaginile la WebP/AVIF cu dimensiuni responsive (`srcset`), `loading="lazy"` pe imaginile sub fold dar **nu** pe imaginea LCP (aceea cu `fetchpriority="high"`), amânați JS-ul neesențial, `font-display: swap`, țintiți LCP < 2,5 s / CLS < 0,1 / INP < 200 ms pe mobil (PageSpeed Insights).
- **Fișiere de modificat:** pluginuri de cache/imagini; tema (template-ul hero).

### R4. Accesibilitate (de măsurat la re-audit)

- **Impact:** pe lângă obligațiile legale în creștere (European Accessibility Act, aplicabil din 2025), problemele tipice (contrast slab pe hero, lipsă `alt`, formulare fără `label`) taie din conversii.
- **Soluție tehnică (checklist):** `alt` descriptiv pe toate imaginile de galerie („Casă duplex Bell Residence — fațadă sud"), un singur `h1` per pagină cu ierarhie corectă h2/h3, `label` asociat fiecărui câmp de formular, contrast text/fundal ≥ 4,5:1, focus vizibil pe linkuri/butoane, `lang="ro"` pe `<html>`. Verificare: extensia axe DevTools sau Lighthouse Accessibility ≥ 90.
- **Fișiere de modificat:** conținut Media Library (alt-uri), tema (heading-uri, contrast în CSS), pluginul de formular.

### R5. Măsurarea conversiilor — probabil inexistentă

- **Impact:** fără analytics + evenimente, nu se poate ști ce pagini aduc lead-uri și dacă banii pe promovare se întorc.
- **Soluție tehnică:** instalați GA4 (sau alternativa fără cookie-banner: Plausible/Umami) și definiți evenimente de conversie: (1) submit formular contact, (2) click pe `tel:0732962866`, (3) click WhatsApp dacă se adaugă, (4) click către listările welhome. Legați GA4 de Google Ads dacă se reia promovarea. Adăugați banner de consimțământ GDPR dacă rămâneți pe GA4.
- **Fișiere de modificat:** plugin de analytics (Site Kit/GTM) + pluginul de formular (event la submit); pagina de politică de confidențialitate.

### R6. UX și conversie pe pagini (de detaliat la re-audit)

- **Impact:** conținutul indexat e editorial (concept, structură, finisaje), dar lipsesc din index paginile tranzacționale: listă case disponibile cu preț, plan de situație, pagina de contact — drumul cel mai scurt spre lead.
- **Soluție tehnică:** asigurați-vă că site-ul restaurat are (și sunt linkuite din meniu): (1) pagină „Case disponibile" cu preț, suprafață, compartimentare, status (disponibil/rezervat/vândut — datele există deja în sistemul Operational/Jarvis), (2) CTA lipicios pe mobil cu telefon + WhatsApp, (3) galerie foto + tur virtual, (4) hartă cu localizarea (4 km centru, 1 km autostradă — argumentele deja folosite), (5) secțiune FAQ, (6) dovezi sociale (testimoniale, stadiul construcției). Linkuri interne: fiecare articol editorial să trimită spre pagina de case disponibile și spre contact.
- **Fișiere de modificat:** pagini/meniuri în WP admin; tema (CTA mobil).

### R7. Sincronizare stoc site ↔ Jarvis (oportunitate)

- **Impact:** Jarvis are deja raportarea zilnică de vânzări Bell Residence (`src/supervisor/sales.js` — stoc, rezervări, avansuri). Site-ul afișând manual disponibilitatea va rămâne mereu în urmă.
- **Soluție tehnică:** pe termen mediu, expuneți din sistemul Operational un feed simplu (JSON) cu unitățile și statusul lor, consumat de site (shortcode WP care citește feed-ul) — site-ul arată automat „X case disponibile". Alternativ minimal: alertă Jarvis săptămânală „verifică dacă site-ul reflectă stocul".
- **Fișiere de modificat:** (repo) `src/api.js` — endpoint public read-only; (site) shortcode/plugin mic în WP.

---

## Plan de re-audit post-restaurare (de rulat imediat ce site-ul răspunde 200)

Măsurătorile imposibile acum, în ordine:

1. **Smoke test:** `curl -sI https://bellresidence.ro/` → `200`, conținut real; verificați și `robots.txt`, `sitemap.xml`, 5–10 URL-uri vechi.
2. **Lighthouse** (Performance/SEO/Accessibility/Best Practices, mobil + desktop): via PageSpeed Insights (https://pagespeed.web.dev) sau local `npx lighthouse https://bellresidence.ro --preset=desktop`. Țintă: Performance ≥ 80 mobil, SEO ≥ 95, Accessibility ≥ 90.
3. **Core Web Vitals de teren:** raportul CWV din GSC (apare după ~28 zile de trafic) — între timp folosiți valorile lab din Lighthouse.
4. **Crawl complet** (Screaming Frog / `npx linkinator https://bellresidence.ro -r`): linkuri interne rupte, lanțuri de redirect, pagini orfane, titluri/descrieri duplicate, imagini fără alt.
5. **Formulare:** trimitere de test pe fiecare formular + confirmarea primirii emailului; verificați și mesajele de eroare/validare.
6. **Schema:** validator.schema.org + Google Rich Results Test pe homepage și o pagină de casă.
7. **Rezultatele** se adaugă în acest fișier ca secțiune „Re-audit {dată}".

---

## Ordinea de execuție recomandată (rezumat)

| # | Acțiune | Termen |
|---|---|---|
| 1 | Reactivare hosting (C1) + pauză campanii/redirecționare linkuri active (C3) | azi |
| 2 | Activare monitor Jarvis: `SITE_MONITOR_URL` pe Railway (C4) | azi |
| 3 | Verificare robots/sitemap + cerere reindexare în GSC (C2, I3) | ziua restaurării |
| 4 | Backup off-site + auto-renew domeniu/hosting (I5, I4) | săptămâna 1 |
| 5 | Fix slug „finsiaje" + titluri SEO (I1, I2) | săptămâna 1 |
| 6 | Re-audit tehnic complet: Lighthouse, CWV, crawl, formulare | săptămâna 1–2 |
| 7 | Schema.org, OG, analytics conversii (R1, R2, R5) | săptămâna 2–3 |
| 8 | UX pagini tranzacționale + sincronizare stoc (R6, R7) | luna 1 |

---

## Surse consultate

- Răspunsuri HTTP live bellresidence.ro (403 pe toate căile testate, 8 iulie 2026)
- Index Google `site:bellresidence.ro`: [homepage — „Account Suspended"](https://bellresidence.ro/), [Concept](https://bellresidence.ro/concept-bell-residence/), [Structura de rezistență](https://bellresidence.ro/structura-rezistenta/), [Variante de design interior](https://bellresidence.ro/services/finsiaje-lux/)
- Prezențe partenere: [Bell Residence | Welhome](https://bellresidence.welhome.ro/), [listare casesibiu.com (227.000 €)](https://casesibiu.com/case/casa-la-cheie-sibiu-selimbar-comision-0-1520742), [listare casesibiu.com (ansamblu)](https://casesibiu.com/case/casa-noua-ansamblu-exclusiv-case-sibiu-selimbar-1520715), [Facebook — Bell Residence Selimbar](https://www.facebook.com/p/Bell-Residence-Selimbar-100059821350043/)
- Cod repo `jarvis-server`: `src/monitor.js`, `src/config.js`, `src/supervisor/sales.js`
