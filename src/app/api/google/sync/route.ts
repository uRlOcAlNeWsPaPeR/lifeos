import { route, ok, ApiError } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { getUserPlan } from "@/lib/ai";
import { limitsFor } from "@/lib/plan-limits";
import { assertGoogleConfigured } from "@/lib/google/env";
import { getConnection } from "@/lib/google/connection";
import { syncGoogleCalendar } from "@/lib/google/sync";
import { GoogleReauthError } from "@/lib/google/client";

// Manual "Sync now" and the throttled auto-sync both hit this. Google being
// down must never take LifeOS down — failures return a clean error and the
// rest of the app keeps working off its own Firestore data.
export const POST = route(async (req) => {
  const uid = await requireUid(req);
  assertGoogleConfigured();

  const plan = await getUserPlan(uid);
  if (!limitsFor(plan).googleCalendarEnabled) {
    throw new ApiError(402, "Google Calendar is a Student+ feature.");
  }

  const conn = await getConnection(uid);
  if (!conn) throw new ApiError(409, "Google Calendar is not connected.");

  try {
    const counts = await syncGoogleCalendar(uid);
    return ok({ ok: true, counts, lastSyncedAt: new Date().toISOString() });
  } catch (e) {
    if (e instanceof GoogleReauthError) {
      throw new ApiError(401, "Your Google Calendar authorization expired. Please reconnect.");
    }
    throw new ApiError(502, "Google Calendar couldn't sync right now. We'll try again later.");
  }
});
