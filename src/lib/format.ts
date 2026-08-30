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
} | null {
  if (!due) return null;
  const d = parseDate(due);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86400000);

  if (days < 0) return { label: days === -1 ? "Yesterday" : `${Math.abs(days)}d overdue`, tone: "destructive" };
  if (days === 0) return { label: "Today", tone: "warning" };
  if (days === 1) return { label: "Tomorrow", tone: "primary" };
  if (days < 7) return { label: d.toLocaleDateString([], { weekday: "long" }), tone: "primary" };
  return { label: d.toLocaleDateString([], { month: "short", day: "numeric" }), tone: "muted" };
}

export function fmtDate(d: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return "";
  return parseDate(d).toLocaleDateString([], opts ?? { month: "short", day: "numeric" });
}

export function fmtTime(d: string | Date) {
  return new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
