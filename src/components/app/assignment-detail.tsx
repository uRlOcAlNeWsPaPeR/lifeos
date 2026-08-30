"use client";

import { useMemo, useState } from "react";
import { Check, Clock, CalendarClock, Pencil, Trash2, Plus, ListChecks } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge, priorityTone } from "@/components/ui/badge";
import { TaskEditor, draftToPayload, type TaskDraft } from "@/components/app/task-editor";
import { CanvasBadge, OpenInCanvas } from "@/components/canvas/canvas-badge";
import { useAppData } from "@/lib/store/app-data";
import { fmtDate, fmtTime, fmtDuration, relativeDue } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AssignmentDTO, TaskDTO } from "@/lib/types";

const STATUS_LABEL: Record<AssignmentDTO["status"], string> = {
  open: "Not turned in",
  submitted: "Turned in",
  graded: "Graded",
};

/**
 * The assignment as the primary school item. Its optional "planning task"
 * (estimate / when to work / notes / done-state) lives here — there's no separate
 * to-do in the task list mirroring it.
 */
export function AssignmentDetail({
  assignment,
  onClose,
}: {
  assignment: AssignmentDTO | null;
  onClose: () => void;
}) {
  const { data, addTask, updateTask, toggleTask, deleteTask } = useAppData();
  const [editorOpen, setEditorOpen] = useState(false);

  const goals = useMemo(
    () => data.goals.filter((g) => g.status === "active").map((g) => ({ id: g.id, title: g.title })),
    [data.goals],
  );
  const courses = useMemo(() => data.courses.map((c) => ({ id: c.id, name: c.name })), [data.courses]);

  const linked = assignment?.linkedTask ?? null;
  const fullTask = linked ? data.allTasks.find((t) => t.id === linked.id) ?? null : null;
  const due = relativeDue(assignment?.dueAt);

  // Prefill for a brand-new planning task (TaskEditor treats any truthy `task` as edit).
  const draftSeed: TaskDTO | null = assignment
    ? {
        id: "",
        title: assignment.title,
        notes: null,
        status: "todo",
        priority: "high",
        category: null,
        dueAt: assignment.dueAt,
        estimatedMinutes: null,
        completedAt: null,
        sortOrder: 0,
        source: "canvas",
        goalId: null,
        courseId: assignment.courseId,
        assignmentId: assignment.id,
        dueTime: null,
        scheduledAt: null,
        respectSleep: true,
        recurrence: "none",
      }
    : null;

  async function saveTask(draft: TaskDraft) {
    const payload = draftToPayload(draft);
    if (fullTask) {
      await updateTask(fullTask.id, payload);
    } else if (assignment) {
      await addTask({
        ...payload,
        assignmentId: assignment.id,
        courseId: payload.courseId ?? assignment.courseId ?? null,
        source: assignment.provider === "canvas" ? "canvas" : "assignment",
      });
    }
  }

  return (
    <>
      <Modal open={!!assignment && !editorOpen} onClose={onClose} title={assignment?.title}>
        {assignment && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {assignment.course && (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: assignment.course.color }}
                  />
                  {assignment.course.name}
                </span>
              )}
              {assignment.provider === "canvas" && <CanvasBadge />}
              <Badge tone={assignment.status === "open" ? "muted" : "success"}>
                {STATUS_LABEL[assignment.status]}
              </Badge>
              {assignment.status === "graded" && assignment.gradeValue && (
                <Badge tone="primary">{assignment.gradeValue}</Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
                {assignment.dueAt
                  ? `Due ${fmtDate(assignment.dueAt, { weekday: "short", month: "short", day: "numeric" })}${
                      new Date(assignment.dueAt).getHours() !== 0
                        ? ` · ${fmtTime(assignment.dueAt)}`
                        : ""
                    }`
                  : "No due date"}
              </span>
              {due && assignment.status === "open" && <Badge tone={due.tone}>{due.label}</Badge>}
            </div>

            {assignment.description && (
              <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-sm text-muted-foreground scrollbar-thin">
                {assignment.description}
              </p>
            )}

            {assignment.canvasUrl && <OpenInCanvas url={assignment.canvasUrl} />}

            <div className="border-t border-white/[0.07] pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Your plan for this
              </p>

              {linked ? (
                <div className="space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleTask(linked.id)}
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all active:scale-90",
                        linked.status === "done"
                          ? "border-primary bg-gradient-brand text-primary-foreground"
                          : "border-white/20 hover:border-primary hover:bg-primary/10",
                      )}
                      aria-label={linked.status === "done" ? "Mark not done" : "Mark done"}
                    >
                      {linked.status === "done" && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm", linked.status === "done" && "text-muted-foreground line-through")}>
                        {linked.status === "done" ? "Done — you've handled this" : "Marked to do"}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <Badge tone={priorityTone(linked.priority)} className="capitalize">
                          {linked.priority}
                        </Badge>
                        {linked.estimatedMinutes ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {fmtDuration(linked.estimatedMinutes)}
                          </span>
                        ) : null}
                        {linked.scheduledAt && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" />
                            {fmtDate(linked.scheduledAt, { month: "short", day: "numeric" })} ·{" "}
                            {fmtTime(linked.scheduledAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {linked.notes && (
                    <p className="whitespace-pre-wrap border-t border-white/[0.06] pt-2.5 text-sm text-muted-foreground">
                      {linked.notes}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditorOpen(true)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await deleteTask(linked.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove task
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 p-4 text-center">
                  <ListChecks className="mx-auto mb-1.5 h-5 w-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Add a task to estimate the work, schedule time for it, or jot notes.
                  </p>
                  <Button size="sm" className="mt-2.5" onClick={() => setEditorOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Add task
                  </Button>
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground/70">
                Marking this done means you&apos;ve done the work in LifeOS — it doesn&apos;t
                submit anything to Canvas.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {assignment && (
        <TaskEditor
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          onSave={saveTask}
          task={fullTask ?? draftSeed}
          goals={goals}
          courses={courses}
        />
      )}
    </>
  );
}
