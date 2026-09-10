import type { AssistantAction, LifeOSContext, Priority } from "./types";

// Turn the model's proposed `actions` into a safe, typed list. Anything that
// references data the student doesn't have (a made-up task id, a course that
// isn't theirs), or a nonsense date, is dropped — exactly like the assistant's
// `references`. The human-readable `label` is rebuilt here from real data so the
// confirm card can't be made to say one thing while doing another.

const PRIORITIES = new Set<Priority>(["low", "medium", "high", "urgent"]);
const MAX_ACTIONS = 8;

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** Accept a date only if it parses and lands within ±1–2 years of now. */
function cleanDate(v: unknown, now: Date): string | null {
  const s = str(v, 40);
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  if (t < now.getTime() - 366 * 864e5 || t > now.getTime() + 2 * 366 * 864e5) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date(t).toISOString();
}

const dueSuffix = (iso: string | null) => (iso ? ` · due ${iso.slice(0, 10)}` : "");

export function sanitizeActions(raw: unknown, ctx: LifeOSContext): AssistantAction[] {
  if (!Array.isArray(raw)) return [];

  const courseIds = new Set(ctx.courses.map((c) => c.id));
  const openTaskIds = new Set(ctx.tasks.filter((t) => t.status !== "done").map((t) => t.id));
  const taskIds = new Set(ctx.tasks.map((t) => t.id));
  const assignmentIds = new Set(ctx.assignments.map((a) => a.id));
  const courseName = new Map(ctx.courses.map((c) => [c.id, c.name]));
  const taskTitle = new Map(ctx.tasks.map((t) => [t.id, t.title]));
  const assignmentTitle = new Map(ctx.assignments.map((a) => [a.id, a.title]));

  const out: AssistantAction[] = [];

  for (const item of raw as Record<string, unknown>[]) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id ?? "");
    const courseId =
      typeof item.courseId === "string" && courseIds.has(item.courseId) ? item.courseId : null;

    switch (String(item.kind)) {
      case "add_task": {
        const title = str(item.title, 200);
        if (!title) break;
        const dueAt = cleanDate(item.dueAt, ctx.now);
        const p = String(item.priority ?? "medium").toLowerCase() as Priority;
        out.push({
          kind: "add_task",
          title,
          dueAt,
          priority: PRIORITIES.has(p) ? p : "medium",
          notes: str(item.notes, 1000),
          courseId,
          label:
            `Add task “${title}”${dueSuffix(dueAt)}` +
            (courseId ? ` · ${courseName.get(courseId)}` : ""),
        });
        break;
      }
      case "add_course": {
        const name = str(item.name, 120);
        if (!name) break;
        out.push({
          kind: "add_course",
          name,
          code: str(item.code, 40),
          instructor: str(item.instructor, 80),
          label: `Add course “${name}”`,
        });
        break;
      }
      case "add_assignment": {
        const title = str(item.title, 200);
        if (!title || !courseId) break;
        const dueAt = cleanDate(item.dueAt, ctx.now);
        const pts =
          typeof item.pointsPossible === "number" && item.pointsPossible > 0
            ? Math.round(item.pointsPossible)
            : null;
        out.push({
          kind: "add_assignment",
          courseId,
          title,
          dueAt,
          pointsPossible: pts,
          label: `Add assignment “${title}” to ${courseName.get(courseId)}${dueSuffix(dueAt)}`,
        });
        break;
      }
      case "complete_task": {
        if (!openTaskIds.has(id)) break;
        out.push({ kind: "complete_task", id, label: `Mark “${taskTitle.get(id)}” done` });
        break;
      }
      case "delete_task": {
        if (!taskIds.has(id)) break;
        out.push({ kind: "delete_task", id, label: `Delete task “${taskTitle.get(id)}”` });
        break;
      }
      case "delete_course": {
        if (!courseIds.has(id)) break;
        out.push({
          kind: "delete_course",
          id,
          label: `Delete course “${courseName.get(id)}” and its assignments`,
        });
        break;
      }
      case "delete_assignment": {
        if (!assignmentIds.has(id)) break;
        out.push({
          kind: "delete_assignment",
          id,
          label: `Delete assignment “${assignmentTitle.get(id)}”`,
        });
        break;
      }
    }

    if (out.length >= MAX_ACTIONS) break;
  }

  return out;
}
