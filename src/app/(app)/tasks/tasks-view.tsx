"use client";

import { useMemo, useState } from "react";
import { Plus, ListChecks, Clock, Flame, CalendarClock, CalendarX2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { StatStrip, StatItem } from "@/components/ui/stat-strip";
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

  // "All open" reads better grouped by when — Linear/Todoist-style sections —
  // using the same date each group already sorts by (planned → when you'll
  // work on it, unplanned → when it's due). Every other tab is one flat list.
  // Order within a section is the list's own order, so drag-reorder still
  // works the same.
  const sections = useMemo(() => {
    if (tab !== "all") return [{ key: "flat", label: null as string | null, tasks: list }];
    const now = new Date();
    const eod = new Date(now);
    eod.setHours(23, 59, 59, 999);
    const eow = new Date(eod);
    eow.setDate(eow.getDate() + 6);
    const defs = [
      { key: "overdue", label: "Overdue" },
      { key: "today", label: "Today" },
      { key: "week", label: "Next 7 days" },
      { key: "later", label: "Later" },
      { key: "none", label: "No date" },
    ];
    const byKey = new Map<string, TaskDTO[]>(defs.map((d) => [d.key, []]));
    for (const t of list) {
      const raw = group === "planned" ? t.scheduledAt : t.dueAt;
      const when = raw ? (group === "planned" ? new Date(raw) : parseDate(raw)) : null;
      const key = !when
        ? "none"
        : group === "unplanned" && when < now
          ? "overdue"
          : when <= eod
            ? "today"
            : when <= eow
              ? "week"
              : "later";
      byKey.get(key)!.push(t);
    }
    return defs
      .map((d) => ({ key: d.key, label: d.label as string | null, tasks: byKey.get(d.key)! }))
      .filter((d) => d.tasks.length > 0);
  }, [tab, list, group]);

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

      <StatStrip className="mb-6 grid-cols-3">
        <StatItem compact icon={ListChecks} label="Open" value={allOpen.length} />
        <StatItem compact icon={Clock} label="Est. work" value={fmtDuration(totalMinutes) || "0m"} />
        <StatItem
          compact
          icon={Flame}
          label="Overdue"
          value={overdue}
          tone={overdue > 0 ? "warning" : "default"}
        />
      </StatStrip>

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div
          role="group"
          aria-label="Planned or unplanned tasks"
          className="grid shrink-0 grid-cols-2 gap-1 rounded-full border border-white/[0.07] bg-card/60 p-1 backdrop-blur-xl"
        >
          {groups.map((g) => (
            <button
              key={g.id}
              aria-pressed={group === g.id}
              onClick={() => {
                setGroup(g.id);
                setTab("today");
              }}
              className={cn(
                "flex items-center justify-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200",
                group === g.id
                  ? "bg-primary/15 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--glow)/0.3)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <g.icon className={cn("h-4 w-4", group === g.id && "text-primary")} />
              {g.label}
              <span className="text-xs tabular-nums text-muted-foreground">{g.count}</span>
            </button>
          ))}
        </div>

        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200",
                tab === t.id
                  ? "bg-white/[0.07] text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  tab === t.id ? "text-primary" : "text-muted-foreground",
                )}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
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
        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.key}>
              {section.label && (
                <h2 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
                  <span className={cn(section.key === "overdue" && "text-warning")}>{section.label}</span>
                  <span className="tabular-nums text-muted-foreground/60">{section.tasks.length}</span>
                </h2>
              )}
              <div className="space-y-2">
                {section.tasks.map((task) => (
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
            </section>
          ))}
          {tab !== "completed" && (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2.5 rounded-2xl border border-dashed border-white/[0.08] px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/[0.04] hover:text-foreground"
            >
              <Plus className="h-4 w-4 text-primary" />
              Add task
            </button>
          )}
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
