# SALES INTELLIGENCE — Funnelul canonic de vânzări (Capitol 24 — CEO Intelligence)

> **STARE: PROIECTAT — implementat ca ADAPTOR read-only în `src/ceo/salesIntelligence.js`, validare exclusiv în Shadow Mode.**
> Zero acțiuni autonome · zero task-uri reale · zero mesaje către oameni · stagiile fără sursă = `NOT_CONNECTED`, niciodată simulate.

> **Poziționare:** acest document definește modul în care CEO AI **vede** vânzările Bell Residence — nu un proces nou de vânzări. Este un **adaptor peste datele existente** din Operational (`sales_summary`, `list_sales_units`, `partner_activity`), consumat de [Observation Engine (cap. 21)](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md), de [Proactive CEO Pipeline (cap. 22)](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md) și de [Cash Intelligence](CASH_INTELLIGENCE.md). Golurile de date se declară prin [Data Gap Engine](DATA_GAP_ENGINE.md), iar orice acțiune rezultată trece prin [Proposal Engine](PROPOSAL_ENGINE.md) și ApprovalGate.

---

## 1. Scop

Vânzarea unui apartament nu este un eveniment, ci un **lanț**: de la primul contact până la banii intrați în bancă. Astăzi Operational vede doar capătul lanțului (unități, statusuri, sume declarate). CEO AI are nevoie de întregul lanț ca să răspundă la întrebările fondatorului:

- *Câți bani reali vin din vânzări și când?* (→ [Cash Intelligence](CASH_INTELLIGENCE.md))
- *Unde se pierd cumpărătorii?* (conversie între stagii)
- *Care unități stau pe loc și de ce?*
- *Vânzarea declarată s-a transformat în cash încasat?*

Trei reguli definesc capitolul:

1. **Adaptor, nu proces nou.** Sales Intelligence citește ce există. Nu impune formulare noi, nu schimbă fluxul lui Adrian, Dana sau al partenerilor. Conectarea unor surse noi se face doar prin propunere aprobată.
2. **Stagiile fără sursă = `NOT_CONNECTED`.** Un stagiu pentru care nu există date nu se estimează, nu se simulează, nu se completează cu presupuneri. Se declară gol de date. **Date lipsă ≠ zero.**
3. **Vânzare declarată ≠ cash încasat.** Separarea strictă CASH / REVENUE / CONTRACTED REVENUE din [Cash Intelligence](CASH_INTELLIGENCE.md) se aplică identic aici.

---

## 2. Funnelul canonic — cele 9 stagii

Funnelul este **canonic** (definiția CEO AI a lanțului de vânzare), independent de ce surse sunt conectate azi. Sursele se mapează pe el, nu invers.

| # | Stagiu | Definiție | Criteriu de ieșire (spre stagiul următor) |
|---|---|---|---|
| 1 | **LEAD** | Persoană care și-a exprimat interesul (site, telefon, portal, partener, recomandare) | Contact bidirecțional stabilit |
| 2 | **CONTACT** | Discuție reală purtată (telefon/WhatsApp/email/față în față) | Programare vizionare |
| 3 | **VIEWING** | Vizionare la șantier/apartament efectuată | Intenție declarată + discuție de preț |
| 4 | **NEGOTIATION** | Negociere activă: preț, etaj, termene, mobilare | Acord verbal / cerere de rezervare |
| 5 | **RESERVATION** | Unitate blocată pe numele clientului | Avans încasat |
| 6 | **ADVANCE** | Avans plătit și **încasat efectiv** | Semnare precontract |
| 7 | **PRECONTRACT** | Antecontract semnat (notarial sau sub semnătură privată) | Semnare contract final |
| 8 | **CONTRACT** | Contract de vânzare-cumpărare semnat | Plata integrală |
| 9 | **CASH RECEIVED** | Banii intrați efectiv în contul companiei | — (capăt de lanț; alimentează [Cash Intelligence](CASH_INTELLIGENCE.md)) |

Reguli de interpretare:

