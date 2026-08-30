import { route, ok } from "@/lib/api";
import { requireUid, adminAuth } from "@/lib/firebase/admin";
import { canvasConfigured, canvasEnv, canvasPersonalToken } from "@/lib/canvas/env";
import { getConnection } from "@/lib/canvas/connection";
import { schoolNameFromHost } from "@/lib/canvas/url";
import type { CanvasStatusDTO } from "@/lib/canvas/types";

// The safe, non-sensitive connection view for the browser. No tokens, no
// `lastError` — just enough to render the Settings / School UI.
export const GET = route(async (req) => {
  const uid = await requireUid(req);
  const conn = canvasConfigured ? await getConnection(uid) : null;
  const email = canvasPersonalToken.enabled
    ? ((await adminAuth().getUser(uid).catch(() => null))?.email ?? null)
    : null;

  const dto: CanvasStatusDTO = {
    configured: canvasConfigured,
    connected: Boolean(conn),
    school: conn ? schoolNameFromHost(hostOf(conn.instanceUrl)) : null,
    canvasUserName: conn?.canvasUserName ?? null,
    status: conn?.status ?? null,
    lastSyncedAt: conn?.lastSyncedAt ?? null,
    defaultInstanceUrl: canvasEnv.defaultInstanceUrl || null,
    lockedInstanceUrl:
      canvasEnv.allowedInstanceHosts.length === 1
        ? `https://${canvasEnv.allowedInstanceHosts[0]}`
        : null,
    personalTokenMode: !canvasEnv.mock && canvasPersonalToken.allows(email),
    authMode: conn?.authMode ?? null,
    message:
      conn?.status === "reauth_required"
        ? "Your Canvas authorization expired. Reconnect to keep syncing."
        : conn?.status === "error"
          ? "Canvas couldn't sync last time. We'll try again."
          : null,
  };
  return ok(dto);
});

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
