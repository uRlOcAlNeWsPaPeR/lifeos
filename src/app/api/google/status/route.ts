import { route, ok } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { getUserPlan } from "@/lib/ai";
import { limitsFor } from "@/lib/plan-limits";
import { googleConfigured } from "@/lib/google/env";
import { getConnection } from "@/lib/google/connection";
import type { GoogleStatusDTO } from "@/lib/google/types";

// The safe, non-sensitive connection view for the browser. No tokens, no
// `lastError` — just enough to render the Settings UI.
export const GET = route(async (req) => {
  const uid = await requireUid(req);
  const plan = await getUserPlan(uid);
  const enabled = limitsFor(plan).googleCalendarEnabled;
  const conn = googleConfigured ? await getConnection(uid) : null;

  const dto: GoogleStatusDTO = {
    configured: googleConfigured,
    enabled,
    connected: Boolean(conn),
    status: conn?.status ?? null,
    lastSyncedAt: conn?.lastSyncedAt ?? null,
    message:
      conn?.status === "reauth_required"
        ? "Your Google Calendar authorization expired. Reconnect to keep syncing."
        : conn?.status === "error"
          ? "Google Calendar couldn't sync last time. We'll try again."
          : null,
  };
  return ok(dto);
});