- Stagiile 5–8 sunt **stări declarate** (ce spune Operational); stagiul 9 este o **stare verificată** (banca). Diferența dintre ele este o detecție, nu o presupunere (§5.6).
- Un client poate sări stagii (ex. cumpără fără negociere lungă) — funnelul nu forțează parcurgerea liniară; el definește **ce înseamnă fiecare stare**, nu ordinea obligatorie a oamenilor.
- Regresul (rezervare anulată, precontract picat) este o tranziție validă și un semnal de business, nu o eroare de date.

---

## 3. Maparea pe sursele actuale

Sursele existente (Operational, prin MCP) și ce acoperă fiecare:

| Sursă | Ce oferă | Stagii acoperite |
|---|---|---|
| `sales_summary` | Sinteza vânzărilor: unități vândute/rezervate/disponibile, sume declarate | 5–8 (agregat) |
| `list_sales_units` | Inventarul unităților Bell cu status, preț, cumpărător (domeniul `BELL_INVENTORY` din [Company Data Map](COMPANY_DATA_MAP.md)) | 5–8 (per unitate) |
| `partner_activity` | Activitatea partenerilor de vânzări (conturi partener din Operational) | semnal **indirect** pentru 1–3, doar dacă partenerii înregistrează |

Starea per stagiu (convenția `CONNECTED` / `PARTIAL` / `NOT_CONNECTED` din [Company Data Map](COMPANY_DATA_MAP.md)):

| Stagiu | Stare | Sursă | Observații |
|---|---|---|---|
| 1. LEAD | `NOT_CONNECTED` | — | Lead-urile trăiesc în telefonul lui Adrian, WhatsApp, portaluri. Niciun jurnal conectat. |
| 2. CONTACT | `NOT_CONNECTED` | — | Fără evidență structurată. |
| 3. VIEWING | `NOT_CONNECTED` | — | Vizionările nu sunt înregistrate nicăieri accesibil. `partner_activity` poate conține urme, dar nu e jurnal de vizionări. |
| 4. NEGOTIATION | `NOT_CONNECTED` | — | Negocierile există doar în conversații. |
| 5. RESERVATION | `CONNECTED` | `list_sales_units`, `sales_summary` | Status „rezervat" per unitate. |
| 6. ADVANCE | `PARTIAL` | `list_sales_units` + declarativ | Avansul **declarat** e vizibil; avansul **încasat** cere confruntare cu banca (domeniul `BANK` — vezi §5.6). |
| 7. PRECONTRACT | `PARTIAL` | `list_sales_units` | Depinde de disciplina actualizării statusului în Operational. |
| 8. CONTRACT | `CONNECTED` | `list_sales_units`, `sales_summary` | Status „vândut" per unitate. |
| 9. CASH RECEIVED | `PARTIAL` | [Cash Intelligence](CASH_INTELLIGENCE.md) | Verificabil doar în măsura în care domeniul `BANK` este conectat. |

Consecința onestă: **jumătatea de sus a funnelului (1–4) este oarbă.** CEO AI nu raportează „zero lead-uri" — raportează `NOT_CONNECTED` și menține gap-urile corespunzătoare în [Data Gap Engine](DATA_GAP_ENGINE.md) (domeniul `LEADS` din Company Data Map), cu propuneri de conectare pregătite dar **netrimise** fără ApprovalGate.

---

## 4. Principiul adaptor-peste-existent

