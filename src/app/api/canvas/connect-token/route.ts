import { route, ok, readJson, ApiError } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { canvasTokenConnectSchema } from "@/lib/validation";
import { canvasEnv } from "@/lib/canvas/env";
import { personalTokenAllowedFor } from "@/lib/canvas/personal-token";
import { normalizeCanvasUrl } from "@/lib/canvas/url";
import { savePersonalTokenConnection } from "@/lib/canvas/connection";

// DEV ONLY. Connect Canvas with a pasted personal access token
// (Account → Settings → New Access Token). Gated by CANVAS_ALLOW_PERSONAL_TOKEN
// and restricted to allowlisted account emails. Canvas' API Policy forbids this
// for multi-user apps — OAuth is the shipping path.
export const POST = route(async (req) => {
  const uid = await requireUid(req);
  if (!(await personalTokenAllowedFor(uid))) {
    throw new ApiError(404, "Not available.");
  }

  const { instanceUrl, accessToken } = canvasTokenConnectSchema.parse(await readJson(req));
  const normalized = normalizeCanvasUrl(instanceUrl, canvasEnv.allowedInstanceHosts);
  if (!normalized.ok) {
    throw new ApiError(422, normalized.error ?? "That doesn't look like a Canvas address.");
  }

  // Verify the token works and learn who it belongs to.
  let user: { id: number | string; name?: string };
  try {
    const res = await fetch(`${normalized.url}/api/v1/users/self`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (res.status === 401) throw new ApiError(401, "Canvas rejected that access token.");
    if (!res.ok) throw new ApiError(502, `Canvas returned ${res.status}.`);
    user = await res.json();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(502, "Couldn't reach that Canvas instance.");
  }

  await savePersonalTokenConnection({
    uid,
    instanceUrl: normalized.url,
    accessToken,
    canvasUserId: user.id != null ? String(user.id) : "",
    canvasUserName: user.name ?? null,
  });

  return ok({ ok: true, school: normalized.host, canvasUserName: user.name ?? null });
});
