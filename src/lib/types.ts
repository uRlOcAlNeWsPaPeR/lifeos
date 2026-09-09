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
  assignments: AssignmentDTO[];
}

export interface AssignmentDTO {
  id: string;
  title: string;
  description: string | null;
  courseId: string | null;
  dueAt: string | null;
  status: "open" | "submitted" | "graded";
  gradeValue: string | null;
  pointsEarned: number | null;
  pointsPossible: number | null;
  provider?: string | null;
  canvasAssignmentId?: string | null;
  canvasUrl?: string | null;
  course?: { id: string; name: string; color: string } | null;
  tasks?: { id: string; status: string }[];
  /** The user's planning task for this assignment, if they've added one. */
  linkedTask?: LinkedTaskDTO | null;
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
  provider?: string | null;
  canvasUrl?: string | null;
  canvasEventId?: string | null;
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
