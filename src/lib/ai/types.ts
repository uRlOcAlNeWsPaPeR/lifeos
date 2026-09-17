// Shared types for the LifeOS AI layer.
// Every AI capability operates over a snapshot of the user's LifeOS data
// (LifeOSContext) — never as a free-floating chatbot.

import type { PodcastOptions, PodcastScript } from "@/lib/podcast/types";

export type Priority = "low" | "medium" | "high" | "urgent";

/** Which engine produced a result. */
export type AIEngine = "heuristic" | "anthropic" | "gemini" | "openrouter" | "groq";

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

/** One turn of the assistant conversation, as sent to the model. */
export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * A change the assistant proposes to the student's LifeOS data. The assistant
 * NEVER writes anything itself — each action is shown in the chat as a one-tap
 * confirm and then run through the normal app store, undo bar included. Every
 * id / courseId is validated against the real data server-side before it reaches
 * the client (see `sanitizeActions`).
 */
export type AssistantAction =
  | {
      kind: "add_task";
      label: string;
      title: string;
      dueAt: string | null;
      priority: Priority;
      notes: string | null;
      courseId: string | null;
    }
  | {
      kind: "add_course";
      label: string;
      name: string;
      code: string | null;
      instructor: string | null;
    }
  | {
      kind: "add_assignment";
      label: string;
      courseId: string;
      title: string;
      dueAt: string | null;
      pointsPossible: number | null;
    }
  | { kind: "complete_task"; label: string; id: string }
  | { kind: "delete_task"; label: string; id: string }
  | { kind: "delete_course"; label: string; id: string }
  | { kind: "delete_assignment"; label: string; id: string };

export interface AssistantResult {
  engine: AIEngine;
  answer: string; // markdown
  references: AssistantReference[];
  /** Proposed data changes awaiting the student's confirm. Often empty. */
  actions: AssistantAction[];
}

/** One Practice card the model pulled out of a student's notes. */
export interface GeneratedCard {
  front: string;
  back: string;
}

export interface GenerateCardsResult {
  engine: AIEngine;
  cards: GeneratedCard[];
}

export interface GeneratePodcastResult {
  engine: AIEngine;
  script: PodcastScript;
}

export interface AIProvider {
  readonly name: AIEngine;
  parseBrainDump(text: string, ctx: LifeOSContext): Promise<BrainDumpResult>;
  /** Same output as parseBrainDump, but read off a screenshot (planner, Canvas, syllabus, whiteboard…). */
  parseBrainDumpImage(
    imageBase64: string,
    mimeType: string,
    ctx: LifeOSContext,
  ): Promise<BrainDumpResult>;
  prioritize(ctx: LifeOSContext): Promise<PrioritizeResult>;
  assist(messages: AssistantMessage[], ctx: LifeOSContext): Promise<AssistantResult>;
  /** Turn a block of the student's own notes into study cards. */
  generateCards(notes: string, title: string | null): Promise<GenerateCardsResult>;
  /** Turn a block of the student's own notes into a listenable episode. */
  generatePodcast(notes: string, opts: PodcastOptions): Promise<GeneratePodcastResult>;
}
