# GMAIL CONNECTION GUIDE — JARVIS Email Intelligence

Scop: conectarea contului Gmail pentru ca JARVIS să poată **căuta/citi/analiza** emailuri și
atașamente (read-only) și să **creeze drafturi la cerere**. **Trimiterea rămâne dezactivată.**

Utilizatorul normal parcurge conectarea prin **wizardul din secțiunea Email** (nu are nevoie de
acest ghid). Acest ghid e pentru **pasul de admin** (config Google Cloud), necesar O SINGURĂ DATĂ.

## Ce trebuie făcut o dată (admin — Adrian sau IT)

1. **Google Cloud Console** → creează/selectează un proiect.
2. **Enable Gmail API** (APIs & Services → Library → Gmail API → Enable). (Opțional: Drive API pentru atașamente din Drive.)
3. **OAuth consent screen** → tip **External** (sau Internal dacă e Workspace); completează app name + email suport.
4. Dacă e External în „Testing": adaugă contul Gmail al lui Adrian la **Test users**.
5. **Credentials → Create OAuth client ID → Web application**.
6. **Authorized redirect URIs** — adaugă exact:
   - Producție (Railway): `https://jarvis-server-production-a362.up.railway.app/auth/google/callback`
   - Development (dacă e cazul): `http://localhost:3000/auth/google/callback`
7. Copiază **Client ID** + **Client Secret**.
8. **Variabile de mediu** (Railway → jarvis-server): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
   (JARVIS setează singur `GOOGLE_REFRESH_TOKEN` după autorizare, prin callback.)

## Scope-uri exacte (minime — fără trimitere)
- `gmail.readonly` — citire + căutare email.
- `gmail.compose` — creare drafturi (NU trimitere).
- `drive.readonly` — citire atașamente din Drive (opțional).
- **NU** se cere `gmail.send` — trimiterea e imposibilă structural.

## Conectarea (Adrian, prin wizard)
1. Deschide secțiunea **Email** în JARVIS → **Conectează Gmail**.
2. Wizardul arată permisiunile cerute → **Autorizează prin Google**.
3. Ecranul Google → aprobi cele 3 scope-uri (nicio trimitere).
4. Callback-ul `/auth/google/callback` salvează singur `GOOGLE_REFRESH_TOKEN` + redeploy.
5. JARVIS rulează testul read-only și confirmă contul + permisiunile reale.

## Verificarea conexiunii
- `GET /api/email/status` → `connected`, cont, scope-uri, `send_enabled:false`.
- `POST /api/email/test` → căutare read-only limitată + audit.

## Revocarea accesului
- Secțiunea Email → **Revocă accesul** (`POST /api/email/disconnect`) → invalidează `GOOGLE_REFRESH_TOKEN`.
- Sau din contul Google: myaccount.google.com → Security → Third-party access → revocă JARVIS.

## Troubleshooting
- **„Conectarea nu poate începe / lipsește GOOGLE_CLIENT_ID"** → adminul nu a setat env-urile (pașii 5-8).
- **redirect_uri_mismatch** → redirect URI din Google Cloud nu coincide exact cu cel de mai sus.
- **access_denied / app not verified** → adaugă contul la Test users (pas 4) sau publică consent screen.
- **token expirat** → secțiunea Email arată „necesită reconectare" → Reconectează Gmail.
- **scope prea larg** → dacă tokenul are `gmail.send/modify`, integrarea NU se activează până la remediere (regenerează clientul cu scope-urile de mai sus).

## Garanții de securitate
Tokenuri criptate, fără tokenuri în loguri, atașamente UNTRUSTED (fără resurse remote/macro),
prompt injection guard, fără modificarea inboxului, fără trimitere, fără scriere Operational în
afara TASKS. Conținutul email = `UNTRUSTED_EXTERNAL_CONTENT` (nu poate schimba permisiuni/politici).
