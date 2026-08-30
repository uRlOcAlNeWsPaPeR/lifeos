import { route, ok, readJson } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { brainDumpSchema } from "@/lib/validation";
import { getAI, buildContext, assertAndCountAiUsage } from "@/lib/ai";

export const POST = route(async (req) => {
  const uid = await requireUid(req);
  const { text } = brainDumpSchema.parse(await readJson(req));

  await assertAndCountAiUsage(uid, "brainDump");

  const ctx = await buildContext(uid);
  const result = await getAI().parseBrainDump(text, ctx);

  return ok({ items: result.items, summary: result.summary, engine: result.engine });
});
