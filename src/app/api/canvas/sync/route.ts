import { route, ok, ApiError } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { assertCanvasConfigured } from "@/lib/canvas/env";
import { getConnection } from "@/lib/canvas/connection";
import { syncCanvas } from "@/lib/canvas/sync";
import { CanvasReauthError } from "@/lib/canvas/client";

// Manual "Sync now" and the throttled auto-sync both hit this. Canvas being down
// must never take LifeOS down — failures return a clean error and the rest of the
// app keeps working off its own Firestore data.
export const POST = route(async (req) => {
  const uid = await requireUid(req);
  assertCanvasConfigured();

  const conn = await getConnection(uid);
  if (!conn) throw new ApiError(409, "Canvas is not connected.");

  try {
    const counts = await syncCanvas(uid);
    return ok({ ok: true, counts, lastSyncedAt: new Date().toISOString() });
  } catch (e) {
    if (e instanceof CanvasReauthError) {
      throw new ApiError(401, "Your Canvas authorization expired. Please reconnect.");
    }
    // Detail is already logged + stored server-side in syncCanvas.
    throw new ApiError(502, "Canvas couldn't sync right now. We'll try again later.");
  }
});
