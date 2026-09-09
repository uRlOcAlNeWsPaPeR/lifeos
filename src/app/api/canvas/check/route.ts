import { route, ok } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { canvasConfigured } from "@/lib/canvas/env";
import { getConnection } from "@/lib/canvas/connection";
import { CanvasClient } from "@/lib/canvas/client";

// Lightweight "has Canvas changed since our last sync?" probe. The client polls
// this while the app is open; when it returns hasUpdates, the UI nudges the user
// to hit Sync. Reads Canvas's activity stream — it never writes, and any failure
// is swallowed (a background poll must not disrupt the app).
export const GET = route(async (req) => {
  const uid = await requireUid(req);
  if (!canvasConfigured) return ok({ connected: false, hasUpdates: false });

  const conn = await getConnection(uid);
  if (!conn || conn.status !== "connected") {
    return ok({ connected: Boolean(conn), hasUpdates: false });
  }

  try {
    const items = await CanvasClient.from(conn).getActivityStream();
    const since = conn.lastSyncedAt ? Date.parse(conn.lastSyncedAt) : 0;

    const RELEVANT_MSG = new Set([
      "Due Date",
      "Grading",
      "Late Grading",
      "All Submissions",
      "Assignment Created",
      "Assignment Changed",
      "Assignment Due Date Changed",
      "Submission Graded",
      "Submissions Posted",
    ]);
    const newer = items.filter((i) => {
      const relevant =
        i.type === "Submission" ||
        i.type === "Assignment" ||
        (i.type === "Message" && !!i.notification_category && RELEVANT_MSG.has(i.notification_category));
      if (!relevant) return false;
      const t = Date.parse(i.updated_at || i.created_at || "");
      return Number.isFinite(t) && t > since;
    });

    const newestAt = newer
      .map((i) => i.updated_at || i.created_at || "")
      .sort()
      .pop();

    return ok({
      connected: true,
      hasUpdates: newer.length > 0,
      count: newer.length,
      newestAt: newestAt ?? null,
    });
  } catch {
    // reauth / rate limit / Canvas down — stay quiet, the next sync will surface it
    return ok({ connected: true, hasUpdates: false });
  }
});
