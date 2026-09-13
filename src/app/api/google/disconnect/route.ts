import { route, ok, readJson } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { googleDisconnectSchema } from "@/lib/validation";
import { getConnection, deleteConnection } from "@/lib/google/connection";
import { purgeGoogleData } from "@/lib/google/sync";
import { revokeToken } from "@/lib/google/oauth";
import { decryptToken } from "@/lib/google/crypto";

// Disconnect Google Calendar. Revokes the token at Google (best-effort), removes
// the stored connection + tokens, and — explicitly, per the student's choice —
// either keeps the imported events or removes everything Google-sourced. Never
// silently deletes user data.
export const POST = route(async (req) => {
  const uid = await requireUid(req);
  const { googleEvents } = googleDisconnectSchema.parse(await readJson(req));

  const conn = await getConnection(uid);
  if (!conn) return ok({ ok: true, alreadyDisconnected: true });

  if (conn.accessTokenEnc) {
    try {
      await revokeToken(decryptToken(conn.accessTokenEnc));
    } catch (e) {
      console.error("[google] disconnect: revoke failed (continuing):", (e as Error).message);
    }
  }

  if (googleEvents === "remove") await purgeGoogleData(uid);
  await deleteConnection(uid);

  return ok({ ok: true });
});
