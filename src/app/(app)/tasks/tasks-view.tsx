"use client";

import { useMemo, useState } from "react";
import { Plus, ListChecks, Clock, Flame } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { TaskItem } from "@/components/app/task-item";
import { TaskEditor, draftToPayload, type TaskDraft } from "@/components/app/task-editor";
import { useAppData } from "@/lib/store/app-data";
import { fmtDuration, parseDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskDTO } from "@/lib/types";

type Tab = "today" | "upcoming" | "completed" | "all";

export function TasksView() {
  const { data, addTask, updateTask, toggleTask, deleteTask, reorderTasks } = useAppData();
  const [tab, setTab] = useState<Tab>("today");
  const [editing, setEditing] = useState<TaskDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const goals = useMemo(
    () => data.goals.filter((g) => g.status === "active").map((g) => ({ id: g.id, title: g.title })),
    [data.goals],
  );
  const courses = useMemo(
    () => data.courses.map((c) => ({ id: c.id, name: c.name })),
    [data.courses],
  );

  const buckets = useMemo(() => {
    const eod = new Date();
    eod.setHours(23, 59, 59, 999);
    const sorted = [...data.tasks].sort(
      (a, b) => a.sortOrder - b.sortOrder || (a.dueAt ?? "z").localeCompare(b.dueAt ?? "z"),
    );
    const open = sorted.filter((t) => t.status === "todo");
    return {
      today: open.filter((t) => t.dueAt && parseDate(t.dueAt) <= eod),
      upcoming: open.filter((t) => !t.dueAt || parseDate(t.dueAt) > eod),
      completed: sorted
        .filter((t) => t.status === "done")
        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
      all: open,
    };
  }, [data.tasks]);

  const list = buckets[tab];

  const openTasks = buckets.all;
  const totalMinutes = openTasks.reduce((n, t) => n + (t.estimatedMinutes ?? 0), 0);
  const overdue = openTasks.filter((t) => t.dueAt && parseDate(t.dueAt) < new Date()).length;

  async function save(draft: TaskDraft) {
    const payload = draftToPayload(draft);
    if (editing) await updateTask(editing.id, payload);
    else await addTask({ ...payload, title: payload.title });
  }

  async function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ordered = [...list];
    const from = ordered.findIndex((t) => t.id === dragId);
    const to = ordered.findIndex((t) => t.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    setDragId(null);
    await reorderTasks(ordered.map((t) => t.id));
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "today", label: "Today", count: buckets.today.length },
    { id: "upcoming", label: "Upcoming", count: buckets.upcoming.length },
    { id: "all", label: "All open", count: buckets.all.length },
    { id: "completed", label: "Completed", count: buckets.completed.length },
  ];

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Everything you need to do, prioritized and organized."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New task
          </Button>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatChip icon={ListChecks} label="Open tasks" value={openTasks.length} />
        <StatChip icon={Clock} label="Estimated work" value={fmtDuration(totalMinutes) || "0m"} />
        <StatChip
          icon={Flame}
          label="Overdue"
          value={overdue}
          tone={overdue > 0 ? "warn" : "ok"}
        />
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-white/[0.07] bg-card/60 p-1.5 backdrop-blur-xl">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200",
              tab === t.id
                ? "bg-gradient-to-r from-primary/25 to-primary/5 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--glow)/0.3)]"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
            )}
          >
            {t.label}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs",
                tab === t.id ? "bg-primary/25 text-primary" : "bg-white/[0.06]",
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={tab === "completed" ? "Nothing completed yet" : "No tasks here"}
          description={
            tab === "today"
              ? "Nothing due today. Check Upcoming or add something new."
              : "Add a task, or run a Brain Dump to capture everything at once."
          }
          action={
            tab !== "completed" && (
              <Button onClick={() => setCreating(true)} size="sm">
                <Plus className="h-4 w-4" /> New task
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2.5">
          {list.map((task) => (
            <div
              key={task.id}
              draggable={tab !== "completed"}
              onDragStart={() => setDragId(task.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(task.id)}
              className={cn("transition-opacity", dragId === task.id && "opacity-40")}
            >
              <TaskItem
                task={task}
                onToggle={(t) => toggleTask(t.id)}
                onEdit={setEditing}
                onDelete={(t) => deleteTask(t.id)}
                draggable={tab !== "completed"}
              />
            </div>
          ))}
        </div>
      )}

      <TaskEditor
        open={creating || !!editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSave={save}
        task={editing}
        goals={goals}
        courses={courses}
      />
    </>
  );
}

function StatChip({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  tone?: "default" | "warn" | "ok";
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl border",
          tone === "warn"
            ? "border-warning/30 bg-warning/10 text-warning"
            : "border-white/10 bg-white/[0.04] text-primary",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}
