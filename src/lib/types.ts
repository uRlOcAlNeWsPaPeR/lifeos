// Shared client-facing shapes (JSON-serialized from the API).

export interface TaskDTO {
  id: string;
  title: string;
  notes: string | null;
  status: "todo" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  category: string | null;
  dueAt: string | null;
  estimatedMinutes: number | null;
  completedAt: string | null;
  sortOrder: number;
  source: string;
  goalId: string | null;
  courseId: string | null;
  assignmentId: string | null;
  createdAt?: string;
  /** "HH:MM" — a specific time it's due, on top of dueAt's date */
  dueTime?: string | null;
  /** ISO — when the user plans to *work* on it (shows on calendar/planner) */
  scheduledAt?: string | null;
  /** honour the sleep schedule when scheduling this task (default true) */
  respectSleep?: boolean;
  recurrence?: "none" | "daily" | "weekdays" | "weekly" | null;
  goal?: { id: string; title: string } | null;
  course?: { id: string; name: string; color: string } | null;
  /** Set when source === "canvas" — deep link to the assignment on Canvas. */
  canvasUrl?: string | null;
  canvasAssignmentId?: string | null;
  /**
   * When set, this task mirrors an assignment of the same name — it's the
   * assignment's planning data (estimate / schedule / notes / done-state), not a
   * standalone to-do. Hidden from task lists; surfaced via the assignment.
   */
  shadowOfAssignmentId?: string | null;
  assignment?: { id: string; title: string } | null;
}

/** The optional "planning layer" a user attaches to an assignment. */
export interface LinkedTaskDTO {
  id: string;
  status: "todo" | "done";
  notes: string | null;
  estimatedMinutes: number | null;
  scheduledAt: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  dueTime: string | null;
  completedAt: string | null;
}

export interface MilestoneDTO {
  id: string;
  title: string;
  done: boolean;
  dueAt: string | null;
  sortOrder: number;
}

export interface GoalDTO {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  targetType: "milestone" | "habit";
  habitPerWeek: number | null;
  progress: number;
  status: "active" | "achieved" | "archived";
  dueAt: string | null;
  milestones: MilestoneDTO[];
  habitLogs: { id: string; date: string }[];
  tasks: { id: string; title: string; status: string; dueAt: string | null }[];
}

export interface CourseDTO {
  id: string;
  name: string;
  code: string | null;
  instructor: string | null;
  color: string;
  term: string | null;
  currentGrade: string | null;
  /** Canvas's own computed current score (0–100), when it syncs one. */
  currentScore: number | null;
  provider: string | null;
  canvasCourseId?: string | null;
  canvasUrl?: string | null;
  /**
   * Grade categories for a manually-tracked (non-Canvas) course — e.g. Tests
   * 50%, Homework 20%, Quizzes 30%. Canvas courses ignore this; Canvas already
   * reports its own weighted `currentScore`.
   */
  gradeWeights?: { category: string; weight: number }[] | null;
  assignments: AssignmentDTO[];
}

export interface AssignmentDTO {
  id: string;
  title: string;
  description: string | null;
  courseId: string | null;
  dueAt: string | null;
  status: "open" | "submitted" | "graded";
  /** When it was created — the real Canvas date for a Canvas-sourced assignment when
   *  Canvas provides one, otherwise when it was added here. Not always available. */
  createdAt?: string | null;
  gradeValue: string | null;
  pointsEarned: number | null;
  pointsPossible: number | null;
  /** Which of the course's `gradeWeights` categories this counts toward, if any. */
  category?: string | null;
  provider?: string | null;
  canvasAssignmentId?: string | null;
  canvasUrl?: string | null;
  course?: { id: string; name: string; color: string } | null;
  tasks?: { id: string; status: string }[];
  /** The user's planning task for this assignment, if they've added one. */
  linkedTask?: LinkedTaskDTO | null;
  /**
   * User-declared "I've done this", independent of what Canvas reports. Shows
   * as done in LifeOS while `status` is still "open" (Canvas has no submission
   * on record) and survives Canvas resyncs — a resync only clears it once
   * Canvas itself reports the assignment submitted or graded, at which point
   * `status` carries the real answer and this flag stops mattering.
   */
  localDone?: boolean;
}