1. **Nu se creează proces nou.** Nimeni din companie nu primește un flux suplimentar de completat din cauza acestui modul. Dacă un stagiu merită conectat, CEO AI produce o **System Improvement Proposal** ([Improvement Engine](IMPROVEMENT_ENGINE.md)) sau un **Information Request** ([Data Gap Engine](DATA_GAP_ENGINE.md)) — și Adrian decide.
2. **Sursa de adevăr rămâne Operational.** Sales Intelligence nu are stocare proprie de vânzări; derivă totul la citire din `sales_summary` / `list_sales_units` / `partner_activity`.
3. **Read-only.** Modulul nu scrie în Operational, nu modifică statusuri de unități, nu contactează clienți sau parteneri.
4. **Determinism.** Aceleași date de intrare → aceleași stări de funnel și aceleași detecții. Fără LLM în calculul stărilor.
5. **Praguri din configurație, nu din cod.** Toate pragurile din §5 (zile, procente) vin din `companyConfig.js` (COMPANY INSTANCE #1 = Profi Concept); nucleul rămâne generic.

---

## 5. Detecțiile

Fiecare detecție produce o observație în formatul canonic al [Observation Engine (cap. 21)](../21-observation-engine/OBSERVATION_TYPES.md) — cu severitate, confidence, `data_quality`, `unknowns` — și intră în triajul din [cap. 22](../22-proactive-ceo/SIGNAL_TRIAGE_RULES.md). Nicio detecție nu declanșează acțiuni; cel mult ajunge, prin lanțul validat, în [Founder Attention (cap. 23)](../23-founder-attention/FOUNDER_ATTENTION_ARCHITECTURE.md) sau ca recomandare prin [Proposal Engine](PROPOSAL_ENGINE.md).

### 5.1 Rezervări fără avans

| | |
|---|---|
| Condiție | Unitate cu status „rezervat" de peste N zile (prag `companyConfig`) fără avans declarat/încasat |
| Surse | `list_sales_units` + Cash Intelligence |
| De ce contează | Rezervarea fără avans blochează inventarul fără angajament real; e cea mai frecventă formă de „vânzare fantomă" |
| Ieșire | Observație + recomandare posibilă (reconfirmare client / eliberare unitate) — doar prin Proposal Engine |

### 5.2 Lead-uri abandonate

| | |
|---|---|
| Condiție | Lead fără contact de peste N zile |
| Stare | **`DATA_REQUIRED`** — necomputabilă cât timp stagiile 1–2 sunt `NOT_CONNECTED` |
| Ieșire azi | Data Gap explicit (domeniul `LEADS`), nu o detecție goală și nu o estimare |

### 5.3 Conversie slabă între stagii

| | |
|---|---|
| Condiție | Rata de conversie între două stagii **conectate** scade sub pragul istoric (ex. rezervare→avans, avans→precontract) |
| Surse | `list_sales_units` (tranziții de status în timp, din snapshot-uri succesive) |
| Limitare declarată | Se calculează **doar pe segmentele conectate (5→9)**; conversia 1→5 este `UNKNOWN`, nu „100%" și nu „0%" |
| Ieșire | Observație cu trend; escaladare doar la degradare persistentă |

### 5.4 Unități stagnante

| | |
|---|---|
| Condiție | Unitate disponibilă fără nicio schimbare de status timp de N zile, în timp ce unități comparabile se mișcă |
| Surse | `list_sales_units` + istoricul snapshot-urilor din `jarvis_state` |
| De ce contează | Semnal de preț greșit, poziționare slabă sau problemă de produs (etaj, orientare, compartimentare) |
| Ieșire | Observație; la persistență → episod executiv cu întrebări pentru Board (CSO/CMO din [BOARD_ROLES](../04-executive-board/BOARD_ROLES.md)) |

### 5.5 Discount neobișnuit

| | |
|---|---|
| Condiție | Preț de vânzare/rezervare sub prețul de listă cu mai mult de pragul din `companyConfig` |
| Surse | `list_sales_units` (preț listă vs preț tranzacție) |
| De ce contează | Protejează marja și semnalează fie presiune de negociere, fie eroare de introducere a datelor |
| Ieșire | Observație cu ambele ipoteze declarate (discount real / eroare de date) — nu se presupune care |

### 5.6 Diferență vânzare declarată vs cash încasat

| | |
|---|---|
| Condiție | Avans/tranșă/contract declarat în Operational fără intrare bancară corespondentă în fereastra așteptată |
| Surse | `list_sales_units` + `sales_summary` × domeniul `BANK` prin [Cash Intelligence](CASH_INTELLIGENCE.md) |
| Regulă absolută | Cât timp `BANK` este `PARTIAL`/`NOT_CONNECTED`, detecția raportează `UNVERIFIABLE` + Data Gap, **nu** „lipsesc bani" |
| De ce contează | Este puntea dintre funnel și lichiditate: singura vânzare care contează pentru cash este cea încasată |
| Ieșire | Observație de severitate ridicată la diferențe confirmate; `founder_attention` doar după verificare |

### 5.7 Forecast încasări din vânzări

| | |
|---|---|
| Condiție | Permanent (nu e alertă, e flux de date) |
| Logică | Avansuri așteptate + tranșe din precontracte + solduri din contracte → **CONFIRMED RECEIVABLES** (contract semnat) și **PROBABLE RECEIVABLES** (rezervări cu avans), cu date estimate |
| Destinație | Intrare directă în modelul de lichiditate proiectată din [Cash Intelligence](CASH_INTELLIGENCE.md) (orizonturi 7/14/21/30/60/90) |
| Regulă absolută | Componentele fără sursă → `UNKNOWN` + Data Gap; **niciodată inventate**. O rezervare fără avans nu intră în forecast. |

---

## 6. Ce produce și ce NU produce modulul

| Produce | NU produce |
|---|---|
| Stări de funnel per unitate/client, cu proveniența fiecărei valori | Statusuri modificate în Operational |
| Observații deterministe pentru cap. 21/22 | Mesaje către clienți, parteneri sau echipă |
| Intrări CONFIRMED/PROBABLE pentru Cash Intelligence | Cifre estimate pentru stagiile `NOT_CONNECTED` |
| Data Gaps + propuneri de conectare (netrimise fără ApprovalGate) | Proces nou de vânzări impus oamenilor |
| Material pentru Board Preview (CSO/CFO/CMO) | Convocare de Board sau execuție |

Lanțul complet rămâne cel din MASTER PHASE: **SEE → UNDERSTAND → VERIFY → THINK → SIMULATE → RECOMMEND → ASK/PROPOSE → ADRIAN APPROVES → DELEGATE/EXECUTE → VERIFY EXECUTION → LEARN.** Sales Intelligence trăiește în SEE/UNDERSTAND/VERIFY; tot ce urmează trece prin [Proposal Engine](PROPOSAL_ENGINE.md) și, la final, prin [Closed Loop](CLOSED_LOOP.md).

---

## 7. Drumul de la orb la conectat (fără a forța pe nimeni)

Ordinea recomandată de închidere a golurilor — fiecare pas doar ca propunere aprobată de Adrian:

1. **Banca (domeniul `BANK`)** — deblochează §5.6 și transformă stagiul 9 în `CONNECTED`. Cel mai mare câștig per efort.
2. **Jurnal minim de lead-uri/vizionări** — o singură sursă simplă (formular site / listă în Operational), propusă prin Improvement Engine; deblochează §5.2 și conversia 1→5.
3. **Disciplina statusurilor 6–7** — nu prin proces nou, ci prin verificarea încrucișată cu banca (avans încasat → status confirmat automat la citire).

Până atunci, CEO AI spune explicit ce nu vede — pentru că un CEO care recunoaște ce nu știe este mai valoros decât unul care inventează.

---

## Legături

- [Company Data Map](COMPANY_DATA_MAP.md) — domeniile `SALES`, `LEADS`, `BELL_INVENTORY`, `RECEIVABLES` și stările lor
- [Cash Intelligence](CASH_INTELLIGENCE.md) — receivables, lichiditate proiectată, separarea CASH/REVENUE
- [Data Gap Engine](DATA_GAP_ENGINE.md) — declararea și tratarea golurilor din funnel
- [Proposal Engine](PROPOSAL_ENGINE.md) — singura cale de la detecție la acțiune
- [Cap. 21 — Observation Engine](../21-observation-engine/OBSERVATION_ENGINE_ARCHITECTURE.md) — formatul canonic al observațiilor
- [Cap. 22 — Proactive CEO](../22-proactive-ceo/PROACTIVE_CEO_ARCHITECTURE.md) — triaj, episoade, brief
- [Cap. 23 — Founder Attention](../23-founder-attention/FOUNDER_ATTENTION_ARCHITECTURE.md) — ce ajunge la Adrian
- [Cap. 04 — Executive Board](../04-executive-board/BOARD_ROLES.md) — directorii care ar analiza episoadele de vânzări
