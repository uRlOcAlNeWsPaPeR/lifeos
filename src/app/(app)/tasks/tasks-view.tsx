"use client";

import { useMemo, useState } from "react";
import { Plus, ListChecks, Clock, Flame, CalendarClock, CalendarX2 } from "lucide-react";
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

type Group = "planned" | "unplanned";
type Tab = "today" | "upcoming" | "completed" | "all";

export function TasksView() {
  const { data, addTask, updateTask, toggleTask, deleteTask, reorderTasks } = useAppData();
  const [group, setGroup] = useState<Group>("planned");
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

  // `allTasks` (not the narrower `tasks`) so a task created anywhere in the
  // app — including an assignment's own "planning task" over on School, which
  // `tasks` deliberately hides everywhere else to avoid double-counting
  // against its assignment — still shows up here. This is the one place
  // meant to be the complete, unfiltered list of everything to do.
  const sortedAll = useMemo(
    () =>
      [...data.allTasks].sort(
        (a, b) => a.sortOrder - b.sortOrder || (a.dueAt ?? "z").localeCompare(b.dueAt ?? "z"),
      ),
    [data.allTasks],
  );

  // Planned = has a "work on it at" time (scheduledAt); everything else is
  // unplanned. That split is the top-level nav; Today/Upcoming/All/Completed
  // then slice whichever group is selected.
  const { plannedAll, unplannedAll } = useMemo(
    () => ({
      plannedAll: sortedAll
        .filter((t) => t.scheduledAt)
        .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? "")),
      unplannedAll: sortedAll.filter((t) => !t.scheduledAt),
    }),
    [sortedAll],
  );

  const groupTasks = group === "planned" ? plannedAll : unplannedAll;

  const buckets = useMemo(() => {
    const eod = new Date();
    eod.setHours(23, 59, 59, 999);
    const open = groupTasks.filter((t) => t.status === "todo");
    const completed = groupTasks
      .filter((t) => t.status === "done")
      .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    // Planned tasks are sliced by *when you planned to work on them*, not
    // their due date — a task planned for today with no separate due date is
    // still today's task, not "upcoming". Unplanned tasks have no scheduledAt
    // at all, so they keep the old due-date split.
    if (group === "planned") {
      return {
        today: open.filter((t) => t.scheduledAt && new Date(t.scheduledAt) <= eod),
        upcoming: open.filter((t) => t.scheduledAt && new Date(t.scheduledAt) > eod),
        completed,
        all: open,
      };
    }
    return {
      today: open.filter((t) => t.dueAt && parseDate(t.dueAt) <= eod),
      upcoming: open.filter((t) => !t.dueAt || parseDate(t.dueAt) > eod),
      completed,
      all: open,
    };
  }, [groupTasks, group]);

  const list = buckets[tab];

  // Page-level stats stay global — switching Planned/Unplanned shouldn't
  // change your sense of total workload or what's overdue.
  const allOpen = sortedAll.filter((t) => t.status === "todo");
  const totalMinutes = allOpen.reduce((n, t) => n + (t.estimatedMinutes ?? 0), 0);
  const overdue = allOpen.filter((t) => t.dueAt && parseDate(t.dueAt) < new Date()).length;

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
    setDragId(null);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    await reorderTasks(ordered.map((t) => t.id));
  }

  const groups: { id: Group; label: string; icon: React.ComponentType<{ className?: string }>; count: number }[] = [
    { id: "planned", label: "Planned", icon: CalendarClock, count: plannedAll.filter((t) => t.status === "todo").length },
    { id: "unplanned", label: "Unplanned", icon: CalendarX2, count: unplannedAll.filter((t) => t.status === "todo").length },
  ];

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
        <StatChip icon={ListChecks} label="Open tasks" value={allOpen.length} />
        <StatChip icon={Clock} label="Estimated work" value={fmtDuration(totalMinutes) || "0m"} />
        <StatChip
          icon={Flame}
          label="Overdue"
          value={overdue}
          tone={overdue > 0 ? "warn" : "ok"}
        />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => {
              setGroup(g.id);
              setTab("today");
            }}
            className={cn(
              "flex items-center gap-2.5 rounded-2xl border p-3.5 text-left transition-all duration-200",
              group === g.id
                ? "border-primary/40 bg-gradient-to-r from-primary/20 to-primary/5 shadow-[inset_0_0_0_1px_hsl(var(--glow)/0.3)]"
                : "border-white/[0.07] bg-card/60 hover:border-white/15",
            )}
          >
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                group === g.id ? "bg-primary/20 text-primary" : "bg-white/[0.05] text-muted-foreground",
              )}
            >
              <g.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{g.label}</p>
              <p className="text-xs text-muted-foreground">
                {g.count} open task{g.count === 1 ? "" : "s"}
              </p>
            </div>
          </button>
        ))}
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
          icon={group === "planned" ? CalendarClock : ListChecks}
          title={tab === "completed" ? "Nothing completed yet" : "No tasks here"}
          description={
            group === "planned"
              ? tab === "today"
                ? "Nothing planned for today. Set a time on a task to see it here."
                : "Nothing planned yet. Set a \"work on it at\" time on a task's editor to see it here."
              : tab === "today"
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
                onRestore={(t) => toggleTask(t.id)}
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
