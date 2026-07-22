# ÎNTREABĂ CODEX — arhitectura minimă recomandată (§18)

> Propunere de arhitectură, **fără cod încă**. Buton „Întreabă CODEX" în aplicațiile Danei și Nelu din Operational: angajatul scrie o problemă / întrebare / atașează document, CODEX răspunde folosind contextul companiei. Reutilizează infrastructura existentă; NU sistem paralel.

## Principiul de reutilizare (nimic nou major)

Tot ce trebuie EXISTĂ deja:
- **Canalul de chat + creierul** — `src/brain.js` (`handleMessage`), calea read-only Operational, memoria conversațională (`history.js`), Source Truth + anti-halucinație (nou, `ceo/sourceTruth.js`).
- **Storage** — `jarvis_state` (conversații per cheie) SAU tabela `conversations` din DB-ul JARVIS (deja folosită de HUD/Telegram).
- **Atașamente** — `attachments` + `file_blobs` în Operational (deja) + `documentIngestRunner` (parse → staging).
- **Granița** — FULL READ / TASKS-ONLY WRITE neatinsă.

## Componentele minime de adăugat (nu acum)

1. **UI în Operational** (repo `operational`): un buton/panou „Întreabă CODEX" pe pagina Danei și Nelu — un textarea + upload (reutilizează upload-ul de atașamente existent) + fir de conversație. **Aici e singurul cod cu adevărat nou**, și e în Operational, nu în jarvis-server.
2. **Endpoint în jarvis-server**: `POST /api/codex/ask` (sub PIN/token), body `{ employee_id, text, attachment_ref? }` → cheamă `handleMessage("codex:<employee_id>", text)` pe calea read-only + un system-prompt cu **permission boundary per angajat** (Dana vede doar ce ține de rolul ei; Nelu de al lui). Răspuns chunked (ca la Telegram).
3. **Conversație per angajat**: cheie `codex:conv:<employee_id>` în jarvis_state SAU channel dedicat în `conversations`. Reutilizează `appendMessage`/`getContext`.
4. **Task linking**: dacă întrebarea se referă la un task, CODEX îl citește (read-only) și poate pune o observație pe task-ul ORIGINAL (regula „un task = o responsabilitate", `opsObservation`) — nu creează task nou.

## Ce NU se construiește acum

- Fără arhitectură paralelă de mesagerie.
- Fără scriere în Operational dincolo de Tasks.
- Fără acces al angajaților la date în afara rolului lor (permission boundary strict).
- Fără auto-execuție: dacă întrebarea cere o acțiune materială (bani/contract), CODEX răspunde informativ + rutează spre fluxul de aprobare existent.

## Fluxul propus (o singură buclă coerentă)

```
Angajat scrie in Operational (buton Intreaba CODEX)
  -> POST /api/codex/ask (jarvis-server)
  -> handleMessage read-only + Source Truth + boundary per rol
  -> raspuns contextual (memorie conversationala per angajat)
  -> daca e legat de un task: observatie pe task-ul ORIGINAL (nu task nou)
  -> raspuns chunked in UI
```

## Efortul estimat (când se aprobă)

- Operational UI: ~mediu (o pagină + fir conversație + upload reutilizat).
- jarvis-server endpoint + boundary: ~mic (reutilizează handleMessage + history).
- Total: un modul mic, nu o arhitectură nouă. **Recomandare: se construiește DUPĂ ce prima buclă reală de management (follow-up → răspuns → verify → close) e demonstrată live**, ca să validăm întâi direcția CODEX→PEOPLE→RESPONSE.

**Status: PROPUNERE. Nu se construiește până la aprobarea fondatorului.**
