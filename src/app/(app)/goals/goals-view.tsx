"use client";

import { useState } from "react";
import { Plus, Target, Check, Trash2, Flame, CalendarDays, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress, Ring } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useAppData } from "@/lib/store/app-data";
import { goalProgress } from "@/lib/analytics-derive";
import { fmtDate, relativeDue } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { GoalDTO } from "@/lib/types";

export function GoalsView() {
  const { data, addGoal, updateGoal, deleteGoal, goalAction, toggleMilestone } = useAppData();
  const [creating, setCreating] = useState(false);

  const goals = data.goals;
  const active = goals.filter((g) => g.status === "active");
  const achieved = goals.filter((g) => g.status === "achieved");

  const handlers = { updateGoal, deleteGoal, goalAction, toggleMilestone };

  return (
    <>
      <PageHeader
        title="Goals"
        description="Bigger targets, broken into milestones and habits — with the tasks that move them forward."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New goal
          </Button>
        }
      />

      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No goals yet"
          description="Add a goal like “Get an A in Physics” or “Practice guitar 4× a week.”"
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New goal
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
            {active.map((g) => (
              <GoalCard key={g.id} goal={g} {...handlers} />
            ))}
          </div>

          {achieved.length > 0 && (
            <div>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Achieved
              </h2>
              <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                {achieved.map((g) => (
                  <GoalCard key={g.id} goal={g} {...handlers} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <GoalEditor open={creating} onClose={() => setCreating(false)} onCreate={addGoal} />
    </>
  );
}

function GoalCard({
  goal,
  updateGoal,
  deleteGoal,
  goalAction,
  toggleMilestone,
}: {
  goal: GoalDTO;
  updateGoal: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  goalAction: (id: string, body: { action: string; title?: string }) => Promise<void>;
  toggleMilestone: (goalId: string, milestoneId: string, done: boolean) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [newMilestone, setNewMilestone] = useState("");

  const weekLogs = goal.habitLogs.filter(
    (l) => new Date(l.date) >= new Date(Date.now() - 7 * 864e5),
  ).length;
  const isHabit = goal.targetType === "habit" && goal.habitPerWeek;
  const pct = isHabit ? Math.round((weekLogs / goal.habitPerWeek!) * 100) : goalProgress(goal);
  const due = relativeDue(goal.dueAt);

  return (
    <Card className="flex flex-col p-6">
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <Ring value={pct} size={60} />
          <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold">
            {pct}%
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium leading-tight">{goal.title}</p>
            <button
              onClick={() => deleteGoal(goal.id)}
              className="-m-2 p-2 text-muted-foreground transition-colors hover:text-destructive"
              aria-label="Delete goal"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {goal.category && <Badge tone="muted">{goal.category}</Badge>}
            {isHabit ? (
              <Badge tone="primary">
                <Flame className="h-3 w-3" /> {weekLogs}/{goal.habitPerWeek} this week
              </Badge>
            ) : (
              <Badge tone="muted">
                {goal.milestones.filter((m) => m.done).length}/{goal.milestones.length} milestones
              </Badge>
            )}
            {due && (
              <Badge tone={due.tone}>
                <CalendarDays className="h-3 w-3" /> {due.label}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {goal.description && <p className="mt-3 text-sm text-muted-foreground">{goal.description}</p>}

      <div className="mt-4">
        <Progress value={pct} tone={pct >= 100 ? "success" : "primary"} />
      </div>

      {isHabit && goal.status === "active" && (
        <Button
          size="sm"
          variant="outline"
          className="mt-4 self-start"
          onClick={() => goalAction(goal.id, { action: "log-habit" })}
        >
          <Check className="h-4 w-4" /> Log today
        </Button>
      )}

      <button
        onClick={() => setExpanded((e) => !e)}
        className="mt-4 flex items-center gap-1 text-xs font-medium text-primary"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
        {expanded ? "Hide details" : "Milestones & tasks"}
      </button>

      {expanded && (
        <div className="mt-4 space-y-5 border-t border-white/[0.07] pt-4 animate-slide-up">
          {!isHabit && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Milestones
              </p>
              <ul className="space-y-2">
                {goal.milestones.map((m) => (
                  <li key={m.id} className="flex items-center gap-2.5 text-sm">
                    <button
                      onClick={() => toggleMilestone(goal.id, m.id, !m.done)}
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all active:scale-90",
                        m.done
                          ? "border-primary bg-gradient-brand text-primary-foreground"
                          : "border-white/20 hover:border-primary",
                      )}
                    >
                      {m.done && <Check className="h-3 w-3" strokeWidth={3} />}
                    </button>
                    <span className={cn(m.done && "text-muted-foreground line-through")}>{m.title}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <Input
                  className="h-9 text-sm"
                  placeholder="Add a milestone"
                  value={newMilestone}
                  onChange={(e) => setNewMilestone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newMilestone.trim()) {
                      goalAction(goal.id, { action: "add-milestone", title: newMilestone.trim() });
                      setNewMilestone("");
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (newMilestone.trim()) {
                      goalAction(goal.id, { action: "add-milestone", title: newMilestone.trim() });
                      setNewMilestone("");
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Related tasks
            </p>
            {goal.tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Link tasks to this goal from the task editor.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {goal.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between">
                    <span className={cn(t.status === "done" && "text-muted-foreground line-through")}>
                      {t.title}
                    </span>
                    {t.dueAt && (
                      <span className="text-xs text-muted-foreground">{fmtDate(t.dueAt)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-2">
            {goal.status === "active" ? (
              <Button size="sm" variant="outline" onClick={() => updateGoal(goal.id, { status: "achieved" })}>
                Mark achieved
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => updateGoal(goal.id, { status: "active" })}>
                Reopen
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function GoalEditor({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: Record<string, unknown>) => Promise<GoalDTO | undefined>;
}) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    targetType: "milestone",
    habitPerWeek: "4",
    dueAt: "",
    milestones: "",
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const res = await onCreate({
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      targetType: form.targetType,
      habitPerWeek: form.targetType === "habit" ? Number(form.habitPerWeek) : null,
      dueAt: form.dueAt || null,
      milestones:
        form.targetType === "milestone"
          ? form.milestones.split("\n").map((m) => m.trim()).filter(Boolean)
          : [],
    });
    setSaving(false);
    if (res) {
      onClose();
      setForm({
        title: "",
        description: "",
        category: "",
        targetType: "milestone",
        habitPerWeek: "4",
        dueAt: "",
        milestones: "",
      });
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New goal">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Goal">
          <Input
            autoFocus
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Get an A in Physics"
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })}>
              <option value="milestone">Milestone goal</option>
              <option value="habit">Weekly habit</option>
            </Select>
          </Field>
          {form.targetType === "habit" ? (
            <Field label="Times per week">
              <Input
                type="number"
                min={1}
                max={21}
                value={form.habitPerWeek}
                onChange={(e) => setForm({ ...form, habitPerWeek: e.target.value })}
              />
            </Field>
          ) : (
            <Field label="Target date (optional)">
              <Input
                type="date"
                value={form.dueAt}
                onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
              />
            </Field>
          )}
        </div>
        <Field label="Category (optional)">
          <Input
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="Physics"
          />
        </Field>
        {form.targetType === "milestone" && (
          <Field label="Milestones (one per line)">
            <Textarea
              rows={3}
              value={form.milestones}
              onChange={(e) => setForm({ ...form, milestones: e.target.value })}
              placeholder={"Raise quiz average to 90%\nFinish all labs on time\nAce the midterm"}
            />
          </Field>
        )}
        <Field label="Notes (optional)">
          <Textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Create goal
          </Button>
        </div>
      </form>
    </Modal>
  );
}
