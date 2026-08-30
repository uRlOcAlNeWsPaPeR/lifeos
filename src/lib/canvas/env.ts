// Centralised access to the Canvas integration's environment configuration.
// Everything here is SERVER-ONLY in effect — the client never imports this file.
// The OAuth client secret and token-encryption secret must never reach the browser.

function clean(v: string | undefined): string {
  return (v ?? "").trim();
}

export const canvasEnv = {
  clientId: clean(process.env.CANVAS_CLIENT_ID),
  clientSecret: clean(process.env.CANVAS_CLIENT_SECRET),
  /** Must EXACTLY match the redirect URI registered on the Canvas developer key. */
  redirectUri: clean(process.env.CANVAS_REDIRECT_URI),
  /** Optional hint pre-filled in the "connect" UI (e.g. "https://canvas.instructure.com"). */
  defaultInstanceUrl: clean(process.env.CANVAS_DEFAULT_INSTANCE_URL),
  /** Secret used to AES-256-GCM encrypt stored access / refresh tokens. */
  tokenSecret: clean(process.env.CANVAS_TOKEN_SECRET),
  /** Secret used to HMAC-sign the short-lived OAuth `state` value. */
  stateSecret: clean(process.env.CANVAS_STATE_SECRET),
  /**
   * Optional comma-separated allowlist of permitted Canvas hostnames. Empty = allow
   * any host that looks like a Canvas domain (see `normalizeCanvasUrl`).
   * Example: "canvas.university.edu,school.instructure.com"
   */
  allowedInstanceHosts: clean(process.env.CANVAS_ALLOWED_INSTANCE_HOSTS)
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
  /** When "1"/"true", the Canvas client returns canned fixtures instead of calling Canvas. */
  mock: /^(1|true|yes)$/i.test(clean(process.env.CANVAS_MOCK)),
};

/**
 * DEV ONLY — personal-access-token connect mode. Canvas' API Policy forbids
 * pasted tokens for multi-user apps, so this is scoped tight:
 *   CANVAS_ALLOW_PERSONAL_TOKEN="1"                     → any signed-in user (local dev)
 *   CANVAS_ALLOW_PERSONAL_TOKEN="you@school.edu,..."    → only these LifeOS account emails
 * Empty → OAuth only.
 */
const rawPersonalToken = clean(process.env.CANVAS_ALLOW_PERSONAL_TOKEN);
const personalTokenAllowAll = /^(1|true|yes)$/i.test(rawPersonalToken);
const personalTokenEmails = rawPersonalToken.includes("@")
  ? rawPersonalToken.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  : [];

export const canvasPersonalToken = {
  /** Is the paste-token path enabled at all on this deployment? */
  enabled: personalTokenAllowAll || personalTokenEmails.length > 0,
  allowAll: personalTokenAllowAll,
  emails: personalTokenEmails,
  /** May this specific LifeOS account use the paste-token path? */
  allows(email: string | null | undefined): boolean {
    if (personalTokenAllowAll) return true;
    return !!email && personalTokenEmails.includes(email.trim().toLowerCase());
  },
};

/**
 * True when enough is configured for the OAuth flow to run. In mock mode we only
 * need the crypto/state secrets (the client id/secret/redirect are faked).
 */
export const canvasConfigured =
  canvasEnv.mock || canvasPersonalToken.enabled
    ? Boolean(canvasEnv.tokenSecret)
    : Boolean(
        canvasEnv.clientId &&
          canvasEnv.clientSecret &&
          canvasEnv.redirectUri &&
          canvasEnv.tokenSecret &&
          canvasEnv.stateSecret,
      );

/** Throw a 500-ish error if a server route is hit without Canvas configured. */
export function assertCanvasConfigured(): void {
  if (!canvasConfigured) {
    const err = new Error("Canvas integration is not configured on this deployment.");
    (err as { status?: number }).status = 503;
    throw err;
  }
}
