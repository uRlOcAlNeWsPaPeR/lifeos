import { route, ok } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { getAI, buildContext } from "@/lib/ai";

// Dashboard "AI Priority" panel. Free for all tiers (it's the core loop).
export const POST = route(async (req) => {
  const uid = await requireUid(req);
  const ctx = await buildContext(uid);
  const result = await getAI().prioritize(ctx);
  return ok(result);
});
