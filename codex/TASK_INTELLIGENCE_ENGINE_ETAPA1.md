# TASK INTELLIGENCE ENGINE — ETAPA 1 (AUDIT + ARHITECTURĂ PROPUSĂ)

STATUS: audit read-only + propunere. ZERO cod de implementare. Nu se atinge Operational.
Principiu: JARVIS **nu execută** taskuri — **învață** din ele și **recomandă**.

## A. AUDIT — CE EXISTĂ DEJA (read-only, verificat în cod)

### A.1 Cum citește JARVIS task-urile din Operational
- **opsdb (read-only, structural)** — `supervisor/collector.js` face `SELECT id, title, status, resolution, deadline, assignee, created_by, project, acceptance_criteria, created_at, updated_at FROM tasks WHERE deleted_at IS NULL AND kind != 'personal'`. `resolution` = JSON `{done, clarif, attachments, cost}`.
- **Atașamente** — `documentIngestRunner.js`: `SELECT a.task_id, a.filename, a.original_name, a.uploaded_by, a.created_at, fb.data, fb.mime, fb.size FROM attachments a JOIN file_blobs fb ...` (BYTEA, read-only, FULL READ autorizat).
- **Observații/conversație** — prin MCP `get_task` (thread de observații); folosit deja în `askCodex` (`tc.observations`). Nu există tabelă opsdb interogată direct pentru observații.
- **Read-only impus** — `opsdb.js`: sesiune `default_transaction_read_only` + gardă `isReadOnlySql`. Scrierea = doar `operationalWrite` (TASKS-only). **Task Intelligence e pur observațional → zero risc de scriere.**

### A.2 Module REUTILIZABILE (nu construim de la zero)
| Nevoie ETAPA 1 | Modul existent reutilizabil |
|---|---|
| DOCUMENT MEMORY (2,3) | `documentIngestRunner.js` (citește attachments+file_blobs, security→parser→schema→dataset, clasificare) + `evolution/documentTypeRegistry.js` (12 tipuri) → staging `ceo:documents` |
| EXPERIENCE DB + learning (4,6) | `actions/decisionLearning.js` (`situationFingerprint`, DecisionExample→Preference) — tiparul de învățare din context, nu situație→etichetă |
| SIMILAR TASKS (5) | `nervousSystem.findSimilarDecisions` (token overlap), `nervous/dedupEngine.checkDuplicate` (similaritate 0.55), `situationFingerprint` |
| CONVERSATION MEMORY (2) | `codex/conversationStore.js` (per-thread, HUMAN_CLAIM) + `history.js` (rezumat rulant) |
| PEOPLE similar (5,7) | `nervous/orgMemory.js` (delegation confidence), `nervous/effectiveness.js`, `nervous/peopleLoad.js` |
| RECOMMENDATION (7) | `actions/envelope.js` + `actions/actionCard.js` (AUTO/APPROVAL/CHOICE) — recomandarea = Action Card, nu decizie |
| Persistență | `state.js` (jarvis_state) — toate memoriile JARVIS sunt aici, izolat de Operational |

**Concluzie audit:** ~70% din piese există. Task Intelligence Engine = un strat de **indexare + agregare + căutare** peste ele, plus un extractor de cunoștințe pe conversație.

## B. ARHITECTURĂ PROPUSĂ

Un director nou `src/ceo/taskIntel/` (izolat, read-only pe Operational, scrie doar în jarvis_state):

```
taskIntel/
  ingest.js        — TASK MEMORY: indexează taskurile FINALIZATE (opsdb read + MCP get_task
                     pt observații + documentIngestRunner pt atașamente). Idempotent pe task_id+updated_at.
  conversation.js  — CONVERSATION MEMORY: din thread-ul de observații extrage
                     {problemă, întrebări, răspunsuri, decizie, concluzie} (LLM structurat,
                     ca envelope — NU stochează bruta, ci cunoștință).
  knowledge.js     — KNOWLEDGE BUILDING: pt fiecare task finalizat → KnowledgeCard
                     {ce/cine/de ce/cum/documente/probleme/rezolvare/reutilizabil}.
  experience.js    — EXPERIENCE DB: agregă KnowledgeCards pe fingerprint (tip problemă +
                     documente + owner + durată + rezultat). Reutilizează situationFingerprint.
  similar.js       — SIMILAR TASKS: la un task nou → caută experiențe/persoane/documente/
                     soluții similare (fingerprint + token overlap, praguri existente).
  recommend.js     — AI RECOMMENDATION: din experiența similară → recomandă executant/
                     documente/pași/timp estimat/riscuri. DOAR recomandă (Action Card CHOICE/INFO).
  index.js         — orchestrator (cron: indexare taskuri finalizate) + API read-only.
```

**Fluxul de date (read-only pe Operational):**
```
Operational (tasks + attachments + get_task observations)  ── READ ONLY ──►
  ingest.js → conversation.js → knowledge.js → experience.js  ── WRITE ──► jarvis_state
                                                                            (ceo:taskintel:*)
La task NOU:  similar.js (căutare) → recommend.js → Action Card (recomandare) → CEO Home / chat
```

