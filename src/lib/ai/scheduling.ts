// Turns a weekly schedule + workload into concrete free-time slot suggestions.
import type { LifeOSContext } from "./types";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface FreeSlot {
  dayIndex: number;
  dayName: string;
  label: string; // e.g. "Tonight", "Tomorrow evening", "Thursday afternoon"
  start: Date;
  end: Date;
  minutes: number;
}

function parseHM(hm: string): [number, number] {
  const m = hm.trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return [16, 0];
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return [h, min];
}

/**
 * Produce candidate study windows for the next `days` days.
 * A day's window is the gap between the end of the user's classes/activities
 * and a sensible cutoff (default 22:00). Weekends get an afternoon block too.
 */
export function freeSlots(ctx: LifeOSContext, days = 7): FreeSlot[] {
  const slots: FreeSlot[] = [];
  const now = ctx.now;

  for (let offset = 0; offset < days; offset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const di = day.getDay();

    // latest end time among schedule blocks + extracurriculars for this weekday
    const blocks = ctx.profile.schedule.filter(
      (b) => b.day?.toLowerCase() === DAY_NAMES[di].toLowerCase(),
    );
    let endHour = 15;
    let endMin = 30;
    for (const b of blocks) {
      const [h, m] = parseHM(b.end);
      if (h + m / 60 > endHour + endMin / 60) {
        endHour = h;
        endMin = m;
      }
    }
    // events already on the calendar that day push the start later
    for (const ev of ctx.events) {
      if (sameDay(ev.endAt, day) && ev.endAt.getHours() >= endHour) {
        endHour = ev.endAt.getHours();
        endMin = ev.endAt.getMinutes();
      }
    }

    const start = new Date(day);
    start.setHours(endHour, endMin, 0, 0);
    // don't propose slots in the past
    if (offset === 0 && start < now) start.setTime(Math.ceil(now.getTime() / (30 * 60000)) * 30 * 60000);

    const end = new Date(day);
    end.setHours(22, 0, 0, 0);

    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    if (minutes >= 45) {
      slots.push({
        dayIndex: di,
        dayName: DAY_NAMES[di],
        label: humanLabel(offset, di, start.getHours() < 17 ? "afternoon" : "evening"),
        start,
        end,
        minutes,
      });
    }

    // weekend afternoon block
    if ((di === 0 || di === 6) && !(offset === 0 && now.getHours() >= 15)) {
      const aStart = new Date(day);
      aStart.setHours(13, 0, 0, 0);
      const aEnd = new Date(day);
      aEnd.setHours(16, 0, 0, 0);
      if (!(offset === 0 && aStart < now)) {
        slots.push({
          dayIndex: di,
          dayName: DAY_NAMES[di],
          label: humanLabel(offset, di, "afternoon"),
          start: aStart,
          end: aEnd,
          minutes: 180,
        });
      }
    }
  }

  return slots;
}

function humanLabel(offset: number, dayIndex: number, part: "evening" | "afternoon") {
  if (offset === 0) return part === "evening" ? "Tonight" : "Later today";
  if (offset === 1) return `Tomorrow ${part}`;
  return `${DAY_NAMES[dayIndex]} ${part}`;
}

export function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function fmtSlot(slot: FreeSlot, minutesNeeded?: number) {
  const s = slot.start;
  const label = slot.label;
  const startStr = s.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (minutesNeeded) {
    const e = new Date(s.getTime() + minutesNeeded * 60000);
    const endStr = e.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `${label} ${startStr}–${endStr}`;
  }
  return `${label} (from ${startStr})`;
}
