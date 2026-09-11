import { route, ok } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { getAIFor, buildContext, getUserPlan } from "@/lib/ai";

// Dashboard "AI Priority" panel. Uncapped on every tier (it's the core loop) —
// but Free is $0, so it still routes to the offline heuristic engine, never a
// paid API call. Only Student+ gets the real model here too.
export const POST = route(async (req) => {
  const uid = await requireUid(req);
  const plan = await getUserPlan(uid);
  const ctx = await buildContext(uid);
  const result = await getAIFor(plan).prioritize(ctx);
  return ok(result);
});
