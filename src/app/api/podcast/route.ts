import { route, ok, readJson } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";
import { generatePodcastSchema } from "@/lib/validation";
import { getAIFor, assertAndCountAiUsage } from "@/lib/ai";
import { estimateSeconds } from "@/lib/podcast/script";

/**
 * Notes in, a listenable episode out. Metered against the same Brain Dump
 * quota as card generation — all three are "a big block of the student's text
 * through the model", so they draw on one budget rather than opening another
 * uncapped path to the API.
 *
 * Only the script is returned. The audio itself is synthesised in the browser
 * at play time, so nothing is stored or streamed server-side.
 */
export const POST = route(async (req) => {
  const uid = await requireUid(req);
  const { notes, title, subject, format, targetMinutes } = generatePodcastSchema.parse(
    await readJson(req),
  );

  const plan = await assertAndCountAiUsage(uid, "brainDump");

  const { script, engine } = await getAIFor(plan).generatePodcast(notes, {
    title: title ?? null,
    subject: subject ?? null,
    format,
    targetMinutes,
  });

  return ok({
    title: script.title,
    summary: script.summary,
    segments: script.segments,
    estimatedSeconds: estimateSeconds(script.segments),
    engine,
  });
});
