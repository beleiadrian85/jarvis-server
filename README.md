# JARVIS Backend — Faza 1

Creierul always-on al lui JARVIS. Faza 1 livrează un singur flux end-to-end:
**„Bună dimineața Jarvis" → raport (vreme + calendar + task-uri Operational)**, prin Telegram.

PWA-ul/HUD-ul rămâne separat — acesta e serverul care stă pornit non-stop.

---

## Ce face acum (Faza 1)

- Bot Telegram, doar tu poți comanda (verificare chat ID).
- `Bună dimineața Jarvis` sau `/raport` → brief scurt: vreme Sibiu + calendar + task-urile tale.
- Orice alt mesaj → chat normal cu Claude (fără memorie persistentă încă — vine în Faza 2).
- Task-urile vin din **Operational prin MCP** (apel direct din API-ul Claude).
- Vremea: Open-Meteo (gratis, fără cheie).
- Calendar: opțional — dacă nu-l configurezi, raportul merge fără el.

Ce NU e încă (intenționat): cron 9/17, monitor email, monitor site, memorie persistentă. Scheletul pentru cron e gata în `src/scheduler.js`, dezactivat.

---

## Pas 1 — Botul Telegram

1. În Telegram, scrie lui **@BotFather** → `/newbot` → alege nume → primești un **token**.
2. Pune token-ul în `TELEGRAM_BOT_TOKEN`.
3. Chat ID-ul tău: pornește o conversație cu botul tău, trimite-i `/id` (după deploy) SAU
   folosește @userinfobot. Pune valoarea în `TELEGRAM_OWNER_CHAT_ID`.

## Pas 2 — Cheia Claude

`console.anthropic.com` → API keys → pune în `ANTHROPIC_API_KEY`.

## Pas 3 — Operational

Ai deja URL-ul connectorului (cel cu token în path). Pune-l în `OPERATIONAL_MCP_URL`.
Dacă MCP-ul tău cere autentificare separată în loc de token în URL, spune-mi și adăugăm
`authorization_token`.

## Pas 4 — Deploy pe Railway

1. Urcă folderul într-un repo GitHub (sau direct prin Railway CLI).
2. Railway → New Project → Deploy from GitHub repo.
3. Railway → **Variables** → adaugă tot ce e în `.env.example` (cu valorile tale reale).
4. Start command e deja `npm start` (din `package.json`). Railway îl ia automat.
5. După deploy, scrie botului `/raport`. Dacă răspunde cu brief-ul → merge.

Health check: `GET /` întoarce statusul surselor (ce e configurat).

---

## Calendar (opțional, Faza 1)

Google cere OAuth. Cel mai simplu mod de a obține un `refresh_token`:

1. Google Cloud Console → proiect nou → activează **Google Calendar API**.
2. OAuth consent screen (tip „External", te adaugi ca test user) →
   Credentials → OAuth client ID (tip „Desktop").
3. Obține `client_id` + `client_secret`.
4. Generează un `refresh_token` cu scope `https://www.googleapis.com/auth/calendar.readonly`
   (cel mai rapid: OAuth 2.0 Playground → setează propriul client → autorizează → exchange).
5. Pune cele 3 valori în `.env`. Gata, raportul include calendarul.

Dacă nu vrei să te chinui acum, lasă-le goale — le aprindem la Faza 2.

---

## Local (test rapid)

```bash
cp .env.example .env   # completează valorile
npm install
npm start
```

## Structură

```
src/
  index.js              server health + pornire bot
  config.js             env + validare
  claude.js             apel Claude (simplu + cu MCP)
  telegram.js           bot, comenzi, chat
  morning.js            orchestrează raportul
  scheduler.js          cron 9/17 — SCHELET Faza 3 (dezactivat)
  sources/
    weather.js          Open-Meteo
    operational.js      task-uri via MCP
    calendar.js         Google Calendar (opțional)
```

## Următorul pas (Faza 2)

Memorie persistentă (Postgres + pgvector) + reminder email important.
Atunci botul începe să „țină minte" și chat-ul devine contextual.
