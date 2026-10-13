// The Brain: everything a student has put into LifeOS, as one connected web.
//
// A "memory" is anything worth recalling later — a note they wrote, a question
// they asked the assistant, a task, an assignment, a goal, a study deck, a
// podcast episode, a brain dump. Most already live in their own collections;
// the Brain doesn't copy them, it reads them (see collect.ts). Only things that
// have nowhere else to live — a note the student writes straight into the
// Brain, and the questions they ask the assistant — are stored as `MemoryDTO`.

/** What a stored memory is. Everything else is derived from existing data. */
export type StoredMemoryKind = "note" | "question";

export interface MemoryDTO {
  id: string;
  kind: StoredMemoryKind;
  title: string;
  text: string;
  /** Local calendar day this memory is *from* (YYYY-MM-DD) — may be years ago. */
  occurredAt: string;
  courseId: string | null;
  subject: string | null;
  tags: string[];
  createdAt: string;
}

export type MemoryKind =
  | "note"
  | "question"
  | "task"
  | "assignment"
  | "goal"
  | "deck"
  | "podcast"
  | "dump"
  | "course";

/** One thing in the web, whatever it came from. */
export interface MemoryNode {
  /** Namespaced by source, so a task and a deck can never collide. */
  id: string;
  kind: MemoryKind;
  title: string;
  text: string;
  /** When it happened / was made (ms epoch), or null when that isn't known. */
  at: number | null;
  /** Hub this belongs to — `course:<id>` or `subject:<slug>` — if any. */
  hubKey: string | null;
  hubLabel: string | null;
  tags: string[];
  /** In-app page that shows the original, if there is one. */
  href: string | null;
  /** Set for stored memories, which the student can delete from the Brain. */
  storedId: string | null;
}
