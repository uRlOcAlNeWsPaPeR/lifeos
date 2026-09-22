"use client";

import { useEffect, useMemo, useState } from "react";
import { Moon, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { HelpButton } from "@/components/ui/help-button";
import { Switch } from "@/components/ui/switch";
import { useAppData } from "@/lib/store/app-data";
import { checkBedtime, fmt12, splitSessions } from "@/lib/scheduling/sleep";
import { toInputDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskDTO } from "@/lib/types";

export interface TaskDraft {
  title: string;
  notes: string;
  priority: string;
  category: string;
  dueAt: string;
  dueTime: string;
  scheduledDate: string;
  scheduledTime: string;
  estimatedMinutes: string;
  recurrence: string;
  respectSleep: boolean;
  goalId: string;
  courseId: string;
}

export function TaskEditor({
  open,
  onClose,
  onSave,
  task,
  goals = [],
  courses = [],
  defaultDueDate,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (draft: TaskDraft) => Promise<void>;
  task?: TaskDTO | null;
  goals?: { id: string; title: string }[];
  courses?: { id: string; name: string }[];
  /** New-task due date, e.g. the day clicked in the calendar. Defaults to today. */
  defaultDueDate?: string;
}) {
  const { data } = useAppData();
  const prefs = data.profile.prefs;
  const [draft, setDraft] = useState<TaskDraft>(blank());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (task) {
      const s = task.scheduledAt ? new Date(task.scheduledAt) : null;
      setDraft({
        title: task.title,
        notes: task.notes ?? "",
        priority: task.priority,
        category: task.category ?? "",
        dueAt: toInputDate(task.dueAt),
        dueTime: task.dueTime ?? "",
        scheduledDate: s ? toInputDate(task.scheduledAt) : "",
        scheduledTime: s ? `${String(s.getHours()).padStart(2, "0")}:${String(s.getMinutes()).padStart(2, "0")}` : "",
        estimatedMinutes: task.estimatedMinutes ? String(task.estimatedMinutes) : "",
        recurrence: task.recurrence ?? "none",
        respectSleep: task.respectSleep ?? true,
        goalId: task.goalId ?? "",
        courseId: task.courseId ?? "",
      });
    } else {
      setDraft(blank(prefs.defaultSessionMin, defaultDueDate));
    }
  }, [open, task, prefs.defaultSessionMin, defaultDueDate]);

  // Sleep-aware check: only when a specific work time + duration are set.
  const bedtime = useMemo(() => {
    if (!draft.scheduledDate || !draft.scheduledTime || !draft.estimatedMinutes) return null;
    const start = new Date(`${draft.scheduledDate}T${draft.scheduledTime}`);
    if (Number.isNaN(start.getTime())) return null;
    return checkBedtime(start, Number(draft.estimatedMinutes), prefs, draft.respectSleep);
  }, [draft.scheduledDate, draft.scheduledTime, draft.estimatedMinutes, draft.respectSleep, prefs]);

  // Planning to start work after the thing is already due is almost always a
  // mistake — flag it instead of silently accepting it.
  const scheduledAfterDue = useMemo(() => {
    if (!draft.scheduledDate || !draft.dueAt) return false;
    const due = new Date(`${draft.dueAt}T${draft.dueTime || "23:59"}`);
    const scheduled = new Date(`${draft.scheduledDate}T${draft.scheduledTime || "09:00"}`);
    if (Number.isNaN(due.getTime()) || Number.isNaN(scheduled.getTime())) return false;
    return scheduled.getTime() > due.getTime();
  }, [draft.scheduledDate, draft.scheduledTime, draft.dueAt, draft.dueTime]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function shiftToTomorrow() {
    if (!draft.scheduledDate) return;
    const d = new Date(`${draft.scheduledDate}T00:00`);
    d.setDate(d.getDate() + 1);
    setDraft({ ...draft, scheduledDate: toInputDate(d.toISOString()) });
  }

  const isEdit = Boolean(task && task.id);
  // Canvas is the source of truth for its own assignments' due dates — a sync
  // would just overwrite a manual change anyway, so don't let it happen here.
  const isCanvasTask = task?.source === "canvas";

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit task" : "New task"}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title">
          <Input
            autoFocus
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="e.g. Finish English essay"
            required
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Priority">
            <Select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </Field>
          <Field label="Subject / category">
            <Input
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              placeholder="Physics"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Due date" hint={isCanvasTask ? "Set by Canvas" : "Blank = no deadline"}>
            <Input
              type="date"
              value={draft.dueAt}
              onChange={(e) => setDraft({ ...draft, dueAt: e.target.value })}
              disabled={isCanvasTask}
            />
          </Field>
          <Field label="Due time">
            <Input
              type="time"
              value={draft.dueTime}
              onChange={(e) => setDraft({ ...draft, dueTime: e.target.value })}
              disabled={isCanvasTask || !draft.dueAt}
            />
          </Field>
          <Field label="Est. time (min)" hint="Used for planning">
            <Input
              type="number"
              min={0}
              step={5}
              value={draft.estimatedMinutes}
              onChange={(e) => setDraft({ ...draft, estimatedMinutes: e.target.value })}
              placeholder="45"
            />
          </Field>
        </div>

        {/* When to work on it */}
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Moon className="h-3.5 w-3.5 text-primary" /> When do you want to work on it?
            <span className="text-muted-foreground/70">(optional)</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              type="date"
              value={draft.scheduledDate}
              onChange={(e) => setDraft({ ...draft, scheduledDate: e.target.value })}
            />
            <Input
              type="time"
              value={draft.scheduledTime}
              onChange={(e) => setDraft({ ...draft, scheduledTime: e.target.value })}
              disabled={!draft.scheduledDate}
            />
          </div>

          {scheduledAfterDue && (
            <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs animate-scale-in">
              <p className="flex items-center gap-1.5 font-medium text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> This is planned after the due date
              </p>
              <p className="mt-1 text-muted-foreground">
                You&apos;d be starting this after it&apos;s already due.{" "}
                {isCanvasTask
                  ? "Pick an earlier time to work on it — the due date is set by Canvas."
                  : "Push the due date out, or pick an earlier time to work on it."}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {!isCanvasTask && (
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({ ...draft, dueAt: draft.scheduledDate, dueTime: draft.scheduledTime })
                    }
                    className="rounded-md border border-white/10 px-2 py-1 font-medium hover:border-primary/40 hover:text-primary"
                  >
                    Move due date to match
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, scheduledDate: "", scheduledTime: "" })}
                  className="rounded-md border border-white/10 px-2 py-1 font-medium text-muted-foreground hover:border-white/25 hover:text-foreground"
                >
                  Clear planned time
                </button>
              </div>
            </div>
          )}

          {/* A plain <div>, not <label> — a <label> forwards clicks to whichever
              labelable descendant the browser picks, which fires the switch from
              clicks meant for Help (and vice versa). */}
          <div className="mt-3 flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0">Respect my sleep schedule</span>
              <HelpButton>
                <p className="font-medium text-foreground">Why does LifeOS need this?</p>
                <p className="mt-1">
                  Your desired sleep is a <em>scheduling preference</em>. LifeOS tries not to plan
                  normal work past your bedtime ({fmt12(prefs.bedtime)}).
                </p>
                <p className="mt-1">
                  It never stops you working later — turn this off for this task, or pick
                  “Work past bedtime anyway” if a warning shows.
                </p>
              </HelpButton>
            </span>
            <Switch
              checked={draft.respectSleep}
              onChange={(v) => setDraft({ ...draft, respectSleep: v })}
              label="Respect my sleep schedule"
            />
          </div>

          {bedtime?.conflict && (
            <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs animate-scale-in">
              <p className="flex items-center gap-1.5 font-medium text-warning">
                <AlertTriangle className="h-3.5 w-3.5" /> Not enough time before your bedtime
              </p>
              <p className="mt-1 text-muted-foreground">
                This needs about {bedtime.neededMin} min, but you only have{" "}
                {bedtime.availableMin} min before {fmt12(prefs.bedtime)}.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={shiftToTomorrow}
                  className="rounded-md border border-white/10 px-2 py-1 font-medium hover:border-primary/40 hover:text-primary"
                >
                  Schedule tomorrow
                </button>
                {bedtime.availableMin >= 15 && (
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({ ...draft, estimatedMinutes: String(bedtime.availableMin) })
                    }
                    className="rounded-md border border-white/10 px-2 py-1 font-medium hover:border-primary/40 hover:text-primary"
                  >
                    Do {bedtime.availableMin} min tonight
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, scheduledTime: "" })}
                  className="rounded-md border border-white/10 px-2 py-1 font-medium hover:border-primary/40 hover:text-primary"
                >
                  Pick another time
                </button>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, respectSleep: false })}
                  className="rounded-md border border-white/10 px-2 py-1 font-medium text-muted-foreground hover:border-white/25 hover:text-foreground"
                >
                  Work past bedtime anyway
                </button>
              </div>
              {Number(draft.estimatedMinutes) > 50 && (
                <p className="mt-2 text-[11px] text-muted-foreground/80">
                  Tip: this could be {splitSessions(Number(draft.estimatedMinutes)).map((m) => `${m}m`).join(" + ")} across sessions.
                </p>
              )}
            </div>
          )}
          {bedtime && !bedtime.conflict && draft.scheduledTime && (
            <p className="mt-2 text-[11px] text-primary/80">
              Fits before bedtime — ends around{" "}
              {bedtime.endsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Repeats">
            <Select value={draft.recurrence} onChange={(e) => setDraft({ ...draft, recurrence: e.target.value })}>
              <option value="none">Doesn&apos;t repeat</option>
              <option value="daily">Every day</option>
              <option value="weekdays">Every weekday</option>
              <option value="weekly">Every week</option>
            </Select>
          </Field>
          {courses.length > 0 && (
            <Field label="Linked subject">
              <Select value={draft.courseId} onChange={(e) => setDraft({ ...draft, courseId: e.target.value })}>
                <option value="">None</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {goals.length > 0 && (
          <Field label="Linked goal">
            <Select value={draft.goalId} onChange={(e) => setDraft({ ...draft, goalId: e.target.value })}>
              <option value="">None</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Notes">
          <Textarea
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            rows={2}
            placeholder="Anything you want to remember…"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? "Save changes" : "Add task"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function blank(defaultMin = 45, defaultDueDate?: string): TaskDraft {
  return {
    title: "",
    notes: "",
    priority: "medium",
    category: "",
    // Defaults to today (or the caller's chosen date, e.g. the day clicked
    // in the calendar) so a freshly created task shows up on the calendar
    // right away instead of vanishing until you pick a date yourself.
    dueAt: defaultDueDate ?? toInputDate(new Date()),
    dueTime: "",
    scheduledDate: "",
    scheduledTime: "",
    estimatedMinutes: String(defaultMin),
    recurrence: "none",
    respectSleep: true,
    goalId: "",
    courseId: "",
  };
}

export function draftToPayload(d: TaskDraft) {
  const scheduledAt =
    d.scheduledDate && d.scheduledTime
      ? new Date(`${d.scheduledDate}T${d.scheduledTime}`).toISOString()
      : d.scheduledDate
        ? new Date(`${d.scheduledDate}T09:00`).toISOString()
        : null;
  return {
    title: d.title.trim(),
    notes: d.notes.trim() || null,
    priority: d.priority,
    category: d.category.trim() || null,
    dueAt: d.dueAt || null,
    dueTime: d.dueTime || null,
    scheduledAt,
    respectSleep: d.respectSleep,
    recurrence: d.recurrence,
    estimatedMinutes: d.estimatedMinutes ? Number(d.estimatedMinutes) : null,
    goalId: d.goalId || null,
    courseId: d.courseId || null,
  };
}
