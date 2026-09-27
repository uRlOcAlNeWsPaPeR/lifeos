import { adminConfigured, adminDb } from "@/lib/firebase/admin";
import {
  COLLEGE_BOARD_DATES_URL,
  FALLBACK_DATES,
  looksComplete,
  parseCollegeBoardDates,
  type OfficialDates,
} from "./official-dates";

/** How long a read of College Board's page is trusted before the next request refreshes it. */
const FRESH_MS = 12 * 60 * 60 * 1000;

export interface OfficialDatesResult extends OfficialDates {
  /** ISO time the dates were last read from College Board (null = built-in fallback). */
  updatedAt: string | null;
  source: "collegeboard" | "cache" | "fallback";
}

const docRef = () => adminDb().collection("config").doc("satDates");

/** Fetch and parse College Board's page. Throws if it can't be read or looks wrong. */
async function readCollegeBoard(): Promise<OfficialDates> {
  const res = await fetch(COLLEGE_BOARD_DATES_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LifeOS date sync)" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`College Board responded ${res.status}`);
  const parsed = parseCollegeBoardDates(await res.text());
  if (!looksComplete(parsed)) throw new Error("College Board's page changed shape — kept the last good dates");
  return parsed;
}

/**
 * The current official dates. Serves the cached copy while it's fresh, and
 * otherwise re-reads College Board — so the site follows their changes without
 * anyone editing code. If College Board can't be reached or the page no longer
 * parses, the last good copy keeps being served (and the built-in fallback
 * only if there has never been one).
 */
export async function getOfficialDates(opts: { force?: boolean } = {}): Promise<OfficialDatesResult> {
  let cached: (OfficialDates & { updatedAt: string }) | null = null;
  if (adminConfigured) {
    try {
      const snap = await docRef().get();
      if (snap.exists) cached = snap.data() as OfficialDates & { updatedAt: string };
    } catch {
      /* fall through to a live read */
    }
  }

  const age = cached ? Date.now() - new Date(cached.updatedAt).getTime() : Infinity;
  if (cached && !opts.force && age < FRESH_MS) {
    return { sat: cached.sat, psat: cached.psat, updatedAt: cached.updatedAt, source: "cache" };
  }

  try {
    const fresh = await readCollegeBoard();
    const updatedAt = new Date().toISOString();
    if (adminConfigured) {
      await docRef()
        .set({ ...fresh, updatedAt })
        .catch((e) => console.error("[sat-dates] couldn't cache", e));
    }
    return { ...fresh, updatedAt, source: "collegeboard" };
  } catch (err) {
    console.error("[sat-dates] refresh failed:", err instanceof Error ? err.message : err);
    if (cached) return { sat: cached.sat, psat: cached.psat, updatedAt: cached.updatedAt, source: "cache" };
    return { ...FALLBACK_DATES, updatedAt: null, source: "fallback" };
  }
}
