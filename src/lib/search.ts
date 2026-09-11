// One search across everything in LifeOS — pages and the student's own data.
//
// Pure and dependency-free so it can be unit-tested and run on every keystroke
// without a round-trip. The whole workspace is already in memory (the store
// holds every collection), so search is a filter, not a query.

import type {
  AssignmentDTO,
  CourseDTO,
  DeckDTO,
  EventDTO,
  GoalDTO,
  TaskDTO,
} from "@/lib/types";

export type ResultKind =
  | "page"
  | "task"
  | "assignment"
  | "course"
  | "deck"
  | "goal"
  | "event";

export interface SearchResult {
  id: string;
  kind: ResultKind;
  title: string;
  /** Context line — course name, due date, deck size. */
  subtitle?: string;
  /** Where selecting this result takes you. */
  href: string;
  score: number;
}

/** Every destination in the app, searchable by name and by what it's for. */
export interface PageEntry {
  label: string;
  href: string;
  /** Words that should also find this page ("gpa" → Grades). */
  keywords: string[];
  group: string;
}

export const PAGES: PageEntry[] = [
  { label: "Dashboard", href: "/dashboard", group: "Today", keywords: ["home", "hub", "overview", "start"] },
  { label: "Brain Dump", href: "/brain-dump", group: "Today", keywords: ["capture", "notes", "unload", "messy", "ai"] },
  { label: "Tasks", href: "/tasks", group: "Today", keywords: ["todo", "to do", "list", "work"] },
  { label: "Study", href: "/study", group: "Today", keywords: ["study session", "focus", "lock in", "sessions", "pomodoro"] },
  { label: "Calendar", href: "/calendar", group: "Today", keywords: ["schedule", "week", "month", "events", "agenda"] },
  { label: "School", href: "/school", group: "School", keywords: ["courses", "classes", "class", "assignments", "canvas", "subjects", "teachers"] },
  { label: "Grades", href: "/grades", group: "School", keywords: ["gpa", "marks", "scores", "average", "grade calculator"] },
  { label: "Practice", href: "/practice", group: "School", keywords: ["flashcards", "decks", "study", "quiz", "match", "revise", "memorize", "games"] },
  { label: "Goals", href: "/goals", group: "Progress", keywords: ["targets", "habits", "milestones", "ambitions"] },
  { label: "Analytics", href: "/analytics", group: "Progress", keywords: ["stats", "insights", "streak", "progress", "charts"] },
  { label: "AI Assistant", href: "/assistant", group: "Tools", keywords: ["ask", "chat", "help", "question", "ai"] },
  { label: "Settings", href: "/settings", group: "Tools", keywords: ["preferences", "account", "profile", "sleep", "bedtime", "canvas", "plan", "reminders"] },
];

/** Lowercase, strip accents and punctuation — matches how people actually type. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Score one candidate against the query. Higher is better; 0 means no match.
 *
 * Ranked so the thing you meant comes first: an exact title beats a title that
 * starts with the query, which beats a word starting with it, which beats a
 * match buried mid-word. Every query term must appear somewhere, so typing two
 * words narrows rather than widens.
 */
export function score(query: string, title: string, extra = ""): number {
  const q = fold(query);
  if (!q) return 0;
  const t = fold(title);
  const haystack = extra ? `${t} ${fold(extra)}` : t;

  const terms = q.split(" ");
  let total = 0;

  for (const term of terms) {
    if (!haystack.includes(term)) return 0; // every term must land somewhere

    if (t === term) total += 100;
    else if (t.startsWith(term)) total += 60;
    else if (new RegExp(`\\b${escapeRe(term)}`).test(t)) total += 40;
    else if (t.includes(term)) total += 20;
    else if (new RegExp(`\\b${escapeRe(term)}`).test(haystack)) total += 12;
    else total += 5; // only in the keyword/context text
  }

  // Prefer the tighter match when two things score the same — "Math" should
  // outrank "Mathematics Extension 2 Revision" for the query "math".
  return total / terms.length + Math.max(0, 20 - t.length / 4);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface SearchInput {
  tasks: TaskDTO[];
  assignments: AssignmentDTO[];
  courses: CourseDTO[];
  decks: DeckDTO[];
  goals: GoalDTO[];
  events: EventDTO[];
}

/**
 * Search pages and content together, best matches first.
 *
 * `limit` is per kind, so one busy collection can't crowd everything else out
 * of the list — a student with 200 tasks still sees their decks and courses.
 */
export function searchAll(
  query: string,
  data: SearchInput,
  limit = 5,
): SearchResult[] {
  const q = query.trim();
  if (!q) return [];

  const out: SearchResult[] = [];

  const add = (
    kind: ResultKind,
    items: { id: string; title: string; subtitle?: string; href: string; extra?: string }[],
  ) => {
    const scored = items
      .map((it) => ({ ...it, kind, score: score(q, it.title, it.extra) }))
      .filter((it) => it.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    out.push(...scored.map(({ extra: _extra, ...rest }) => rest as SearchResult));
  };

  add(
    "page",
    PAGES.map((p) => ({
      id: p.href,
      title: p.label,
      subtitle: p.group,
      href: p.href,
      extra: p.keywords.join(" "),
    })),
  );

  const courseName = new Map(data.courses.map((c) => [c.id, c.name]));

  add(
    "task",
    data.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      subtitle: [t.course?.name ?? (t.courseId ? courseName.get(t.courseId) : null), t.category]
        .filter(Boolean)
        .join(" · ") || undefined,
      href: "/tasks",
      extra: [t.notes, t.category].filter(Boolean).join(" "),
    })),
  );

  add(
    "assignment",
    data.assignments.map((a) => ({
      id: a.id,
      title: a.title,
      subtitle: a.course?.name ?? (a.courseId ? courseName.get(a.courseId) : undefined),
      href: "/school",
      extra: a.description ?? "",
    })),
  );

  add(
    "course",
    data.courses.map((c) => ({
      id: c.id,
      title: c.name,
      subtitle: [c.code, c.instructor].filter(Boolean).join(" · ") || undefined,
      href: "/school",
      extra: [c.code, c.instructor, c.term].filter(Boolean).join(" "),
    })),
  );

  add(
    "deck",
    data.decks.map((d) => ({
      id: d.id,
      title: d.title,
      subtitle: `${d.cards.length} card${d.cards.length === 1 ? "" : "s"}`,
      href: `/practice/${d.id}`,
      // Card fronts are searchable, so "mitosis" finds the deck that drills it.
      extra: d.cards.map((c) => c.front).join(" "),
    })),
  );

  add(
    "goal",
    data.goals.map((g) => ({
      id: g.id,
      title: g.title,
      subtitle: g.category ?? undefined,
      href: "/goals",
      extra: [g.description, g.category].filter(Boolean).join(" "),
    })),
  );

  add(
    "event",
    data.events.map((e) => ({
      id: e.id,
      title: e.title,
      subtitle: e.location ?? undefined,
      href: "/calendar",
      extra: e.description ?? "",
    })),
  );

  return out.sort((a, b) => b.score - a.score);
}

export const KIND_LABEL: Record<ResultKind, string> = {
  page: "Page",
  task: "Task",
  assignment: "Assignment",
  course: "Course",
  deck: "Deck",
  goal: "Goal",
  event: "Event",
};
