// Deterministic task priority scoring. Used by the dashboard "AI Priority"
// panel and by the heuristic prioritize() implementation.
import type { LifeOSContext, Priority } from "./types";

const PRIORITY_WEIGHT: Record<Priority, number> = {
  urgent: 40,
  high: 26,
  medium: 12,
  low: 4,
};

export interface ScoredTask {
  id: string;
  title: string;
  score: number;
  dueAt?: Date | null;
  category?: string | null;
  estimatedMinutes?: number | null;
  factors: string[];
}

export function scoreTasks(ctx: LifeOSContext): ScoredTask[] {
  const now = ctx.now;
  const open = ctx.tasks.filter((t) => t.status !== "done");

  return open
    .map((t) => {
      const factors: string[] = [];
      let score = PRIORITY_WEIGHT[t.priority] ?? 12;

      if (t.dueAt) {
        const hrs = (t.dueAt.getTime() - now.getTime()) / 3600000;
        if (hrs < 0) {
          score += 55;
          factors.push("overdue");
        } else if (hrs <= 24) {
          score += 45;
          factors.push("due today");
        } else if (hrs <= 48) {
          score += 32;
          factors.push("due tomorrow");
        } else if (hrs <= 24 * 4) {
          score += 20;
          factors.push("due this week");
        } else if (hrs <= 24 * 7) {
          score += 10;
        }
      }

      // linked to an active goal → matters for the bigger picture
      if (t.goalTitle) {
        score += 8;
        factors.push(`supports "${t.goalTitle}"`);
      }

      // linked to a course with an imminent assignment
      if (t.courseName) {
        const soon = ctx.assignments.find(
          (a) =>
            a.courseName === t.courseName &&
            a.status !== "graded" &&
            a.dueAt &&
            a.dueAt.getTime() - now.getTime() < 24 * 3 * 3600000,
        );
        if (soon) {
          score += 12;
          factors.push(`${t.courseName} assignment due soon`);
        }
      }

      // quick wins get a small nudge so they don't rot
      if (t.estimatedMinutes && t.estimatedMinutes <= 20) {
        score += 4;
        factors.push("quick win");
      }

      // big tasks with a near deadline need to be started now
      if (t.estimatedMinutes && t.estimatedMinutes >= 90 && t.dueAt) {
        const days = (t.dueAt.getTime() - now.getTime()) / 86400000;
        if (days <= 3) {
          score += 10;
          factors.push("large task, start early");
        }
      }

      return {
        id: t.id,
        title: t.title,
        score: Math.round(score),
        dueAt: t.dueAt,
        category: t.category,
        estimatedMinutes: t.estimatedMinutes,
        factors,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function relativeDue(due: Date | null | undefined, now: Date): string | null {
  if (!due) return null;
  const ms = due.getTime() - now.getTime();
  const days = Math.round(ms / 86400000);
  if (ms < 0) {
    const overdue = Math.abs(days);
    return overdue === 0 ? "overdue today" : `${overdue}d overdue`;
  }
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days < 7) return `due in ${days}d`;
  return `due ${due.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}
