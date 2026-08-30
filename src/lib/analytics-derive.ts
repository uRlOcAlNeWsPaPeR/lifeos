// Pure, client-safe analytics. Operates on already-loaded DTOs so the
// dashboard / analytics page never needs a server round-trip to recompute.
import type { AssignmentDTO, GoalDTO, TaskDTO } from "@/lib/types";

export interface AnalyticsSummary {
  completedTotal: number;
  completed7d: number;
  overdueOpen: number;
  openTotal: number;
  completionRate: number;
  avgGoalProgress: number;
  activeGoals: number;
  weeklyCompletion: { label: string; completed: number; created: number }[];
  categoryLoad: { category: string; open: number; minutes: number }[];
  upcomingWorkload: {
    label: string;
    date: string;
    tasks: number;
    assignments: number;
    minutes: number;
  }[];
  streakDays: number;
}

export function goalProgress(g: Pick<GoalDTO, "targetType" | "progress" | "milestones">): number {
  if (g.targetType === "milestone" && g.milestones.length) {
    return Math.round((g.milestones.filter((m) => m.done).length / g.milestones.length) * 100);
  }
  return g.progress;
}

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const parse = (s: string | null | undefined) => (s ? new Date(s) : null);

export function deriveAnalytics(
  tasks: TaskDTO[],
  goals: GoalDTO[],
  assignments: AssignmentDTO[],
): AnalyticsSummary {
  const now = new Date();
  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  const cutoff30 = addDays(now, -30);
  const last30 = tasks.filter((t) => {
    const c = parse(t.createdAt);
    return !c || c >= cutoff30;
  });
  const done30 = last30.filter((t) => t.status === "done").length;
  const total30 = last30.length;

  const weeklyCompletion: AnalyticsSummary["weeklyCompletion"] = [];
  for (let w = 5; w >= 0; w--) {
    const start = startOfDay(addDays(now, -((w + 1) * 7 - 1)));
    const end = endOfDay(addDays(now, -w * 7));
    weeklyCompletion.push({
      label: w === 0 ? "This wk" : `${w}w ago`,
      completed: done.filter((t) => {
        const c = parse(t.completedAt);
        return c && c >= start && c <= end;
      }).length,
      created: tasks.filter((t) => {
        const c = parse(t.createdAt);
        return c && c >= start && c <= end;
      }).length,
    });
  }

  const catMap = new Map<string, { open: number; minutes: number }>();
  for (const t of open) {
    const key = t.category || "Uncategorized";
    const cur = catMap.get(key) ?? { open: 0, minutes: 0 };
    cur.open += 1;
    cur.minutes += t.estimatedMinutes ?? 0;
    catMap.set(key, cur);
  }
  const categoryLoad = [...catMap.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.open - a.open)
    .slice(0, 6);

  const upcomingWorkload = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(now, i);
    const s = startOfDay(d);
    const e = endOfDay(d);
    const dayTasks = open.filter((t) => {
      const due = parse(t.dueAt);
      return due && due >= s && due <= e;
    });
    const dayAssignments = assignments.filter((a) => {
      const due = parse(a.dueAt);
      return a.status !== "graded" && due && due >= s && due <= e;
    });
    return {
      label: d.toLocaleDateString([], { weekday: "short" }),
      date: d.toLocaleDateString([], { month: "short", day: "numeric" }),
      tasks: dayTasks.length,
      assignments: dayAssignments.length,
      minutes: dayTasks.reduce((n, t) => n + (t.estimatedMinutes ?? 30), 0),
    };
  });

  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const s = startOfDay(addDays(now, -i));
    const e = endOfDay(addDays(now, -i));
    const any = done.some((t) => {
      const c = parse(t.completedAt);
      return c && c >= s && c <= e;
    });
    if (any) streak++;
    else if (i > 0) break;
  }

  const progresses = goals.filter((g) => g.status !== "archived").map((g) => goalProgress(g));

  return {
    completedTotal: done.length,
    completed7d: done.filter((t) => {
      const c = parse(t.completedAt);
      return c && c >= addDays(now, -7);
    }).length,
    overdueOpen: open.filter((t) => {
      const due = parse(t.dueAt);
      return due && due < now;
    }).length,
    openTotal: open.length,
    completionRate: total30 ? Math.round((done30 / total30) * 100) : 0,
    avgGoalProgress: progresses.length
      ? Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length)
      : 0,
    activeGoals: goals.filter((g) => g.status === "active").length,
    weeklyCompletion,
    categoryLoad,
    upcomingWorkload,
    streakDays: streak,
  };
}
