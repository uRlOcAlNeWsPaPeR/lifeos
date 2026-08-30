// Sleep-aware scheduling helpers. Pure, client-safe.
// LifeOS SUGGESTS — it never blocks. Every check returns guidance the user
// can accept or override.

import type { Prefs } from "@/lib/firebase/schema";

/** "HH:MM" → minutes since midnight. */
export function hm(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToHm(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function fmt12(t: string): string {
  const mins = hm(t);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${ap}` : `${h12} ${ap}`;
}

/** A Date for today at "HH:MM". */
export function todayAt(t: string, base = new Date()): Date {
  const d = new Date(base);
  d.setHours(hm(t) / 60, hm(t) % 60, 0, 0);
  return d;
}

/**
 * The bedtime boundary as a Date relative to `from`.
 * Handles past-midnight bedtimes (e.g. 00:30) by rolling to the next day.
 */
export function bedtimeOn(day: Date, prefs: Prefs): Date {
  const b = todayAt(prefs.bedtime, day);
  // if bedtime is in the small hours and "day" is already past noon, bedtime is tomorrow morning
  if (hm(prefs.bedtime) < hm("06:00") && day.getHours() >= 12) {
    b.setDate(b.getDate() + 1);
  }
  return b;
}

export interface BedtimeCheck {
  /** true when the work would run past bedtime */
  conflict: boolean;
  availableMin: number; // minutes between the start and bedtime
  neededMin: number;
  bedtime: Date;
  endsAt: Date;
  /** minutes the task would overrun bedtime by (0 when no conflict) */
  overrunMin: number;
}

/**
 * Would working on this task at `startAt` for `durationMin` push past bedtime?
 * When `respectSleep` is false the check still computes the numbers but
 * `conflict` is forced to false (the user opted out).
 */
export function checkBedtime(
  startAt: Date,
  durationMin: number,
  prefs: Prefs,
  respectSleep = true,
): BedtimeCheck {
  const bedtime = bedtimeOn(startAt, prefs);
  const endsAt = new Date(startAt.getTime() + durationMin * 60_000);
  const availableMin = Math.max(0, Math.round((bedtime.getTime() - startAt.getTime()) / 60_000));
  const overrunMin = Math.max(0, Math.round((endsAt.getTime() - bedtime.getTime()) / 60_000));
  return {
    conflict: respectSleep && overrunMin > 0,
    availableMin,
    neededMin: durationMin,
    bedtime,
    endsAt,
    overrunMin,
  };
}

/**
 * How much usable time is left tonight before bedtime, starting from `now`
 * (or the end of school, whichever is later).
 */
export function timeLeftTonight(prefs: Prefs, now = new Date()): number {
  const bedtime = bedtimeOn(now, prefs);
  const start = Math.max(now.getTime(), todayAt(prefs.schoolEnd, now).getTime());
  return Math.max(0, Math.round((bedtime.getTime() - start) / 60_000));
}

export function isStudyDay(prefs: Prefs, day = new Date()): boolean {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return prefs.studyDays.includes(names[day.getDay()]);
}

/** Split a long task into readable sub-sessions capped at `maxMin` each. */
export function splitSessions(totalMin: number, maxMin = 50): number[] {
  if (totalMin <= maxMin) return [totalMin];
  const n = Math.ceil(totalMin / maxMin);
  const per = Math.round(totalMin / n / 5) * 5;
  const out = Array(n - 1).fill(per);
  out.push(totalMin - per * (n - 1));
  return out;
}
