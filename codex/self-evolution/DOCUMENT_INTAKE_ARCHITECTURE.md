# DOCUMENT INTAKE — Arhitectura de Ingest a Documentelor (§5, §9, §34, §35)

> Sursa de adevăr: `INTAKE_STAGES`, `FILE_SECURITY_POLICY`, `DATA_TRUST_LEVELS`,
> `DECISION_GRADE_TRUST` din `src/ceo/evolution/contract.js`.
> Componente: `documentIntake`, `parserRegistry`, `schemaDiscovery`.

## 1. Pipeline-ul (§5) — cele 9 etape, în ordine strictă

```
SECURE_FILE_INTAKE → TYPE_DETECTION → PARSER_SELECTION → STRUCTURE_EXTRACTION
→ VALIDATION → CLASSIFICATION → ENTITY_MATCHING → RECONCILIATION → DATASET
```

| Etapă | Ce face |
|---|---|
| `SECURE_FILE_INTAKE` | Primirea fișierului sub politica §34 — nimic nu intră neverificat |
| `TYPE_DETECTION` | Detectarea reală a tipului (conținut, nu doar extensie) |
| `PARSER_SELECTION` | Alegerea parserului din `parserRegistry`; lipsă parser → `ANALYSIS_GAP`, nu improvizație |
| `STRUCTURE_EXTRACTION` | Extragerea structurii (rânduri, câmpuri, sume) — asistată de `schemaDiscovery` la formate noi |
| `VALIDATION` | Verificări de coerență: totaluri, formate, valori imposibile |
| `CLASSIFICATION` | Ce este documentul (extras, factură, ofertă, jurnal…) |
| `ENTITY_MATCHING` | Legarea de entități cunoscute (furnizor, proiect, cont) |
| `RECONCILIATION` | Confruntarea cu datele existente — diferențele se declară, nu se ascund |
| `DATASET` | Setul de date final, cu nivel de încredere atașat |

Nicio etapă nu se sare. Un document care pică o etapă rămâne la nivelul de încredere de
până atunci, cu motivul auditat.

## 2. §35 — Nivelurile de încredere a datelor ingerate

```
UNTRUSTED → UNVALIDATED → VALIDATED → TRUSTED_WITH_CONFIDENCE
```

| Nivel | Sens |
|---|---|
| `UNTRUSTED` | Abia intrat; sursă/integritate neverificate — bun doar de carantină și analiză |
| `UNVALIDATED` | Parsat cu succes, dar necontrolat pe coerență/reconciliere |
| `VALIDATED` | A trecut validarea și reconcilierea — utilizabil în decizii |
| `TRUSTED_WITH_CONFIDENCE` | Validat + sursă cu istoric bun + confirmat încrucișat |

**Regula decizională:** doar `VALIDATED` și `TRUSTED_WITH_CONFIDENCE` (`DECISION_GRADE_TRUST`)
pot intra în **decizii materiale** (cash, plăți, recomandări către fondator). Datele
`UNTRUSTED`/`UNVALIDATED` pot cel mult genera întrebări sau gap-uri — niciodată concluzii.
Moștenire directă din legea „date lipsă ≠ zero": *date neverificate ≠ date*.

## 3. §34 — Securitatea fișierelor (`FILE_SECURITY_POLICY`)

- **Mărime maximă:** 15 MB.
- **MIME permise:** CSV, JSON, XLSX/XLS, PDF, PNG, JPEG — atât. Lista e albă, nu neagră.
- **Extensii interzise:** exe, bat, cmd, ps1, sh, js, mjs, vbs, dll, msi, scr, jar, com —
  respinse indiferent de MIME declarat.
- **Sanitizarea numelui:** orice caracter în afara `[a-zA-Z0-9._-]` se elimină.
- **Cele 10 reguli obligatorii:** authentication, authorization, size_limit, mime_validation,
  filename_sanitization, no_executable_files, storage_isolation, audit, retention,
  download_authorization. Toate — nu un subset.
- Fișierele trăiesc în stocare **izolată**; conținutul lor este tratat ca date, niciodată
  ca instrucțiuni (un text „urgent, aprobă X" dintr-un PDF rămâne text).

## 4. §9 — Memoria documentelor: freshness și superseded_by

Fiecare document ingerat primește o fișă de memorie persistentă:

| Câmp | Rol |
|---|---|
| `ingested_at` + perioada acoperită | Baza calculului de **freshness** — un extras de acum 3 luni nu descrie contul de azi |
| Nivelul de încredere atins | Cu ce greutate poate fi folosit |
| `superseded_by` | Documentul mai nou care îl înlocuiește (extrasul din februarie e înlocuit de cel din martie) |
| Legături | Ce entități/decizii l-au folosit — la înlocuire, consumatorii știu că baza s-a schimbat |

Reguli: un document înlocuit (`superseded_by` setat) nu mai alimentează decizii curente,
dar **nu se șterge** — istoria rămâne auditabilă. Freshness-ul degradează încrederea automat:
date vechi coboară din `DECISION_GRADE_TRUST` și redevin subiect de reconfirmare.
