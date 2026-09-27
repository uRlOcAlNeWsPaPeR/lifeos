import { route, ok } from "@/lib/api";
import { getOfficialDates } from "@/lib/sat/official-dates-server";

export const dynamic = "force-dynamic";

/**
 * College Board's current SAT and PSAT/NMSQT dates. Public information, so no
 * sign-in; the server re-reads College Board's page whenever its copy is over
 * half a day old.
 */
export const GET = route(async () => {
  const dates = await getOfficialDates();
  return ok(dates, { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } });
});
