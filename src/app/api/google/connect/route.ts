import { route, ok, ApiError } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { getUserPlan } from "@/lib/ai";
import { limitsFor } from "@/lib/plan-limits";
import { assertGoogleConfigured } from "@/lib/google/env";
import { signState } from "@/lib/google/state";
import { buildAuthorizeUrl } from "@/lib/google/oauth";

// Step 1 of the OAuth flow. The browser (a popup) calls this; we hand back the
// URL to send the user to on Google. The client secret never appears here —
// only the public client id, in the authorize URL.
export const POST = route(async (req) => {
  const uid = await requireUid(req);
  assertGoogleConfigured();

  const plan = await getUserPlan(uid);
  if (!limitsFor(plan).googleCalendarEnabled) {
    throw new ApiError(402, "Google Calendar is a Student+ feature.");
  }

  const state = signState({ uid });
  const authorizeUrl = buildAuthorizeUrl(state);
  return ok({ authorizeUrl });
});
