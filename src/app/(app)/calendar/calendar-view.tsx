"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  GraduationCap,
  ListChecks,
  CalendarDays,
  Check,
  Pencil,
  Trash2,
  Clock,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { LifeosCore } from "@/components/dashboard/lifeos-core";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { TaskEditor, draftToPayload, type TaskDraft } from "@/components/app/task-editor";
import { AssignmentDetail } from "@/components/app/assignment-detail";
import { useAppData } from "@/lib/store/app-data";
import { CALENDAR_INTEGRATIONS } from "@/lib/integrations/descriptors";
import { IntegrationCard } from "@/components/app/integration-card";
import { openStudyLockPrompt } from "@/lib/study-lock";
import { fmtTime, toInputDateTime, isStaleOverdue, parseDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AssignmentDTO, EventDTO, TaskDTO } from "@/lib/types";

type View = "month" | "week";

const KEY = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const sameDay = (a: Date, b: Date) => KEY(a) === KEY(b);
const startOfWeek = (d: Date) => {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const EVENT_DOT: Record<string, string> = {
  class: "bg-primary",
  study_session: "bg-[var(--g-teal)]",
  deadline: "bg-destructive",
  event: "bg-muted-foreground",
};

export function CalendarView() {
  const { data } = useAppData();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [view, setView] = useState<View>("month");
  const [selected, setSelected] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Build a date-keyed index once per data change — cheap and avoids per-cell scans.
  const index = useMemo(() => {
    const map = new Map<string, { tasks: TaskDTO[]; events: EventDTO[]; assignments: AssignmentDTO[] }>();
    const bucket = (k: string) => {
      let b = map.get(k);
      if (!b) map.set(k, (b = { tasks: [], events: [], assignments: [] }));
      return b;
    };
    for (const t of data.tasks) {
      // show a task on the day you plan to WORK on it, else its due date
      const when = t.scheduledAt || t.dueAt;
      if (!when) continue;
      // hide long-abandoned open tasks (unless the user scheduled work for them)
      if (t.status !== "done" && !t.scheduledAt && isStaleOverdue(t.dueAt)) continue;
      bucket(KEY(new Date(when))).tasks.push(t);
    }
    for (const e of data.events) bucket(KEY(new Date(e.startAt))).events.push(e);
    for (const a of data.assignments) {
      // only open assignments — turned-in / graded work drops off the calendar —
      // and not the ones long past due
      if (a.dueAt && a.status === "open" && !isStaleOverdue(a.dueAt)) {
        bucket(KEY(parseDate(a.dueAt))).assignments.push(a);
      }
    }
    return map;
  }, [data.tasks, data.events, data.assignments]);

  const grid = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(cursor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const first = new Date(cursor);
    const start = startOfWeek(first);
    const end = startOfWeek(new Date(first.getFullYear(), first.getMonth() + 1, 0));
    const days: Date[] = [];
    for (let d = new Date(start); d <= addDays(end, 6); d = addDays(d, 1)) days.push(new Date(d));
    return days;
  }, [cursor, view]);

  const today = new Date();
  const label =
    view === "week"
      ? `Week of ${startOfWeek(cursor).toLocaleDateString([], { month: "long", day: "numeric" })}`
      : cursor.toLocaleDateString([], { month: "long", year: "numeric" });

  function shift(dir: -1 | 1) {
    setCursor((c) => {
      const n = new Date(c);
      if (view === "week") n.setDate(n.getDate() + dir * 7);
      else n.setMonth(n.getMonth() + dir);
      return n;
    });
  }

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Your whole schedule — tasks, deadlines, classes and study sessions."
        action={
          <Button onClick={() => setSelected(KEY(new Date()))}>
            <Plus className="h-4 w-4" /> Add for today
          </Button>
        }
      />

      <Card className="overflow-hidden p-0">
        {/* toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-gradient-to-r from-primary/8 via-transparent to-transparent px-5 py-3.5">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{label}</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-white/10 p-0.5">
              {(["month", "week"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                    view === v ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isMobile && v === "month" ? "Agenda" : v}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => shift(-1)}
                className="rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground sm:p-1.5"
                aria-label="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const d = new Date();
                  d.setDate(1);
                  setCursor(d);
                }}
              >
                Today
              </Button>
              <button
                onClick={() => shift(1)}
                className="rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground sm:p-1.5"
                aria-label="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {isMobile ? (
          <CalendarAgenda
            cursor={cursor}
            view={view}
            index={index}
            today={today}
            onSelect={setSelected}
          />
        ) : (
        <>
        {/* weekday header */}
        <div className="grid grid-cols-7 border-b border-white/[0.06] text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-2.5">{d}</div>
          ))}
        </div>

        {/* grid */}
        <div
          className={cn(
            "grid grid-cols-7",
            view === "week" ? "min-h-[62vh] auto-rows-fr" : "auto-rows-fr",
          )}
          style={
            view === "month"
              ? { gridTemplateRows: `repeat(${grid.length / 7}, minmax(116px, 1fr))` }
              : undefined
          }
        >
          {grid.map((day) => {
            const k = KEY(day);
            const b = index.get(k);
            const inMonth = view === "week" || day.getMonth() === cursor.getMonth();
            const isToday = sameDay(day, today);
            const dayPast = k < KEY(today);
            const dayFuture = k > KEY(today);
            const items = [
              ...(b?.events ?? []).map((e) => ({
                type: "event" as const,
                id: e.id,
                title: e.title,
                kind: e.kind,
                canvas: e.provider === "canvas",
              })),
              ...(b?.assignments ?? []).map((a) => ({
                type: "assignment" as const,
                id: a.id,
                title: a.title,
                kind: a.localDone ? "done" : "",
                canvas: a.provider === "canvas",
              })),
              ...(b?.tasks ?? []).map((t) => ({
                type: "task" as const,
                id: t.id,
                title: t.title,
                kind: t.status,
                canvas: t.source === "canvas",
              })),
            ];
            // Month view only shows its own month — the trailing/leading days of
            // adjacent months render as empty, non-interactive cells.
            if (!inMonth) {
              return (
                <div
                  key={k}
                  className="border-b border-r border-white/[0.03] bg-white/[0.01] last:border-r-0"
                />
              );
            }

            // Past days collapse to a single "N items" pill — the day drawer
            // still opens the full list on click. Month view only.
            const collapsePast = dayPast && view === "month" && items.length > 0;
            const shown = view === "week" ? items : items.slice(0, 3);
            const more = items.length - shown.length;

            return (
              <button
                key={k}
                onClick={() => setSelected(k)}
                className={cn(
                  "flex flex-col gap-1 border-b border-r border-white/[0.05] p-1.5 text-left transition-colors last:border-r-0 hover:bg-white/[0.03]",
                  selected === k && "bg-primary/[0.07] ring-1 ring-inset ring-primary/40",
                  view === "week" && "overflow-y-auto scrollbar-thin",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                    isToday
                      ? "bg-gradient-brand text-primary-foreground shadow-glow-sm"
                      : dayPast
                        ? "text-muted-foreground"
                        : "text-foreground",
                  )}
                >
                  {day.getDate()}
                </span>
                {collapsePast ? (
                  <span className="mt-0.5 self-start rounded px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground/70 ring-1 ring-inset ring-white/[0.08]">
                    {items.length} item{items.length === 1 ? "" : "s"}
                  </span>
                ) : (
                <div className="flex flex-col gap-0.5">
                  {shown.map((it) => {
                    const done = it.kind === "done";
                    // Colour by type; time drives prominence — past items fade back
                    // like an out-of-month day, future items go bold.
                    const cls = done
                      ? "bg-primary/10 text-muted-foreground line-through"
                      : it.type === "event"
                        ? cn("bg-white/[0.06]", dayPast && "opacity-35", dayFuture && "font-semibold")
                        : it.type === "assignment"
                          ? cn("bg-warning/15 text-warning", dayPast && "opacity-35", dayFuture && "font-semibold")
                          : cn("bg-primary/15 text-primary", dayPast && "opacity-35", dayFuture && "font-semibold");
                    return (
                      <span
                        key={`${it.type}-${it.id}`}
                        className={cn(
                          "flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10.5px] leading-tight",
                          cls,
                          it.canvas && "ring-1 ring-inset ring-primary/40",
                        )}
                        title={it.canvas ? `${it.title} · from Canvas` : it.title}
                      >
                        {it.type === "event" && (
                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", EVENT_DOT[it.kind])} />
                        )}
                        <span className="truncate">{it.title}</span>
                      </span>
                    );
                  })}
                  {more > 0 && (
                    <span className="px-1.5 text-[10px] font-medium text-primary">+{more} more</span>
                  )}
                </div>
                )}
              </button>
            );
          })}
        </div>
        </>
        )}
      </Card>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {[
          ["Task", "bg-primary/60"],
          ["Class", "bg-primary"],
          ["Study session", "bg-[var(--g-teal)]"],
          ["Assignment", "bg-warning"],
        ].map(([l, c]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", c)} /> {l}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full ring-1 ring-primary/50" /> From Canvas
        </span>
      </div>

      <section className="mt-12">
        <div className="divider-gradient mb-8" />
        <h2 className="text-xl font-semibold tracking-tight">Connect a calendar</h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Sync your events, deadlines and study sessions both ways with the calendar you
          already use.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {CALENDAR_INTEGRATIONS.map((i) => (
            <IntegrationCard key={i.id} integration={i} />
          ))}
        </div>
      </section>

      {selected && <DayDrawer dateKey={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

/* --------------------------- expandable date view --------------------------- */

function DayDrawer({ dateKey, onClose }: { dateKey: string; onClose: () => void }) {
  const { data, addTask, updateTask, toggleTask, deleteTask, addEvent, deleteEvent } = useAppData();
  const [taskModal, setTaskModal] = useState<TaskDTO | "new" | null>(null);
  const [eventModal, setEventModal] = useState(false);
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const detailAssignment = detailFor
    ? data.assignments.find((a) => a.id === detailFor) ?? null
    : null;

  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const todayKey = KEY(new Date());
  const dayIsPast = dateKey < todayKey;
  const dayIsFuture = dateKey > todayKey;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !taskModal && !eventModal && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, taskModal, eventModal]);

  const goals = data.goals.filter((g) => g.status === "active").map((g) => ({ id: g.id, title: g.title }));
  const courses = data.courses.map((c) => ({ id: c.id, name: c.name }));

  // Everything for this day — computed here (not from the month-grid index) so the
  // drawer can show completed / turned-in work too, grouped by state.
  const dk = dateKey;
  const events = data.events
    .filter((e) => KEY(new Date(e.startAt)) === dk)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  const dayTasks = data.tasks.filter(
    (t) =>
      (t.scheduledAt && KEY(new Date(t.scheduledAt)) === dk) ||
      (t.dueAt && KEY(parseDate(t.dueAt)) === dk),
  );
  const dayAssignments = data.assignments.filter((a) => a.dueAt && KEY(parseDate(a.dueAt)) === dk);

  type Bucket = "todo" | "planned" | "done";
  const taskBucket = (t: TaskDTO): Bucket =>
    t.status === "done" ? "done" : t.scheduledAt ? "planned" : "todo";
  const assignmentBucket = (a: AssignmentDTO): Bucket =>
    a.status !== "open" || a.localDone || a.linkedTask?.status === "done"
      ? "done"
      : a.linkedTask
        ? "planned"
        : "todo";

  const groups: Record<Bucket, { tasks: TaskDTO[]; assignments: AssignmentDTO[] }> = {
    todo: { tasks: [], assignments: [] },
    planned: { tasks: [], assignments: [] },
    done: { tasks: [], assignments: [] },
  };
  for (const t of dayTasks) groups[taskBucket(t)].tasks.push(t);
  for (const a of dayAssignments) groups[assignmentBucket(a)].assignments.push(a);

  const totalItems =
    events.length +
    dayTasks.length +
    dayAssignments.length;

  const BUCKET_META: { key: Bucket; label: string }[] = [
    { key: "todo", label: "To do" },
    { key: "planned", label: "Plan created" },
    { key: "done", label: "Done" },
  ];

  async function saveTask(draft: TaskDraft) {
    const payload = draftToPayload(draft);
    if (taskModal && taskModal !== "new") await updateTask(taskModal.id, payload);
    else await addTask({ ...payload, title: payload.title, dueAt: payload.dueAt ?? dateKey });
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <aside
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl border border-white/10 bg-popover/95 backdrop-blur-2xl shadow-glow-lg animate-slide-up sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[440px] sm:max-h-none sm:rounded-t-none sm:rounded-l-2xl sm:border-y-0 sm:border-r-0 sm:animate-slide-in-right"
        role="dialog"
        aria-label={`Schedule for ${date.toLocaleDateString()}`}
      >
        <header className="flex items-start justify-between border-b border-white/[0.06] p-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              {date.toLocaleDateString([], { weekday: "long" })}
            </p>
            <h2 className="text-xl font-semibold tracking-tight">
              {date.toLocaleDateString([], { month: "long", day: "numeric" })}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {totalItems} item{totalItems === 1 ? "" : "s"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex gap-2 border-b border-white/[0.06] p-4">
          <Button size="sm" className="flex-1" onClick={() => setTaskModal("new")}>
            <ListChecks className="h-4 w-4" /> Task
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={() => setEventModal(true)}>
            <CalendarDays className="h-4 w-4" /> Event
          </Button>
        </div>

        <div className="pb-safe flex-1 space-y-5 overflow-y-auto scrollbar-thin p-4">
          {totalItems === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nothing scheduled. Add a task or event above.
            </p>
          )}

          {events.length > 0 && (
            <Section title="Schedule">
              {events.map((e) => {
                const liveStudy =
                  e.kind === "study_session" &&
                  Date.parse(e.startAt) <= Date.now() &&
                  Date.now() < Date.parse(e.endAt);
                return (
                  <div
                    key={e.id}
                    className="group flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"
                  >
                    <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", EVENT_DOT[e.kind])} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.allDay ? "All day" : `${fmtTime(e.startAt)} – ${fmtTime(e.endAt)}`}
                        {e.location ? ` · ${e.location}` : ""} · {e.kind.replace("_", " ")}
                      </p>
                      {liveStudy && (
                        <button
                          onClick={() => openStudyLockPrompt()}
                          className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                        >
                          <Clock className="h-3 w-3" /> Lock in
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => deleteEvent(e.id)}
                      className="hover-reveal -m-1 rounded p-2 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 sm:p-1"
                      aria-label="Delete event"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </Section>
          )}

          {BUCKET_META.map(({ key, label }) => {
            const g = groups[key];
            if (g.tasks.length + g.assignments.length === 0) return null;
            return (
              <Section key={key} title={`${label} · ${g.tasks.length + g.assignments.length}`}>
                {g.assignments.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setDetailFor(a.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left transition-colors hover:border-primary/40",
                      (key === "done" || (key === "todo" && dayIsPast)) && "opacity-60",
                    )}
                  >
                    <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm",
                          key !== "done" && dayIsFuture ? "font-semibold" : "font-medium",
                          key === "done" && "line-through",
                        )}
                      >
                        {a.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.course?.name ?? "No course"}
                        {a.status === "submitted" && " · turned in"}
                        {a.status === "graded" && ` · ${a.gradeValue ?? "graded"}`}
                        {a.status === "open" && a.localDone && " · marked done"}
                        {a.status === "open" && !a.localDone && a.linkedTask && " · has a plan"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-xs text-muted-foreground">
                      {a.linkedTask || a.localDone || a.status !== "open" ? "Open" : "+ Task"}
                    </span>
                  </button>
                ))}

                {g.tasks.map((t) => (
                  <div
                    key={t.id}
                    className={cn(
                      "group flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3",
                      (key === "done" || (key === "todo" && dayIsPast)) && "opacity-60",
                    )}
                  >
                    <button
                      onClick={() => toggleTask(t.id)}
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all active:scale-90",
                        t.status === "done"
                          ? "border-primary bg-gradient-brand text-primary-foreground"
                          : "border-white/20 hover:border-primary hover:bg-primary/10",
                      )}
                      aria-label="Toggle complete"
                    >
                      {t.status === "done" && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm",
                          t.status !== "done" && dayIsFuture ? "font-semibold" : "font-medium",
                          t.status === "done" && "line-through",
                        )}
                      >
                        {t.title}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge tone="muted" className="capitalize">{t.priority}</Badge>
                        {t.category && <span>{t.category}</span>}
                        {t.scheduledAt && key === "planned" && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {fmtTime(t.scheduledAt)}
                          </span>
                        )}
                        {t.estimatedMinutes ? <span>~{t.estimatedMinutes}m</span> : null}
                      </div>
                    </div>
                    <div className="hover-reveal flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => setTaskModal(t)}
                        className="rounded p-2 text-muted-foreground hover:text-foreground sm:p-1"
                        aria-label="Edit task"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteTask(t.id)}
                        className="rounded p-2 text-muted-foreground hover:text-destructive sm:p-1"
                        aria-label="Delete task"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </Section>
            );
          })}
        </div>
      </aside>

      <AssignmentDetail assignment={detailAssignment} onClose={() => setDetailFor(null)} />

      <TaskEditor
        open={taskModal !== null}
        onClose={() => setTaskModal(null)}
        onSave={saveTask}
        task={taskModal && taskModal !== "new" ? taskModal : null}
        goals={goals}
        courses={courses}
      />
      <EventEditor
        open={eventModal}
        dateKey={dateKey}
        onClose={() => setEventModal(false)}
        onSave={async (payload) => {
          await addEvent(payload);
          setEventModal(false);
        }}
      />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/* ------------------------------ mobile agenda ------------------------------ */

function useIsMobile(query = "(max-width: 639px)") {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return mobile;
}

type DayIndex = Map<
  string,
  { tasks: TaskDTO[]; events: EventDTO[]; assignments: AssignmentDTO[] }
>;

/**
 * The month grid can't fit seven columns on a phone, so small screens get a
 * vertical agenda instead: every day in the range that has something on it,
 * newest work in bold, tap a day to open the same drawer the grid uses.
 */
function CalendarAgenda({
  cursor,
  view,
  index,
  today,
  onSelect,
}: {
  cursor: Date;
  view: View;
  index: DayIndex;
  today: Date;
  onSelect: (k: string) => void;
}) {
  const days = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(cursor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const out: Date[] = [];
    for (let d = new Date(first); d <= last; d = addDays(d, 1)) out.push(new Date(d));
    return out;
  }, [cursor, view]);

  const todayKey = KEY(today);

  const rows = days
    .map((day) => {
      const k = KEY(day);
      const b = index.get(k);
      const items = [
        ...(b?.events ?? []).map((e) => ({
          type: "event" as const,
          id: e.id,
          title: e.title,
          kind: e.kind,
          canvas: e.provider === "canvas",
          done: false,
        })),
        ...(b?.assignments ?? []).map((a) => ({
          type: "assignment" as const,
          id: a.id,
          title: a.title,
          kind: "",
          canvas: a.provider === "canvas",
          done: Boolean(a.localDone),
        })),
        ...(b?.tasks ?? []).map((t) => ({
          type: "task" as const,
          id: t.id,
          title: t.title,
          kind: t.status,
          canvas: t.source === "canvas",
          done: t.status === "done",
        })),
      ];
      return { day, k, items };
    })
    .filter((r) => r.items.length > 0);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
        <ExplodingCore />
        <div>
          <p className="text-sm font-medium">
            {view === "week" ? "Nothing this week" : "Nothing this month"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Tasks, deadlines and study sessions will show up here.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => onSelect(todayKey)}>
          <Plus className="h-4 w-4" /> Add for today
        </Button>
      </div>
    );
  }

  return (
    <div className="divide-y divide-white/[0.06]">
      {rows.map(({ day, k, items }) => {
        const isToday = k === todayKey;
        const past = k < todayKey;
        return (
          <button
            key={k}
            onClick={() => onSelect(k)}
            className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]"
          >
            <div className="w-14 shrink-0 pt-0.5">
              <p
                className={cn(
                  "text-[11px] font-medium uppercase tracking-wide",
                  isToday ? "text-primary" : "text-muted-foreground",
                )}
              >
                {day.toLocaleDateString([], { weekday: "short" })}
              </p>
              <p
                className={cn(
                  "text-lg font-semibold leading-tight",
                  isToday && "text-primary",
                  past && "text-muted-foreground",
                )}
              >
                {day.getDate()}
              </p>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {items.map((it) => {
                const cls = it.done
                  ? "bg-primary/10 text-muted-foreground line-through"
                  : it.type === "event"
                    ? "bg-white/[0.06]"
                    : it.type === "assignment"
                      ? "bg-warning/15 text-warning"
                      : "bg-primary/15 text-primary";
                return (
                  <span
                    key={`${it.type}-${it.id}`}
                    className={cn(
                      "flex items-center gap-1.5 truncate rounded-lg px-2.5 py-1.5 text-xs",
                      cls,
                      past && !it.done && "opacity-50",
                      it.canvas && "ring-1 ring-inset ring-primary/40",
                    )}
                  >
                    {it.type === "event" && (
                      <span
                        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", EVENT_DOT[it.kind])}
                      />
                    )}
                    {it.type === "assignment" && (
                      <GraduationCap className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{it.title}</span>
                  </span>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The LifeOS Core, shrunk to an empty-state ornament — tap it and it detonates
 * and reforms, the same beat as the dashboard. Pure CSS keyframes (see
 * globals.css); reduced-motion collapses it to an instant flicker.
 */
function ExplodingCore() {
  const [boom, setBoom] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function detonate() {
    if (boom) return;
    setBoom(true);
    timer.current = setTimeout(() => setBoom(false), 1100);
  }

  const shards = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const ang = (i / 12) * Math.PI * 2;
        const dist = 60 + Math.random() * 46;
        return {
          dx: `${Math.round(Math.cos(ang) * dist)}px`,
          dy: `${Math.round(Math.sin(ang) * dist)}px`,
          size: 3 + Math.round(Math.random() * 4),
        };
      }),
    [],
  );

  return (
    <button
      type="button"
      onClick={detonate}
      aria-label="LifeOS Core"
      className="relative grid h-28 w-28 place-items-center outline-none"
    >
      {boom && (
        <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
          <span
            className="absolute h-16 w-16 rounded-full"
            style={{
              border: "2px solid hsl(152 92% 68%)",
              animation: "core-shock 820ms cubic-bezier(0.15,0.7,0.3,1) 220ms forwards",
            }}
          />
          {shards.map((s, i) => (
            <span
              key={i}
              className="absolute rounded-full bg-[hsl(152_90%_66%)]"
              style={{
                width: s.size,
                height: s.size,
                ["--dx" as string]: s.dx,
                ["--dy" as string]: s.dy,
                animation: `core-shard 880ms cubic-bezier(0.16,1,0.3,1) 220ms forwards`,
              }}
            />
          ))}
        </span>
      )}
      <span
        className="block h-full w-full"
        style={{
          animation: boom
            ? "core-charge 220ms ease-in forwards, core-burst 720ms cubic-bezier(0.16,1,0.3,1) 220ms forwards, core-reform 780ms cubic-bezier(0.22,1,0.36,1) 940ms both"
            : undefined,
        }}
      >
        <LifeosCore variant="orbit" active />
      </span>
    </button>
  );
}

export function EventEditor({
  open,
  dateKey,
  onClose,
  onSave,
}: {
  open: boolean;
  dateKey: string;
  onClose: () => void;
  onSave: (p: {
    title: string;
    startAt: string;
    endAt: string;
    kind: string;
    location: string | null;
    locked?: boolean;
  }) => Promise<void>;
}) {
  const base = useMemo(() => {
    const [yy, mm, dd] = dateKey.split("-").map(Number);
    const s = new Date(yy, mm - 1, dd, 16, 0);
    const e = new Date(yy, mm - 1, dd, 17, 0);
    return { s: toInputDateTime(s), e: toInputDateTime(e) };
  }, [dateKey]);

  const blankForm = {
    title: "",
    startAt: base.s,
    endAt: base.e,
    kind: "study_session",
    location: "",
    // Not pre-chosen — for a study session, the student has to pick one.
    locked: null as boolean | null,
  };
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [lockError, setLockError] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ ...blankForm, startAt: base.s, endAt: base.e });
      setLockError(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, base]);

  const needsLockChoice = form.kind === "study_session" && form.locked === null;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.title.trim()) return;
    if (needsLockChoice) {
      setLockError(true);
      return;
    }
    setSaving(true);
    try {
      await onSave({
        title: form.title.trim(),
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
        kind: form.kind,
        location: form.location.trim() || null,
        locked: form.kind === "study_session" ? (form.locked ?? undefined) : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New event">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title">
          <Input
            autoFocus
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Study session — Physics"
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start">
            <Input
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => setForm({ ...form, startAt: e.target.value })}
            />
          </Field>
          <Field label="End">
            <Input
              type="datetime-local"
              value={form.endAt}
              onChange={(e) => setForm({ ...form, endAt: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="study_session">Study session</option>
              <option value="event">Event</option>
              <option value="class">Class</option>
              <option value="deadline">Deadline</option>
            </Select>
          </Field>
          <Field label="Location (optional)">
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </Field>
        </div>
        {form.kind === "study_session" && (
          <Field
            label="Focus lock"
            error={lockError ? "Pick locked or unlocked before creating the session." : undefined}
            hint={
              lockError
                ? undefined
                : form.locked === null
                  ? "Choose one."
                  : form.locked
                    ? "Locked — LifeOS nags you to lock in and takes over the screen while it runs."
                    : "Unlocked — just a block on your calendar, no nagging."
            }
          >
            <Select
              value={form.locked === null ? "" : form.locked ? "locked" : "unlocked"}
              onChange={(e) => {
                setLockError(false);
                setForm({ ...form, locked: e.target.value === "locked" });
              }}
              className={cn(lockError && "border-destructive/60 focus:border-destructive")}
            >
              <option value="" disabled>
                Choose one…
              </option>
              <option value="locked">Locked session</option>
              <option value="unlocked">Unlocked session</option>
            </Select>
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Add event
          </Button>
        </div>
      </form>
    </Modal>
  );
}
