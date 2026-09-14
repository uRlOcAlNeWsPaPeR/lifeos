import { NextResponse } from "next/server";
import { verifyState } from "@/lib/google/state";
import { exchangeCode } from "@/lib/google/oauth";
import { saveNewConnection } from "@/lib/google/connection";

// Step 2/3 of OAuth. Google redirects the user's browser here (top-level, no
// auth header) with ?code & ?state, or ?error on denial. Identity comes from
// the HMAC-signed state. We exchange the code server-side, store the encrypted
// tokens, then either message the opener (popup) or redirect.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = url.searchParams;
  const error = params.get("error");
  const code = params.get("code");
  const rawState = params.get("state") ?? "";

  if (error) {
    return respond(req, { ok: false, reason: error === "access_denied" ? "denied" : "error" });
  }

  let state;
  try {
    state = verifyState(rawState);
  } catch (e) {
    console.error("[google] callback: bad state", (e as Error).message);
    return respond(req, { ok: false, reason: "bad_state" });
  }

  if (!code) {
    return respond(req, { ok: false, reason: "no_code" });
  }

  try {
    const token = await exchangeCode(code);
    if (!token?.access_token) throw new Error("Google returned no access token.");
    await saveNewConnection({ uid: state.uid, token });
  } catch (e) {
    console.error("[google] callback: code exchange failed", (e as Error).message);
    return respond(req, { ok: false, reason: "exchange_failed" });
  }

  return respond(req, { ok: true, reason: null });
}

interface Result {
  ok: boolean;
  reason: string | null;
}

/**
 * Return an HTML page that notifies window.opener and self-closes (popup flow).
 * If there's no opener, redirect back into Settings with a query flag.
 */
function respond(req: Request, result: Result): NextResponse {
  const appOrigin = new URL(req.url).origin;
  const flag = result.ok ? "connected" : (result.reason ?? "error");
  const redirectUrl = `${appOrigin}/settings?tab=connections&google=${encodeURIComponent(flag)}`;

  const payload = JSON.stringify({ type: "lifeos:google-oauth", ...result });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Google Calendar</title></head>
<body style="font-family:system-ui;background:#0a0a0a;color:#e5e5e5;display:grid;place-items:center;height:100vh;margin:0">
<p>${result.ok ? "Google Calendar connected. You can close this window." : "Returning to LifeOS…"}</p>
<script>
  (function () {
    var msg = ${payload};
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(msg, ${JSON.stringify(appOrigin)});
        window.close();
        return;
      }
    } catch (e) {}
    window.location.replace(${JSON.stringify(redirectUrl)});
  })();
</script>
</body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
