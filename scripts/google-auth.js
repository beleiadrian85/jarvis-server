/**
 * Obtine GOOGLE_REFRESH_TOKEN pentru JARVIS (rulezi LOCAL, o singura data):
 *
 *   node scripts/google-auth.js <CLIENT_ID> <CLIENT_SECRET>
 *
 * Deschide linkul afisat, aprobi accesul, iar scriptul prinde redirectul
 * pe http://localhost:8765 si iti afiseaza refresh token-ul.
 */
import http from "node:http";

const [clientId, clientSecret] = process.argv.slice(2);
if (!clientId || !clientSecret) {
  console.error("Foloseste: node scripts/google-auth.js <CLIENT_ID> <CLIENT_SECRET>");
  process.exit(1);
}

const REDIRECT = "http://localhost:8765";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
  });

console.log("\n1) Deschide in browser:\n\n" + authUrl + "\n\n2) Aproba accesul. Astept redirectul...\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  const code = url.searchParams.get("code");
  if (!code) {
    res.end("Lipseste codul.");
    return;
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
    }),
  });
  const d = await tokenRes.json();
  if (d.refresh_token) {
    console.log("\n✅ GOOGLE_REFRESH_TOKEN:\n\n" + d.refresh_token + "\n\nSeteaza-l in Railway impreuna cu GOOGLE_CLIENT_ID si GOOGLE_CLIENT_SECRET.");
    res.end("Gata! Refresh token-ul e in terminal. Poti inchide fereastra.");
  } else {
    console.error("\n❌ Nu am primit refresh token:", JSON.stringify(d, null, 2));
    res.end("Eroare — vezi terminalul.");
  }
  server.close();
});
server.listen(8765);
