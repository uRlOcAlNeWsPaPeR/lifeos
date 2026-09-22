import { route, ok, readJson, ApiError } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { brainDumpImageSchema } from "@/lib/validation";
import { getAIFor, buildContext, assertAndCountAiUsage, getUserPlan, limitsFor } from "@/lib/ai";

/**
 * Same output shape as /api/brain-dump, but the input is a screenshot (Canvas
 * page, planner app, syllabus, whiteboard photo) instead of typed text. Its
 * own tight daily quota, separate from the weekly Brain Dump text budget — a
 * vision call is the priciest request LifeOS makes.
 */
export const POST = route(async (req) => {
  const uid = await requireUid(req);
  const { image, mimeType } = brainDumpImageSchema.parse(await readJson(req));

  const plan = await getUserPlan(uid);
  if (!limitsFor(plan).screenshotImportEnabled) {
    throw new ApiError(402, "Screenshot import is a Student+ feature.");
  }

  await assertAndCountAiUsage(uid, "screenshotImport");

  const ctx = await buildContext(uid);
  const result = await getAIFor(plan).parseBrainDumpImage(image, mimeType, ctx);

  return ok({ items: result.items, summary: result.summary, engine: result.engine });
});
