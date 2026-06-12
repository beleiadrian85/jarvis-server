import { config, hasGoogle } from "./config.js";

/**
 * Un singur OAuth Google (refresh token din env), trei scope-uri:
 * calendar.readonly, gmail.readonly + gmail.compose, drive.readonly.
 * Access token-ul se reimprospateaza si se tine in cache pana aproape de expirare.
 */

let cached = { token: null, exp: 0 };

export async function googleToken() {
  if (!hasGoogle) throw new Error("Google neconfigurat.");
  if (cached.token && Date.now() < cached.exp - 60_000) return cached.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      refresh_token: config.google.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}`);
  const d = await res.json();
  cached = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return cached.token;
}

export async function gapi(url, options = {}) {
  const token = await googleToken();
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Google API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
