import { z } from "zod";
import { route, ok, readJson } from "@/lib/api";
import { requireUid } from "@/lib/firebase/admin";

const ORIGIN = (process.env.SCORECLIMB_ORIGIN || "https://singular-klepon-be59b4.netlify.app").replace(/\/$/, "");

const schema = z.object({
  rating: z.enum(["1", "2", "3", "4", "5"]).optional().nullable(),
  message: z.string().trim().min(1, "Write something first").max(1500),
});

/**
 * SAT Prep reviews go to the ScoreClimb team through the Netlify Forms endpoint
 * the standalone site already uses. Relayed server-side because Netlify only
 * accepts the form post on its own origin. Signed-in only, so this isn't an
 * open relay.
 */
export const POST = route(async (req) => {
  await requireUid(req);
  const { rating, message } = schema.parse(await readJson(req));

  const res = await fetch(`${ORIGIN}/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ "form-name": "feedback", rating: rating ?? "", message }).toString(),
  });
  if (!res.ok) {
    const err = new Error("Couldn't send your review right now — please try again later.");
    (err as { status?: number }).status = 502;
    throw err;
  }
  return ok({ sent: true });
});
