// Gather every memory the student has into one flat list. Pure — it takes the
// app's data in and hands nodes back, so it can be tested without a browser.
//
// Nothing here is copied or stored. A task, a deck and a podcast stay where
// they are; the Brain just reads them. That keeps one source of truth (edit a
// task and its memory changes with it) and means the Brain can never drift out
// of sync with the rest of the app.

import type {
  AssignmentDTO,
  CourseDTO,
  DeckDTO,
  GoalDTO,
  PodcastDTO,
  TaskDTO,
} from "@/lib/types";
import type { MemoryDTO, MemoryNode } from "./types";
import { parseDay } from "./time";

/** A brain dump as it's saved: the raw text the student typed, and when. */
export interface BrainDumpRecord {
  id: string;
  rawText: string;
  createdAt: string;
}

export interface MemorySources {
  memories: MemoryDTO[];
  tasks: TaskDTO[];
  assignments: AssignmentDTO[];
  goals: GoalDTO[];
  decks: DeckDTO[];
  podcasts: PodcastDTO[];
  courses: CourseDTO[];
  dumps: BrainDumpRecord[];
}

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Which hub a memory hangs off: its course if it has one, else its subject. */
function hubOf(
  courseId: string | null | undefined,
  subject: string | null | undefined,
  courses: Map<string, CourseDTO>,
): { key: string | null; label: string | null } {
  const course = courseId ? courses.get(courseId) : undefined;
  if (course) return { key: `course:${course.id}`, label: course.name };
  const s = subject?.trim();
  if (s) return { key: `subject:${slug(s)}`, label: s };
  return { key: null, label: null };
}

export function collectMemories(src: MemorySources): MemoryNode[] {
  const courses = new Map(src.courses.map((c) => [c.id, c]));
  const nodes: MemoryNode[] = [];

  for (const m of src.memories) {
    const hub = hubOf(m.courseId, m.subject, courses);
    nodes.push({
      id: `memory:${m.id}`,
      kind: m.kind,
      title: m.title.trim() || clip(m.text, 60) || "Untitled memory",
      text: m.text,
      at: parseDay(m.occurredAt) ?? parseDay(m.createdAt),
      hubKey: hub.key,
      hubLabel: hub.label,
      tags: m.tags,
      href: null,
      storedId: m.id,
    });
  }

  for (const t of src.tasks) {
    // A task that mirrors an assignment is that assignment's planning data —
    // it would show up twice. The assignment is the memory.
    if (t.assignmentId) continue;
    const hub = hubOf(t.courseId, t.category, courses);
    nodes.push({
      id: `task:${t.id}`,
      kind: "task",
      title: t.title,
      text: t.notes ?? "",
      at: parseDay(t.createdAt) ?? parseDay(t.dueAt),
      hubKey: hub.key,
      hubLabel: hub.label,
      tags: [],
      href: "/tasks",
      storedId: null,
    });
  }

  for (const a of src.assignments) {
    const hub = hubOf(a.courseId, null, courses);
    const bits = [a.description, a.category ? `Category: ${a.category}` : null, a.gradeValue ? `Grade: ${a.gradeValue}` : null];
    nodes.push({
      id: `assignment:${a.id}`,
      kind: "assignment",
      title: a.title,
      text: bits.filter(Boolean).join(". "),
      at: parseDay(a.createdAt) ?? parseDay(a.dueAt),
      hubKey: hub.key,
      hubLabel: hub.label,
      tags: [],
      href: "/school",
      storedId: null,
    });
  }

  for (const g of src.goals) {
    nodes.push({
      id: `goal:${g.id}`,
      kind: "goal",
      title: g.title,
      text: [g.description, ...g.milestones.map((m) => m.title)].filter(Boolean).join(". "),
      // Goals carry no creation date; a due date is when it's *for*, not when
      // it was made, so they're left undated rather than mis-placed.
      at: null,
      hubKey: null,
      hubLabel: null,
      tags: g.category ? [g.category] : [],
      href: "/goals",
      storedId: null,
    });
  }

  for (const d of src.decks) {
    const hub = hubOf(d.courseId, d.subject, courses);
    const cards = d.cards.slice(0, 40).map((c) => `${c.front} — ${c.back}`).join(". ");
    nodes.push({
      id: `deck:${d.id}`,
      kind: "deck",
      title: d.title,
      text: clip([d.description, cards].filter(Boolean).join(". "), 1200),
      at: parseDay(d.createdAt),
      hubKey: hub.key,
      hubLabel: hub.label,
      tags: [],
      href: `/practice/${d.id}`,
      storedId: null,
    });
  }

  for (const p of src.podcasts) {
    const hub = hubOf(p.courseId, p.subject, courses);
    nodes.push({
      id: `podcast:${p.id}`,
      kind: "podcast",
      title: p.title,
      text: clip([p.summary, ...p.segments.slice(0, 12).map((s) => s.text)].filter(Boolean).join(" "), 1200),
      at: parseDay(p.createdAt),
      hubKey: hub.key,
      hubLabel: hub.label,
      tags: [],
      href: "/podcast",
      storedId: null,
    });
  }

  for (const d of src.dumps) {
    if (!d.rawText.trim()) continue;
    nodes.push({
      id: `dump:${d.id}`,
      kind: "dump",
      title: clip(d.rawText, 60),
      text: d.rawText,
      at: parseDay(d.createdAt),
      hubKey: null,
      hubLabel: null,
      tags: [],
      href: "/brain-dump",
      storedId: null,
    });
  }

  return nodes;
}
