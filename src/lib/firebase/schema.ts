import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "./client";
import type { GradeScalePref } from "@/lib/grades";

/**
 * Firestore layout — everything scoped under the signed-in user so the
 * security rule is a one-liner (`request.auth.uid == uid`).
 *
 *   users/{uid}                     → ProfileDoc
 *   users/{uid}/tasks/{id}
 *   users/{uid}/goals/{id}
 *   users/{uid}/courses/{id}
 *   users/{uid}/assignments/{id}
 *   users/{uid}/events/{id}
 *   users/{uid}/brainDumps/{id}
 *   users/{uid}/decks/{id}          → a Practice study set (cards embedded)
 *
 * All dates are stored as ISO strings to match the DTOs used across the app.
 */

export const COLLECTIONS = ["tasks", "goals", "courses", "assignments", "events", "alarms", "decks", "podcasts"] as const;
export type CollectionName = (typeof COLLECTIONS)[number];
type AnyCol = CollectionName | "brainDumps" | "focusSessions";

export function userDoc(uid: string): DocumentReference {
  return doc(db(), "users", uid);
}

/**
 * The Brain Game's weekly Competitive leaderboard — the one thing shared
 * ACROSS students rather than scoped to one uid, so its security rule is
 * different from everything above it: anyone signed in can read a week's
 * board, but a student can only ever write their own entry (doc id == their
 * uid). `points` here is a student's BEST 30-second Competitive score this
 * week (correct answers, not tasks) — resets automatically every week since
 * each week gets its own board.
 *
 *   leaderboard/{weekKey}/entries/{uid}  → joined-in students, ranked by score
 *   leaderboard/{weekKey}/skips/{uid}    → "asked, declined" — so Skip sticks
 *                                          for the rest of that week
 */
export interface LeaderboardEntryDoc {
  uid: string;
  name: string;
  points: number;
  updatedAt: string;
}

export function leaderboardEntriesCol(weekKey: string): CollectionReference {
  return collection(db(), "leaderboard", weekKey, "entries");
}

export function leaderboardEntryDoc(weekKey: string, uid: string): DocumentReference {
  return doc(db(), "leaderboard", weekKey, "entries", uid);
}

export function leaderboardSkipDoc(weekKey: string, uid: string): DocumentReference {
  return doc(db(), "leaderboard", weekKey, "skips", uid);
}

export function col(uid: string, name: AnyCol): CollectionReference {
  return collection(db(), "users", uid, name);
}

export function entityDoc(uid: string, name: AnyCol, id: string): DocumentReference {
  return doc(db(), "users", uid, name, id);
}

export interface AlarmDoc {
  label: string;
  time: string; // "HH:MM"
  enabled: boolean;
  kind: "wake" | "study" | "class" | "task" | "bedtime" | "custom";
  /** ["Mon",...] — empty = one-shot (fires next occurrence then disables) */
  repeatDays: string[];
  sound: boolean;
  createdAt: string;
}

/** Scheduling + study preferences. All times are "HH:MM" 24h strings. */
export interface Prefs {
  schoolStart: string;
  schoolEnd: string;
  wakeTime: string;
  bedtime: string;
  windDownMinutes: number; // buffer before bedtime shown as "wind down"
  studyDays: string[]; // ["Mon","Tue",...]
  defaultSessionMin: number;
  defaultBreakMin: number;
  alarmsEnabled: boolean;
  reminders: {
    enabled: boolean;
    leadMinutes: number;
    quietStart: string;
    quietEnd: string;
    taskReminders: boolean;
    calendarReminders: boolean;
    studyReminders: boolean;
  };
  /** Which percent→letter cutoffs to grade against. `presetId: null` = not chosen yet. */
  gradeScale: GradeScalePref;
}

export const DEFAULT_PREFS: Prefs = {
  schoolStart: "08:00",
  schoolEnd: "15:00",
  wakeTime: "07:00",
  bedtime: "23:00",
  windDownMinutes: 30,
  studyDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  defaultSessionMin: 45,
  defaultBreakMin: 10,
  alarmsEnabled: false,
  reminders: {
    enabled: true,
    leadMinutes: 30,
    quietStart: "22:00",
    quietEnd: "07:00",
    taskReminders: true,
    calendarReminders: true,
    studyReminders: true,
  },
  gradeScale: { presetId: null },
};

/** Merge a stored (possibly partial / legacy) prefs blob with the defaults. */
export function withPrefs(raw: Partial<Prefs> | undefined | null): Prefs {
  return {
    ...DEFAULT_PREFS,
    ...(raw ?? {}),
    reminders: { ...DEFAULT_PREFS.reminders, ...(raw?.reminders ?? {}) },
    gradeScale: raw?.gradeScale ?? DEFAULT_PREFS.gradeScale,
  };
}

export interface ProfileDoc {
  name: string;
  email: string;
  plan: string;
  planUpdatedAt: string | null;
  gradeYear: string | null;
  school: string | null;
  goalsText: string | null;
  schedule: { day: string; label: string; start: string; end: string }[];
  extracurriculars: string[];
  helpWith: string[];
  onboardedAt: string | null;
  createdAt: string;
  prefs?: Partial<Prefs>;
  /** { "2026-W35": 3 } — per-WEEK Brain Dump count, enforced against the plan cap */
  brainDumpUsage: Record<string, number>;
  /** { "2026-08-28": 4 } — per-day AI Assistant question count */
  assistantUsage?: Record<string, number>;
}

export function emptyProfile(name: string, email: string): ProfileDoc {
  return {
    name,
    email,
    plan: "free",
    planUpdatedAt: null,
    gradeYear: null,
    school: null,
    goalsText: null,
    schedule: [],
    extracurriculars: [],
    helpWith: [],
    onboardedAt: null,
    createdAt: new Date().toISOString(),
    prefs: DEFAULT_PREFS,
    brainDumpUsage: {},
    assistantUsage: {},
  };
}

/**
 * Today as "YYYY-MM-DD" in the *local* timezone. `toISOString()` would key off
 * UTC, so a student in New York would see their daily AI quota roll over at 8pm
 * instead of midnight.
 */
export const todayKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** ISO-week key like "2026-W35" — used to meter weekly quotas (e.g. Brain Dumps). */
export function weekKey(d: Date = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; // Mon=1 … Sun=7
  t.setUTCDate(t.getUTCDate() + 4 - day); // shift to the Thursday of this week
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Key for a metered period. */
export const periodKey = (period: "day" | "week") =>
  period === "week" ? weekKey() : todayKey();
