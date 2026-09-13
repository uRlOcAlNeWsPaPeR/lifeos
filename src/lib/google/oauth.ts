import "server-only";
import { googleEnv } from "./env";
import type { GoogleTokenResponse } from "./types";

// Google OAuth2 — https://developers.google.com/identity/protocols/oauth2/web-server
//   authorize: GET  https://accounts.google.com/o/oauth2/v2/auth
//   token:     POST https://oauth2.googleapis.com/token
//   revoke:    POST https://oauth2.googleapis.com/revoke
// The client secret is used only here, on the server.

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

// Read-only, and only the calendar — LifeOS never writes to Google Calendar and
// never asks for anything beyond it (no profile, no email, no other Google data).
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

/** Step 1 — the URL we send the user's browser to. */
export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: googleEnv.clientId,
    redirect_uri: googleEnv.redirectUri,
    response_type: "code",
    scope: SCOPE,
    state,
    // offline + consent: Google only hands back a refresh_token on a prompted
    // consent screen, not on a "silent" re-authorization — force it every time
    // so a re-connect after a revoked/expired token actually gets one.
    access_type: "offline",
    prompt: "consent",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** Step 3 — trade the authorization code for tokens. */
export async function exchangeCode(code: string): Promise<GoogleTokenResponse> {
  return tokenRequest({
    grant_type: "authorization_code",
    client_id: googleEnv.clientId,
    client_secret: googleEnv.clientSecret,
    redirect_uri: googleEnv.redirectUri,
    code,
  });
}

/** Refresh an expired access token. Google does not re-issue the refresh token. */
export async function refreshAccess(refreshToken: string): Promise<GoogleTokenResponse> {
  return tokenRequest({
    grant_type: "refresh_token",
    client_id: googleEnv.clientId,
    client_secret: googleEnv.clientSecret,
    refresh_token: refreshToken,
  });
}

/** Best-effort revocation on disconnect. Never throws. */
export async function revokeToken(token: string): Promise<void> {
  if (!token) return;
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch (e) {
    console.error("[google] token revoke failed (continuing):", e);
  }
}

/* ------------------------------------------------------------------ */

async function tokenRequest(body: Record<string, string>): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const detail =
      (json as { error_description?: string; error?: string })?.error_description ||
      (json as { error?: string })?.error ||
      `HTTP ${res.status}`;
    const err = new Error(`Google token request failed: ${detail}`);
    (err as { status?: number }).status = res.status === 400 || res.status === 401 ? 400 : 502;
    throw err;
  }
  return json as GoogleTokenResponse;
}
