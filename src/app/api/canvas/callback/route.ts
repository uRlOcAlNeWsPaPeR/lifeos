import { NextResponse } from "next/server";
import { verifyState } from "@/lib/canvas/state";
import { exchangeCode } from "@/lib/canvas/oauth";
import { saveNewConnection } from "@/lib/canvas/connection";

// Step 2/3 of OAuth. Canvas redirects the user's browser here (top-level, no auth
// header) with ?code & ?state, or ?error on denial. Identity + the chosen Canvas
// instance come from the HMAC-signed state. We exchange the code server-side, store
// the encrypted tokens, then either message the opener (popup) or redirect.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = url.searchParams;
  const error = params.get("error");
  const code = params.get("code");
  const rawState = params.get("state") ?? "";

  // Figure out where to send the user back to (best-effort, from the state).
  let origin: "settings" | "onboarding" | "school" = "settings";
  try {
    origin = verifyState(rawState).origin;
  } catch {
    /* handled below */
  }

  if (error) {
    return respond(req, {
      ok: false,
      reason: error === "access_denied" ? "denied" : "error",
      origin,
    });
  }

  let state;
  try {
    state = verifyState(rawState);
  } catch (e) {
    console.error("[canvas] callback: bad state", (e as Error).message);
    return respond(req, { ok: false, reason: "bad_state", origin });
  }

  if (!code) {
    return respond(req, { ok: false, reason: "no_code", origin: state.origin });
  }

  try {
    const token = await exchangeCode(state.instanceUrl, code);
    if (!token?.access_token) throw new Error("Canvas returned no access token.");
    await saveNewConnection({ uid: state.uid, instanceUrl: state.instanceUrl, token });
  } catch (e) {
    console.error("[canvas] callback: code exchange failed", (e as Error).message);
    return respond(req, { ok: false, reason: "exchange_failed", origin: state.origin });
  }

  return respond(req, { ok: true, reason: null, origin: state.origin });
}

interface Result {
  ok: boolean;
  reason: string | null;
  origin: "settings" | "onboarding" | "school";
}

/**
 * Return an HTML page that notifies window.opener and self-closes (popup flow).
 * If there's no opener, redirect back into the app with a query flag.
 */
function respond(req: Request, result: Result): NextResponse {
  const appOrigin = new URL(req.url).origin;
  const back =
    result.origin === "onboarding"
      ? "/onboarding"
      : result.origin === "school"
        ? "/school"
        : "/settings";
  const flag = result.ok ? "connected" : (result.reason ?? "error");
  const redirectUrl = `${appOrigin}${back}?canvas=${encodeURIComponent(flag)}`;

  const payload = JSON.stringify({ type: "lifeos:canvas-oauth", ...result });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Canvas</title></head>
<body style="font-family:system-ui;background:#0a0a0a;color:#e5e5e5;display:grid;place-items:center;height:100vh;margin:0">
<p>${result.ok ? "Canvas connected. You can close this window." : "Returning to LifeOS…"}</p>
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
