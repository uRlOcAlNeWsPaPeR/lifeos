import { route, ok, readJson } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { assistantSchema } from "@/lib/validation";
import { getAI, buildContext, assertAndCountAiUsage } from "@/lib/ai";

export const POST = route(async (req) => {
  const uid = await requireUid(req);
  const { question } = assistantSchema.parse(await readJson(req));

  await assertAndCountAiUsage(uid, "assistant");

  const ctx = await buildContext(uid);
  const result = await getAI().assist(question, ctx);
  return ok(result);
});
