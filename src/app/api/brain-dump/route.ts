import { route, ok, readJson } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { brainDumpSchema } from "@/lib/validation";
import { getAIFor, buildContext, assertAndCountAiUsage } from "@/lib/ai";

export const POST = route(async (req) => {
  const uid = await requireUid(req);
  const { text } = brainDumpSchema.parse(await readJson(req));

  const plan = await assertAndCountAiUsage(uid, "brainDump");

  const ctx = await buildContext(uid);
  const result = await getAIFor(plan).parseBrainDump(text, ctx);

  return ok({ items: result.items, summary: result.summary, engine: result.engine });
});
