// Shared types for the LifeOS AI layer.
// Every AI capability operates over a snapshot of the user's LifeOS data
// (LifeOSContext) — never as a free-floating chatbot.

export type Priority = "low" | "medium" | "high" | "urgent";

/** Which engine produced a result. */
export type AIEngine = "heuristic" | "anthropic" | "gemini";

export interface LifeOSContext {
  now: Date;
  profile: {
    name: string;
    gradeYear?: string | null;
    school?: string | null;
    goalsText?: string | null;
    schedule: { day: string; label: string; start: string; end: string }[];
    extracurriculars: string[];
    helpWith: string[];
  };
  tasks: {
    id: string;
    title: string;
    status: string;
    priority: Priority;
    category?: string | null;
    dueAt?: Date | null;
    estimatedMinutes?: number | null;
    goalTitle?: string | null;
    courseName?: string | null;
  }[];
  goals: {
    id: string;
    title: string;
    progress: number;
    status: string;
    dueAt?: Date | null;
    category?: string | null;
    targetType: string;
    habitPerWeek?: number | null;
    habitLogsThisWeek?: number;
  }[];
  courses: {
    id: string;
    name: string;
    code?: string | null;
    currentGrade?: string | null;
    source?: string | null;
  }[];
  assignments: {
    id: string;
    title: string;
    courseName?: string | null;
    dueAt?: Date | null;
    status: string;
    source?: string | null;
    hasLinkedTask: boolean;
  }[];
  events: { id: string; title: string; startAt: Date; endAt: Date; kind: string }[];
}

export interface BrainDumpItem {
  /** Short — 2–5 words, keyword-style (e.g. "History test", "English essay"). */
  title: string;
  /**
   * Details the student elaborated on — topics a test covers, essay prompt,
   * instructions — folded into ONE task instead of split into many.
   */
  notes: string | null;
  category?: string | null;
  suggestedPriority: Priority;
  suggestedDueAt: string | null; // ISO — only when a date was explicit in the text
  dueDateWasExplicit: boolean;
  estimatedMinutes: number | null;
  suggestedSlot: string | null;
  reasoning: string;
}

export interface BrainDumpResult {
  engine: AIEngine;
  items: BrainDumpItem[];
  summary: string;
}

export interface PriorityPick {
  taskId: string;
  title: string;
  reason: string;
}

export interface PrioritizeResult {
  engine: AIEngine;
  intro: string;
  picks: PriorityPick[];
}

export interface AssistantReference {
  type: "task" | "goal" | "assignment" | "course" | "event";
  id: string;
  title: string;
}

export interface AssistantResult {
  engine: AIEngine;
  answer: string; // markdown
  references: AssistantReference[];
}

export interface AIProvider {
  readonly name: AIEngine;
  parseBrainDump(text: string, ctx: LifeOSContext): Promise<BrainDumpResult>;
  prioritize(ctx: LifeOSContext): Promise<PrioritizeResult>;
  assist(question: string, ctx: LifeOSContext): Promise<AssistantResult>;
}
