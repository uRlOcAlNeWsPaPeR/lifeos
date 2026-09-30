"use client";

import { useMemo, useState } from "react";
import { Check, Clock, CalendarClock, CalendarPlus, Pencil, Trash2, Plus, ListChecks } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge, priorityTone } from "@/components/ui/badge";
import { confirm } from "@/components/ui/confirm";
import { TaskEditor, draftToPayload, type TaskDraft } from "@/components/app/task-editor";
import { CanvasBadge, OpenInCanvas } from "@/components/canvas/canvas-badge";
import { useAppData } from "@/lib/store/app-data";
import { fmtDate, fmtTime, fmtDuration, relativeDue, hasTime } from "@/lib/format";
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
  const { data, addTask, updateTask, toggleTask, deleteTask, updateAssignment } = useAppData();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  // Canvas owns its assignments — each sync would overwrite an edit here.
  // Everything else (screenshot / Infinite Campus imports, manual) is ours.
  const editable = !!assignment && assignment.provider !== "canvas";

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

  // Finishing the plan and finishing the assignment aren't the same thing —
  // ask, instead of assuming, and only for Canvas assignments (a manually
  // added one has no separate "done" signal worth double-checking).
  async function toggleLinkedTask() {
    if (!linked || !assignment) return;
    const completing = linked.status !== "done";
    await toggleTask(linked.id);
    if (completing && assignment.provider === "canvas" && !assignment.localDone) {
      const yes = await confirm({
        title: "Mark the assignment done too?",
        body: `"${assignment.title}" will show as done in LifeOS. This doesn't submit or change anything on Canvas.`,
        confirmLabel: "Mark done",
        cancelLabel: "Not yet",
      });
      if (yes) await updateAssignment(assignment.id, { localDone: true });
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
              <Badge tone={assignment.status !== "open" ? "success" : assignment.localDone ? "primary" : "muted"}>
                {assignment.status !== "open"
                  ? STATUS_LABEL[assignment.status]
                  : assignment.localDone
                    ? "Done"
                    : STATUS_LABEL.open}
              </Badge>
              {assignment.status === "graded" && assignment.gradeValue && (
                <Badge tone="primary">{assignment.gradeValue}</Badge>
              )}
            </div>

            {editable && !editingDetails && (
              <Button size="sm" variant="outline" onClick={() => setEditingDetails(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit assignment
              </Button>
            )}
            {editable && editingDetails && (
              <AssignmentDetailsForm
                key={assignment.id}
                assignment={assignment}
                onCancel={() => setEditingDetails(false)}
                onSave={async (patch) => {
                  await updateAssignment(assignment.id, patch);
                  setEditingDetails(false);
                }}
              />
            )}

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
                {assignment.dueAt
                  ? `Due ${fmtDate(assignment.dueAt, { weekday: "short", month: "short", day: "numeric" })}${
                      hasTime(assignment.dueAt)
                        ? ` · ${fmtTime(assignment.dueAt)}`
                        : ""
                    }`
                  : "No due date"}
              </span>
              {due && assignment.status === "open" && !assignment.localDone && (
                <Badge tone={due.tone}>{due.label}</Badge>
              )}
            </div>

            {assignment.createdAt && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70">
                <CalendarPlus className="h-3.5 w-3.5" />
                Created {fmtDate(assignment.createdAt, { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}

            {assignment.status === "open" && (
              <div>
                <Button
                  size="sm"
                  variant={assignment.localDone ? "outline" : "primary"}
                  onClick={() => updateAssignment(assignment.id, { localDone: !assignment.localDone })}
                >
                  <Check className="h-3.5 w-3.5" />
                  {assignment.localDone ? "Marked done — undo" : "Mark as done"}
                </Button>
                {assignment.localDone && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                    Shows as done in LifeOS. It stays that way through Canvas syncs — this
                    updates automatically to &quot;Turned in&quot; once Canvas shows you actually
                    submitted it.
                  </p>
                )}
              </div>
            )}

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
                      onClick={toggleLinkedTask}
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

/** "YYYY-MM-DD" for a date input, whether dueAt is a bare date or a full ISO time. */
function dateInputValue(dueAt: string | null): string {
  if (!dueAt) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) return dueAt;
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

/** Keep a stored due time when only the day changes; bare dates stay bare. */
function withNewDate(prev: string | null, day: string): string | null {
  if (!day) return null;
  if (!prev || /^\d{4}-\d{2}-\d{2}$/.test(prev)) return day;
  const old = new Date(prev);
  if (Number.isNaN(old.getTime())) return day;
  const [y, m, d] = day.split("-").map(Number);
  const next = new Date(old);
  next.setFullYear(y, m - 1, d);
  return next.toISOString();
}

const num = (v: string): number | null => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Full edit for an assignment LifeOS owns (screenshot / Infinite Campus
 * import, or added by hand): name, due date, status, score and notes.
 */
function AssignmentDetailsForm({
  assignment,
  onSave,
  onCancel,
}: {
  assignment: AssignmentDTO;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(assignment.title);
  const [day, setDay] = useState(dateInputValue(assignment.dueAt));
  const [status, setStatus] = useState<AssignmentDTO["status"]>(assignment.status);
  const [earned, setEarned] = useState(assignment.pointsEarned?.toString() ?? "");
  const [possible, setPossible] = useState(assignment.pointsPossible?.toString() ?? "");
  const [gradeValue, setGradeValue] = useState(assignment.gradeValue ?? "");
  const [notes, setNotes] = useState(assignment.description ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        dueAt: withNewDate(assignment.dueAt, day),
        status,
        statusByUser: true,
        pointsEarned: num(earned),
        pointsPossible: num(possible),
        gradeValue: gradeValue.trim() || null,
        description: notes.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
      <Field label="Name">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Due date">
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as AssignmentDTO["status"])}>
            <option value="open">Open</option>
            <option value="submitted">Submitted</option>
            <option value="graded">Graded</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-3">
        <Field label="Points earned">
          <Input inputMode="decimal" value={earned} onChange={(e) => setEarned(e.target.value)} placeholder="—" />
        </Field>
        <Field label="Out of">
          <Input inputMode="decimal" value={possible} onChange={(e) => setPossible(e.target.value)} placeholder="—" />
        </Field>
        <Field label="Or grade">
          <Input value={gradeValue} onChange={(e) => setGradeValue(e.target.value)} placeholder="A-, 92%" maxLength={20} />
        </Field>
      </div>
      {status !== "graded" && (earned || gradeValue) && (
        <p className="text-xs text-muted-foreground">
          The score is kept but won&apos;t count toward your grade until this is Graded.
        </p>
      )}
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1500} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} loading={saving} disabled={!title.trim()}>
          Save
        </Button>
      </div>
    </div>
  );
}