## C. MODELUL BAZEI DE CUNOȘTINȚE (jarvis_state, izolat)

```js
TaskRecord {              // ceo:taskintel:tasks  (index brut, minimizat)
  id, title, description, project, creator, executant, validator,
  started_at, finished_at, resolution_time_min, final_result,
  attachment_refs[], observation_count, indexed_at, fingerprint
}
KnowledgeCard {           // ceo:taskintel:knowledge
  task_id, problem, what, who, why, how, documents_used[],
  problems_encountered[], resolution, reusable[], evidence_class, confidence
}
ExperienceEntry {         // ceo:taskintel:experience  (agregat pe fingerprint)
  fingerprint, problem_type, typical_owner, avg_resolution_min,
  documents_pattern[], typical_result, sample_task_ids[], occurrences, confidence
}
DocumentKnowledge {       // reutilizează ceo:documents (documentIngestRunner)
  task_id, filename, doc_type, summary, extracted_fields, trust
}
Recommendation {          // efemer → Action Card
  new_task_ref, suggested_executant, suggested_documents[], suggested_steps[],
  estimated_time_min, risks[], based_on_task_ids[], confidence
}
```
Clase de evidență: `OBSERVED_IN_TASK / EXTRACTED_FROM_DOC / INFERRED / UNKNOWN` (nu confundă „găsit" cu „confirmat").

## D. FLUXUL DE ÎNVĂȚARE
1. **Indexare** (cron, ex. zilnic): taskuri cu `status IN (acceptat/rezolvat)` noi/actualizate → TaskRecord (idempotent).
2. **Extracție conversație** → KnowledgeCard (LLM structurat, ca ManagerialDecisionEnvelope: fără proză brută).
3. **Documente** → DocumentKnowledge (reutilizează pipeline-ul existent).
4. **Agregare** → ExperienceEntry pe fingerprint (min. N ocurențe pt „pattern", ca DecisionPreference — nu dintr-un caz).
5. **La task nou** → SIMILAR → RECOMMEND → Action Card (executant/documente/pași/timp/riscuri).

## E. FIȘIERE care AR FI create/modificate (NIMIC încă — cere aprobarea ta)
- **NOI:** `src/ceo/taskIntel/{ingest,conversation,knowledge,experience,similar,recommend,index,api}.js`, `test/taskIntel.test.mjs`, secțiune „Experiență & Cunoștințe" în CEO Home (frontend).
- **MODIFICATE (minim, aditiv):** `config.js` (flag `TASK_INTELLIGENCE_ENABLED`, default off), `index.js` (register API), `scheduler.js` (cron indexare — gated).
- **NEATINSE:** Operational, `operationalWrite`, orice modul de scriere, taskflow, approvalGate.

## F. TESTE (plan)
- Idempotență indexare (același task nu se re-indexează).
- Read-only: garda structurală (taskIntel nu importă taskflow/approvalGate; zero create/update_task).
- Fingerprint distinge tipuri de problemă diferite.
- Experience pattern doar din N+ ocurențe (nu 1 caz).
- Similar: task nou → găsește taskuri comparabile.
- Recommend produce Action Card (recomandare), NU execuție.
- Document knowledge reutilizează documentIngestRunner (fără dublare).
- Conversation extraction: nu stochează bruta, produce cunoștință structurată.

## G. RISCURI
1. **Volum/cost LLM** — extracția conversației pe fiecare task e apel LLM → cost. *Mitigare:* batch + doar taskuri finalizate + cache pe fingerprint + gated.
2. **Date sensibile** — conversațiile/documentele pot conține date sensibile. *Mitigare:* minimizare (nu stoca bruta), UNTRUSTED pe atașamente (reutilizează fenceUntrusted), fără date sensibile în loguri.
3. **Prompt injection din conversație/documente** — reutilizează `untrustedInput` (deja existent).
4. **Recomandări greșite** — *Mitigare:* recomandă doar cu confidence + „bazat pe N taskuri"; niciodată decide; Action Card, nu execuție.
5. **Observațiile via MCP** — dependent de `get_task`; dacă MCP e jos, indexarea observațiilor eșuează. *Mitigare:* best-effort + health (reutilizează monitoringHealth).

## H. ROLLBACK
- Totul e **aditiv + gated** (`TASK_INTELLIGENCE_ENABLED=off` implicit) → dezactivare instant fără efect.
- Datele stau în `jarvis_state` chei `ceo:taskintel:*` → ștergere = golirea cheilor, zero impact pe Operational.
- Fără migrări DB, fără schemă nouă în Operational, fără scriere → rollback = revert commit + unset flag.

## VERDICT ETAPA 1
Fezabil, ~70% reutilizare, risc scăzut (pur observațional, read-only pe Operational, TASKS-only rămâne neatins). Recomand aprobarea pentru ETAPA 2 (implementare `ingest.js` + `knowledge.js` + teste, gated), pe increment, cu validare live după fiecare piesă.
```
```
