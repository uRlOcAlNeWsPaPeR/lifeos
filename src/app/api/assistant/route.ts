import { route, ok, readJson } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { assistantSchema } from "@/lib/validation";
import { getAIFor, buildContext, assertAndCountAiUsage } from "@/lib/ai";
import { sanitizeActions } from "@/lib/ai/actions";
import type { AssistantMessage } from "@/lib/ai/types";

export const POST = route(async (req) => {
  const uid = await requireUid(req);
  const body = assistantSchema.parse(await readJson(req));

  const plan = await assertAndCountAiUsage(uid, "assistant");

  const ctx = await buildContext(uid);
  const messages: AssistantMessage[] =
    body.messages ?? [{ role: "user", content: body.question! }];

  const result = await getAIFor(plan).assist(messages, ctx);

  // Defence in depth: re-check every proposed action against the freshly built
  // context before it reaches the browser (ids must be the student's own).
  return ok({ ...result, actions: sanitizeActions(result.actions, ctx) });
});
