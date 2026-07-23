# GMAIL / CALENDAR — PASUL FINAL DE AUTORIZARE (doar Adrian)

Tot ce se putea tehnic FARA Adrian e gata: flux OAuth, scopes, callback care isi
seteaza singur token-ul pe Railway + redeploy, si detectia automata a conexiunii
in Source Truth + Capability Manifest. Ramane exact un pas manual — al tau.

## Ce trebuie (exact)

| Element | Valoare |
|---|---|
| **Tip client OAuth** | Web application (Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID) |
| **Redirect URI** (exact) | `https://jarvis-server-production-a362.up.railway.app/auth/google/callback` |
| **Scopes ceruti** | `gmail.readonly` (citire email) · `gmail.compose` (DOAR draft, zero trimitere autonoma) · `calendar.events` (citire + scriere evenimente) · `drive.readonly` |
| **Cont Google** | contul firmei (proficoncept.sb@gmail.com sau contul unde sunt emailurile relevante) |

## Ce faci tu (o singura data, ~3 minute)
1. Google Cloud Console → creezi (sau folosesti) un proiect → **OAuth client ID: Web application**.
2. La **Authorized redirect URIs** adaugi exact URI-ul de mai sus.
3. Copiezi **Client ID** + **Client Secret** in wizardul din Command Center (`/ceo.html` → Google Connection), sau le pui direct ca env pe Railway (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
4. Apesi **CONNECT** → te duce la ecranul Google de consimtamant → aprobi cele 4 scopes.
5. Gata. Callback-ul face restul singur.

## Ce se intampla AUTOMAT dupa ce apesi Connect (fara tine)
- Callback `/auth/google/callback` primeste codul → `exchangeCode` → obtine `refresh_token`.
- Il scrie singur pe Railway (`GOOGLE_REFRESH_TOKEN`) prin Railway API + redeploy.
- La repornire: `sourceTruth` detecteaza `clientId + refreshToken` → **Gmail/Calendar trec pe CONNECTED**.
- Capability Manifest se actualizeaza (self-model aliniat cu realitatea).
- Read path testabil imediat (citire emailuri/evenimente).

## Garantii de siguranta (raman valabile)
- **Zero trimitere autonoma de email.** `gmail.compose` = doar DRAFT; orice outbound trece prin approvalGate (aprobi tu).
- Garda `ceo.wiring` interzice structural scrieri Gmail/Calendar in CEO core.
- Calendar `events` permite scriere de evenimente DOAR ca actiune aprobata, nu autonom.

## Status curent
`BLOCKED_EXTERNAL_AUTH` — nu e un blocaj tehnic, ci consimtamantul tau Google. Restul programului a continuat fara sa astepte acest pas.
