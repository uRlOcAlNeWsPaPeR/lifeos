// Dates for the Brain. A memory's day is a local calendar day, so it's parsed
// as local noon — parsing "2016-03-05" as UTC midnight shows it a day early
// west of Greenwich (the same trap `toInputDate` once fell into).

const DAY = 86_400_000;

export function parseDay(day: string | null | undefined): number | null {
  if (!day) return null;
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime();
    return Number.isFinite(t) ? t : null;
  }
  const t = Date.parse(day);
  return Number.isFinite(t) ? t : null;
}

export function dayKey(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "today", "3 weeks ago", "2 years ago" — the nearest honest unit. */
export function ageLabel(at: number | null, now: number): string {
  if (at == null) return "Undated";
  const days = Math.floor((now - at) / DAY);
  if (days < 0) return "Upcoming";
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30.44)} months ago`;
  const years = Math.floor(days / 365.25);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (m: number) => MONTHS[m];

export function fullDate(at: number | null): string {
  if (at == null) return "No date";
  const d = new Date(at);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export interface TimeRange {
  start: number;
  end: number;
  /** Shown to the student so they can see what was understood. */
  label: string;
}

const addMonths = (ms: number, n: number) => {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + n);
  return d.getTime();
};

/**
 * Pull a time hint out of a recall query: "multiplication 10 years ago",
 * "fractions last year", "essay in 2019". Returns the range it means and the
 * words left over for keyword search. Nothing recognised → range null and the
 * query untouched, so ordinary searches are never reinterpreted.
 */
export function parseTimeHint(query: string, now: number): { range: TimeRange | null; rest: string } {
  let q = query.trim();
  if (!q) return { range: null, rest: "" };
  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = q.match(re);
    if (m) q = (q.slice(0, m.index) + " " + q.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, " ").trim();
    return m;
  };

  const ago = take(/\b(\d{1,3})\s*(year|yr|month|mo|week|wk|day)s?\s*(?:ago|back)\b/i);
  if (ago) {
    const n = Number(ago[1]);
    const unit = ago[2].toLowerCase();
    if (unit.startsWith("y")) {
      // "10 years ago" means roughly then, not that exact day: ±1 year window.
      return { range: { start: addMonths(now, -12 * (n + 1)), end: addMonths(now, -12 * Math.max(0, n - 1)), label: `around ${n} year${n === 1 ? "" : "s"} ago` }, rest: q };
    }
    if (unit.startsWith("mo")) {
      return { range: { start: addMonths(now, -(n + 1)), end: addMonths(now, -Math.max(0, n - 1)), label: `around ${n} month${n === 1 ? "" : "s"} ago` }, rest: q };
    }
    const span = unit.startsWith("w") ? 7 : 1;
    return { range: { start: now - (n + 1) * span * DAY, end: now - Math.max(0, n - 1) * span * DAY, label: `around ${n} ${unit.startsWith("w") ? "week" : "day"}${n === 1 ? "" : "s"} ago` }, rest: q };
  }

  if (take(/\byesterday\b/i)) {
    const d = new Date(now);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime();
    return { range: { start, end: start + DAY, label: "yesterday" }, rest: q };
  }
  if (take(/\blast\s+week\b/i)) return { range: { start: now - 14 * DAY, end: now - 7 * DAY, label: "last week" }, rest: q };
  if (take(/\bthis\s+week\b/i)) return { range: { start: now - 7 * DAY, end: now + DAY, label: "this week" }, rest: q };
  if (take(/\blast\s+month\b/i)) return { range: { start: addMonths(now, -2), end: addMonths(now, -1), label: "last month" }, rest: q };
  if (take(/\bthis\s+month\b/i)) return { range: { start: addMonths(now, -1), end: now + DAY, label: "this month" }, rest: q };
  const thisYear = new Date(now).getFullYear();
  if (take(/\blast\s+year\b/i)) {
    return { range: { start: new Date(thisYear - 1, 0, 1).getTime(), end: new Date(thisYear, 0, 1).getTime(), label: String(thisYear - 1) }, rest: q };
  }
  if (take(/\bthis\s+year\b/i)) {
    return { range: { start: new Date(thisYear, 0, 1).getTime(), end: now + DAY, label: String(thisYear) }, rest: q };
  }
  const yr = take(/\b(?:in\s+)?((?:19|20)\d{2})\b/i);
  if (yr) {
    const y = Number(yr[1]);
    return { range: { start: new Date(y, 0, 1).getTime(), end: new Date(y + 1, 0, 1).getTime(), label: String(y) }, rest: q };
  }
  return { range: null, rest: query.trim() };
}

export const DAY_MS = DAY;
