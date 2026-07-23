# JARVIS V1 — FINAL ENGINEERING & PRODUCT AUDIT

Data: 23 iul 2026. Fara exagerare — dovezi, nu optimism.

## MASTER PHASES
- **DONE (~40):** 1-14, 16-21, 23-27, **28 (Ask CODEX, LIVE)**, 29-35, 37-38, 42. Adaugate in aceasta rulare: Ask CODEX end-to-end, self-model 3-way (Faza 13), triple-truth audit (Faza 15), Gmail/Calendar auth-prep (Faza 12).
- **PARTIAL (~2):** 13→acum DONE; 39-41 (perf/UX/docs — incrementale, functionale).
- **BLOCKED (real, nu tehnic):** 22 Gmail/Calendar = `BLOCKED_EXTERNAL_AUTH` (consimtamant Google Adrian); 36 = `IN_PROGRESS_EXTERNAL_DEPENDENCY` (raspuns uman); self-deploy = OFF intentionat; 43 route reorg = amanat.

## CURRENT HEAD / TESTS / PRODUCTION
- HEAD: `cb063b9` + commit-uri finale (self-model/audit/docs). origin/main sincronizat.
- TESTS: **70 fisiere, toate trec.**
- PRODUCTION: jarvis-server LIVE pe Railway (amusing-sparkle), `CODEX_ASK_ENABLED=on`, deploy validat.

## ASK CODEX
- **Dana:** context finante/contabilitate/cash/creante/documente; data-loop ("ce lipseste" → surse neconectate, uman). Validat LIVE.
- **Nelu:** context executie/santier/materiale; blocker intelligence (pas concret, Adrian doar cand e obligatoriu). Cerere finance → blocata (out_of_scope, zero leakage). Validat LIVE.
- **Attachments:** PDF/XLSX/CSV/imagine → UNTRUSTED (scan + fence). Injectare detectata + refuzata LIVE.
- **Permissions:** need-to-know per rol; cross-user leakage testat (Dana≠Nelu context). CODE: `codex/identity.js`.
- **Security:** `codex/untrustedInput` (prompt/tool/exfil/false-authority); continut extern = DATE. Comenzi doar din user, nu din documente.
- **Commands:** ConversationMode → CommandBus (operationalWrite) → execution receipt. TASKS-only. Zero permission bypass (garda `codex.wiring`).
- **Memory:** per user+thread; afirmatii umane = HUMAN_CLAIM (nu fapt verificat).
- **UX:** conversational, uman, zero coduri interne (`humanize`). Buton in dashboard + pe task (context auto).
- **STARE FRONTEND (onest):** componenta `AskCodex` + butonul "Intreaba CODEX" sunt scrise in `operational.jsx` (bracket-check OK, stil consecvent). Backend-ul e LIVE si validat. Integrarea in Operationalul DEPLOYAT ramane un pas: repo-ul local `operational` nu are commit-uri si nu e legat de pipeline-ul de deploy real → NU am impins in orb. Pas de integrare (ca OAuth): (1) preia componenta din operational.jsx in Operationalul deployat; (2) adauga pe serverul Operational un proxy same-origin `/api/codex/ask` → jarvis-server care injecteaza PIN-ul (angajatii nu vad PIN-ul). Pana atunci butonul degradeaza elegant ("CODEX indisponibil").

## STRATURI COGNITIVE
- **COGNITIVE KERNEL:** unificat; Ask CODEX si chat-ul folosesc acelasi grounding (nu chatbot paralel).
- **MODEL ROUTING:** TIER 0-3 explicit (`selectTier`); heavy + second opinion pe capital/strategie/negociere.
- **FOUNDER MODEL:** invata ipoteze din decizii (evidence/confidence≤75/counterexamples); KNOW ADRIAN, NOT YES-MAN.
- **COGNITIVE TRACE:** factual, persistat (model/tier/surse/latency/egress). Read-only.
- **DATA TRUST:** scor 5-dimensiuni per domeniu; plafon MEDIUM pe bani nereconciliati.
- **EVENT FLOW:** vocabular canonic (`changeEvents`) OPERATIONAL→JARVIS; reevaluare pe zona afectata.
- **OPERATIONAL SYNC:** reactiveWatch (poll ~7min) + changeEvents; contract semantic (`dataContract`).

