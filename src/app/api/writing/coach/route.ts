import { z } from "zod";
import { route, ok, readJson } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { getAI, assertAndCountAiUsage } from "@/lib/ai";

const coachSchema = z.object({
  essay: z.string().min(40, "Paste at least a paragraph").max(24_000),
});

export const POST = route(async (req) => {
  const uid = await requireUid(req);
  const { essay } = coachSchema.parse(await readJson(req));

  await assertAndCountAiUsage(uid, "essayCoach");

  const result = await getAI().essayCoach(essay);
  return ok(result);
});
