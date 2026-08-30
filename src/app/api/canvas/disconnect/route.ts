import { route, ok, readJson } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { canvasDisconnectSchema } from "@/lib/validation";
import { getConnection, deleteConnection } from "@/lib/canvas/connection";
import { purgeCanvasData } from "@/lib/canvas/sync";
import { revokeToken } from "@/lib/canvas/oauth";
import { decryptToken } from "@/lib/canvas/crypto";
import { canvasEnv } from "@/lib/canvas/env";

// Disconnect Canvas. Revokes the token at Canvas (best-effort), removes the stored
// connection + tokens, and — explicitly, per the user's choice — either keeps
// Canvas-imported tasks (unlinked) or removes all Canvas-sourced items. Never
// silently deletes user data.
export const POST = route(async (req) => {
  const uid = await requireUid(req);
  const { canvasTasks } = canvasDisconnectSchema.parse(await readJson(req));

  const conn = await getConnection(uid);
  if (!conn) return ok({ ok: true, alreadyDisconnected: true });

  if (!canvasEnv.mock && conn.accessTokenEnc) {
    try {
      await revokeToken(conn.instanceUrl, decryptToken(conn.accessTokenEnc));
    } catch (e) {
      console.error("[canvas] disconnect: revoke failed (continuing):", (e as Error).message);
    }
  }

  await purgeCanvasData(uid, { removeTasks: canvasTasks === "remove" });
  await deleteConnection(uid);

  return ok({ ok: true });
});
