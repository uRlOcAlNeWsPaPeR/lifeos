// Centralised access to the Google Calendar integration's environment
// configuration. Everything here is SERVER-ONLY in effect — the client never
// imports this file. The OAuth client secret and token-encryption secret must
// never reach the browser.

function clean(v: string | undefined): string {
  return (v ?? "").trim();
}

export const googleEnv = {
  clientId: clean(process.env.GOOGLE_CLIENT_ID),
  clientSecret: clean(process.env.GOOGLE_CLIENT_SECRET),
  /** Must EXACTLY match a redirect URI registered on the Google OAuth client. */
  redirectUri: clean(process.env.GOOGLE_REDIRECT_URI),
  /** Secret used to AES-256-GCM encrypt stored access / refresh tokens. */
  tokenSecret: clean(process.env.GOOGLE_TOKEN_SECRET),
  /** Secret used to HMAC-sign the short-lived OAuth `state` value. */
  stateSecret: clean(process.env.GOOGLE_STATE_SECRET),
};

/** True when enough is configured for the OAuth flow to run. */
export const googleConfigured = Boolean(
  googleEnv.clientId && googleEnv.clientSecret && googleEnv.redirectUri &&
    googleEnv.tokenSecret && googleEnv.stateSecret,
);

/** Throw a 500-ish error if a server route is hit without Google configured. */
export function assertGoogleConfigured(): void {
  if (!googleConfigured) {
    const err = new Error("Google Calendar integration is not configured on this deployment.");
    (err as { status?: number }).status = 503;
    throw err;
  }
}