export interface EventDTO {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  kind: "event" | "study_session" | "class" | "deadline";
  location: string | null;
  taskId: string | null;
  /** study_session only — false = a plain calendar block, no lock-in nag. */
  locked?: boolean;
  provider?: string | null;
  canvasUrl?: string | null;
  canvasEventId?: string | null;
  /** Google Calendar-sourced event (provider: "google"), one-way pull only.
   *  googleEventId is only unique WITHIN googleCalendarId (the student may
   *  have several Google calendars synced — their own, a shared family one,
   *  a subscribed holiday calendar). */
  googleEventId?: string | null;
  googleCalendarId?: string | null;
  googleUrl?: string | null;
}

export interface BrainDumpItemDTO {
  id: string;
  title: string;
  category: string | null;
  suggestedPriority: "low" | "medium" | "high" | "urgent";
  suggestedDueAt: string | null;
  dueDateWasExplicit: boolean;
  estimatedMinutes: number | null;
  suggestedSlot: string | null;
  reasoning: string | null;
  accepted: boolean;
}

export interface BrainDumpDTO {
  id: string;
  rawText: string;
  status: string;
  engine: string;
  createdAt: string;
  items: BrainDumpItemDTO[];
}

export interface AlarmDTO {
  id: string;
  label: string;
  time: string;
  enabled: boolean;
  kind: "wake" | "study" | "class" | "task" | "bedtime" | "custom";
  repeatDays: string[];
  sound: boolean;
}

export interface FocusSessionDTO {
  id: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
  subject: string | null;
  taskId: string | null;
  taskTitle: string | null;
}

/* ------------------------------- Practice ------------------------------- *
 * A deck is one study set. Cards live *inside* the deck document (the way
 * milestones live inside a goal) — a deck is capped well under Firestore's 1MB
 * limit, so the whole thing loads in a single snapshot and a study session is
 * one write instead of one per card.                                        */

/** How well a card is known. Derived from `streak`, never stored. */
export type Mastery = "new" | "learning" | "familiar" | "mastered";

export interface CardDTO {
  id: string;
  /** Term / question — the prompt side. */
  front: string;
  /** Definition / answer — the side being recalled. */
  back: string;
  hint: string | null;

  /* --- spaced repetition state --- */
  /** Consecutive correct answers. Reset to 0 on a miss. */
  streak: number;
  /** SM-2 style ease factor, 1.3–3.0. Lower = shown more often. */
  ease: number;
  /** ISO — when this card is next due for review. null = never studied. */
  dueAt: string | null;
  /** Times a known card was forgotten — flags cards that need a rewrite. */
  lapses: number;
  seen: number;
  correct: number;
}

export type DeckSource = "manual" | "paste" | "ai";

export interface DeckDTO {
  id: string;
  title: string;
  description: string | null;
  /** Links the deck to a course so it can be surfaced next to that work. */
  courseId: string | null;
  /** Free-text subject, used when the deck isn't tied to a course. */
  subject: string | null;
  cards: CardDTO[];
  source: DeckSource;
  createdAt: string;
  lastStudiedAt: string | null;
  /** Personal bests, for the games that keep score. */
  bestMatchMs: number | null;
  bestRushScore: number;
  sessions: number;
}

/** The four ways to study a deck. */
export type GameMode = "flashcards" | "match" | "quiz" | "rush";

/** How the student rated their recall on a flashcard. */
export type Grade = "again" | "hard" | "good" | "easy";

/* -------------------------------------------------------------------------- *
 * Podcast — episodes built from the student's own notes. Defined alongside the
 * script-building logic in lib/podcast, re-exported here so the store and UI
 * import every DTO from one place.
 * -------------------------------------------------------------------------- */
export type {
  PodcastDTO,
  PodcastFormat,
  PodcastOptions,
  PodcastScript,
  PodcastSegment,
  PodcastSource,
  SegmentKind,
  Speaker,
} from "@/lib/podcast/types";