## EXTERNAL INTELLIGENCE
- **NEWS MONITOR:** registru topicuri (EUR/RON, dobanzi BNR, credit, IMM Invest, ANAF, imobiliar Sibiu, costuri, concurenta); dedup + novelty + credibilitate sursa (nu spam).
- **EXTERNAL→INTERNAL IMPACT:** mapare cu provenance; I14 = extern NU devine fapt intern. Validat LIVE (7 semnale reale mapate la Bell).

## MANAGEMENT
- **AUTONOMOUS TASK MANAGEMENT:** TASKS-only, gated, limite 5/zi + 2/persoana, kill switch, receipts.
- **OPEN LOOPS / CLOSED VERIFIED LOOPS:** watchdog + follow-up armate; **bucle reale inchise verificat = 0** (depinde de raspuns uman — nu se fabrica).

## GMAIL / CALENDAR
- **GMAIL:** NOT_CONNECTED. **CALENDAR:** NOT_CONNECTED.
- **Exact blocker/action:** consimtamant Google Adrian. Vezi `codex/GMAIL_CALENDAR_AUTH_STEP.md` — tip client Web, redirect `https://jarvis-server-production-a362.up.railway.app/auth/google/callback`, scopes gmail.readonly/compose + calendar.events + drive.readonly. Dupa Connect: auto-detect CONNECTED + sync + read test + manifest update. Zero email autonom.

## CAPABILITY SELF-MODEL
- **can_execute explanation:** distinctie in 3 nivele (arhitectura A, corecta). CORE = read + propose, `execute_directly=false`. AUTHORIZED COMMANDS = CommandBus (create_task/add_observation/reminder), TASKS-only, sub politica (nervous + ask_codex). FORBIDDEN = plati/contabilitate/contracte/preturi/config/self-deploy/Level 3. `whatCanIExecute()` raspunde onest la "ce poti executa singur".

## AUDITURI FINALE
- **CODE TRUTH vs JARVIS SELF-MODEL:** capabilityManifest reflecta modulele reale — **0 contradictii**.
- **CODE TRUTH vs OPERATIONAL REALITY:** triple-truth audit (`scripts/tripleTruthAudit.mjs`) pe 10 capabilitati — **0 mismatches** (READ/WRITE/SOURCE/EXECUTION aliniate; bank/gmail declarate onest NOT_CONNECTED).
- **SECURITY:** untrusted input (chat + Ask CODEX + documente); zero write in afara TASKS (garzi structurale).

## TOP REMAINING BLOCKERS (necesita decizia/actiunea ta, nu cod)
1. **Gmail/Calendar OAuth** — 3 minute de click-uri (doc gata).
2. **Prima bucla reala inchisa** — un raspuns Nelu/Dana pe un task JARVIS (reactive path o proceseaza in ≤7min).
3. Level 3 / self-deploy — raman OFF prin design pana decizi tu.

## FINAL VERDICT
**COHERENT + ACTIVE_MANAGEMENT (parametrizat).**
Motiv onest: sistemul e coerent (un creier), gestioneaza activ (task-uri, follow-up, Ask CODEX live pentru echipa), constient extern, instrumentat si securizat. NU declar `RELIABLE_OPERATIONAL_CEO` si cu atat mai putin `LIVING_COMPANY_OS_V1` — acele praguri cer **bucle reale inchise verificate (acum 0)** si conectarea surselor externe (OAuth-ul tau). Acelea depind de lume reala si de tine, nu de mai mult cod.
