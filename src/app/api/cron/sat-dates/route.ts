import { route, ok, ApiError } from "@/lib/api";
import { getOfficialDates } from "@/lib/sat/official-dates-server";

export const dynamic = "force-dynamic";

/**
 * Scheduled by vercel.json: re-read College Board's dates daily so the
 * site is current even when nobody has opened SAT Prep. Vercel sends
 * `Authorization: Bearer $CRON_SECRET` when that variable is set; when it is,
 * anything else is refused. (Refreshing is harmless either way — it only reads a
 * public page — the check just keeps strangers from hammering it.)
 */
export const GET = route(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    throw new ApiError(401, "Not allowed");
  }
  const d = await getOfficialDates({ force: true });
  return ok({ source: d.source, updatedAt: d.updatedAt, sat: d.sat.length, psat: d.psat.length });
});
