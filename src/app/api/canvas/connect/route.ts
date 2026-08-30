import { route, ok, readJson, ApiError } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { canvasConnectSchema } from "@/lib/validation";
import { assertCanvasConfigured, canvasEnv } from "@/lib/canvas/env";
import { normalizeCanvasUrl } from "@/lib/canvas/url";
import { signState } from "@/lib/canvas/state";
import { buildAuthorizeUrl } from "@/lib/canvas/oauth";

// Step 1 of the OAuth flow. The browser (a popup, usually) calls this with the
// user's Canvas web address; we hand back the URL to send them to on Canvas.
// The client secret never appears here — only the public client id, in the
// authorize URL.
export const POST = route(async (req) => {
  const uid = await requireUid(req);
  assertCanvasConfigured();

  const { instanceUrl, origin } = canvasConnectSchema.parse(await readJson(req));
  const normalized = normalizeCanvasUrl(instanceUrl, canvasEnv.allowedInstanceHosts);
  if (!normalized.ok) {
    throw new ApiError(422, normalized.error ?? "That doesn't look like a Canvas address.");
  }

  const state = signState({ uid, instanceUrl: normalized.url, origin });
  const authorizeUrl = buildAuthorizeUrl(normalized.url, state);

  return ok({ authorizeUrl, school: normalized.host });
});
