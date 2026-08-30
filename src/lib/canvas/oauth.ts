import "server-only";
import { canvasEnv } from "./env";
import type { CanvasTokenResponse } from "./types";

// Canvas OAuth2 — https://canvas.instructure.com/doc/api/file.oauth.html
//   authorize:  GET  {instanceUrl}/login/oauth2/auth
//   token:      POST {instanceUrl}/login/oauth2/token
//   revoke:     DELETE {instanceUrl}/login/oauth2/token
// The client secret is used only here, on the server.

/** Step 1 — the URL we send the user's browser to on their Canvas instance. */
export function buildAuthorizeUrl(instanceUrl: string, state: string): string {
  // Mock mode: there is no real Canvas to visit — point the popup straight at our
  // own callback with a fake code so the rest of the flow runs unchanged.
  if (canvasEnv.mock) {
    const redirect = canvasEnv.redirectUri || `${appOrigin()}/api/canvas/callback`;
    return `${redirect}?code=mock-code&state=${encodeURIComponent(state)}`;
  }
  const params = new URLSearchParams({
    client_id: canvasEnv.clientId,
    response_type: "code",
    redirect_uri: canvasEnv.redirectUri,
    state,
  });
  return `${instanceUrl}/login/oauth2/auth?${params.toString()}`;
}

/** Step 3 — trade the authorization code for tokens. */
export async function exchangeCode(
  instanceUrl: string,
  code: string,
): Promise<CanvasTokenResponse> {
  if (canvasEnv.mock) return mockToken();
  return tokenRequest(instanceUrl, {
    grant_type: "authorization_code",
    client_id: canvasEnv.clientId,
    client_secret: canvasEnv.clientSecret,
    redirect_uri: canvasEnv.redirectUri,
    code,
  });
}

/** Refresh an expired access token. Canvas keeps the same refresh token. */
export async function refreshAccess(
  instanceUrl: string,
  refreshToken: string,
): Promise<CanvasTokenResponse> {
  if (canvasEnv.mock) return mockToken({ withRefresh: false });
  return tokenRequest(instanceUrl, {
    grant_type: "refresh_token",
    client_id: canvasEnv.clientId,
    client_secret: canvasEnv.clientSecret,
    refresh_token: refreshToken,
  });
}

/** Best-effort revocation on disconnect. Never throws. */
export async function revokeToken(instanceUrl: string, accessToken: string): Promise<void> {
  if (canvasEnv.mock || !accessToken) return;
  try {
    await fetch(`${instanceUrl}/login/oauth2/token`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (e) {
    console.error("[canvas] token revoke failed (continuing):", e);
  }
}

/* ------------------------------------------------------------------ */

async function tokenRequest(
  instanceUrl: string,
  body: Record<string, string>,
): Promise<CanvasTokenResponse> {
  const res = await fetch(`${instanceUrl}/login/oauth2/token`, {
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
    const err = new Error(`Canvas token request failed: ${detail}`);
    (err as { status?: number }).status = res.status === 400 || res.status === 401 ? 400 : 502;
    throw err;
  }
  return json as CanvasTokenResponse;
}

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.VERCEL_URL?.replace(/^/, "https://") ||
    "http://localhost:3000"
  );
}

let mockSeq = 0;
function mockToken(opts: { withRefresh?: boolean } = {}): CanvasTokenResponse {
  const withRefresh = opts.withRefresh ?? true;
  mockSeq += 1;
  return {
    access_token: `mock-access-${mockSeq}-${Date.now()}`,
    token_type: "Bearer",
    ...(withRefresh ? { refresh_token: `mock-refresh-${Date.now()}` } : {}),
    expires_in: 3600,
    scope: "",
    user: { id: 900001, name: "Mock Student" },
  };
}
