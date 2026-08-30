// Canvas instance URL parsing / validation. Isomorphic — safe on client and server.
// Different schools run Canvas on different domains, so the user tells us theirs.

export interface NormalizedCanvasUrl {
  ok: boolean;
  /** e.g. "https://canvas.school.edu" — protocol forced to https, no path, no trailing slash. */
  url: string;
  host: string;
  error?: string;
}

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

// Obvious non-Canvas hosts people might paste by mistake.
const BLOCKED_HOSTS = new Set([
  "google.com",
  "gmail.com",
  "canvas.com",
  "localhost",
  "example.com",
]);

/**
 * Accepts "canvas.school.edu", "https://canvas.school.edu/", "http://.../courses",
 * etc. Returns a canonical `https://<host>` origin or an error.
 *
 * @param allowedHosts optional allowlist (server passes `canvasEnv.allowedInstanceHosts`).
 *   Empty / omitted = allow any plausible Canvas domain.
 */
export function normalizeCanvasUrl(
  input: string,
  allowedHosts: string[] = [],
): NormalizedCanvasUrl {
  const raw = (input ?? "").trim().toLowerCase();
  if (!raw) return { ok: false, url: "", host: "", error: "Enter your Canvas web address." };

  let host = raw;
  // strip scheme
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  // strip everything from the first slash, query or hash
  host = host.split(/[/?#]/)[0];
  // strip credentials / port
  host = host.split("@").pop() ?? host;
  host = host.split(":")[0];
  host = host.replace(/\.$/, "");

  if (!host || !HOST_RE.test(host) || host.split(".").length < 2) {
    return {
      ok: false,
      url: "",
      host,
      error: "That doesn't look like a Canvas web address (e.g. canvas.yourschool.edu).",
    };
  }

  if (BLOCKED_HOSTS.has(host)) {
    return { ok: false, url: "", host, error: "That doesn't look like a Canvas address." };
  }

  if (allowedHosts.length > 0 && !allowedHosts.includes(host)) {
    return {
      ok: false,
      url: "",
      host,
      error: "That Canvas institution isn't enabled for LifeOS yet.",
    };
  }

  return { ok: true, url: `https://${host}`, host };
}

/** Best-effort "school name" from a Canvas host, for display. */
export function schoolNameFromHost(host: string): string {
  const parts = host.split(".");
  const core = parts[0] === "canvas" && parts.length > 2 ? parts[1] : parts[0];
  return core.charAt(0).toUpperCase() + core.slice(1);
}
