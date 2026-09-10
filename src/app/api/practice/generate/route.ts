import { route, ok, readJson } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { generateCardsSchema } from "@/lib/validation";
import { getAI, assertAndCountAiUsage } from "@/lib/ai";

/**
 * Notes in, study cards out. Metered against the same Brain Dump quota — both
 * are "a big block of the student's text through the model", so they draw on
 * one budget rather than opening a second uncapped path to the API.
 */
export const POST = route(async (req) => {
  const uid = await requireUid(req);
  const { notes, title } = generateCardsSchema.parse(await readJson(req));

  await assertAndCountAiUsage(uid, "brainDump");

  const result = await getAI().generateCards(notes, title ?? null);

  return ok({ cards: result.cards, engine: result.engine });
});
