// Client-safe formatting helpers.

/** Parse a value to a Date, treating a bare "YYYY-MM-DD" as LOCAL midnight
 *  (not UTC) so date-only values don't shift a day in western timezones. */
export function parseDate(d: string | Date): Date {
  if (d instanceof Date) return d;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return new Date(d);
}

export function relativeDue(due: string | Date | null | undefined): {
  label: string;
  tone: "muted" | "primary" | "warning" | "destructive";
  /** true once the due date is in the past — render the row less prominently. */
  past: boolean;
} | null {
  if (!due) return null;
  const d = parseDate(due);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86400000);

  // Past = still visible, just quieter. Upcoming = prominent.
  if (days < 0)
    return { label: days === -1 ? "Yesterday" : `${Math.abs(days)}d ago`, tone: "muted", past: true };
  if (days === 0) return { label: "Today", tone: "warning", past: false };
  if (days === 1) return { label: "Tomorrow", tone: "primary", past: false };
  if (days < 7) return { label: d.toLocaleDateString([], { weekday: "long" }), tone: "primary", past: false };
  return {
    label: d.toLocaleDateString([], { month: "short", day: "numeric" }),
    tone: "primary",
    past: false,
  };
}

export function fmtDate(d: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return "";
  return parseDate(d).toLocaleDateString([], opts ?? { month: "short", day: "numeric" });
}

export function fmtTime(d: string | Date) {
  return new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Does this stored value carry a clock time, or is it just a calendar day?
 *
 * Ask the string, not the parsed Date: a bare "2026-09-10" parsed with
 * `new Date()` becomes 8pm the previous evening in New York, so a
 * `getHours() !== 0` test reports a due *time* the student never set.
 */
export function hasTime(d: string | Date | null | undefined): boolean {
  if (!d) return false;
  if (d instanceof Date) return d.getHours() !== 0 || d.getMinutes() !== 0;
  return d.includes("T") || d.includes(" ");
}

export function fmtDuration(minutes: number | null | undefined) {
  if (!minutes) return "";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function toInputDate(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function toInputDateTime(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60000).toISOString().slice(0, 16);
}

/**
 * Best-effort "last name" from an instructor / teacher string.
 *   "Ms. York"       → "York"
 *   "Jane York"      → "York"
 *   "York, Jane"     → "York"
 *   "Dr. A. B. Chen" → "Chen"
 */
export function lastName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  // "Last, First" — the surname is what precedes the comma
  if (s.includes(",")) s = s.split(",")[0].trim();
  // drop common honorifics / titles
  s = s.replace(/\b(mrs?|ms|mx|mr|dr|prof|professor|sr|sra|mme|coach)\.?\s+/gi, "").trim();
  const parts = s.split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

/** Append " - Lastname" to a course name, unless it's already there. */
export function courseNameWithTeacher(
  name: string,
  instructor: string | null | undefined,
): string {
  const base = name.trim();
  const ln = lastName(instructor);
  if (!ln) return base;
  return base.toLowerCase().endsWith(`- ${ln.toLowerCase()}`) ? base : `${base} - ${ln}`;
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * A deadline this far past is treated as stale — hidden from workload / deadline /
 * overdue surfaces (dashboard, daily brief, calendar). The item still exists; it
 * just stops nagging. Turned-in work is hidden regardless of age.
 */
export const STALE_OVERDUE_DAYS = 20;

export function isStaleOverdue(
  dueAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!dueAt) return false;
  const d = parseDate(dueAt).getTime();
  if (Number.isNaN(d)) return false;
  return d < now.getTime() - STALE_OVERDUE_DAYS * 86_400_000;
}

/** "just now" / "3 min ago" / "2 hours ago" / "yesterday" / "Mar 4". */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const sec = Math.round((Date.now() - then) / 1000);
  if (sec < 45) return "just now";
  if (sec < 90) return "a minute ago";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day} days ago`;
  return fmtDate(iso, { month: "short", day: "numeric" });
}
