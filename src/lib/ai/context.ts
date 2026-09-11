import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { LifeOSContext, Priority } from "./types";

const d = (v: unknown): Date | null => {
  if (!v) return null;
  const x = new Date(v as string);
  return Number.isNaN(x.getTime()) ? null : x;
};

const normTitle = (s: string) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const dayKey = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : "");

/** Build the AI data snapshot for a user from Firestore. This is the ONLY thing AI sees. */
export async function buildContext(uid: string): Promise<LifeOSContext> {
  const base = adminDb().collection("users").doc(uid);
  const [profileSnap, tasksSnap, goalsSnap, coursesSnap, assignmentsSnap, eventsSnap] =
    await Promise.all([
      base.get(),
      base.collection("tasks").get(),
      base.collection("goals").get(),
      base.collection("courses").get(),
      base.collection("assignments").get(),
      base.collection("events").get(),
    ]);

  const profile = profileSnap.data() ?? {};
  const tasks = tasksSnap.docs.map((s) => ({ id: s.id, ...s.data() })) as Record<string, unknown>[];
  const goals = goalsSnap.docs.map((s) => ({ id: s.id, ...s.data() })) as Record<string, unknown>[];
  const courses = coursesSnap.docs.map((s) => ({ id: s.id, ...s.data() })) as Record<string, unknown>[];
  const assignments = assignmentsSnap.docs.map((s) => ({ id: s.id, ...s.data() })) as Record<string, unknown>[];
  const events = eventsSnap.docs.map((s) => ({ id: s.id, ...s.data() })) as Record<string, unknown>[];

  const courseName = new Map(courses.map((c) => [c.id as string, c.name as string]));
  const goalTitle = new Map(goals.map((g) => [g.id as string, g.title as string]));
  const assignmentKeys = new Set(
    assignments.map((a) => `${normTitle(a.title as string)}|${dayKey(d(a.dueAt))}`),
  );
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);

  return {
    now: new Date(),
    profile: {
      name: (profile.name as string) ?? "there",
      gradeYear: (profile.gradeYear as string) ?? null,
      school: (profile.school as string) ?? null,
      goalsText: (profile.goalsText as string) ?? null,
      schedule: (profile.schedule as LifeOSContext["profile"]["schedule"]) ?? [],
      extracurriculars: (profile.extracurriculars as string[]) ?? [],
      helpWith: (profile.helpWith as string[]) ?? [],
    },
    // Skip tasks that just shadow an assignment (same name/day, or explicit link) —
    // the assignment already represents that work.
    tasks: tasks
      .filter((t) => {
        if (t.assignmentId) return false;
        const key = `${normTitle(t.title as string)}|${dayKey(d(t.dueAt))}`;
        return !(t.dueAt && assignmentKeys.has(key));
      })
      .map((t) => ({
        id: t.id as string,
        title: t.title as string,
        status: (t.status as string) ?? "todo",
        priority: ((t.priority as string) ?? "medium") as Priority,
        category: (t.category as string) ?? null,
        dueAt: d(t.dueAt),
        estimatedMinutes: (t.estimatedMinutes as number) ?? null,
        goalTitle: t.goalId ? goalTitle.get(t.goalId as string) ?? null : null,
        courseName: t.courseId ? courseName.get(t.courseId as string) ?? null : null,
      })),
    goals: goals.map((g) => ({
      id: g.id as string,
      title: g.title as string,
      progress: goalProgressOf(g),
      status: (g.status as string) ?? "active",
      dueAt: d(g.dueAt),
      category: (g.category as string) ?? null,
      targetType: (g.targetType as string) ?? "milestone",
      habitPerWeek: (g.habitPerWeek as number) ?? null,
      habitLogsThisWeek: (((g.habitLogs as { date: string }[]) ?? []).filter(
        (l) => new Date(l.date) >= weekStart,
      )).length,
    })),
    courses: courses.map((c) => ({
      id: c.id as string,
      name: c.name as string,
      code: (c.code as string) ?? null,
      currentGrade: (c.currentGrade as string) ?? null,
      source: (c.provider as string) === "canvas" ? "canvas" : null,
    })),
    assignments: assignments.map((a) => ({
      id: a.id as string,
      title: a.title as string,
      courseName: a.courseId ? courseName.get(a.courseId as string) ?? null : null,
      dueAt: d(a.dueAt),
      // `localDone` is the student manually marking it done in LifeOS — Canvas
      // itself may still report "open" (no submission on record). Fold it into
      // the status the AI sees, or every recommendation and priority score
      // built from this context would keep treating it as outstanding work.
      status: a.localDone ? "done" : (a.status as string) ?? "open",
      source: (a.provider as string) === "canvas" ? "canvas" : null,
      hasLinkedTask: tasks.some((t) => t.assignmentId === a.id && t.status !== "done"),
    })),
    events: events.map((e) => ({
      id: e.id as string,
      title: e.title as string,
      startAt: d(e.startAt) ?? new Date(),
      endAt: d(e.endAt) ?? new Date(),
      kind: (e.kind as string) ?? "event",
    })),
  };
}

function goalProgressOf(g: Record<string, unknown>): number {
  const ms = (g.milestones as { done: boolean }[]) ?? [];
  if ((g.targetType ?? "milestone") === "milestone" && ms.length) {
    return Math.round((ms.filter((m) => m.done).length / ms.length) * 100);
  }
  return (g.progress as number) ?? 0;
}
