// College Board's published SAT and PSAT/NMSQT dates, read off their
// "Test Dates and Deadlines" page. The page is the source of truth — dates and
// months move, so nothing here is hard-coded except the fallback used when the
// page can't be reached. Pure functions only; fetching and caching live in
// the API route.

export const COLLEGE_BOARD_DATES_URL = "https://satsuite.collegeboard.org/sat/dates-deadlines";

export interface SatDate {
  /** YYYY-MM-DD */
  date: string;
  registerBy?: string;
  /** Last day for late registration / changes. */
  lateBy?: string;
  /** College Board lists next year's dates as "anticipated" — they can still move. */
  anticipated?: boolean;
}

export interface PsatWindow {
  /** First and last day of the window schools pick their day from. YYYY-MM-DD */
  start: string;
  end: string;
  label: string;
}

export interface OfficialDates {
  sat: SatDate[];
  psat: PsatWindow[];
}

/** Last-resort values, from College Board's page as of September 2026. */
export const FALLBACK_DATES: OfficialDates = {
  sat: [
    { date: "2026-10-03", registerBy: "2026-09-18", lateBy: "2026-09-22" },
    { date: "2026-11-07", registerBy: "2026-10-23", lateBy: "2026-10-27" },
    { date: "2026-12-05", registerBy: "2026-11-20", lateBy: "2026-11-24" },
    { date: "2027-03-06", registerBy: "2027-02-19", lateBy: "2027-02-23" },
    { date: "2027-05-01", registerBy: "2027-04-16", lateBy: "2027-04-20" },
    { date: "2027-06-05", registerBy: "2027-05-21", lateBy: "2027-05-25" },
  ],
  psat: [{ start: "2026-10-01", end: "2026-10-30", label: "Fall 2026" }],
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** "Sept. 12, 2026" / "March 6, 2027" → "2026-09-12", or null when it isn't a whole date line. */
export function parseDateLine(line: string): string | null {
  const m = line.trim().match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})\*{0,3}$/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  const day = Number(m[2]);
  if (!month || day < 1 || day > 31) return null;
  return iso(Number(m[3]), month, day);
}

/** "October 1–30, 2026" or "March 1–April 30, 2027" → a start and end. */
export function parseRangeLine(line: string): { start: string; end: string } | null {
  const t = line.trim().replace(/[–—]/g, "-");
  const same = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*-\s*(\d{1,2}),?\s+(20\d{2})$/);
  if (same) {
    const mo = MONTHS[same[1].toLowerCase()];
    if (!mo) return null;
    return { start: iso(Number(same[4]), mo, Number(same[2])), end: iso(Number(same[4]), mo, Number(same[3])) };
  }
  const cross = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*-\s*([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})$/);
  if (cross) {
    const m1 = MONTHS[cross[1].toLowerCase()];
    const m2 = MONTHS[cross[3].toLowerCase()];
    if (!m1 || !m2) return null;
    const y = Number(cross[5]);
    return { start: iso(m1 > m2 ? y - 1 : y, m1, Number(cross[2])), end: iso(y, m2, Number(cross[4])) };
  }
  return null;
}

/** The page's visible text, one line per element — scripts and styles dropped. */
export function htmlToLines(html: string): string[] {
  const noCode = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "");
  const text = noCode
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#39;|&rsquo;/g, "'");
  return text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Pull the dates out of College Board's page text. Returns what it could find;
 * the caller decides whether that's enough to trust (see `looksComplete`).
 *
 *  • SAT Weekend table — rows of test date, registration deadline, and
 *    late-registration deadline, in that order.
 *  • "Anticipated" next-year dates — bare test dates, flagged as anticipated.
 *  • PSAT/NMSQT — a window of days ("October 1–30, 2026"), since schools
 *    choose their own day within it.
 */
export function parseCollegeBoardDates(html: string): OfficialDates {
  const lines = htmlToLines(html);
  const sat: SatDate[] = [];

  const head = lines.findIndex((l) => /^SAT Test Date\b/i.test(l));
  if (head !== -1) {
    // A "Register" button sits inside some rows, and footnote stars trail others.
    const cells = lines.slice(head + 1).filter((l) => !/^(Register|\*+)$/i.test(l));
    let i = 0;
    // Skip the column headings, then read dates three at a time.
    while (i < cells.length && parseDateLine(cells[i]) == null && i < 8) i++;
    while (i < cells.length) {
      const d = parseDateLine(cells[i]);
      if (!d) break;
      const r = parseDateLine(cells[i + 1] ?? "");
      const l = parseDateLine(cells[i + 2] ?? "");
      sat.push({ date: d, ...(r ? { registerBy: r } : {}), ...(l ? { lateBy: l } : {}) });
      i += r && l ? 3 : r ? 2 : 1;
    }
  }

  const anticipated = lines.findIndex((l) => /^Anticipated SAT Weekend/i.test(l));
  if (anticipated !== -1) {
    for (let i = anticipated + 1; i < lines.length && i - anticipated < 20; i++) {
      if (/^Important Dates/i.test(lines[i])) break;
      const d = parseDateLine(lines[i]);
      if (d) sat.push({ date: d, anticipated: true });
    }
  }

  const psat: PsatWindow[] = [];
  lines.forEach((l, i) => {
    // "For Fall 2026: SAT School Day, PSAT/NMSQT, and PSAT 8/9" then the window.
    const m = l.match(/^For (Fall|Spring|Winter) (20\d{2}):(.*)$/i);
    if (!m || !/PSAT\/NMSQT/i.test(m[3])) return;
    const range = parseRangeLine(lines[i + 1] ?? "");
    if (range) psat.push({ ...range, label: `${m[1]} ${m[2]}` });
  });

  const seen = new Set<string>();
  const uniq = sat
    .filter((s) => (seen.has(s.date) ? false : (seen.add(s.date), true)))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { sat: uniq, psat: psat.sort((a, b) => a.start.localeCompare(b.start)) };
}

/**
 * Whether a parse looks like the real page rather than a layout change that
 * left us with scraps. A bad parse must never replace good cached dates.
 */
export function looksComplete(d: OfficialDates): boolean {
  const confirmed = d.sat.filter((s) => !s.anticipated);
  return confirmed.length >= 3 && d.sat.every((s) => /^20\d{2}-\d{2}-\d{2}$/.test(s.date));
}

/** Dates still ahead of `today` (YYYY-MM-DD), earliest first. */
export function upcomingSat(d: OfficialDates, today: string): SatDate[] {
  return d.sat.filter((s) => s.date >= today);
}

export function upcomingPsat(d: OfficialDates, today: string): PsatWindow[] {
  return d.psat.filter((w) => w.end >= today);
}

/** Whether a student's saved SAT date is one College Board currently lists. */
export function isOfficialSat(d: OfficialDates, date: string): boolean {
  return d.sat.some((s) => s.date === date);
}

/** Whether a saved PSAT date falls inside any window College Board lists. */
export function isInPsatWindow(d: OfficialDates, date: string): boolean {
  return d.psat.some((w) => date >= w.start && date <= w.end);
}
